from contextlib import contextmanager
import sqlite3
from typing import List, Dict, Optional
from datetime import datetime, timezone
from pathlib import Path
import uuid

from .config import settings


class DocumentRegistry:
    """
    SQLite-backed metadata registry for uploaded documents (FR-14).
    Maintains document records, processing status, and chunk counts.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or settings.SQLITE_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _init_db(self):
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL UNIQUE,
                    file_type TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    chunk_count INTEGER DEFAULT 0,
                    page_count INTEGER DEFAULT 0,
                    status TEXT NOT NULL,
                    error_message TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def register_document(
        self,
        filename: str,
        file_type: str,
        file_size: int,
        page_count: int = 0,
        chunk_count: int = 0,
        status: str = "indexed",
        error_message: Optional[str] = None,
        doc_id: Optional[str] = None,
    ) -> Dict:
        """Register or update an uploaded document record."""
        doc_id = doc_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO documents (id, filename, file_type, file_size, chunk_count, page_count, status, error_message, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(filename) DO UPDATE SET
                    id=excluded.id,
                    file_size=excluded.file_size,
                    chunk_count=excluded.chunk_count,
                    page_count=excluded.page_count,
                    status=excluded.status,
                    error_message=excluded.error_message,
                    created_at=excluded.created_at
                """,
                (doc_id, filename, file_type, file_size, chunk_count, page_count, status, error_message, now),
            )
            conn.commit()

        return self.get_document_by_filename(filename) or {
            "id": doc_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": file_size,
            "chunk_count": chunk_count,
            "page_count": page_count,
            "status": status,
            "created_at": now,
        }

    def list_documents(self) -> List[Dict]:
        """List all registered documents ordered by creation time descending."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM documents ORDER BY created_at DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_document(self, doc_id: str) -> Optional[Dict]:
        """Retrieve a document by ID."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_document_by_filename(self, filename: str) -> Optional[Dict]:
        """Retrieve a document by filename."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM documents WHERE filename = ?", (filename,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def delete_document(self, doc_id: str) -> Optional[str]:
        """
        Delete a document record by ID.
        Returns the filename of the deleted document, or None if not found.
        """
        doc = self.get_document(doc_id)
        if not doc:
            return None

        filename = doc["filename"]
        with self._get_connection() as conn:
            conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            conn.commit()
        return filename
