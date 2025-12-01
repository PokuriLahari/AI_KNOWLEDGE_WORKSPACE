import os
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from core.rag_pipeline import RAGPipeline
from .models import AskRequest, AskResponse

# Locate the project root and .env file explicitly
PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")

print("DEBUG OPENAI_API_KEY:", repr(OPENAI_API_KEY[:8] if OPENAI_API_KEY else None))

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not set in environment (.env)")

app = FastAPI(title="RAG Document Q&A API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # tighten for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = RAGPipeline(
    openai_api_key=OPENAI_API_KEY,
    openai_model=OPENAI_MODEL,
    collection_name="documents",
    persist_directory="chroma_db",
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/index")
async def index_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for now.")

    tmp_dir = Path("tmp")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = tmp_dir / file.filename

    with temp_path.open("wb") as f:
        f.write(await file.read())

    pipeline.index_pdf(temp_path)
    return {"status": "indexed", "file": file.filename}


@app.post("/ask", response_model=AskResponse)
async def ask_question(payload: AskRequest):
    try:
        result = pipeline.answer_question(payload.question, k=payload.k)
    except Exception as e:
        # log it in the backend console
        print("Error in /ask:", repr(e))
        # send back a readable error message
        raise HTTPException(status_code=500, detail=str(e))

    return AskResponse(
        question=result["question"],
        answer=result["answer"],
        contexts=[
            {"text": c["text"], "metadata": c["metadata"]}
            for c in result["contexts"]
        ],
    )