# Knowledge Workspace — Multi-Agent Document Intelligence System

A production-grade AI SaaS workspace for semantic document search, grounded multi-turn Q&A, hierarchical summarization, pedagogical concept explanation, and cross-document policy/conflict comparison.

## Architecture & Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Plus Jakarta Sans + JetBrains Mono typography
- **Backend & RAG API**: Express / FastAPI-compatible REST endpoints (`/health`, `/route`, `/index`, `/documents`, `/documents/{doc_id}`, `/ask`, `/summarize`, `/explain`, `/compare`, `/sessions`)
- **AI Synthesis**: `@google/genai` (`gemini-3.8-flash`) with strict citation grounding and deterministic hybrid retrieval fallback
- **Retrieval Pipeline**: Sliding-window semantic chunking (750 chars, 120-char overlap), BM25 + dense vector similarity ranking, Reciprocal Rank Fusion (RRF), and persistent workspace store (`.data/workspace-store.json`)

## Supported API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | Returns system health, active model/provider, vector store, indexed document count, and upload limits |
| `/route` | `POST` | Classifies query intent (`qa`, `summarize`, `explain`, `compare`, `general`), confidence, style, and target concept |
| `/index` | `POST` | Validates and indexes uploaded documents (`PDF`, `DOCX`, `PPTX`, `TXT`, `CSV` up to 25 MB) into semantic chunks |
| `/documents` | `GET` | Lists all indexed documents with chunk counts, page counts, file sizes, and timestamps |
| `/documents/{doc_id}` | `GET` | Returns full document metadata and all extracted chunks for inspection |
| `/documents/{doc_id}` | `DELETE` | Purges a document and all of its associated chunks from the registry |
| `/ask` | `POST` | Executes grounded RAG synthesis with `question`, `k`, `session_id`, and `document_id` |
| `/summarize` | `POST` | Generates structured summaries (`executive_brief`, `structured_sections`, `bullet_highlights`, `technical_deep_dive`) |
| `/explain` | `POST` | Deconstructs technical concepts (`technical`, `executive`, `step_by_step`, `eli5`) with document evidence |
| `/compare` | `POST` | Cross-references two documents on a topic to identify similarities, differences, conflicts, and coverage gaps |

## Environment Variables

Copy `.env.example` to `.env`:

```bash
GEMINI_API_KEY="your_gemini_api_key"
VITE_API_URL=""
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

## Setup & Startup Commands

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run unit tests**:
   ```bash
   npx --yes tsx --test src/lib/ragCore.test.ts
   ```

3. **Start the full-stack development server (Port 3000)**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```
