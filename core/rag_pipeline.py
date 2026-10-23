from typing import List, Dict, Optional, Any, Union
from pathlib import Path
import uuid
import os
from openai import (
    OpenAI,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
    OpenAIError,
)

from .config import settings
from .embeddings import EmbeddingModel
from .vector_store import VectorStore
from .document_loader import load_document_text, load_pdf_text, chunk_text, DocumentParsingError
from .document_registry import DocumentRegistry
from .memory_layer import HindsightMemory
from .router import router, IntentType, ExplanationStyle
from .agents.summarizer import SummarizerAgent, SummarizationError
from .agents.explainer import ExplainerAgent, ExplanationError
from .agents.comparator import ComparatorAgent, ComparisonError


class RAGPipeline:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        openai_model: Optional[str] = None,
        collection_name: Optional[str] = None,
        persist_directory: Optional[str] = None,
    ):
        self.embedder = EmbeddingModel(model_name=settings.EMBEDDING_MODEL_NAME)
        self.vstore = VectorStore(
            collection_name=collection_name or settings.CHROMA_COLLECTION_NAME,
            persist_directory=persist_directory or str(settings.CHROMA_PERSIST_DIR),
        )
        self.registry = DocumentRegistry()
        self.memory = HindsightMemory()

        resolved_key = api_key or openai_api_key or settings.api_key
        resolved_model = model or openai_model or settings.model or "gemini-3.8-flash"
        resolved_base_url = base_url or settings.base_url

        if resolved_base_url:
            self.client = OpenAI(api_key=resolved_key, base_url=resolved_base_url)
        else:
            self.client = OpenAI(api_key=resolved_key)
        self.model = resolved_model

        # Dedicated specialized agents
        self.summarizer = SummarizerAgent(client=self.client, model=self.model)
        self.explainer = ExplainerAgent(client=self.client, model=self.model)
        self.comparator = ComparatorAgent(client=self.client, model=self.model)

    def index_document(self, path: Path) -> Dict:
        """
        Parse any supported document (PDF, DOCX, PPTX, TXT, CSV), chunk, embed,
        store in vector DB with unique document_id attached to every chunk, and record in DocumentRegistry.
        """
        pages = load_document_text(path)
        if not pages:
            raise DocumentParsingError(f"No extractable text found in '{path.name}'.")

        # Check if file with same name already exists in registry
        existing = self.registry.get_document_by_filename(path.name)
        if existing:
            doc_id = existing["id"]
            # Purge existing vectors before re-indexing to ensure no stale chunks are mixed
            self.vstore.delete_by_document_id(doc_id)
            self.vstore.delete_by_source(path.name)
        else:
            doc_id = str(uuid.uuid4())

        all_texts: List[str] = []
        metadatas: List[Dict] = []
        ids: List[str] = []

        for page in pages:
            page_num = page["page"]
            text = page["text"]
            chunks = chunk_text(text, chunk_size=settings.CHUNK_SIZE, chunk_overlap=settings.CHUNK_OVERLAP)

            for idx, chunk in enumerate(chunks):
                chunk_id = f"{doc_id}_{idx}"
                all_texts.append(chunk)
                ids.append(chunk_id)
                metadatas.append(
                    {
                        "document_id": doc_id,
                        "source": str(path.name),
                        "page": page_num,
                        "chunk_index": idx,
                    }
                )

        if all_texts:
            embeddings = self.embedder.embed_texts(all_texts)
            self.vstore.add_documents(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=all_texts,
            )

        # Register in SQLite DocumentRegistry
        file_stat = path.stat()
        registered = self.registry.register_document(
            filename=path.name,
            file_type=path.suffix.lower(),
            file_size=file_stat.st_size,
            page_count=len(pages),
            chunk_count=len(all_texts),
            status="indexed",
            doc_id=doc_id,
        )

        return {
            "status": "indexed",
            "file": path.name,
            "document_id": registered["id"],
            "pages": len(pages),
            "chunks": len(all_texts),
        }

    def index_pdf(self, path: Path):
        """Backwards-compatible wrapper around index_document."""
        return self.index_document(path)

    def delete_document(self, doc_id: str) -> Dict:
        """Delete document record and all associated vector chunks (FR-14)."""
        doc = self.registry.get_document(doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")

        filename = doc["filename"]
        self.registry.delete_document(doc_id)

        deleted_vectors = self.vstore.delete_by_document_id(doc_id)
        if deleted_vectors == 0:
            deleted_vectors = self.vstore.delete_by_source(filename)

        return {
            "status": "deleted",
            "document_id": doc_id,
            "filename": filename,
            "purged_vectors": deleted_vectors,
        }

    def summarize_document(
        self,
        query: str = "",
        document_id: Optional[str] = None,
        source_name: Optional[str] = None,
        format_type: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute full-document summarization using SummarizerAgent (FR-05).
        Enforces strict source isolation:
        - If document_id is provided, retrieves only chunks belonging to that document ID.
        - If document_id is not provided, resolves via source_name, query, or active registry.
        - If multiple documents exist and none is specified, prompts user to select a document.
        - Never combines chunks from unrelated documents into a single document summary.
        """
        target_id = document_id
        target_source = source_name
        docs_in_registry = self.registry.list_documents()

        if target_id:
            doc = self.registry.get_document(target_id)
            if not doc:
                raise ValueError(f"Document with ID '{target_id}' not found.")
            target_source = doc["filename"]
        elif target_source:
            doc = self.registry.get_document_by_filename(target_source)
            if doc:
                target_id = doc["id"]
        elif query:
            # Check if any registered document filename or ID is mentioned in query
            for doc in docs_in_registry:
                if doc["filename"].lower() in query.lower() or doc["id"] in query:
                    target_id = doc["id"]
                    target_source = doc["filename"]
                    break

        # If still unresolved
        if not target_id and not target_source:
            if len(docs_in_registry) == 0:
                return {
                    "question": query,
                    "answer": "No documents found in the workspace to summarize. Please upload a document first.",
                    "session_id": session_id,
                    "intent": "SUMMARIZE",
                    "contexts": [],
                    "summary_metadata": {
                        "coverage": "none",
                        "sources": [],
                        "chunks_used": 0,
                    },
                }
            elif len(docs_in_registry) == 1:
                target_id = docs_in_registry[0]["id"]
                target_source = docs_in_registry[0]["filename"]
            else:
                doc_list_str = ", ".join(f"'{d['filename']}'" for d in docs_in_registry)
                return {
                    "question": query,
                    "answer": f"Multiple documents are available in your workspace ({doc_list_str}). Please select or specify which document you would like to summarize.",
                    "session_id": session_id,
                    "intent": "SUMMARIZE",
                    "contexts": [],
                    "summary_metadata": {
                        "coverage": "none",
                        "sources": [],
                        "chunks_used": 0,
                        "disambiguation_required": True,
                    },
                }

        # Retrieve chunks strictly for the targeted document
        if target_id:
            chunks = self.vstore.get_chunks_by_document_id(target_id)
            if not chunks and target_source:
                chunks = self.vstore.get_chunks_by_source(source_name=target_source)
        else:
            chunks = self.vstore.get_chunks_by_source(source_name=target_source)

        # Enforce strict source isolation filter
        if target_id:
            chunks = [
                c for c in chunks
                if c.get("metadata", {}).get("document_id") == target_id
                or (not c.get("metadata", {}).get("document_id") and c.get("metadata", {}).get("source") == target_source)
            ]
        elif target_source:
            chunks = [
                c for c in chunks
                if c.get("metadata", {}).get("source") == target_source
            ]

        if not chunks:
            return {
                "question": query,
                "answer": f"No extractable text or chunks found for document '{target_source or target_id}'.",
                "session_id": session_id,
                "intent": "SUMMARIZE",
                "contexts": [],
                "summary_metadata": {
                    "coverage": "none",
                    "sources": [target_source] if target_source else [],
                    "chunks_used": 0,
                },
            }

        # Safe diagnostic inspection
        preview = (chunks[0].get("text", "")[:60] if chunks else "").strip().replace("\n", " ")
        print(f"DEBUG SUMMARIZE: doc_id={target_id}, source={target_source}, chunks={len(chunks)}, preview='{preview}'")

        try:
            summary_result = self.summarizer.summarize(
                chunks=chunks,
                query=query,
                format_type=format_type,
                scope_name=target_source,
            )
        except SummarizationError as e:
            raise RuntimeError(str(e)) from e

        # Attach representative contexts for citation inspection in UI
        contexts = [
            {"text": c["text"], "metadata": c["metadata"]}
            for c in chunks[:15]
        ]

        if session_id:
            self.memory.add_turn(session_id, "user", query)
            self.memory.add_turn(session_id, "assistant", summary_result["summary"])

        return {
            "question": query,
            "answer": summary_result["summary"],
            "session_id": session_id,
            "intent": "SUMMARIZE",
            "document_id": target_id,
            "contexts": contexts,
            "summary_metadata": summary_result,
        }

    def explain_concept(
        self,
        query: str,
        style: Optional[Union[str, ExplanationStyle]] = None,
        k: int = 5,
        session_id: Optional[str] = None,
        document_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a pedagogical explanation using ExplainerAgent (FR-06).
        Leverages document evidence, citation metadata, and session history.
        """
        q_emb = self.embedder.embed_texts([query])[0]
        where_filter = {"document_id": document_id} if document_id else None
        result = self.vstore.query(q_emb, k=k, where=where_filter)

        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]

        contexts = [
            {"text": d, "metadata": m} for d, m in zip(docs, metas) if d.strip()
        ]

        turns = []
        if session_id:
            turns = self.memory.get_recent_history(session_id=session_id, limit=4)

        try:
            res = self.explainer.explain(
                query=query,
                contexts=contexts,
                style=style,
                session_history=turns,
            )
        except ExplanationError as e:
            raise RuntimeError(str(e)) from e

        if session_id:
            self.memory.add_turn(session_id, "user", query)
            self.memory.add_turn(session_id, "assistant", res["explanation"])

        return {
            "question": query,
            "answer": res["explanation"],
            "session_id": session_id,
            "intent": "EXPLAIN",
            "style": res["style"],
            "document_id": document_id,
            "contexts": contexts,
            "explanation_metadata": res,
        }

    def answer_question(
        self,
        question: str,
        k: int = 5,
        session_id: Optional[str] = None,
        document_id: Optional[str] = None,
    ) -> Dict:
        """
        Retrieve top-k relevant chunks and ask LLM to answer.
        Dispatches SUMMARIZE intents to SummarizerAgent (FR-05).
        Dispatches EXPLAIN intents to ExplainerAgent (FR-06).
        Supports session conversation history via HindsightMemory (FR-11).
        Supports document isolation via document_id.
        """
        # Check intent routing
        route_res = router.route(question)
        if route_res.intent == IntentType.SUMMARIZE:
            return self.summarize_document(
                query=question,
                document_id=document_id,
                session_id=session_id,
            )
        elif route_res.intent == IntentType.EXPLAIN:
            return self.explain_concept(
                query=question,
                style=route_res.style,
                k=k,
                session_id=session_id,
                document_id=document_id,
            )
        elif route_res.intent == IntentType.COMPARE:
            docs_in_registry = self.registry.list_documents()
            if len(docs_in_registry) < 2:
                return {
                    "question": question,
                    "answer": "Cross-document comparison requires at least two registered documents in the workspace. Please upload another document or use the Document Comparison tool.",
                    "session_id": session_id,
                    "intent": "COMPARE",
                    "contexts": [],
                }
            comp_res = self.compare_documents(
                doc_id_a=docs_in_registry[0]["id"],
                doc_id_b=docs_in_registry[1]["id"],
                topic_query=question,
                session_id=session_id,
            )
            return {
                "question": question,
                "answer": comp_res["comparison"],
                "session_id": session_id,
                "intent": "COMPARE",
                "contexts": comp_res["contexts"],
                "comparison_metadata": comp_res,
            }

        q_emb = self.embedder.embed_texts([question])[0]
        where_filter = {"document_id": document_id} if document_id else None
        result = self.vstore.query(q_emb, k=k, where=where_filter)

        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]

        context_blocks = []
        for doc, meta in zip(docs, metas):
            context_blocks.append(
                f"Source: {meta.get('source')} (page {meta.get('page')})\n{doc}"
            )

        context_str = "\n\n---\n\n".join(context_blocks) if context_blocks else "No context retrieved."

        # Fetch conversation history from Hindsight memory if session_id is provided
        history_str = ""
        if session_id:
            turns = self.memory.get_recent_history(session_id=session_id, limit=4)
            if turns:
                history_lines = [f"{t['role'].capitalize()}: {t['content']}" for t in turns]
                history_str = "\nPrevious Conversation:\n" + "\n".join(history_lines) + "\n"

        prompt = f"""You are a helpful assistant in an AI Knowledge Workspace.
Answer the user's question using ONLY the retrieved context below.

Context:
{context_str}
{history_str}
Question: {question}

If the context is not sufficient, state clearly that the available documents do not contain sufficient evidence.
Do not fabricate information or citations.
"""

        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
            )
            answer = completion.choices[0].message.content
        except AuthenticationError as e:
            raise RuntimeError(f"Authentication failed with LLM provider. Please check your API key: {e}") from e
        except RateLimitError as e:
            raise RuntimeError(f"LLM provider rate limit exceeded or quota exhausted: {e}") from e
        except APIConnectionError as e:
            raise RuntimeError(f"Network error connecting to LLM provider API endpoint: {e}") from e
        except APIStatusError as e:
            raise RuntimeError(f"LLM provider returned error ({e.status_code}): {e.message}") from e
        except OpenAIError as e:
            raise RuntimeError(f"LLM provider request failed: {e}") from e

        # Record conversation in Hindsight memory
        if session_id:
            self.memory.add_turn(session_id, "user", question)
            self.memory.add_turn(session_id, "assistant", answer)

        return {
            "question": question,
            "answer": answer,
            "session_id": session_id,
            "intent": "QA",
            "contexts": [
                {"text": d, "metadata": m} for d, m in zip(docs, metas)
            ],
        }

    def compare_documents(
        self,
        doc_id_a: str,
        doc_id_b: str,
        topic_query: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute cross-document comparative analysis using ComparatorAgent (FR-07).
        """
        doc_a = self.registry.get_document(doc_id_a)
        if not doc_a:
            raise ValueError(f"Document A with ID '{doc_id_a}' not found in registry.")

        doc_b = self.registry.get_document(doc_id_b)
        if not doc_b:
            raise ValueError(f"Document B with ID '{doc_id_b}' not found in registry.")

        chunks_a = self.vstore.get_chunks_by_document_id(doc_id_a)
        chunks_b = self.vstore.get_chunks_by_document_id(doc_id_b)

        # Fallback to source name for legacy chunks
        if not chunks_a:
            chunks_a = self.vstore.get_chunks_by_source(source_name=doc_a["filename"])
        if not chunks_b:
            chunks_b = self.vstore.get_chunks_by_source(source_name=doc_b["filename"])

        try:
            comparison_result = self.comparator.compare(
                chunks_a=chunks_a,
                chunks_b=chunks_b,
                source_a=doc_a["filename"],
                source_b=doc_b["filename"],
                topic_query=topic_query,
            )
        except ComparisonError as e:
            raise RuntimeError(str(e)) from e

        contexts = [
            {"text": c["text"], "metadata": c["metadata"]}
            for c in chunks_a[:8] + chunks_b[:8]
        ]

        if session_id:
            interaction_title = f"Comparison of '{doc_a['filename']}' and '{doc_b['filename']}'"
            if topic_query:
                interaction_title += f" on topic '{topic_query}'"
            self.memory.add_turn(session_id, "user", interaction_title)
            self.memory.add_turn(session_id, "assistant", comparison_result["comparison"][:500] + "...")

        return {
            "doc_id_a": doc_id_a,
            "doc_id_b": doc_id_b,
            "source_a": doc_a["filename"],
            "source_b": doc_b["filename"],
            "topic_query": topic_query,
            "session_id": session_id,
            "comparison": comparison_result["comparison"],
            "similarities": comparison_result["similarities"],
            "differences": comparison_result["differences"],
            "conflicts": comparison_result["conflicts"],
            "absent_topics": comparison_result["absent_topics"],
            "coverage_a": comparison_result["coverage_a"],
            "coverage_b": comparison_result["coverage_b"],
            "contexts": contexts,
        }