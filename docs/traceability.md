# Requirements Traceability Matrix (RTM)

## Project: Multi-Agent Document Intelligence System

This matrix maps each requirement to its architectural component, delivery sprint, automated testing strategy, and current status.

| Req ID | Title | Sprint | Architecture Component / Module | Test Strategy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-01** | Multi-Format Document Ingestion | Sprint 1 | `backend.app.agents.ingestion_agent` | Unit tests for PDF, DOCX, PPTX, TXT, CSV parsing | Planned |
| **FR-02** | Text Extraction & Chunking | Sprint 1 | `backend.app.agents.ingestion_agent` | Chunk length, overlap, and metadata extraction tests | Planned |
| **FR-03** | Vector Embedding & Semantic Retrieval | Sprint 1 | `backend.app.agents.retrieval_agent` | ChromaDB vector search retrieval accuracy tests | Planned |
| **FR-04** | Grounded Question Answering | Sprint 2 | `backend.app.agents.qa_agent` | Grounded QA evaluation and chunk citation tests | Planned |
| **FR-05** | Document Summarization | Sprint 3 | `backend.app.agents.summarization_agent` | Source summarization format and content tests | Planned |
| **FR-06** | Multi-Level Explanation | Sprint 3 | `backend.app.agents.explanation_agent` | Complexity prompt level verification tests | Planned |
| **FR-07** | Multi-Source Comparison | Sprint 4 | `backend.app.agents.comparison_agent` | Multi-source comparison difference matrix tests | Planned |
| **FR-08** | Structured Field Extraction | Sprint 4 | `backend.app.agents.extraction_agent` | Pydantic schema validation for extracted entities | Planned |
| **FR-09** | Grounded Content Generation | Sprint 5 | `backend.app.agents.generation_agent` | Fact-checking against source chunks | Planned |
| **FR-10** | Multi-Source Synthesis | Sprint 5 | `backend.app.orchestrator` / `qa_agent` | Multi-document reasoning integration tests | Planned |
| **FR-11** | Conversational Memory | Sprint 5 | `backend.app.memory.memory_manager` | Multi-turn context retention tests | Planned |
| **FR-12** | Source & Citation Attribution | Sprint 2 | `backend.app.agents.qa_agent` | Citation metadata presence and schema checks | Planned |
| **FR-13** | Honest Evidence Refusal | Sprint 2 | `backend.app.agents.qa_agent` | Negative case testing for low-confidence queries | Planned |
| **FR-14** | Source Lifecycle Management | Sprint 6 | `backend.app.database`, `frontend.app` | Source deletion and vector cleanup integration tests | Planned |
| **FR-15** | Intelligent Intent Routing | Sprint 3 | `backend.app.orchestrator` | Intent classification & LLM tool routing tests | Planned |
| **NFR-01** | Observability & Latency Tracking | Sprint 0 | `backend.app.utils.logger` | `test_timed_agent_decorator_sync` & `_async` | **Completed** |
| **NFR-02** | Plain Agent Architecture | Sprint 0+ | `backend.app.agents.*` | Architecture review, modular imports | **Completed** |
| **NFR-03** | SQLite Metadata Persistence | Sprint 0 | `backend.app.database` | `test_database_models` | **Completed** |
| **NFR-04** | Async Progress Tracking | Sprint 6 | `backend.app.database` (`Job` model) | Job progress update and polling tests | Planned |
| **NFR-05** | CI & Automated Test Coverage | Sprint 0 | `.github/workflows/ci.yml` | GitHub Actions workflow execution | **Completed** |
