import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from openai import AuthenticationError, RateLimitError, APIConnectionError
import httpx

from core.document_loader import chunk_text
from core.embeddings import EmbeddingModel
from core.vector_store import VectorStore
from core.rag_pipeline import RAGPipeline


class TestRAGPipeline(unittest.TestCase):
    def test_chunk_text(self):
        text = "Hello world! " * 100
        chunks = chunk_text(text, chunk_size=200, chunk_overlap=50)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c) <= 200 for c in chunks))

    def test_embedding_and_vector_store(self):
        embedder = EmbeddingModel()
        texts = ["Artificial intelligence is fascinating.", "Baking bread requires yeast."]
        embs = embedder.embed_texts(texts)
        self.assertEqual(len(embs), 2)

        vstore = VectorStore(collection_name="test_collection")
        vstore.add_documents(
            ids=["doc-1", "doc-2"],
            embeddings=embs,
            metadatas=[{"source": "doc1.pdf", "page": 1}, {"source": "doc2.pdf", "page": 2}],
            documents=texts,
        )

        query_emb = embedder.embed_texts(["AI and machine learning"])[0]
        results = vstore.query(query_emb, k=1)
        self.assertEqual(len(results["documents"][0]), 1)
        self.assertIn("Artificial intelligence", results["documents"][0][0])

    def test_rag_pipeline_init_gemini(self):
        pipeline = RAGPipeline(
            api_key="mock-gemini-key",
            model="gemini-3.8-flash",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )
        self.assertEqual(pipeline.model, "gemini-3.8-flash")
        self.assertEqual(
            str(pipeline.client.base_url).rstrip("/"),
            "https://generativelanguage.googleapis.com/v1beta/openai",
        )

    def test_rag_pipeline_init_groq(self):
        pipeline = RAGPipeline(
            api_key="gsk_mock_groq_key",
            model="openai/gpt-oss-120b",
            base_url="https://api.groq.com/openai/v1",
        )
        self.assertEqual(pipeline.model, "openai/gpt-oss-120b")
        self.assertEqual(
            str(pipeline.client.base_url).rstrip("/"),
            "https://api.groq.com/openai/v1",
        )

    @patch("openai.resources.chat.completions.Completions.create")
    def test_answer_question_mocked_success(self, mock_create):
        mock_choice = MagicMock()
        mock_choice.message.content = "UNICEF received significant support from Germany."
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_create.return_value = mock_response

        pipeline = RAGPipeline(api_key="mock-key", model="gemini-3.8-flash")
        # Populate dummy vector store doc
        pipeline.vstore.add_documents(
            ids=["test-id"],
            embeddings=pipeline.embedder.embed_texts(["Germany donated to UNICEF."]),
            metadatas=[{"source": "report.pdf", "page": 5}],
            documents=["Germany donated to UNICEF."],
        )

        res = pipeline.answer_question("How much did Germany donate?", k=1)
        self.assertEqual(res["question"], "How much did Germany donate?")
        self.assertEqual(res["answer"], "UNICEF received significant support from Germany.")
        self.assertEqual(len(res["contexts"]), 1)
        self.assertEqual(res["contexts"][0]["metadata"]["source"], "report.pdf")
        self.assertTrue(mock_create.called)

    @patch("openai.resources.chat.completions.Completions.create")
    def test_answer_question_auth_error(self, mock_create):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_res = httpx.Response(401, request=mock_req)
        mock_create.side_effect = AuthenticationError(
            message="Invalid API Key",
            response=mock_res,
            body={"error": {"message": "Invalid API Key"}},
        )

        pipeline = RAGPipeline(api_key="bad-key")
        with self.assertRaises(RuntimeError) as ctx:
            pipeline.answer_question("What is this?")
        self.assertIn("Authentication failed with LLM provider", str(ctx.exception))

    @patch("openai.resources.chat.completions.Completions.create")
    def test_answer_question_rate_limit_error(self, mock_create):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_res = httpx.Response(429, request=mock_req)
        mock_create.side_effect = RateLimitError(
            message="Rate limit exceeded",
            response=mock_res,
            body={"error": {"message": "Rate limit exceeded"}},
        )

        pipeline = RAGPipeline(api_key="mock-key")
        with self.assertRaises(RuntimeError) as ctx:
            pipeline.answer_question("What is this?")
        self.assertIn("rate limit exceeded or quota exhausted", str(ctx.exception))

    @patch("openai.resources.chat.completions.Completions.create")
    def test_answer_question_connection_error(self, mock_create):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_create.side_effect = APIConnectionError(request=mock_req, message="Connection failed")

        pipeline = RAGPipeline(api_key="mock-key")
        with self.assertRaises(RuntimeError) as ctx:
            pipeline.answer_question("What is this?")
        self.assertIn("Network error connecting to LLM provider", str(ctx.exception))


class TestFastAPIEndpoints(unittest.TestCase):
    def setUp(self):
        from starlette.testclient import TestClient
        from app.main import app
        self.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    @patch("core.rag_pipeline.RAGPipeline.answer_question")
    def test_ask_endpoint_mocked(self, mock_answer):
        mock_answer.return_value = {
            "question": "What is AI?",
            "answer": "AI is artificial intelligence.",
            "contexts": [
                {"text": "AI context snippet", "metadata": {"source": "ai.pdf", "page": 1}}
            ],
        }

        response = self.client.post("/ask", json={"question": "What is AI?", "k": 1})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["answer"], "AI is artificial intelligence.")
        self.assertEqual(len(data["contexts"]), 1)


if __name__ == "__main__":
    unittest.main()
