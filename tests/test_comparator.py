import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from openai import AuthenticationError, RateLimitError, APIConnectionError
import httpx

from core.agents.comparator import ComparatorAgent, ComparisonError
from core.rag_pipeline import RAGPipeline
from starlette.testclient import TestClient
from app.main import app


class TestComparatorAgent(unittest.TestCase):
    def setUp(self):
        self.mock_client = MagicMock()
        self.agent = ComparatorAgent(client=self.mock_client, model="gemini-3.8-flash")

    def _setup_mock_response(self, text: str):
        mock_choice = MagicMock()
        mock_choice.message.content = text
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

    def test_similarity_and_difference_detection(self):
        chunks_a = [
            {"text": "Project Alpha uses Python and PostgreSQL for backend storage.", "metadata": {"source": "arch_a.pdf", "page": 1, "chunk_index": 0}},
        ]
        chunks_b = [
            {"text": "Project Beta uses Python with MongoDB for NoSQL storage.", "metadata": {"source": "arch_b.pdf", "page": 2, "chunk_index": 0}},
        ]

        mock_output = """# Cross-Document Comparison: arch_a.pdf vs arch_b.pdf

## 1. Executive Summary & Scope
Both projects develop backend systems.

## 2. Key Similarities
- [Supported Finding] Both systems use Python as their core programming language [Source: arch_a.pdf, Page: 1; Source: arch_b.pdf, Page: 2].

## 3. Key Differences
- [Supported Finding] Project Alpha utilizes relational PostgreSQL storage [Source: arch_a.pdf, Page: 1], whereas Project Beta utilizes document-oriented MongoDB [Source: arch_b.pdf, Page: 2].

## 4. Conflicting Claims & Contradictions
No direct conflicting claims identified between the provided documents.

## 5. Absent Information & Unilateral Coverage
- [Information Absent from arch_b.pdf]: Relational schema normalization
- [Information Absent from arch_a.pdf]: Document collection indexing

## 6. Coverage & Processing Limits
Complete comparison completed within context limits."""

        self._setup_mock_response(mock_output)

        res = self.agent.compare(
            chunks_a=chunks_a,
            chunks_b=chunks_b,
            source_a="arch_a.pdf",
            source_b="arch_b.pdf",
        )

        self.assertIn("Python", res["comparison"])
        self.assertEqual(len(res["similarities"]), 1)
        self.assertEqual(len(res["differences"]), 1)
        self.assertEqual(res["coverage_a"], "complete")
        self.assertEqual(res["coverage_b"], "complete")

        # Verify prompt received both context blocks
        prompt = self.mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
        self.assertIn("arch_a.pdf", prompt)
        self.assertIn("arch_b.pdf", prompt)
        self.assertIn("PostgreSQL", prompt)
        self.assertIn("MongoDB", prompt)

    def test_conflicting_claims_detection(self):
        chunks_a = [
            {"text": "Total project cost in 2024 was 1.2 million USD.", "metadata": {"source": "audit_a.pdf", "page": 5, "chunk_index": 0}},
        ]
        chunks_b = [
            {"text": "Total project cost in 2024 was 1.8 million USD.", "metadata": {"source": "audit_b.pdf", "page": 8, "chunk_index": 0}},
        ]

        mock_output = """# Cross-Document Comparison: audit_a.pdf vs audit_b.pdf

## 1. Executive Summary & Scope
Budget audit comparison.

## 2. Key Similarities
- [Supported Finding] Both documents report on 2024 expenditure.

## 3. Key Differences
- [Supported Finding] Different auditors prepared each assessment.

## 4. Conflicting Claims & Contradictions
- [Possible Conflict / Discrepancy] Topic: 2024 Total Project Expenditure
  - audit_a.pdf: Claims 1.2M USD [Source: audit_a.pdf, Page: 5]
  - audit_b.pdf: Claims 1.8M USD [Source: audit_b.pdf, Page: 8]
  - Nature of Disagreement: Substantial discrepancy of 600,000 USD between audit reports.

## 5. Absent Information & Unilateral Coverage
- [Information Absent from audit_b.pdf]: Breakdown of travel expenses

## 6. Coverage & Processing Limits
Complete comparison."""

        self._setup_mock_response(mock_output)

        res = self.agent.compare(chunks_a=chunks_a, chunks_b=chunks_b, source_a="audit_a.pdf", source_b="audit_b.pdf")
        self.assertGreater(len(res["conflicts"]), 0)
        self.assertIn("1.2M", res["comparison"])
        self.assertIn("1.8M", res["comparison"])

    def test_information_absent_from_source(self):
        chunks_a = [
            {"text": "Security policy requires multi-factor authentication (MFA) on all nodes.", "metadata": {"source": "security.pdf", "page": 3}},
        ]
        chunks_b = [
            {"text": "Performance benchmarks showed 99.9% uptime under peak load.", "metadata": {"source": "performance.pdf", "page": 1}},
        ]

        mock_output = """# Cross-Document Comparison

## 2. Key Similarities
- [Supported Finding] Both documents focus on infrastructure quality.

## 3. Key Differences
- [Supported Finding] Security vs performance focus.

## 4. Conflicting Claims & Contradictions
No direct conflicting claims identified.

## 5. Absent Information & Unilateral Coverage
- [Information Absent from performance.pdf]: Multi-factor authentication requirements
- [Information Absent from security.pdf]: Uptime metrics under peak load

## 6. Coverage & Processing Limits
Complete."""

        self._setup_mock_response(mock_output)

        res = self.agent.compare(chunks_a=chunks_a, chunks_b=chunks_b, source_a="security.pdf", source_b="performance.pdf")
        self.assertGreater(len(res["absent_topics"]["source_a_only"]), 0)
        self.assertGreater(len(res["absent_topics"]["source_b_only"]), 0)

    def test_empty_document_handling(self):
        res = self.agent.compare(chunks_a=[], chunks_b=[], source_a="empty1.pdf", source_b="empty2.pdf")
        self.assertEqual(res["coverage_a"], "none")
        self.assertEqual(res["coverage_b"], "none")
        self.assertIn("empty", res["comparison"].lower())

    def test_one_empty_document_handling(self):
        chunks_a = [{"text": "Content", "metadata": {"source": "docA.pdf", "page": 1}}]
        res = self.agent.compare(chunks_a=chunks_a, chunks_b=[], source_a="docA.pdf", source_b="emptyB.pdf")
        self.assertEqual(res["coverage_b"], "none")
        self.assertIn("no extractable content", res["comparison"].lower())

    def test_large_document_staged_partial_coverage(self):
        # Generate enough chunks to exceed max_single_pass_chars
        long_text = "Dense architecture specification and component requirements. " * 50
        chunks_a = [{"text": long_text, "metadata": {"source": "large_a.pdf", "page": i, "chunk_index": i}} for i in range(1, 15)]
        chunks_b = [{"text": long_text, "metadata": {"source": "large_b.pdf", "page": i, "chunk_index": i}} for i in range(1, 15)]

        self._setup_mock_response("# Staged Comparison\n## 6. Coverage & Processing Limits\nStaged comparison performed.")
        res = self.agent.compare(chunks_a=chunks_a, chunks_b=chunks_b, source_a="large_a.pdf", source_b="large_b.pdf")

        self.assertEqual(res["coverage_a"], "partial")
        self.assertEqual(res["coverage_b"], "partial")

    def test_provider_error_handling(self):
        mock_req = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        mock_res = httpx.Response(401, request=mock_req)
        self.mock_client.chat.completions.create.side_effect = AuthenticationError(
            message="Invalid Key", response=mock_res, body={"error": {}}
        )

        chunks_a = [{"text": "Text A", "metadata": {"source": "a.pdf", "page": 1}}]
        chunks_b = [{"text": "Text B", "metadata": {"source": "b.pdf", "page": 1}}]

        with self.assertRaises(ComparisonError) as ctx:
            self.agent.compare(chunks_a=chunks_a, chunks_b=chunks_b)
        self.assertIn("Authentication failed", str(ctx.exception))


class TestPipelineComparisonIntegration(unittest.TestCase):
    @patch("core.agents.comparator.ComparatorAgent.compare")
    def test_pipeline_compare_documents(self, mock_compare):
        mock_compare.return_value = {
            "comparison": "Doc 1 and Doc 2 share key principles.",
            "similarities": ["Principle 1"],
            "differences": ["Scale"],
            "conflicts": [],
            "absent_topics": {"source_a_only": [], "source_b_only": []},
            "coverage_a": "complete",
            "coverage_b": "complete",
            "sources": ["first.pdf", "second.pdf"],
        }

        pipeline = RAGPipeline(api_key="mock-key", model="gemini-3.8-flash")
        pipeline.registry.register_document(filename="first.pdf", file_type=".pdf", file_size=100, doc_id="id-1")
        pipeline.registry.register_document(filename="second.pdf", file_type=".pdf", file_size=100, doc_id="id-2")

        pipeline.vstore.add_documents(
            ids=["chunk-first-1", "chunk-sec-1"],
            embeddings=pipeline.embedder.embed_texts(["First text", "Second text"]),
            metadatas=[
                {"document_id": "id-1", "source": "first.pdf", "page": 1, "chunk_index": 0},
                {"document_id": "id-2", "source": "second.pdf", "page": 1, "chunk_index": 0},
            ],
            documents=["First text", "Second text"],
        )

        res = pipeline.compare_documents(doc_id_a="id-1", doc_id_b="id-2", topic_query="principles")
        self.assertEqual(res["source_a"], "first.pdf")
        self.assertEqual(res["source_b"], "second.pdf")
        self.assertIn("share key principles", res["comparison"])
        self.assertTrue(mock_compare.called)

    def test_pipeline_compare_missing_doc_id_raises_value_error(self):
        pipeline = RAGPipeline(api_key="mock-key", model="gemini-3.8-flash")
        with self.assertRaises(ValueError) as ctx:
            pipeline.compare_documents(doc_id_a="invalid-1", doc_id_b="invalid-2")
        self.assertIn("not found in registry", str(ctx.exception))


class TestFastAPICompareEndpoint(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    @patch("app.main.pipeline.compare_documents")
    def test_post_compare_endpoint(self, mock_comp):
        mock_comp.return_value = {
            "doc_id_a": "doc-1",
            "doc_id_b": "doc-2",
            "source_a": "report_2023.pdf",
            "source_b": "report_2024.pdf",
            "topic_query": "budget",
            "session_id": "session-compare-1",
            "comparison": "Comparative analysis between 2023 and 2024 budgets.",
            "similarities": ["Operational line items"],
            "differences": ["Growth rate"],
            "conflicts": [],
            "absent_topics": {"source_a_only": [], "source_b_only": []},
            "coverage_a": "complete",
            "coverage_b": "complete",
            "contexts": [],
        }

        resp = self.client.post(
            "/compare",
            json={
                "doc_id_a": "doc-1",
                "doc_id_b": "doc-2",
                "topic_query": "budget",
                "session_id": "session-compare-1",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["doc_id_a"], "doc-1")
        self.assertEqual(data["source_a"], "report_2023.pdf")
        self.assertIn("Comparative analysis", data["comparison"])


if __name__ == "__main__":
    unittest.main()
