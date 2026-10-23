import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from openai import AuthenticationError, RateLimitError, APIConnectionError
import httpx

from core.agents.summarizer import SummarizerAgent, SummarizationError
from core.rag_pipeline import RAGPipeline
from starlette.testclient import TestClient
from app.main import app


class TestSummarizerAgent(unittest.TestCase):
    def setUp(self):
        self.mock_client = MagicMock()
        self.agent = SummarizerAgent(client=self.mock_client, model="gemini-3.8-flash")

    def test_valid_document_summary(self):
        # Mock LLM response
        mock_choice = MagicMock()
        mock_choice.message.content = "Executive Summary: The company achieved 20% growth."
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

        chunks = [
            {"text": "Section 1: Financial results showed revenue increased.", "metadata": {"source": "annual_report.pdf", "page": 1, "chunk_index": 0}},
            {"text": "Section 2: Operating costs decreased significantly.", "metadata": {"source": "annual_report.pdf", "page": 2, "chunk_index": 1}},
        ]

        result = self.agent.summarize(chunks=chunks, query="Summarize the annual report")
        self.assertIn("20% growth", result["summary"])
        self.assertEqual(result["format"], "standard")
        self.assertEqual(result["coverage"], "complete")
        self.assertIn("annual_report.pdf", result["sources"])
        self.assertEqual(result["chunks_used"], 2)
        self.assertFalse(result["hierarchical"])

    def test_bullet_point_output_detection(self):
        mock_choice = MagicMock()
        mock_choice.message.content = "- Key Takeaway 1\n- Key Takeaway 2"
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

        chunks = [
            {"text": "Point A details.", "metadata": {"source": "doc.txt", "page": 1}},
        ]

        result = self.agent.summarize(chunks=chunks, query="Give me key takeaways and bullet points")
        self.assertEqual(result["format"], "bullets")
        self.assertIn("Key Takeaway", result["summary"])

    def test_section_level_summary(self):
        mock_choice = MagicMock()
        mock_choice.message.content = "Section 3 Summary: Infrastructure upgrades."
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

        chunks = [
            {"text": "Chapter 3: Infrastructure.", "metadata": {"source": "manual.pdf", "page": 14}},
        ]

        result = self.agent.summarize(chunks=chunks, query="Summarize chapter 3", scope_name="Chapter 3")
        self.assertEqual(result["format"], "section")
        self.assertIn("Section 3 Summary", result["summary"])

    def test_empty_document_handling(self):
        result = self.agent.summarize(chunks=[], query="Summarize")
        self.assertEqual(result["coverage"], "none")
        self.assertEqual(result["chunks_used"], 0)
        self.assertIn("No extractable text", result["summary"])
        self.assertFalse(self.mock_client.chat.completions.create.called)

    def test_long_document_hierarchical_summarization(self):
        # Create enough chunks to exceed max_single_pass_chars threshold
        long_text = "Detailed paragraph content about system architecture and specifications. " * 30
        chunks = [
            {"text": long_text, "metadata": {"source": "specs.pdf", "page": i, "chunk_index": i}}
            for i in range(1, 12)
        ]

        mock_choice = MagicMock()
        mock_choice.message.content = "Consolidated hierarchical summary."
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

        result = self.agent.summarize(chunks=chunks, query="Summarize the specifications")
        self.assertTrue(result["hierarchical"])
        self.assertEqual(result["coverage"], "complete")
        self.assertGreater(result["sections_processed"], 1)
        self.assertEqual(result["partial_failures"], 0)

    def test_partial_failure_handling(self):
        # Simulate partial failure during one batch in map phase
        long_text = "Important architecture details. " * 40
        chunks = [
            {"text": long_text, "metadata": {"source": "large.pdf", "page": i, "chunk_index": i}}
            for i in range(1, 15)
        ]

        call_count = 0
        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise APIConnectionError(request=MagicMock(), message="Temporary network glitch")
            mock_choice = MagicMock()
            mock_choice.message.content = f"Batch summary {call_count}"
            mock_resp = MagicMock()
            mock_resp.choices = [mock_choice]
            return mock_resp

        self.mock_client.chat.completions.create.side_effect = side_effect

        result = self.agent.summarize(chunks=chunks, query="Summarize large document")
        self.assertTrue(result["hierarchical"])
        self.assertEqual(result["coverage"], "partial")
        self.assertGreater(result["partial_failures"], 0)

    def test_provider_auth_error_handling(self):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_res = httpx.Response(401, request=mock_req)
        self.mock_client.chat.completions.create.side_effect = AuthenticationError(
            message="Invalid Key", response=mock_res, body={"error": {}}
        )

        chunks = [{"text": "Content", "metadata": {"source": "doc.pdf", "page": 1}}]
        with self.assertRaises(SummarizationError) as ctx:
            self.agent.summarize(chunks=chunks, query="Summarize")
        self.assertIn("Authentication failed", str(ctx.exception))


class TestPipelineSummarizerIntegration(unittest.TestCase):
    @patch("core.agents.summarizer.SummarizerAgent.summarize")
    def test_pipeline_routes_summarize_intent(self, mock_summarize):
        mock_summarize.return_value = {
            "summary": "This document covers UNICEF activities in Germany.",
            "format": "standard",
            "coverage": "complete",
            "sources": ["unicef.pdf"],
            "page_range": "1-5",
            "chunks_used": 5,
        }

        pipeline = RAGPipeline(api_key="mock-key", model="gemini-3.8-flash")
        pipeline.registry.register_document(
            filename="unicef.pdf", file_type=".pdf", file_size=1000, doc_id="unicef-id"
        )
        # Add mock chunk to vector store
        pipeline.vstore.add_documents(
            ids=["chunk-1"],
            embeddings=pipeline.embedder.embed_texts(["UNICEF report text."]),
            metadatas=[{"document_id": "unicef-id", "source": "unicef.pdf", "page": 1, "chunk_index": 0}],
            documents=["UNICEF report text."],
        )

        # Call answer_question with a summarization prompt mentioning unicef.pdf
        res = pipeline.answer_question("Please summarize unicef.pdf", k=3)
        self.assertEqual(res["intent"], "SUMMARIZE")
        self.assertIn("UNICEF activities", res["answer"])
        self.assertTrue(mock_summarize.called)

    @patch("app.main.pipeline.summarize_document")
    def test_fastapi_summarize_endpoint(self, mock_summarize):
        mock_summarize.return_value = {
            "question": "Summarize workspace documents",
            "answer": "Executive summary of workspace documents.",
            "session_id": None,
            "intent": "SUMMARIZE",
            "contexts": [],
            "summary_metadata": {
                "format": "bullets",
                "coverage": "complete",
                "sources": ["workspace_docs"],
                "chunks_used": 5,
            },
        }
        client = TestClient(app)
        resp = client.post("/summarize", json={"query": "Summarize workspace documents", "format": "bullets"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("summary", data)
        self.assertIn("coverage", data)


if __name__ == "__main__":
    unittest.main()
