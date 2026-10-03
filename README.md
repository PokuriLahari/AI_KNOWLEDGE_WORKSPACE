# Multi-Agent Document Intelligence System

A modular, multi-agent document intelligence platform built with **FastAPI**, **Streamlit**, and **SQLite**, designed around single-responsibility agents for parsing, retrieving, and reasoning across complex multi-format documents (PDF, DOCX, PPTX, TXT, CSV).

---

## 🏗️ Architecture & Sprints

- **Sprint 0 (Current)**: Foundation & Skeleton (FastAPI, Streamlit, SQLite, Structured Observability, Pytest & CI).
- **Sprint 1**: Ingestion + Retrieval Core (PDF, DOCX, PPTX, TXT, CSV parsers, text chunking, ChromaDB vector search).
- **Sprint 2**: Core RAG Loop (QAAgent with citations, honest refusal when insufficient evidence).
- **Sprint 3**: Orchestrator Routing & Multi-Capability (SummarizationAgent, ExplanationAgent).
- **Sprint 4**: Structured Operations (ComparisonAgent, ExtractionAgent).
- **Sprint 5**: Reasoning, Multi-turn Memory & Generation (GenerationAgent, MemoryManager).
- **Sprint 6**: Source Management & Polish (Background async processing, UI polish, complete coverage).

---

## 🚀 Getting Started

### 1. Prerequisites
- Python 3.10+ (tested on Python 3.13)
- `pip` or `uv`

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```
or using `uv`:
```bash
uv pip install -r requirements.txt
```

### 3. Run the Automated Tests
```bash
pytest -v
```

### 4. Start the FastAPI Backend
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 5. Start the Streamlit Frontend
In a separate terminal window:
```bash
streamlit run frontend/app.py
```
The application UI will open in your browser at: [http://localhost:8501](http://localhost:8501)

---

## 📊 Observability & Latency Tracking
All agent calls are decorated with `@timed_agent(agent_name)` which records latency, execution status, and logs structured metrics in real-time. Metrics can be queried directly at `/api/metrics` or viewed in the Streamlit UI dashboard.

---

## 📚 Requirements & Traceability

See:
- [docs/requirements.md](docs/requirements.md) - Functional and Non-Functional requirements specification.
- [docs/traceability.md](docs/traceability.md) - Requirements Traceability Matrix (RTM).

