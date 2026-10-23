from pathlib import Path
import os
from typing import Set
from dotenv import load_dotenv

# Ensure project root is located and .env is loaded
PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH)


class Settings:
    """Centralized configuration for AI Knowledge Workspace."""

    # Project directories
    ROOT_DIR: Path = PROJECT_ROOT
    DATA_DIR: Path = PROJECT_ROOT / "data"
    TMP_DIR: Path = PROJECT_ROOT / "tmp"
    CHROMA_PERSIST_DIR: Path = PROJECT_ROOT / "chroma_db"
    SQLITE_PATH: Path = PROJECT_ROOT / "workspace.db"

    # Ingestion constraints (FR-01, FR-02)
    MAX_FILE_SIZE_BYTES: int = int(os.getenv("MAX_FILE_SIZE_BYTES", str(25 * 1024 * 1024)))  # 25 MB
    ALLOWED_EXTENSIONS: Set[str] = {".pdf", ".docx", ".pptx", ".txt", ".csv"}

    # Processing & Chunking (FR-02)
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "800"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "200"))

    # Retrieval (FR-03)
    DEFAULT_TOP_K: int = int(os.getenv("DEFAULT_TOP_K", "5"))
    CHROMA_COLLECTION_NAME: str = os.getenv("CHROMA_COLLECTION_NAME", "documents")

    # Embeddings
    EMBEDDING_MODEL_NAME: str = os.getenv(
        "EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"
    )

    # LLM Provider & Secrets
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "").strip().lower()

    # Active Provider Resolution
    @property
    def active_provider(self) -> str:
        prov = self.LLM_PROVIDER
        if prov in ("groq", "gemini", "openai"):
            return prov
        # Auto-detect if a key starts with gsk_ (Groq API Key format)
        if self.GROQ_API_KEY or (self.GEMINI_API_KEY and self.GEMINI_API_KEY.startswith("gsk_")) or (self.OPENAI_API_KEY and self.OPENAI_API_KEY.startswith("gsk_")):
            return "groq"
        elif self.GEMINI_API_KEY:
            return "gemini"
        elif self.OPENAI_API_KEY:
            return "openai"
        return "none"

    @property
    def api_key(self) -> str:
        if self.active_provider == "groq":
            return (
                self.GROQ_API_KEY
                or (self.GEMINI_API_KEY if self.GEMINI_API_KEY.startswith("gsk_") else "")
                or (self.OPENAI_API_KEY if self.OPENAI_API_KEY.startswith("gsk_") else "")
            )
        elif self.active_provider == "gemini":
            return self.GEMINI_API_KEY
        return self.OPENAI_API_KEY

    @property
    def model(self) -> str:
        if self.active_provider == "groq":
            return os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        elif self.active_provider == "gemini":
            return os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        return os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    @property
    def base_url(self) -> str:
        if self.active_provider == "groq":
            return os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
        elif self.active_provider == "gemini":
            return os.getenv(
                "GEMINI_BASE_URL",
                "https://generativelanguage.googleapis.com/v1beta/openai/",
            )
        return os.getenv("OPENAI_BASE_URL", None)


settings = Settings()
