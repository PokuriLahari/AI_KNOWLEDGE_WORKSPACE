from typing import List, Dict
from pathlib import Path
import uuid
from openai import OpenAI
import os

from .embeddings import EmbeddingModel
from .vector_store import VectorStore
from .document_loader import load_pdf_text, chunk_text


class RAGPipeline:
    def __init__(
        self,
        openai_api_key: str,
        openai_model: str = "gpt-5-mini",
        collection_name: str = "documents",
        persist_directory: str = "chroma_db",
    ):
        self.embedder = EmbeddingModel()
        self.vstore = VectorStore(
            collection_name=collection_name,
            persist_directory=persist_directory,
        )
        self.client = OpenAI(api_key=openai_api_key)
        self.model = openai_model

    def index_pdf(self, path: Path):
        """
        Parse a PDF, chunk it, embed chunks, and store them in the vector DB.
        """
        pages = load_pdf_text(path)
        all_texts: List[str] = []
        metadatas: List[Dict] = []
        ids: List[str] = []

        for page in pages:
            page_num = page["page"]
            text = page["text"]
            chunks = chunk_text(text)

            for idx, chunk in enumerate(chunks):
                doc_id = str(uuid.uuid4())
                all_texts.append(chunk)
                ids.append(doc_id)
                metadatas.append(
                    {
                        "source": str(path.name),
                        "page": page_num,
                        "chunk_index": idx,
                    }
                )

        if not all_texts:
            return

        embeddings = self.embedder.embed_texts(all_texts)
        self.vstore.add_documents(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadatas,
            documents=all_texts,
        )

    def answer_question(self, question: str, k: int = 5) -> Dict:
        """
        Retrieve top-k relevant chunks and ask LLM to answer.
        Returns dict with answer + contexts.
        """
        q_emb = self.embedder.embed_texts([question])[0]
        result = self.vstore.query(q_emb, k=k)

        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]

        context_blocks = []
        for doc, meta in zip(docs, metas):
            context_blocks.append(
                f"Source: {meta.get('source')} (page {meta.get('page')})\n{doc}"
            )

        context_str = "\n\n---\n\n".join(context_blocks) if context_blocks else "No context retrieved."

        prompt = f"""
You are a helpful assistant. Answer the user's question using ONLY the context below.

Context:
{context_str}

Question: {question}

If the context is not sufficient, say you don't know.
"""

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "user", "content": prompt}
            ],
        )

        answer = completion.choices[0].message.content

        return {
            "question": question,
            "answer": answer,
            "contexts": [
                {"text": d, "metadata": m} for d, m in zip(docs, metas)
            ],
        }