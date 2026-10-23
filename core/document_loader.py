from pathlib import Path
from typing import List, Dict, Optional
import csv
import io
import pypdf

from .normalization import normalize_text
from .config import settings


class DocumentParsingError(Exception):
    """Raised when parsing a document fails."""
    pass


def validate_file(path: Path, max_size_bytes: Optional[int] = None) -> None:
    """Validate that the file exists, has an allowed extension, and does not exceed size limits."""
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    ext = path.suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file format '{ext}'. Allowed formats: {', '.join(sorted(settings.ALLOWED_EXTENSIONS))}"
        )

    size = path.stat().st_size
    limit = max_size_bytes or settings.MAX_FILE_SIZE_BYTES
    if size > limit:
        raise ValueError(
            f"File size ({size / (1024 * 1024):.2f} MB) exceeds maximum allowed size ({limit / (1024 * 1024):.1f} MB)"
        )
    if size == 0:
        raise ValueError("File is empty (0 bytes).")


def load_pdf_text(path: Path) -> List[Dict]:
    """Extract pages from a PDF file."""
    try:
        reader = pypdf.PdfReader(str(path))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise DocumentParsingError("Encrypted PDF could not be decrypted.")

        pages = []
        for i, page in enumerate(reader.pages):
            raw_text = page.extract_text() or ""
            cleaned = normalize_text(raw_text)
            if cleaned:
                pages.append({"page": i + 1, "text": cleaned})
        return pages
    except Exception as e:
        if isinstance(e, DocumentParsingError):
            raise
        raise DocumentParsingError(f"Failed to read PDF file '{path.name}': {e}") from e


def load_docx_text(path: Path) -> List[Dict]:
    """Extract paragraphs and tables from a DOCX file."""
    try:
        import docx
        doc = docx.Document(str(path))
        lines = []

        for p in doc.paragraphs:
            if p.text.strip():
                lines.append(p.text.strip())

        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    lines.append(row_text)

        full_text = normalize_text("\n\n".join(lines))
        return [{"page": 1, "text": full_text}] if full_text else []
    except Exception as e:
        raise DocumentParsingError(f"Failed to read DOCX file '{path.name}': {e}") from e


def load_pptx_text(path: Path) -> List[Dict]:
    """Extract text from slides in a PPTX presentation."""
    try:
        from pptx import Presentation
        prs = Presentation(str(path))
        slides = []

        for idx, slide in enumerate(prs.slides, start=1):
            slide_texts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        if paragraph.text.strip():
                            slide_texts.append(paragraph.text.strip())

            slide_content = normalize_text("\n".join(slide_texts))
            if slide_content:
                slides.append({"page": idx, "text": slide_content})
        return slides
    except Exception as e:
        raise DocumentParsingError(f"Failed to read PPTX file '{path.name}': {e}") from e


def load_txt_text(path: Path) -> List[Dict]:
    """Extract text from a plain text file."""
    try:
        content = ""
        for encoding in ("utf-8", "latin-1", "cp1252"):
            try:
                content = path.read_text(encoding=encoding)
                break
            except UnicodeDecodeError:
                continue

        cleaned = normalize_text(content)
        return [{"page": 1, "text": cleaned}] if cleaned else []
    except Exception as e:
        raise DocumentParsingError(f"Failed to read text file '{path.name}': {e}") from e


def load_csv_text(path: Path) -> List[Dict]:
    """Extract text from a CSV file preserving row/column format."""
    try:
        rows = []
        for encoding in ("utf-8", "latin-1"):
            try:
                with path.open("r", encoding=encoding, errors="replace") as f:
                    reader = csv.reader(f)
                    header = next(reader, None)
                    if header:
                        header_str = " | ".join(header)
                        rows.append(f"Header: {header_str}")
                    for idx, row in enumerate(reader, start=1):
                        if any(c.strip() for c in row):
                            rows.append(f"Row {idx}: " + " | ".join(row))
                break
            except Exception:
                continue

        cleaned = normalize_text("\n".join(rows))
        return [{"page": 1, "text": cleaned}] if cleaned else []
    except Exception as e:
        raise DocumentParsingError(f"Failed to read CSV file '{path.name}': {e}") from e


def load_document_text(path: Path) -> List[Dict]:
    """Modular parser dispatcher based on file extension."""
    validate_file(path)
    ext = path.suffix.lower()

    if ext == ".pdf":
        return load_pdf_text(path)
    elif ext == ".docx":
        return load_docx_text(path)
    elif ext == ".pptx":
        return load_pptx_text(path)
    elif ext == ".txt":
        return load_txt_text(path)
    elif ext == ".csv":
        return load_csv_text(path)
    else:
        raise DocumentParsingError(f"Unsupported file extension: {ext}")


def chunk_text(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 200,
) -> List[str]:
    """
    Sentence- and character-aware text chunking with overlap.
    """
    if not text:
        return []

    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - chunk_overlap
    return chunks