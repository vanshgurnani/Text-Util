from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, Union
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class NoteCreate(BaseModel):
    title: str = Field(default="Untitled", max_length=160)
    content: str = Field(default="", max_length=100_000)
    category: str = Field(default="General", max_length=40)
    icon: str = Field(default="✦", max_length=8)
    parent_id: Optional[str] = None
    source_url: Optional[str] = Field(default=None, max_length=2048)
    inbox: bool = False

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Source URL must use http or https")
        return value


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    content: Optional[str] = Field(default=None, max_length=100_000)
    category: Optional[str] = Field(default=None, max_length=40)
    icon: Optional[str] = Field(default=None, max_length=8)
    bookmarked: Optional[bool] = None
    inbox: Optional[bool] = None
    source_url: Optional[str] = Field(default=None, max_length=2048)

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return value
        parsed = urlsplit(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Source URL must use http or https")
        return value.strip()


class Note(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    content: str
    category: str
    icon: str
    bookmarked: bool
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
