import sys
from pathlib import Path
import tempfile
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.document_registry import DocumentRegistry
from core.memory_layer import HindsightMemory
from starlette.testclient import TestClient
from app.main import app


class TestMemoryAndRegistry(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_workspace.db"
        self.registry = DocumentRegistry(db_path=self.db_path)
        self.memory = HindsightMemory(db_path=self.db_path)

    def tearDown(self):
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_document_registry_crud(self):
        # Register document
        doc = self.registry.register_document(
            filename="notes.txt",
            file_type=".txt",
            file_size=1024,
            page_count=1,
            chunk_count=3,
            status="indexed",
        )
        self.assertIsNotNone(doc["id"])
        self.assertEqual(doc["filename"], "notes.txt")

        # List documents
        docs = self.registry.list_documents()
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["filename"], "notes.txt")

        # Get by ID
        fetched = self.registry.get_document(doc["id"])
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["chunk_count"], 3)

        # Delete document
        deleted_name = self.registry.delete_document(doc["id"])
        self.assertEqual(deleted_name, "notes.txt")
        self.assertEqual(len(self.registry.list_documents()), 0)

    def test_hindsight_memory(self):
        session_id = "test-session-123"

        # Add conversation turns
        self.memory.add_turn(session_id, "user", "What is RAG?")
        self.memory.add_turn(session_id, "assistant", "Retrieval-Augmented Generation.")

        history = self.memory.get_recent_history(session_id, limit=5)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")
        self.assertEqual(history[1]["role"], "assistant")

        # Record consolidated memory
        self.memory.record_memory(session_id, "User is asking about RAG systems.", memory_type="observation")
        memories = self.memory.get_memories(session_id)
        self.assertEqual(len(memories), 1)
        self.assertIn("RAG systems", memories[0]["content"])

        # Clear session
        self.memory.clear_session(session_id)
        self.assertEqual(len(self.memory.get_recent_history(session_id)), 0)
        self.assertEqual(len(self.memory.get_memories(session_id)), 0)

    def test_fastapi_document_endpoints(self):
        client = TestClient(app)

        # Test index a text file
        file_content = b"This is a testing document about AI knowledge workspaces."
        resp = client.post(
            "/index",
            files={"file": ("test_doc.txt", file_content, "text/plain")},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["file"], "test_doc.txt")
        doc_id = data["document_id"]

        # Test list documents
        list_resp = client.get("/documents")
        self.assertEqual(list_resp.status_code, 200)
        docs = list_resp.json()["documents"]
        self.assertTrue(any(d["id"] == doc_id for d in docs))

        # Test delete document
        del_resp = client.delete(f"/documents/{doc_id}")
        self.assertEqual(del_resp.status_code, 200)
        self.assertEqual(del_resp.json()["status"], "deleted")


if __name__ == "__main__":
    unittest.main()
