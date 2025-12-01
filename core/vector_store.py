from typing import List, Dict, Any
import chromadb
from chromadb.config import Settings


class VectorStore:
    def __init__(
        self,
        collection_name: str = "documents",
        persist_directory: str = "chroma_db",
    ):
        self.client = chromadb.Client(
            Settings(
                persist_directory=persist_directory,
                anonymized_telemetry=False,
            )
        )
        self.collection = self.client.get_or_create_collection(collection_name)

    def add_documents(
        self,
        ids: List[str],
        embeddings,
        metadatas: List[Dict[str, Any]],
        documents: List[str],
    ):
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=documents,
        )

    def query(self, query_embedding, k: int = 5):
        """
        Returns: dict with documents, metadatas, distances, ids
        """
        result = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
        )
        return result