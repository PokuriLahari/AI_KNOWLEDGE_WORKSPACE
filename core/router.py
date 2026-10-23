import re
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Dict, Any


class IntentType(str, Enum):
    QA = "QA"
    SUMMARIZE = "SUMMARIZE"
    EXPLAIN = "EXPLAIN"
    COMPARE = "COMPARE"
    UNKNOWN = "UNKNOWN"


class ExplanationStyle(str, Enum):
    BEGINNER = "beginner"
    TECHNICAL = "technical"
    ANALOGY = "analogy"
    STEP_BY_STEP = "step_by_step"
    EXAM = "exam"
    STANDARD = "standard"


@dataclass
class IntentResult:
    """Structured routing outcome."""
    intent: IntentType
    confidence: float
    style: Optional[ExplanationStyle] = None
    target_concept: Optional[str] = None
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.intent.value,
            "confidence": self.confidence,
            "style": self.style.value if self.style else None,
            "target_concept": self.target_concept,
            "reason": self.reason,
            "metadata": self.metadata,
        }


class IntentRouter:
    """
    Deterministic & rule-first Intent Router (FR-15).
    Classifies queries into QA, SUMMARIZE, EXPLAIN, or UNKNOWN.
    """

    # Summary regex patterns
    SUMMARY_PATTERNS = [
        r"^(please\s+)?summariz(e|ation)\b",
        r"\b(give\s+(me\s+)?a\s+)?summary\s+(of\b)?",
        r"\btldr\b|\btl;dr\b",
        r"\b(provide\s+a\s+|give\s+a\s+)?recap\b",
        r"\b(overview|condensed\s+version)\s+of\b",
        r"\bbrief\s+summary\b",
        r"\bkey\s+takeaways\b",
    ]

    # Explain regex patterns
    EXPLAIN_PATTERNS = [
        r"^(please\s+)?explain\b",
        r"\bhelp\s+me\s+understand\b",
        r"\bbreak\s+down\b",
        r"\bwalk\s+me\s+through\b",
        r"\bclarify\s+how\b",
        r"\bcan\s+you\s+explain\b",
        r"\bwhat\s+does\s+(.+?)\s+mean\b",
    ]

    # Comparison regex patterns
    COMPARE_PATTERNS = [
        r"^(please\s+)?compare\b",
        r"\b(differences|similarities)\s+between\b",
        r"\bcross[\s-]document\s+comparison\b",
        r"\bcompare\s+(and\s+contrast\s+)?(these|the\s+two|both)\s+documents\b",
    ]

    # Style detection patterns
    STYLE_PATTERNS = {
        ExplanationStyle.BEGINNER: [
            r"\b(like\s+i('m|\s+am)\s+5|eli5)\b",
            r"\bfor\s+a\s+beginner\b",
            r"\b(in\s+)?simple\s+terms\b",
            r"\bsimple\s+explanation\b",
            r"\blayman('s)?\s+terms\b",
            r"\beasy\s+to\s+understand\b",
        ],
        ExplanationStyle.TECHNICAL: [
            r"\btechnical\s+detail\b",
            r"\btechnical\s+explanation\b",
            r"\bin-depth\b|\bdeep\s+dive\b",
            r"\bunder\s+the\s+hood\b",
            r"\barchitectur(e|al)\s+detail\b",
            r"\bmathematical\b|\balgorithmic\b",
            r"\bfor\s+an\s+engineer\b|\bfor\s+a\s+developer\b",
        ],
        ExplanationStyle.ANALOGY: [
            r"\b(with|using)\s+(an\s+)?analog(y|ies)\b",
            r"\bmetaphor\b",
            r"\bcompar(e|ison)\s+to\s+real\s+life\b",
        ],
        ExplanationStyle.STEP_BY_STEP: [
            r"\bstep[\s-]by[\s-]step\b",
            r"\bwalkthrough\b",
            r"\bstepwise\b",
        ],
        ExplanationStyle.EXAM: [
            r"\bfor\s+an\s+exam\b",
            r"\bexam[\s-]oriented\b",
            r"\bstudy\s+guide\b",
        ],
    }

    # QA trigger patterns
    QA_PATTERNS = [
        r"^(what|which|who|where|when|why|how|how\s+much|how\s+many|is|are|does|did|can)\b",
        r"\baccording\s+to\s+(the\s+)?document\b",
        r"\bmentioned\s+in\s+(the\s+)?document\b",
        r"\bfind\s+(the\s+)?information\b",
    ]

    # Greeting / non-document patterns (for UNKNOWN)
    GREETING_PATTERNS = [
        r"^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy)\b",
        r"^(thanks|thank\s+you|ok|okay|bye|goodbye)$",
    ]

    def detect_explanation_style(self, query: str) -> ExplanationStyle:
        """Detect the requested explanation style."""
        for style, patterns in self.STYLE_PATTERNS.items():
            for pat in patterns:
                if re.search(pat, query, re.IGNORECASE):
                    return style
        return ExplanationStyle.STANDARD

    def extract_concept(self, query: str) -> Optional[str]:
        """Attempt to extract the subject/concept being asked about."""
        cleaned = re.sub(
            r"^(please\s+)?(explain|summarize|tell\s+me\s+about)\s+",
            "",
            query,
            flags=re.IGNORECASE,
        )
        # Strip common style suffixes
        cleaned = re.sub(
            r"\b(like\s+i'm\s+5|in\s+simple\s+terms|in\s+technical\s+detail|step\s+by\s+step).*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        ).strip(" ?.,!\"'")
        return cleaned if cleaned else None

    def route(self, query: Any) -> IntentResult:
        """
        Route a user query into an IntentResult.
        Handles invalid/empty input gracefully.
        """
        # Guard clause for invalid / non-string input
        if not isinstance(query, str) or not query.strip():
            return IntentResult(
                intent=IntentType.UNKNOWN,
                confidence=0.0,
                reason="Query is empty or non-string.",
            )

        text = query.strip()

        # Pure punctuation or gibberish check (< 2 alphabetic characters)
        alpha_count = sum(1 for c in text if c.isalpha())
        if alpha_count < 2:
            return IntentResult(
                intent=IntentType.UNKNOWN,
                confidence=0.0,
                reason="Query contains insufficient alphabetic content.",
            )

        # 1. Check for Greetings / Pleasantries
        for pat in self.GREETING_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                return IntentResult(
                    intent=IntentType.UNKNOWN,
                    confidence=0.9,
                    reason="Query is a conversational greeting without document task.",
                )

        # 2. Check for Summarization Intent
        for pat in self.SUMMARY_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                concept = self.extract_concept(text)
                return IntentResult(
                    intent=IntentType.SUMMARIZE,
                    confidence=0.95,
                    target_concept=concept,
                    reason="Explicit summarization request matched.",
                )

        # 3. Check for Explanation Intent
        for pat in self.EXPLAIN_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                style = self.detect_explanation_style(text)
                concept = self.extract_concept(text)
                return IntentResult(
                    intent=IntentType.EXPLAIN,
                    confidence=0.92,
                    style=style,
                    target_concept=concept,
                    reason=f"Explanation intent matched with '{style.value}' style.",
                )

        # Also check if query doesn't start with 'explain' but explicitly requests an explanation style
        style = self.detect_explanation_style(text)
        if style != ExplanationStyle.STANDARD:
            concept = self.extract_concept(text)
            return IntentResult(
                intent=IntentType.EXPLAIN,
                confidence=0.88,
                style=style,
                target_concept=concept,
                reason=f"Requested explanation style '{style.value}' detected.",
            )

        # 4. Check for Comparison Intent
        for pat in self.COMPARE_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                concept = self.extract_concept(text)
                return IntentResult(
                    intent=IntentType.COMPARE,
                    confidence=0.92,
                    target_concept=concept,
                    reason="Cross-document comparison request matched.",
                )

        # 5. Check for QA Intent
        for pat in self.QA_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                return IntentResult(
                    intent=IntentType.QA,
                    confidence=0.85,
                    reason="Interrogative or document-referencing query matched.",
                )

        # If it ends with a question mark and has multiple words, classify as QA
        if text.endswith("?") and len(text.split()) >= 3:
            return IntentResult(
                intent=IntentType.QA,
                confidence=0.75,
                reason="Query is structured as a multi-word question.",
            )

        # 5. Fallback: If not clearly QA, SUMMARIZE, or EXPLAIN, return UNKNOWN
        # (avoiding silently turning arbitrary text into QA)
        return IntentResult(
            intent=IntentType.UNKNOWN,
            confidence=0.4,
            reason="Query does not clearly match QA, Summarization, or Explanation intents.",
        )


router = IntentRouter()
