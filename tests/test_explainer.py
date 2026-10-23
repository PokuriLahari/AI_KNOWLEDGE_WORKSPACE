import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from openai import AuthenticationError, RateLimitError, APIConnectionError, APIStatusError
import httpx

from core.agents.explainer import ExplainerAgent, ExplanationError
from core.router import ExplanationStyle
from core.rag_pipeline import RAGPipeline
from starlette.testclient import TestClient
from app.main import app


class TestExplainerAgent(unittest.TestCase):
    def setUp(self):
        self.mock_client = MagicMock()
        self.agent = ExplainerAgent(client=self.mock_client, model="gemini-3.8-flash")

    def _setup_mock_response(self, text: str):
        mock_choice = MagicMock()
        mock_choice.message.content = text
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

    def test_all_explanation_styles(self):
        styles = [
            (ExplanationStyle.BEGINNER, "STYLE: BEGINNER-FRIENDLY (ELI5)"),
            (ExplanationStyle.TECHNICAL, "STYLE: IN-DEPTH TECHNICAL"),
            (ExplanationStyle.ANALOGY, "STYLE: ANALOGY-DRIVEN"),
            (ExplanationStyle.STEP_BY_STEP, "STYLE: STEP-BY-STEP SEQUENCE"),
            (ExplanationStyle.EXAM, "STYLE: EXAM REVISION GUIDE"),
            (ExplanationStyle.STANDARD, "STYLE: STANDARD EDUCATIONAL"),
        ]

        for style_enum, expected_header in styles:
            self._setup_mock_response(f"Explanation rendered in {style_enum.value} style.")
            result = self.agent.explain(
                query="What is gradient descent?",
                style=style_enum.value,
                contexts=[{"text": "Gradient descent minimizes the loss.", "metadata": {"source": "ml.pdf", "page": 4}}],
            )
            self.assertEqual(result["style"], style_enum.value)
            self.assertTrue(result["has_document_evidence"])
            self.assertEqual(result["sources"], ["ml.pdf"])

            # Verify prompt content passed to LLM
            call_args = self.mock_client.chat.completions.create.call_args
            prompt_sent = call_args[1]["messages"][0]["content"]
            self.assertIn(expected_header, prompt_sent)
            self.assertIn("ml.pdf", prompt_sent)
            self.assertIn("Page: 4", prompt_sent)

    def test_document_grounded_explanation(self):
        self._setup_mock_response("Vector databases store high-dimensional embeddings [Source: rag_primer.pdf, Page: 2].")
        contexts = [
            {"text": "Vector databases index embeddings for nearest neighbor search.", "metadata": {"source": "rag_primer.pdf", "page": 2}},
            {"text": "ChromaDB is an embedded vector database.", "metadata": {"source": "chroma_docs.pdf", "page": 1}},
        ]

        result = self.agent.explain(
            query="Explain how vector databases work",
            contexts=contexts,
            style="technical",
        )
        self.assertTrue(result["has_document_evidence"])
        self.assertIn("rag_primer.pdf", result["sources"])
        self.assertIn("chroma_docs.pdf", result["sources"])
        self.assertEqual(result["contexts_count"], 2)

        prompt_sent = self.mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
        self.assertIn("GROUNDING AND CITATION RULES", prompt_sent)
        self.assertIn("rag_primer.pdf", prompt_sent)

    def test_general_knowledge_fallback_without_documents(self):
        self._setup_mock_response("[Note: This explanation is based on general domain knowledge] Photosynthesis converts light into energy.")

        result = self.agent.explain(
            query="Explain photosynthesis",
            contexts=[],
            style="beginner",
        )
        self.assertFalse(result["has_document_evidence"])
        self.assertEqual(result["sources"], [])
        self.assertEqual(result["contexts_count"], 0)

        prompt_sent = self.mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
        self.assertIn("GENERAL EXPLANATION RULES", prompt_sent)
        self.assertIn("No relevant document contexts retrieved.", prompt_sent)

    def test_auth_error_handling(self):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_res = httpx.Response(401, request=mock_req)
        self.mock_client.chat.completions.create.side_effect = AuthenticationError(
            message="Invalid API Key", response=mock_res, body={"error": {}}
        )

        with self.assertRaises(ExplanationError) as ctx:
            self.agent.explain(query="Explain neural networks", style="standard")
        self.assertIn("Authentication failed", str(ctx.exception))

    def test_rate_limit_error_handling(self):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_res = httpx.Response(429, request=mock_req)
        self.mock_client.chat.completions.create.side_effect = RateLimitError(
            message="Quota exceeded", response=mock_res, body={"error": {}}
        )

        with self.assertRaises(ExplanationError) as ctx:
            self.agent.explain(query="Explain neural networks", style="standard")
        self.assertIn("Rate limit exceeded", str(ctx.exception))

    def test_connection_error_handling(self):
        self.mock_client.chat.completions.create.side_effect = APIConnectionError(
            request=MagicMock(), message="Connection refused"
        )

        with self.assertRaises(ExplanationError) as ctx:
            self.agent.explain(query="Explain neural networks", style="standard")
        self.assertIn("Network error", str(ctx.exception))


class TestPipelineExplainerIntegration(unittest.TestCase):
    @patch("core.agents.explainer.ExplainerAgent.explain")
    def test_pipeline_routes_explain_intent(self, mock_explain):
        mock_explain.return_value = {
            "explanation": "Imagine a library where books are organized by topic (analogy).",
            "style": "analogy",
            "has_document_evidence": True,
            "sources": ["architecture.pdf"],
            "contexts_count": 1,
        }

        pipeline = RAGPipeline(api_key="mock-key", model="gemini-3.8-flash")
        pipeline.vstore.add_documents(
            ids=["chunk-explain-1"],
            embeddings=pipeline.embedder.embed_texts(["Vector database indexing theory."]),
            metadatas=[{"source": "architecture.pdf", "page": 3, "chunk_index": 0}],
            documents=["Vector database indexing theory."],
        )

        res = pipeline.answer_question("Explain vector search by analogy", k=3)
        self.assertEqual(res["intent"], "EXPLAIN")
        self.assertEqual(res["style"], "analogy")
        self.assertIn("Imagine a library", res["answer"])
        self.assertTrue(mock_explain.called)

    @patch("core.agents.explainer.ExplainerAgent.explain")
    def test_pipeline_direct_explain_concept_with_session_memory(self, mock_explain):
        mock_explain.return_value = {
            "explanation": "Step 1: Compute embeddings. Step 2: Query index.",
            "style": "step_by_step",
            "has_document_evidence": False,
            "sources": [],
            "contexts_count": 0,
        }

        pipeline = RAGPipeline(api_key="mock-key", model="gemini-3.8-flash")
        session_id = "test-session-explain-1"

        res = pipeline.explain_concept(
            query="Explain retrieval step by step",
            style="step_by_step",
            session_id=session_id,
        )
        self.assertEqual(res["intent"], "EXPLAIN")
        self.assertEqual(res["style"], "step_by_step")
        self.assertIn("Step 1", res["answer"])

        # Check memory recorded turns
        recent = pipeline.memory.get_recent_history(session_id=session_id, limit=2)
        self.assertEqual(len(recent), 2)
        self.assertEqual(recent[0]["role"], "user")
        self.assertEqual(recent[1]["role"], "assistant")


class TestFastAPIExplainerEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("core.agents.explainer.ExplainerAgent.explain")
    def test_post_explain_endpoint(self, mock_explain):
        mock_explain.return_value = {
            "explanation": "Here is an exam-focused revision sheet for RAG architecture.",
            "style": "exam",
            "has_document_evidence": True,
            "sources": ["handbook.pdf"],
            "contexts_count": 2,
        }

        resp = self.client.post(
            "/explain",
            json={
                "query": "Explain RAG architecture for exams",
                "style": "exam",
                "k": 3,
                "session_id": "api-session-1",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["question"], "Explain RAG architecture for exams")
        self.assertEqual(data["style"], "exam")
        self.assertTrue(data["is_document_grounded"])
        self.assertIn("exam-focused revision sheet", data["explanation"])

    @patch("core.agents.explainer.ExplainerAgent.explain")
    def test_post_ask_routes_to_explainer(self, mock_explain):
        mock_explain.return_value = {
            "explanation": "Simple explanation for beginners: a vector is a list of numbers.",
            "style": "beginner",
            "has_document_evidence": False,
            "sources": [],
            "contexts_count": 0,
        }

        resp = self.client.post(
            "/ask",
            json={"question": "Explain embeddings like I'm 5 years old"},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["intent"], "EXPLAIN")
        self.assertIn("Simple explanation for beginners", data["answer"])


if __name__ == "__main__":
    unittest.main()
