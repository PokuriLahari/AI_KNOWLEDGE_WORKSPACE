from typing import List, Dict, Optional, Any
import re
from openai import (
    OpenAI,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
    OpenAIError,
)


class SummarizationError(Exception):
    """Raised when summarization fails."""
    pass


class SummarizerAgent:
    """
    Dedicated Summarizer Agent for FR-05.
    Supports:
    - Full-document summaries.
    - Section or selected-content summaries.
    - Bullet-point and key takeaways summaries.
    - Executive summaries.
    - Hierarchical summarization for long documents.
    """

    def __init__(self, client: OpenAI, model: str = "gemini-3.8-flash"):
        self.client = client
        self.model = model
        # Chunk text length limit before triggering hierarchical map-reduce
        self.max_single_pass_chars = 14000

    def detect_format(self, query: str) -> str:
        """Infer summary format from user query."""
        q = (query or "").lower()
        if re.search(r"\b(bullet[\s-]?points?|takeaways?|key\s+points?|highlights?)\b", q):
            return "bullets"
        elif re.search(r"\b(executive(\s+summary)?|brief|high[\s-]level)\b", q):
            return "executive"
        elif re.search(r"\b(section|chapter|part)\b", q):
            return "section"
        return "standard"

    def _call_llm(self, prompt: str) -> str:
        """Helper to invoke LLM with error translation."""
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except AuthenticationError as e:
            raise SummarizationError(f"Authentication failed with LLM provider: {e}") from e
        except RateLimitError as e:
            raise SummarizationError(f"Rate limit exceeded or quota exhausted: {e}") from e
        except APIConnectionError as e:
            raise SummarizationError(f"Network error connecting to LLM provider endpoint: {e}") from e
        except APIStatusError as e:
            raise SummarizationError(f"LLM provider error (status {e.status_code}): {e.message}") from e
        except OpenAIError as e:
            raise SummarizationError(f"LLM provider request failed: {e}") from e

    def _format_prompt(self, context_text: str, format_type: str, scope_desc: str) -> str:
        """Construct the prompt based on format type and scope."""
        if format_type == "bullets":
            format_instructions = """Provide a clear, structured summary using bullet points:
- Key Takeaways
- Major Findings / Important Facts
- Significant Outcomes or Metrics"""
        elif format_type == "executive":
            format_instructions = """Provide a high-level Executive Summary:
1. Executive Overview
2. Core Findings & Key Developments
3. Strategic Implications & Recommendations"""
        elif format_type == "section":
            format_instructions = f"""Provide a targeted summary specifically for the requested scope ({scope_desc}):
- Key Points in this section
- Detailed findings with context"""
        else:
            format_instructions = """Provide a comprehensive, well-structured summary:
- Overview
- Main Details & Key Topics
- Summary of Results / Conclusions"""

        return f"""You are an expert document summarizer in an AI Knowledge Workspace.
Summarize the following document content accurately based ONLY on the provided text.
Do not invent information or cite sources outside this text.

Scope: {scope_desc}

{format_instructions}

Document Content:
---
{context_text}
---

Provide the summary now:"""

    def summarize(
        self,
        chunks: List[Dict[str, Any]],
        query: str = "",
        format_type: Optional[str] = None,
        scope_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute summarization across document chunks.
        """
        if not chunks:
            return {
                "summary": "No extractable text found in the selected document(s) to summarize.",
                "format": format_type or "standard",
                "coverage": "none",
                "sources": [],
                "chunks_used": 0,
            }

        resolved_format = format_type or self.detect_format(query)
        sources = sorted(list({c.get("metadata", {}).get("source", "Unknown") for c in chunks}))
        pages = sorted(list({c.get("metadata", {}).get("page", 1) for c in chunks}))
        scope_desc = scope_name or (f"Document(s): {', '.join(sources)}" if sources else "Selected Content")

        total_char_len = sum(len(c.get("text", "")) for c in chunks)

        # 1. Single-pass summarization if within comfortable threshold
        if total_char_len <= self.max_single_pass_chars:
            formatted_content = "\n\n".join(
                f"[Source: {c.get('metadata', {}).get('source', 'Unknown')}, Page: {c.get('metadata', {}).get('page', 1)}]\n{c.get('text', '')}"
                for c in chunks
            )
            prompt = self._format_prompt(formatted_content, resolved_format, scope_desc)
            summary_text = self._call_llm(prompt)

            return {
                "summary": summary_text,
                "format": resolved_format,
                "coverage": "complete",
                "sources": sources,
                "page_range": f"{pages[0]}-{pages[-1]}" if len(pages) > 1 else str(pages[0] if pages else 1),
                "chunks_used": len(chunks),
                "hierarchical": False,
            }

        # 2. Hierarchical map-reduce summarization for large documents
        batch_size = 5
        intermediate_summaries = []
        partial_failures = 0

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            batch_text = "\n\n".join(
                f"[Page {c.get('metadata', {}).get('page', 1)}]: {c.get('text', '')}"
                for c in batch
            )
            batch_prompt = f"""Summarize this section of '{scope_desc}' concisely, preserving all key facts, numbers, and findings:

{batch_text}

Section Summary:"""
            try:
                batch_summary = self._call_llm(batch_prompt)
                intermediate_summaries.append(batch_summary)
            except Exception as e:
                partial_failures += 1
                intermediate_summaries.append(f"[Section {i // batch_size + 1} processing failed]")

        # Reduce step: combine intermediate summaries
        combined_text = "\n\n".join(
            f"Section {idx + 1} Summary:\n{s}" for idx, s in enumerate(intermediate_summaries)
        )
        final_prompt = self._format_prompt(
            combined_text,
            resolved_format,
            f"{scope_desc} (Combined from {len(intermediate_summaries)} sections)",
        )
        final_summary = self._call_llm(final_prompt)

        coverage_status = "partial" if partial_failures > 0 else "complete"

        return {
            "summary": final_summary,
            "format": resolved_format,
            "coverage": coverage_status,
            "sources": sources,
            "page_range": f"{pages[0]}-{pages[-1]}" if len(pages) > 1 else str(pages[0] if pages else 1),
            "chunks_used": len(chunks),
            "sections_processed": len(intermediate_summaries),
            "partial_failures": partial_failures,
            "hierarchical": True,
        }
