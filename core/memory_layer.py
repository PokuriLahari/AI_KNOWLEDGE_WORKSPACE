from contextlib import contextmanager
import sqlite3
from typing import List, Dict, Optional
from datetime import datetime, timezone
from pathlib import Path
import uuid

from .config import settings


class HindsightMemory:
    """
    Biomimetic persistent memory layer inspired by Vectorize Hindsight (FR-11).
    Organizes agent memory into:
    - Session turns: conversation history per session.
    - Observations & Facts: key learnings and grounded insights retained across queries.
    Provides zero-latency SQLite reads without redundant LLM calls.
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
            # Session conversation turns
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_history (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_session_id ON session_history (session_id, created_at)"
            )

            # Consolidated knowledge facts & observations
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS hindsight_memories (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    memory_type TEXT NOT NULL, -- 'fact', 'observation', 'summary'
                    content TEXT NOT NULL,
                    source_doc TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def add_turn(self, session_id: str, role: str, content: str) -> None:
        """Record a conversation turn for a specific session."""
        now = datetime.now(timezone.utc).isoformat()
        turn_id = str(uuid.uuid4())
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO session_history (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (turn_id, session_id, role, content, now),
            )
            conn.commit()

    def get_recent_history(self, session_id: str, limit: int = 6) -> List[Dict[str, str]]:
        """Retrieve recent conversation turns for context construction."""
        if not session_id:
            return []
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT role, content FROM session_history
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, limit),
            )
            rows = cursor.fetchall()
            # Return in chronological order
            return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    def record_memory(
        self,
        session_id: str,
        content: str,
        memory_type: str = "fact",
        source_doc: Optional[str] = None,
    ) -> None:
        """Store an observation or fact learned during interaction."""
        now = datetime.now(timezone.utc).isoformat()
        mem_id = str(uuid.uuid4())
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO hindsight_memories (id, session_id, memory_type, content, source_doc, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (mem_id, session_id, memory_type, content, source_doc, now),
            )
            conn.commit()

    def get_memories(self, session_id: str, limit: int = 10) -> List[Dict]:
        """Fetch consolidated memories for a session."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT memory_type, content, source_doc, created_at
                FROM hindsight_memories
                WHERE session_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (session_id, limit),
            )
            return [dict(r) for r in cursor.fetchall()]

    def clear_session(self, session_id: str) -> None:
        """Clear session turns and memories for isolation."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM session_history WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM hindsight_memories WHERE session_id = ?", (session_id,))
            conn.commit()
