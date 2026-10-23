from typing import List, Dict, Optional, Any, Union
import re
from openai import (
    OpenAI,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    APIStatusError,
    OpenAIError,
)

from ..router import ExplanationStyle


class ExplanationError(Exception):
    """Raised when explanation generation fails."""
    pass


class ExplainerAgent:
    """
    Dedicated Explainer Agent for FR-06.
    Supports multiple educational styles:
    - beginner: accessible language, defines terms, simple examples.
    - technical: in-depth mechanisms, technical architecture, precision.
    - analogy: relatable real-world metaphor with explicit breakdown of analogy limits.
    - step_by_step: logical sequential breakdown.
    - exam: revision structure with definitions, key principles, examples, conclusions.
    - standard: balanced general-purpose explanation.
    """

    STYLE_INSTRUCTIONS = {
        ExplanationStyle.BEGINNER: (
            "STYLE: BEGINNER-FRIENDLY (ELI5)\n"
            "- Use simple, clear everyday language.\n"
            "- Define any technical or unfamiliar terms immediately.\n"
            "- Use intuitive real-world examples to clarify the concept.\n"
            "- Keep sentence structures straightforward."
        ),
        ExplanationStyle.TECHNICAL: (
            "STYLE: IN-DEPTH TECHNICAL\n"
            "- Focus on underlying mechanisms, algorithms, system architecture, and formal definitions.\n"
            "- Specify technical constraints, trade-offs, and operational assumptions.\n"
            "- Maintain rigorous technical precision and domain terminology."
        ),
        ExplanationStyle.ANALOGY: (
            "STYLE: ANALOGY-DRIVEN\n"
            "- Introduce a relatable, vivid real-world analogy or metaphor.\n"
            "- Map the components of the analogy directly to the concept's components.\n"
            "- Explicitly explain where the analogy has limits or breaks down."
        ),
        ExplanationStyle.STEP_BY_STEP: (
            "STYLE: STEP-BY-STEP SEQUENCE\n"
            "- Break down the concept or procedure into a clear numbered sequence (Step 1, Step 2, ...).\n"
            "- Ensure each step builds logically on the preceding one.\n"
            "- Highlight cause-and-effect transitions between steps."
        ),
        ExplanationStyle.EXAM: (
            "STYLE: EXAM REVISION GUIDE\n"
            "Format the explanation systematically for student revision:\n"
            "1. Formal Definition & Summary\n"
            "2. Core Principles & Key Points\n"
            "3. Detailed Mechanism & Evidence\n"
            "4. Practical / Standard Example\n"
            "5. Exam Takeaway / Common Mistakes"
        ),
        ExplanationStyle.STANDARD: (
            "STYLE: STANDARD EDUCATIONAL\n"
            "- Provide a clear, balanced, and articulate explanation.\n"
            "- Cover the core concept, context, and key implications."
        ),
    }

    def __init__(self, client: OpenAI, model: str = "gemini-3.8-flash"):
        self.client = client
        self.model = model

    def _call_llm(self, prompt: str) -> str:
        """Helper to invoke LLM with robust error translation."""
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        except AuthenticationError as e:
            raise ExplanationError(f"Authentication failed with LLM provider: {e}") from e
        except RateLimitError as e:
            raise ExplanationError(f"Rate limit exceeded or quota exhausted: {e}") from e
        except APIConnectionError as e:
            raise ExplanationError(f"Network error connecting to LLM provider endpoint: {e}") from e
        except APIStatusError as e:
            raise ExplanationError(f"LLM provider error (status {e.status_code}): {e.message}") from e
        except OpenAIError as e:
            raise ExplanationError(f"LLM provider request failed: {e}") from e

    def _resolve_style(self, style: Optional[Union[str, ExplanationStyle]]) -> ExplanationStyle:
        """Resolve string or enum to ExplanationStyle."""
        if isinstance(style, ExplanationStyle):
            return style
        if isinstance(style, str):
            style_str = style.lower().strip()
            for s in ExplanationStyle:
                if s.value == style_str:
                    return s
        return ExplanationStyle.STANDARD

    def explain(
        self,
        query: str,
        contexts: Optional[List[Dict[str, Any]]] = None,
        style: Optional[Union[str, ExplanationStyle]] = None,
        session_history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Generate an educational explanation adhering to the requested style and document evidence.
        """
        resolved_style = self._resolve_style(style)
        style_prompt = self.STYLE_INSTRUCTIONS.get(
            resolved_style, self.STYLE_INSTRUCTIONS[ExplanationStyle.STANDARD]
        )

        has_document_evidence = bool(contexts and any(c.get("text", "").strip() for c in contexts))

        # Format context blocks
        context_blocks = []
        sources = set()
        if contexts:
            for c in contexts:
                text = c.get("text", "").strip()
                if text:
                    meta = c.get("metadata", {})
                    src = meta.get("source", "Unknown")
                    pg = meta.get("page", 1)
                    sources.add(src)
                    context_blocks.append(f"[Source: {src}, Page: {pg}]\n{text}")

        context_str = "\n\n---\n\n".join(context_blocks) if context_blocks else "No relevant document contexts retrieved."

        # Format session history if available
        history_str = ""
        if session_history:
            history_lines = [f"{t.get('role', 'user').capitalize()}: {t.get('content', '')}" for t in session_history]
            history_str = "\nPrevious Conversation:\n" + "\n".join(history_lines) + "\n"

        grounding_rules = """
GROUNDING AND CITATION RULES:
1. Base the factual claims primarily on the provided Document Context above.
2. Clearly distinguish between verified facts from the document and illustrative examples or analogies.
3. If the document evidence is incomplete or insufficient to fully explain the concept, explicitly state what is missing rather than fabricating facts.
4. Never invent page numbers, document titles, or quotations.
""" if has_document_evidence else """
GENERAL EXPLANATION RULES:
1. Since no document matched this query, provide a general educational explanation.
2. Begin with a clear notice: '[Note: This explanation is based on general domain knowledge as no specific matching document was found.]'
3. Maintain accurate educational clarity according to the requested style.
"""

        prompt = f"""You are an expert pedagogical explainer in an AI Knowledge Workspace.
Your mission is to help students, researchers, and professionals understand concepts deeply.

{style_prompt}

{grounding_rules}

Document Context:
---
{context_str}
---
{history_str}
User Query: {query}

Provide your explanation now:"""

        explanation_text = self._call_llm(prompt)

        return {
            "explanation": explanation_text,
            "style": resolved_style.value,
            "has_document_evidence": has_document_evidence,
            "sources": sorted(list(sources)),
            "contexts_count": len(contexts) if contexts else 0,
        }
