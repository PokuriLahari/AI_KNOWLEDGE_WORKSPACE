import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
import tempfile
import shutil

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.rag_pipeline import RAGPipeline
from core.vector_store import VectorStore
from core.document_registry import DocumentRegistry
from starlette.testclient import TestClient
from app.main import app


class TestSourceIsolationAndGrounding(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_workspace.db"
        self.chroma_dir = Path(self.temp_dir) / "chroma"
        
        self.pipeline = RAGPipeline(
            api_key="mock-key",
            model="gemini-3.8-flash",
            collection_name=f"test_coll_{Path(self.temp_dir).name}",
            persist_directory=str(self.chroma_dir),
        )
        self.pipeline.registry = DocumentRegistry(db_path=self.db_path)
        self.mock_client = MagicMock()
        self.pipeline.client = self.mock_client
        self.pipeline.summarizer.client = self.mock_client
        self.pipeline.explainer.client = self.mock_client
        self.pipeline.comparator.client = self.mock_client

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _setup_mock_response(self, text: str):
        mock_choice = MagicMock()
        mock_choice.message.content = text
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        self.mock_client.chat.completions.create.return_value = mock_resp

    def test_1_summarizing_doc_a_never_includes_chunks_from_doc_b(self):
        # Register Doc A and Doc B
        doc_a = self.pipeline.registry.register_document(
            filename="financials.pdf", file_type=".pdf", file_size=1000, doc_id="doc-a-id"
        )
        doc_b = self.pipeline.registry.register_document(
            filename="unicef_germany.pdf", file_type=".pdf", file_size=1000, doc_id="doc-b-id"
        )

        # Add vectors for both docs
        emb_a = self.pipeline.embedder.embed_texts(["Doc A financials: revenue grew by 15%."])
        self.pipeline.vstore.add_documents(
            ids=["a-1"],
            embeddings=emb_a,
            metadatas=[{"document_id": "doc-a-id", "source": "financials.pdf", "page": 1, "chunk_index": 0}],
            documents=["Doc A financials: revenue grew by 15%."],
        )

        emb_b = self.pipeline.embedder.embed_texts(["Doc B: Germany contributed 10M to UNICEF."])
        self.pipeline.vstore.add_documents(
            ids=["b-1"],
            embeddings=emb_b,
            metadatas=[{"document_id": "doc-b-id", "source": "unicef_germany.pdf", "page": 1, "chunk_index": 0}],
            documents=["Doc B: Germany contributed 10M to UNICEF."],
        )

        self._setup_mock_response("Financial Summary: Revenue grew 15%.")

        # Summarize Doc A explicitly by document_id
        res = self.pipeline.summarize_document(document_id="doc-a-id")

        call_args = self.mock_client.chat.completions.create.call_args
        prompt_content = call_args[1]["messages"][0]["content"]

        # Assert Doc A chunks are in prompt and Doc B chunks are strictly absent
        self.assertIn("revenue grew by 15%", prompt_content)
        self.assertNotIn("UNICEF", prompt_content)
        self.assertNotIn("Germany", prompt_content)
        self.assertEqual(res["document_id"], "doc-a-id")

    def test_2_two_documents_with_same_filename_do_not_collide(self):
        # Two uploads with same filename from different directories
        doc1 = self.pipeline.registry.register_document(
            filename="report.pdf", file_type=".pdf", file_size=500, doc_id="id-v1"
        )
        # Re-registering with new ID updates the record cleanly
        doc2 = self.pipeline.registry.register_document(
            filename="report.pdf", file_type=".pdf", file_size=600, doc_id="id-v2"
        )

        self.assertEqual(doc2["id"], "id-v2")
        self.assertEqual(doc2["file_size"], 600)

    def test_3_reuploading_document_purges_old_chunks(self):
        # Create temp file
        file_path = Path(self.temp_dir) / "test_doc.txt"
        file_path.write_text("Version 1 content about machine learning.")

        res1 = self.pipeline.index_document(file_path)
        doc_id = res1["document_id"]

        chunks1 = self.pipeline.vstore.get_chunks_by_document_id(doc_id)
        self.assertEqual(len(chunks1), 1)
        self.assertIn("Version 1", chunks1[0]["text"])

        # Re-upload with Version 2 content
        file_path.write_text("Version 2 updated content about deep learning.")
        res2 = self.pipeline.index_document(file_path)

        chunks2 = self.pipeline.vstore.get_chunks_by_document_id(doc_id)
        self.assertEqual(len(chunks2), 1)
        self.assertIn("Version 2", chunks2[0]["text"])
        self.assertNotIn("Version 1", chunks2[0]["text"])

    def test_4_deleting_doc_a_does_not_delete_doc_b_vectors(self):
        self.pipeline.registry.register_document(
            filename="docA.pdf", file_type=".pdf", file_size=100, doc_id="id-a"
        )
        self.pipeline.registry.register_document(
            filename="docB.pdf", file_type=".pdf", file_size=100, doc_id="id-b"
        )

        emb = self.pipeline.embedder.embed_texts(["Content A", "Content B"])
        self.pipeline.vstore.add_documents(
            ids=["chunk-a", "chunk-b"],
            embeddings=emb,
            metadatas=[
                {"document_id": "id-a", "source": "docA.pdf", "page": 1, "chunk_index": 0},
                {"document_id": "id-b", "source": "docB.pdf", "page": 1, "chunk_index": 0},
            ],
            documents=["Content A", "Content B"],
        )

        self.pipeline.delete_document("id-a")

        chunks_a = self.pipeline.vstore.get_chunks_by_document_id("id-a")
        chunks_b = self.pipeline.vstore.get_chunks_by_document_id("id-b")

        self.assertEqual(len(chunks_a), 0)
        self.assertEqual(len(chunks_b), 1)
        self.assertEqual(chunks_b[0]["text"], "Content B")

    def test_5_summary_uses_all_chunks_from_selected_document(self):
        self.pipeline.registry.register_document(
            filename="specs.txt", file_type=".txt", file_size=2000, doc_id="specs-id"
        )

        texts = [f"Section {i} technical requirements." for i in range(1, 6)]
        emb = self.pipeline.embedder.embed_texts(texts)
        self.pipeline.vstore.add_documents(
            ids=[f"spec-c-{i}" for i in range(1, 6)],
            embeddings=emb,
            metadatas=[{"document_id": "specs-id", "source": "specs.txt", "page": i, "chunk_index": i} for i in range(1, 6)],
            documents=texts,
        )

        self._setup_mock_response("Full technical specifications summary.")
        res = self.pipeline.summarize_document(document_id="specs-id")

        self.assertEqual(res["summary_metadata"]["chunks_used"], 5)
        call_args = self.mock_client.chat.completions.create.call_args
        prompt_content = call_args[1]["messages"][0]["content"]

        for i in range(1, 6):
            self.assertIn(f"Section {i} technical requirements", prompt_content)

    def test_6_api_passes_selected_document_id_correctly(self):
        client = TestClient(app)
        with patch.object(app.main.pipeline if hasattr(app, "main") else sys.modules["app.main"].pipeline, "summarize_document") as mock_sum:
            mock_sum.return_value = {
                "question": "Summarize",
                "answer": "Summary of chosen document.",
                "session_id": "s-1",
                "intent": "SUMMARIZE",
                "document_id": "target-id-123",
                "contexts": [],
                "summary_metadata": {"format": "standard", "coverage": "complete", "sources": ["doc.pdf"], "chunks_used": 1},
            }

            resp = client.post("/summarize", json={"document_id": "target-id-123"})
            self.assertEqual(resp.status_code, 200)
            mock_sum.assert_called_once()
            call_kwargs = mock_sum.call_args[1]
            self.assertEqual(call_kwargs["document_id"], "target-id-123")

    def test_7_unrelated_document_produces_summary_based_on_its_own_content(self):
        # Register an astronomy paper
        self.pipeline.registry.register_document(
            filename="james_webb_telescope.pdf", file_type=".pdf", file_size=4000, doc_id="jwst-id"
        )
        astronomy_text = "The James Webb Space Telescope detected high-redshift galaxies at z > 10."
        emb = self.pipeline.embedder.embed_texts([astronomy_text])
        self.pipeline.vstore.add_documents(
            ids=["jwst-1"],
            embeddings=emb,
            metadatas=[{"document_id": "jwst-id", "source": "james_webb_telescope.pdf", "page": 1, "chunk_index": 0}],
            documents=[astronomy_text],
        )

        self._setup_mock_response("Summary: JWST discovered ancient galaxies formed 300 million years after the Big Bang.")

        res = self.pipeline.summarize_document(document_id="jwst-id")

        self.assertIn("JWST", res["answer"])
        call_args = self.mock_client.chat.completions.create.call_args
        prompt_content = call_args[1]["messages"][0]["content"]
        self.assertIn("James Webb Space Telescope", prompt_content)
        self.assertNotIn("UNICEF", prompt_content)
        self.assertNotIn("Germany", prompt_content)

    def test_8_empty_or_unindexed_document_produces_clear_error(self):
        # Attempting to summarize non-existent document ID raises ValueError
        with self.assertRaises(ValueError) as ctx:
            self.pipeline.summarize_document(document_id="non-existent-id")
        self.assertIn("not found", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
