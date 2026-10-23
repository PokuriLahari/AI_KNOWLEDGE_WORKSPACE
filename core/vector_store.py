from typing import List, Dict, Any, Optional
from pathlib import Path
import chromadb
from chromadb.config import Settings as ChromaSettings

from .config import settings


class VectorStore:
    def __init__(
        self,
        collection_name: str = "documents",
        persist_directory: Optional[str] = None,
    ):
        target_dir = persist_directory or str(settings.CHROMA_PERSIST_DIR)
        Path(target_dir).mkdir(parents=True, exist_ok=True)

        # Persistent client stores vectors across server restarts
        try:
            self.client = chromadb.PersistentClient(path=target_dir)
        except Exception:
            # Fallback to standard client if PersistentClient raises
            self.client = chromadb.Client(
                ChromaSettings(
                    persist_directory=target_dir,
                    anonymized_telemetry=False,
                )
            )

        self.collection_name = collection_name
        self.collection = self.client.get_or_create_collection(collection_name)

    def add_documents(
        self,
        ids: List[str],
        embeddings,
        metadatas: List[Dict[str, Any]],
        documents: List[str],
    ):
        """Add chunks, embeddings, and metadata to collection."""
        if not ids:
            return
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )

    def query(self, query_embedding, k: int = 5, where: Optional[Dict[str, Any]] = None):
        """
        Query nearest neighbors with optional metadata filter (e.g. where={"document_id": doc_id}).
        Returns: dict with documents, metadatas, distances, ids
        """
        kwargs: Dict[str, Any] = {
            "query_embeddings": [query_embedding],
            "n_results": k,
        }
        if where:
            kwargs["where"] = where
        result = self.collection.query(**kwargs)
        return result

    def delete_by_document_id(self, document_id: str) -> int:
        """
        Delete all vector chunks associated with a specific document_id (FR-14).
        Returns the count of deleted chunks.
        """
        try:
            existing = self.collection.get(where={"document_id": document_id})
            ids = existing.get("ids", [])
            if ids:
                self.collection.delete(ids=ids)
                return len(ids)
            return 0
        except Exception as e:
            print(f"Warning: Failed to delete vectors for document_id '{document_id}': {e}")
            return 0

    def delete_by_source(self, source_name: str) -> int:
        """
        Delete all vector chunks associated with a source filename.
        Returns the count of deleted chunks if available.
        """
        try:
            # Query IDs with source metadata
            existing = self.collection.get(where={"source": source_name})
            ids = existing.get("ids", [])
            if ids:
                self.collection.delete(ids=ids)
                return len(ids)
            return 0
        except Exception as e:
            print(f"Warning: Failed to delete vectors for source '{source_name}': {e}")
            return 0

    def get_chunks_by_document_id(self, document_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve all chunks and metadata for a specific document_id.
        Preserves natural document ordering by (page, chunk_index).
        """
        try:
            res = self.collection.get(where={"document_id": document_id})
            docs = res.get("documents") or []
            metas = res.get("metadatas") or []
            ids = res.get("ids") or []

            items = []
            for doc_id, text, meta in zip(ids, docs, metas):
                items.append({
                    "id": doc_id,
                    "text": text,
                    "metadata": meta or {},
                })

            items.sort(key=lambda x: (
                int(x["metadata"].get("page", 1) or 1),
                int(x["metadata"].get("chunk_index", 0) or 0)
            ))
            return items
        except Exception as e:
            print(f"Warning: Failed to retrieve chunks for document_id '{document_id}': {e}")
            return []

    def get_chunks_by_source(
        self,
        source_name: Optional[str] = None,
        document_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve all chunks and metadata for a specific document_id or source name, or all sources if None.
        Preserves natural document ordering by (page, chunk_index).
        """
        try:
            if document_id:
                res = self.collection.get(where={"document_id": document_id})
            elif source_name:
                res = self.collection.get(where={"source": source_name})
            else:
                res = self.collection.get()

            docs = res.get("documents") or []
            metas = res.get("metadatas") or []
            ids = res.get("ids") or []

            items = []
            for doc_id, text, meta in zip(ids, docs, metas):
                items.append({
                    "id": doc_id,
                    "text": text,
                    "metadata": meta or {},
                })

            # Sort items by page then chunk_index to preserve original document order
            items.sort(key=lambda x: (
                int(x["metadata"].get("page", 1) or 1),
                int(x["metadata"].get("chunk_index", 0) or 0)
            ))
            return items
        except Exception as e:
            print(f"Warning: Failed to retrieve chunks for source '{source_name or document_id}': {e}")
            return []

    def count(self) -> int:
        """Return total chunks in the collection."""
        try:
            return self.collection.count()
        except Exception:
            return 0