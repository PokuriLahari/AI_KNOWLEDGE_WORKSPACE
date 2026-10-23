import os
import re
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.rag_pipeline import RAGPipeline
from core.document_loader import DocumentParsingError
from core.router import router, IntentType
from .models import (
    AskRequest,
    AskResponse,
    RouteRequest,
    RouteResponse,
    SummarizeRequest,
    SummarizeResponse,
    ExplainRequest,
    ExplainResponse,
    CompareRequest,
    CompareResponse,
    DocumentListResponse,
    DocumentIndexResponse,
    DocumentDeleteResponse,
)

if not settings.api_key:
    raise RuntimeError(
        "No LLM API key found. Please set GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env"
    )

print(
    f"DEBUG PROVIDER: {settings.active_provider}, MODEL: {settings.model}, KEY: {repr(settings.api_key[:8] if settings.api_key else None)}"
)

app = FastAPI(
    title="AI Knowledge Workspace API",
    description="Multi-Agent Document Intelligence System",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = RAGPipeline(
    api_key=settings.api_key,
    model=settings.model,
    base_url=settings.base_url,
    collection_name=settings.CHROMA_COLLECTION_NAME,
    persist_directory=str(settings.CHROMA_PERSIST_DIR),
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "provider": settings.active_provider,
        "model": settings.model,
    }


@app.post("/route", response_model=RouteResponse)
def route_query(payload: RouteRequest):
    """
    Classify a user query into an operational intent (QA, SUMMARIZE, EXPLAIN, UNKNOWN) (FR-15).
    """
    res = router.route(payload.query)
    return RouteResponse(
        intent=res.intent.value,
        confidence=res.confidence,
        style=res.style.value if res.style else None,
        target_concept=res.target_concept,
        reason=res.reason,
        metadata=res.metadata,
    )


@app.post("/summarize", response_model=SummarizeResponse)
def summarize_endpoint(payload: SummarizeRequest):
    """
    Execute full-document, section, or bullet-point summarization (FR-05).
    """
    try:
        res = pipeline.summarize_document(
            query=payload.query or "Summarize document",
            document_id=payload.document_id,
            source_name=payload.source,
            format_type=payload.format,
            session_id=payload.session_id,
        )
        meta = res.get("summary_metadata", {})
        return SummarizeResponse(
            summary=res["answer"],
            format=meta.get("format", "standard"),
            coverage=meta.get("coverage", "complete"),
            sources=meta.get("sources", []),
            document_id=res.get("document_id"),
            page_range=meta.get("page_range"),
            chunks_used=meta.get("chunks_used", len(res.get("contexts", []))),
            contexts=[
                {"text": c["text"], "metadata": c["metadata"]}
                for c in res.get("contexts", [])
            ],
            session_id=payload.session_id,
        )
    except Exception as e:
        print("Error in /summarize:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/explain", response_model=ExplainResponse)
def explain_endpoint(payload: ExplainRequest):
    """
    Execute educational concept explanation with specified pedagogical style (FR-06).
    """
    try:
        res = pipeline.explain_concept(
            query=payload.query,
            style=payload.style,
            k=payload.k,
            session_id=payload.session_id,
            document_id=payload.document_id,
        )
        meta = res.get("explanation_metadata", {})
        return ExplainResponse(
            question=res["question"],
            explanation=res["answer"],
            style=res.get("style", payload.style or "standard"),
            session_id=payload.session_id,
            is_document_grounded=meta.get("has_document_evidence", False),
            sources=meta.get("sources", []),
            contexts=[
                {"text": c["text"], "metadata": c["metadata"]}
                for c in res.get("contexts", [])
            ],
            metadata=meta,
        )
    except Exception as e:
        print("Error in /explain:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compare", response_model=CompareResponse)
def compare_endpoint(payload: CompareRequest):
    """
    Execute grounded cross-document comparative analysis (FR-07).
    """
    try:
        res = pipeline.compare_documents(
            doc_id_a=payload.doc_id_a,
            doc_id_b=payload.doc_id_b,
            topic_query=payload.topic_query,
            session_id=payload.session_id,
        )
        return CompareResponse(
            doc_id_a=res["doc_id_a"],
            doc_id_b=res["doc_id_b"],
            source_a=res["source_a"],
            source_b=res["source_b"],
            topic_query=res.get("topic_query"),
            comparison=res["comparison"],
            similarities=res.get("similarities", []),
            differences=res.get("differences", []),
            conflicts=res.get("conflicts", []),
            absent_topics=res.get("absent_topics", {}),
            coverage_a=res.get("coverage_a", "complete"),
            coverage_b=res.get("coverage_b", "complete"),
            contexts=[
                {"text": c["text"], "metadata": c["metadata"]}
                for c in res.get("contexts", [])
            ],
            session_id=res.get("session_id"),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print("Error in /compare:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/documents", response_model=DocumentListResponse)
def list_documents():
    """Retrieve all indexed documents in the workspace (FR-14)."""
    docs = pipeline.registry.list_documents()
    return DocumentListResponse(documents=docs)


@app.delete("/documents/{doc_id}", response_model=DocumentDeleteResponse)
def delete_document(doc_id: str):
    """Delete a document record and purge all associated vector embeddings (FR-14)."""
    try:
        result = pipeline.delete_document(doc_id)
        return DocumentDeleteResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index", response_model=DocumentIndexResponse)
async def index_document(file: UploadFile = File(...)):
    """
    Ingest, parse, chunk, embed, and store a document (PDF, DOCX, PPTX, TXT, CSV) (FR-01, FR-02).
    """
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed: {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}",
        )

    # Sanitize filename (prevent directory traversal)
    safe_filename = re.sub(r"[^\w\.\-]", "_", Path(file.filename).name)
    tmp_dir = settings.TMP_DIR
    tmp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = tmp_dir / safe_filename

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_BYTES / (1024 * 1024):.1f} MB.",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Cannot index an empty file (0 bytes).")

    with temp_path.open("wb") as f:
        f.write(content)

    try:
        result = pipeline.index_document(temp_path)
    except DocumentParsingError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        print("Error indexing document:", repr(e))
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

    return DocumentIndexResponse(
        status=result["status"],
        file=result["file"],
        document_id=result["document_id"],
        pages=result["pages"],
        chunks=result["chunks"],
    )


@app.post("/ask", response_model=AskResponse)
async def ask_question(payload: AskRequest):
    """
    Answer questions using retrieved document contexts with intent routing and session memory (FR-04, FR-05, FR-11, FR-15).
    """
    # Route intent first (FR-15)
    route_result = router.route(payload.question)

    # Handle ambiguous / non-document requests safely
    if route_result.intent == IntentType.UNKNOWN:
        return AskResponse(
            question=payload.question,
            answer="I could not identify a clear question or document task. Please ask a specific question, or request an explanation or summary of your documents.",
            contexts=[],
            session_id=payload.session_id,
            intent=route_result.intent.value,
            routing=route_result.to_dict(),
        )

    try:
        result = pipeline.answer_question(
            payload.question,
            k=payload.k,
            session_id=payload.session_id,
            document_id=payload.document_id,
        )
    except Exception as e:
        print("Error in /ask:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))

    return AskResponse(
        question=result["question"],
        answer=result["answer"],
        session_id=result.get("session_id"),
        intent=result.get("intent", route_result.intent.value),
        routing=route_result.to_dict(),
        contexts=[
            {"text": c["text"], "metadata": c["metadata"]}
            for c in result.get("contexts", [])
        ],
    )