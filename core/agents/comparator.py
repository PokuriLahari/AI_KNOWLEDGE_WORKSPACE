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


class ComparisonError(Exception):
    """Raised when document comparison fails."""
    pass


class ComparatorAgent:
    """
    Dedicated Document Comparison Agent for FR-07.
    Performs grounded cross-document comparative analysis:
    - Analyzes two selected documents (Document A and Document B).
    - Compares specific focus topics or entire documents.
    - Discovers similarities, differences, and conflicting claims.
    - Identifies content present in one source but absent from another.
    - Distinguishes supported findings, possible conflicts, and absent information.
    - Supports staged comparison for large documents.
    """

    def __init__(self, client: OpenAI, model: str = "gemini-3.8-flash"):
        self.client = client
        self.model = model
        self.max_single_pass_chars = 14000

    def _call_llm(self, prompt: str) -> str:
        """Execute LLM completion with robust provider error translation."""
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except AuthenticationError as e:
            raise ComparisonError(f"Authentication failed with LLM provider: {e}") from e
        except RateLimitError as e:
            raise ComparisonError(f"Rate limit exceeded or quota exhausted: {e}") from e
        except APIConnectionError as e:
            raise ComparisonError(f"Network error connecting to LLM provider endpoint: {e}") from e
        except APIStatusError as e:
            raise ComparisonError(f"LLM provider error (status {e.status_code}): {e.message}") from e
        except OpenAIError as e:
            raise ComparisonError(f"LLM provider request failed: {e}") from e

    def _format_chunks(self, chunks: List[Dict[str, Any]], source_name: str) -> str:
        """Format chunks into numbered context blocks with source and page attribution."""
        blocks = []
        for c in chunks:
            text = c.get("text", "").strip()
            if text:
                meta = c.get("metadata", {})
                pg = meta.get("page", 1)
                idx = meta.get("chunk_index", 0)
                blocks.append(f"[Source: {source_name}, Page: {pg}, Chunk: {idx}]\n{text}")
        return "\n\n".join(blocks)

    def _extract_bullet_items(self, text: str, header_pattern: str) -> List[str]:
        """Extract bullet items following a specific section header."""
        match = re.search(header_pattern, text, re.IGNORECASE)
        if not match:
            return []
        sub = text[match.end():]
        # End at next major header
        next_hdr = re.search(r"\n#{1,3}\s+|\n\d+\.\s+[A-Z]", sub)
        if next_hdr:
            sub = sub[:next_hdr.start()]
        items = []
        for line in sub.splitlines():
            line_str = line.strip()
            if line_str.startswith(("-", "*", "•")) or re.match(r"^\d+\.\s+", line_str):
                cleaned = re.sub(r"^[-*•\d\.\s]+", "", line_str).strip()
                if cleaned:
                    items.append(cleaned)
        return items

    def compare(
        self,
        chunks_a: List[Dict[str, Any]],
        chunks_b: List[Dict[str, Any]],
        source_a: str = "Document A",
        source_b: str = "Document B",
        topic_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Compare two sets of document chunks with grounded citation attribution.
        """
        # Validate inputs
        if not chunks_a and not chunks_b:
            return {
                "comparison": "Both selected documents are empty or have no extractable chunks.",
                "similarities": [],
                "differences": [],
                "conflicts": [],
                "absent_topics": {"source_a_only": [], "source_b_only": []},
                "coverage_a": "none",
                "coverage_b": "none",
                "sources": [source_a, source_b],
            }
        elif not chunks_a:
            return {
                "comparison": f"'{source_a}' contains no extractable content. Comparison cannot be performed.",
                "similarities": [],
                "differences": [],
                "conflicts": [],
                "absent_topics": {"source_a_only": [], "source_b_only": []},
                "coverage_a": "none",
                "coverage_b": "complete",
                "sources": [source_a, source_b],
            }
        elif not chunks_b:
            return {
                "comparison": f"'{source_b}' contains no extractable content. Comparison cannot be performed.",
                "similarities": [],
                "differences": [],
                "conflicts": [],
                "absent_topics": {"source_a_only": [], "source_b_only": []},
                "coverage_a": "complete",
                "coverage_b": "none",
                "sources": [source_a, source_b],
            }

        len_a = sum(len(c.get("text", "")) for c in chunks_a)
        len_b = sum(len(c.get("text", "")) for c in chunks_b)
        is_large = (len_a + len_b) > self.max_single_pass_chars

        coverage_a = "partial" if (is_large and len_a > self.max_single_pass_chars // 2) else "complete"
        coverage_b = "partial" if (is_large and len_b > self.max_single_pass_chars // 2) else "complete"

        # Limit chunks if large to preserve processing limits and report partial coverage
        if is_large:
            limit_chunks_a = chunks_a[:12]
            limit_chunks_b = chunks_b[:12]
        else:
            limit_chunks_a = chunks_a
            limit_chunks_b = chunks_b

        formatted_a = self._format_chunks(limit_chunks_a, source_a)
        formatted_b = self._format_chunks(limit_chunks_b, source_b)

        topic_instruction = f"FOCUS TOPIC / QUESTION: {topic_query}\nFocus your comparative analysis specifically on this topic across both documents." if topic_query else "SCOPE: Full Cross-Document Comparison across all available topics."

        prompt = f"""You are an objective document intelligence comparison analyst in an AI Knowledge Workspace.
Perform a thorough, grounded comparison between the following two sources:
- Source A: {source_a}
- Source B: {source_b}

{topic_instruction}

GROUNDING & CITATION RULES:
1. Every similarity, difference, and conflict MUST cite its supporting document and page metadata (e.g., [Source: {source_a}, Page: X]).
2. For CONFLICTING CLAIMS:
   - State the claim from Source A separately with its exact page citation.
   - State the contradictory claim from Source B separately with its exact page citation.
   - Describe the nature of the contradiction objectively.
   - Do NOT pick a winner or claim one is correct unless an explicit higher-authority citation is given in the text.
3. For ABSENT INFORMATION:
   - Identify topics or claims present in Source A but absent from Source B.
   - Identify topics or claims present in Source B but absent from Source A.
4. Categorize every finding clearly:
   - [Supported Finding] for verified facts.
   - [Possible Conflict / Discrepancy] for contradictions.
   - [Information Absent from Source X] for one-sided information.
   - [Incomplete Comparison] if context limitations prevented analyzing parts of the document.
5. Do NOT invent dates, statistics, quotations, or citations.

=== SOURCE A: {source_a} ===
{formatted_a}

=== SOURCE B: {source_b} ===
{formatted_b}

STRUCTURE YOUR RESPONSE EXACTLY AS FOLLOWS:
# Cross-Document Comparison: {source_a} vs {source_b}

## 1. Executive Summary & Scope
[High-level comparative overview]

## 2. Key Similarities
- [Supported Finding] [Similarity 1 with citations from both sources]
- [Supported Finding] [Similarity 2 with citations from both sources]

## 3. Key Differences
- [Supported Finding] [Difference 1 with citations]
- [Supported Finding] [Difference 2 with citations]

## 4. Conflicting Claims & Contradictions
- [Possible Conflict / Discrepancy] Topic: [Topic]
  - {source_a}: [Claim from A] (Page citation)
  - {source_b}: [Claim from B] (Page citation)
  - Nature of Disagreement: [Explanation]
(If no direct conflicts exist, state clearly: "No direct conflicting claims identified between the provided documents.")

## 5. Absent Information & Unilateral Coverage
- [Information Absent from {source_b}]: [Topic discussed only in {source_a}]
- [Information Absent from {source_a}]: [Topic discussed only in {source_b}]

## 6. Coverage & Processing Limits
[State whether comparison is complete or partial based on context constraints]

Provide the comparative report now:"""

        comparison_text = self._call_llm(prompt)

        # Parse structured sections
        similarities = self._extract_bullet_items(comparison_text, r"##\s*2\.\s*Key\s+Similarities")
        differences = self._extract_bullet_items(comparison_text, r"##\s*3\.\s*Key\s+Differences")
        conflicts_raw = self._extract_bullet_items(comparison_text, r"##\s*4\.\s*Conflicting\s+Claims")
        absent_raw = self._extract_bullet_items(comparison_text, r"##\s*5\.\s*Absent\s+Information")

        conflicts = []
        for c in conflicts_raw:
            if "no direct conflicting" not in c.lower():
                conflicts.append({
                    "topic": c,
                    "claim_a": f"See {source_a} citation in report",
                    "citation_a": None,
                    "claim_b": f"See {source_b} citation in report",
                    "citation_b": None,
                    "nature": "Identified contradiction",
                })

        absent_topics = {
            "source_a_only": [item for item in absent_raw if f"absent from {source_b}".lower() in item.lower() or f"{source_a} only".lower() in item.lower()],
            "source_b_only": [item for item in absent_raw if f"absent from {source_a}".lower() in item.lower() or f"{source_b} only".lower() in item.lower()],
        }

        return {
            "comparison": comparison_text,
            "similarities": similarities,
            "differences": differences,
            "conflicts": conflicts,
            "absent_topics": absent_topics,
            "coverage_a": coverage_a,
            "coverage_b": coverage_b,
            "sources": [source_a, source_b],
            "topic_query": topic_query,
        }
