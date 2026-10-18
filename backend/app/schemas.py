from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class WorkspaceInviteCreate(BaseModel):
    email: EmailStr
    role: Literal["editor", "viewer"] = "editor"


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="sage", max_length=24)


class NoteImportRequest(BaseModel):
    notes: list[NoteCreate] = Field(min_length=1, max_length=100)


class NoteCreate(BaseModel):
    title: str = Field(default="Untitled", max_length=160)
    content: str = Field(default="", max_length=100_000)
    category: str = Field(default="General", max_length=40)
    icon: str = Field(default="✦", max_length=8)
    content_format: Literal["markdown", "plain"] = "markdown"


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    content: Optional[str] = Field(default=None, max_length=100_000)
    category: Optional[str] = Field(default=None, max_length=40)
    icon: Optional[str] = Field(default=None, max_length=8)
    bookmarked: Optional[bool] = None
    version: Optional[int] = Field(default=None, ge=1)
    content_format: Optional[Literal["markdown", "plain"]] = None


class Note(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    content: str
    category: str
    icon: str
    content_format: Literal["markdown", "plain"] = "markdown"
    bookmarked: bool
    version: int = 1
    created_at: datetime
    updated_at: datetime


class SummaryCreate(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    summary: str
    accuracy: Optional[float] = None


class MCPCall(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: Optional[Union[int, str]] = None
    method: str
    params: dict[str, Any] = Field(default_factory=dict)
