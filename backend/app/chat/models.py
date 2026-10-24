from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ChatCitation(BaseModel):
    chunk_id: str
    note_id: str
    note_title: str
    heading_path: list[str] = []
    snippet: str
    score: float = 0.0


class ChatMessageOut(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant", "system"]
    content: str
    citations: list[ChatCitation] = []
    created_at: str


class ConversationSummary(BaseModel):
    id: str
    title: str
    model: str
    is_pinned: bool = False
    message_count: int = 0
    created_at: str
    updated_at: str


class ConversationDetail(BaseModel):
    id: str
    title: str
    model: str
    is_pinned: bool = False
    messages: list[ChatMessageOut] = []
    created_at: str
    updated_at: str


class CreateConversationRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = "gemini-2.0-flash"


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    is_pinned: Optional[bool] = None
    model: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)
    model: Optional[str] = None
    stream: bool = True
    use_rag: bool = True
    category_filter: Optional[str] = None
    note_id_filter: Optional[list[str]] = None


class ExportToNoteRequest(BaseModel):
    title: Optional[str] = None
    category: str = "ai-chats"
    tags: list[str] = ["ai-chat", "summary"]
