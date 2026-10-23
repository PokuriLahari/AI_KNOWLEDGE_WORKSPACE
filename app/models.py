from pydantic import BaseModel
from typing import List, Dict, Optional, Any


class AskRequest(BaseModel):
    question: str
    k: int = 5
    session_id: Optional[str] = None
    document_id: Optional[str] = None


class ContextChunk(BaseModel):
    text: str
    metadata: Dict


class AskResponse(BaseModel):
    question: str
    answer: str
    contexts: List[ContextChunk]
    session_id: Optional[str] = None
    intent: Optional[str] = None
    routing: Optional[Dict[str, Any]] = None


class SummarizeRequest(BaseModel):
    query: Optional[str] = "Please summarize this document"
    document_id: Optional[str] = None
    source: Optional[str] = None
    format: Optional[str] = None
    session_id: Optional[str] = None


class SummarizeResponse(BaseModel):
    summary: str
    format: str
    coverage: str
    sources: List[str]
    document_id: Optional[str] = None
    page_range: Optional[str] = None
    chunks_used: int
    contexts: List[ContextChunk]
    session_id: Optional[str] = None


class ExplainRequest(BaseModel):
    query: str
    style: Optional[str] = "standard"
    k: int = 5
    session_id: Optional[str] = None
    document_id: Optional[str] = None


class ConflictItem(BaseModel):
    topic: str
    claim_a: str
    citation_a: Optional[str] = None
    claim_b: str
    citation_b: Optional[str] = None
    nature: str


class CompareRequest(BaseModel):
    doc_id_a: str
    doc_id_b: str
    topic_query: Optional[str] = None
    session_id: Optional[str] = None


class CompareResponse(BaseModel):
    doc_id_a: str
    doc_id_b: str
    source_a: str
    source_b: str
    topic_query: Optional[str] = None
    comparison: str
    similarities: List[str] = []
    differences: List[str] = []
    conflicts: List[ConflictItem] = []
    absent_topics: Dict[str, List[str]] = {}
    coverage_a: str = "complete"
    coverage_b: str = "complete"
    contexts: List[ContextChunk] = []
    session_id: Optional[str] = None


class ExplainResponse(BaseModel):
    question: str
    explanation: str
    style: str
    contexts: List[ContextChunk]
    session_id: Optional[str] = None
    is_document_grounded: bool = False
    sources: List[str] = []
    metadata: Optional[Dict[str, Any]] = None


class RouteRequest(BaseModel):
    query: str


class RouteResponse(BaseModel):
    intent: str
    confidence: float
    style: Optional[str] = None
    target_concept: Optional[str] = None
    reason: str = ""
    metadata: Optional[Dict[str, Any]] = None


class DocumentItem(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    chunk_count: int = 0
    page_count: int = 0
    status: str
    error_message: Optional[str] = None
    created_at: str


class DocumentListResponse(BaseModel):
    documents: List[DocumentItem]


class DocumentIndexResponse(BaseModel):
    status: str
    file: str
    document_id: str
    pages: int
    chunks: int


class DocumentDeleteResponse(BaseModel):
    status: str
    document_id: str
    filename: str
    purged_vectors: int