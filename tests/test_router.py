import sys
from pathlib import Path
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.router import IntentRouter, IntentType, ExplanationStyle, IntentResult


class TestIntentRouter(unittest.TestCase):
    def setUp(self):
        self.router = IntentRouter()

    def test_ordinary_document_questions_route_to_qa(self):
        queries = [
            "What is the total funding received from Germany?",
            "How many schools were built in 2024?",
            "Which department authorized the expenditure?",
            "According to the document, when does the contract expire?",
            "Who is the primary author of the research paper?",
            "Does the report mention renewable energy targets?",
        ]
        for q in queries:
            with self.subTest(query=q):
                res = self.router.route(q)
                self.assertEqual(res.intent, IntentType.QA)
                self.assertGreaterEqual(res.confidence, 0.7)

    def test_explicit_summary_requests_route_to_summarize(self):
        queries = [
            "Summarize this document",
            "Please give me a summary of chapter 2",
            "TLDR of the quarterly results",
            "Can you provide a recap of the key findings?",
            "Give me a brief summary",
            "What is the overview of the document?",
        ]
        for q in queries:
            with self.subTest(query=q):
                res = self.router.route(q)
                self.assertEqual(res.intent, IntentType.SUMMARIZE)
                self.assertGreaterEqual(res.confidence, 0.8)

    def test_beginner_friendly_explanation_requests_route_to_explain(self):
        queries = [
            "Explain neural networks like I'm 5",
            "Can you explain vector embeddings for a beginner?",
            "Explain this concept in simple terms",
            "Break down the transformer architecture in layman's terms",
            "ELI5: How does gradient descent work?",
        ]
        for q in queries:
            with self.subTest(query=q):
                res = self.router.route(q)
                self.assertEqual(res.intent, IntentType.EXPLAIN)
                self.assertEqual(res.style, ExplanationStyle.BEGINNER)

    def test_technical_explanation_requests_preserve_requested_style(self):
        queries = [
            "Explain cosine similarity in technical detail",
            "Give me a deep dive into the vector search algorithm",
            "Explain the database indexing under the hood",
            "Explain the architectural details for a developer",
        ]
        for q in queries:
            with self.subTest(query=q):
                res = self.router.route(q)
                self.assertEqual(res.intent, IntentType.EXPLAIN)
                self.assertEqual(res.style, ExplanationStyle.TECHNICAL)

    def test_specialized_explanation_styles(self):
        # Analogy style
        res_analogy = self.router.route("Explain backpropagation using an analogy")
        self.assertEqual(res_analogy.intent, IntentType.EXPLAIN)
        self.assertEqual(res_analogy.style, ExplanationStyle.ANALOGY)

        # Step-by-step style
        res_step = self.router.route("Walk me through the tokenization process step by step")
        self.assertEqual(res_step.intent, IntentType.EXPLAIN)
        self.assertEqual(res_step.style, ExplanationStyle.STEP_BY_STEP)

        # Standard explanation
        res_std = self.router.route("Explain how chunking affects retrieval")
        self.assertEqual(res_std.intent, IntentType.EXPLAIN)
        self.assertEqual(res_std.style, ExplanationStyle.STANDARD)

    def test_ambiguous_and_conversational_requests_return_unknown(self):
        queries = [
            "Hello there",
            "Good morning!",
            "Thank you",
            "asdfghjkl",
            "just some random words without a question",
            "yesterday at 3pm",
        ]
        for q in queries:
            with self.subTest(query=q):
                res = self.router.route(q)
                self.assertEqual(res.intent, IntentType.UNKNOWN)

    def test_malformed_inputs_handled_safely(self):
        # Empty string
        res_empty = self.router.route("")
        self.assertEqual(res_empty.intent, IntentType.UNKNOWN)

        # Whitespace only
        res_ws = self.router.route("     \n\t  ")
        self.assertEqual(res_ws.intent, IntentType.UNKNOWN)

        # None
        res_none = self.router.route(None)
        self.assertEqual(res_none.intent, IntentType.UNKNOWN)

        # Numbers or non-string types
        res_num = self.router.route(12345)
        self.assertEqual(res_num.intent, IntentType.UNKNOWN)

        # Pure symbols
        res_sym = self.router.route("???!!!")
        self.assertEqual(res_sym.intent, IntentType.UNKNOWN)

    def test_router_to_dict_serialization(self):
        res = self.router.route("Summarize chapter 4")
        d = res.to_dict()
        self.assertIsInstance(d, dict)
        self.assertEqual(d["intent"], "SUMMARIZE")
        self.assertIn("confidence", d)
        self.assertIn("reason", d)


class TestRouterAPI(unittest.TestCase):
    def setUp(self):
        from starlette.testclient import TestClient
        from app.main import app
        self.client = TestClient(app)

    def test_post_route_endpoint(self):
        resp = self.client.post("/route", json={"query": "Explain quantum computing like I'm 5"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["intent"], "EXPLAIN")
        self.assertEqual(data["style"], "beginner")
        self.assertGreater(data["confidence"], 0.8)

    def test_ask_endpoint_ambiguous_safe_handling(self):
        resp = self.client.post("/ask", json={"question": "Hello there", "k": 1})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["intent"], "UNKNOWN")
        self.assertIn("could not identify a clear question", data["answer"])
        self.assertEqual(len(data["contexts"]), 0)


if __name__ == "__main__":
    unittest.main()
