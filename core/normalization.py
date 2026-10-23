import re
import unicodedata


def normalize_text(text: str) -> str:
    """
    Conservative text normalization.
    - Preserves paragraph structures and line breaks.
    - Normalizes unicode characters (NFC).
    - Removes unprintable/control characters (except tabs and newlines).
    - Standardizes repeated spaces on the same line without flattening paragraphs.
    """
    if not text:
        return ""

    # Normalize unicode to standard composition form
    text = unicodedata.normalize("NFC", text)

    # Remove non-printable control characters except newline and tab
    text = "".join(ch for ch in text if ch in ("\n", "\t", "\r") or not unicodedata.category(ch).startswith("C"))

    # Normalize carriage returns to standard newline
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Clean multiple inline spaces while keeping linebreaks
    lines = []
    for line in text.split("\n"):
        cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
        lines.append(cleaned_line)

    # Join and limit consecutive blank lines to at most two
    result = "\n".join(lines)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()
