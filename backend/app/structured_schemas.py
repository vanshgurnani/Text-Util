from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .structured_data import normalize_columns


class DataColumn(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=1, max_length=80)
    type: Literal["text", "number", "date", "checkbox", "select"] = "text"
    options: list[str] = Field(default_factory=list, max_length=100)


class DataTableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    columns: list[DataColumn] = Field(default_factory=list, max_length=50)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Table name cannot be empty")
        return value

    @field_validator("columns")
    @classmethod
    def validate_columns(cls, value: list[DataColumn]) -> list[DataColumn]:
        normalized = normalize_columns([column.model_dump() for column in value])
        return [DataColumn(**column) for column in normalized]


class DataTableUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Table name cannot be empty")
        return value


class DataRecordCreate(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict, max_length=50)


class DataRecordUpdate(BaseModel):
    version: int = Field(ge=1)
    values: dict[str, Any] = Field(max_length=50)
