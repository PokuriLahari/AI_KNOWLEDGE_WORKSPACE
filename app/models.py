from pydantic import BaseModel
from typing import List, Dict


class AskRequest(BaseModel):
    question: str
    k: int = 5


class ContextChunk(BaseModel):
    text: str
    metadata: Dict


class AskResponse(BaseModel):
    question: str
    answer: str
    contexts: List[ContextChunk]