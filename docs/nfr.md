# Non-Functional Requirements (NFR)

## 1. Performance
- **Extraction Latency**: < 500ms for plain text / CSV under 1MB; < 2.5s for 20-page PDF/DOCX.
- **Embedding Latency**: < 100ms per 5 chunks on CPU using `all-MiniLM-L6-v2`.
- **Vector Retrieval Latency**: < 50ms for top-5 similarity search in ChromaDB.
- **End-to-End Latency**: < 3.5s for typical query response on Gemini 3.8 Flash.

## 2. Reliability & Availability
- **Service Uptime**: Backend `/health` probe returns HTTP 200 with active provider status.
- **Graceful Error Handling**: 100% of LLM errors (401 Bad Auth, 429 Rate Limit/Quota, 503 Connection) are caught and mapped to user-friendly messages without server crash.

## 3. AI Groundedness & Source Traceability
- **Citation Fidelity**: All factual claims must reference an extracted chunk `source` and `page`.
- **Honest Limitations**: If retrieved evidence is empty or insufficient, the model must explicitly state insufficient evidence instead of hallucinating.

## 4. Security & Privacy
- **Secret Isolation**: API keys remain strictly in `.env`; `.gitignore` ensures zero secrets committed to Git.
- **Storage Sanitization**: File uploads are sanitized against path traversal (`..`, special characters).
- **Zero Logging of Document Secrets**: Document text and prompts are excluded from debug/production server logs.

## 5. Scalability & Storage
- **Local Persistence**: Vector chunks persist in `chroma_db/`; metadata persists in SQLite `workspace.db`.
- **Clean Purge**: Deleting a document removes its record and purges all corresponding vector chunks from ChromaDB.

## 6. Validation Methods
- Automated test suite (`pytest tests/`) validating unit parsing, edge cases, error conditions, and API behavior with 100% mocked LLM execution.
- Live integration verification with sample documents.
