from __future__ import annotations

from datetime import date, datetime
from math import isfinite
import re
from secrets import token_hex
from typing import Any

from fastapi import HTTPException


SUPPORTED_COLUMN_TYPES = {"text", "number", "date", "checkbox", "select"}
PROPERTY_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,40}$")


def normalize_columns(columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(columns) > 50:
        raise HTTPException(status_code=422, detail="A table can have at most 50 columns")
    result = []
    names: set[str] = set()
    ids: set[str] = set()
    for column in columns:
        name = column["name"].strip()
        normalized_name = name.casefold()
        column_type = column["type"]
        column_id = column.get("id")
        if not name:
            raise HTTPException(status_code=422, detail="Column names cannot be empty")
        if normalized_name in names:
            raise HTTPException(status_code=422, detail="Column names must be unique")
        if column_type not in SUPPORTED_COLUMN_TYPES:
            raise HTTPException(status_code=422, detail=f"Unsupported column type: {column_type}")
        if not column_id:
            column_id = token_hex(8)
        if not PROPERTY_ID_PATTERN.fullmatch(column_id) or column_id in ids:
            raise HTTPException(status_code=422, detail="Column ids must be unique and use letters, numbers, hyphens, or underscores")
        options = column.get("options", [])
        if column_type == "select":
            if not options or len(options) > 100:
                raise HTTPException(status_code=422, detail="Select columns require 1 to 100 options")
            options = [option.strip() for option in options]
            if any(not option for option in options) or len({option.casefold() for option in options}) != len(options):
                raise HTTPException(status_code=422, detail="Select options must be non-empty and unique")
        else:
            options = []
        names.add(normalized_name)
        ids.add(column_id)
        result.append({"id": column_id, "name": name[:80], "type": column_type, "options": options})
    return result


def validate_record_values(columns: list[dict[str, Any]], values: dict[str, Any]) -> dict[str, Any]:
    columns_by_id = {column["id"]: column for column in columns}
    unknown = set(values) - columns_by_id.keys()
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown column id: {sorted(unknown)[0]}")
    validated = {}
    for column in columns:
        column_id = column["id"]
        value = values.get(column_id)
        if value is None:
            validated[column_id] = None
            continue
        column_type = column["type"]
        if column_type == "text":
            if not isinstance(value, str) or len(value) > 10_000:
                raise HTTPException(status_code=422, detail=f"{column['name']} must be text up to 10000 characters")
        elif column_type == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
                raise HTTPException(status_code=422, detail=f"{column['name']} must be a finite number")
        elif column_type == "date":
            if not isinstance(value, str):
                raise HTTPException(status_code=422, detail=f"{column['name']} must be an ISO date or datetime")
            try:
                date.fromisoformat(value)
            except ValueError:
                try:
                    datetime.fromisoformat(value.replace("Z", "+00:00"))
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=f"{column['name']} must be an ISO date or datetime") from exc
        elif column_type == "checkbox" and not isinstance(value, bool):
            raise HTTPException(status_code=422, detail=f"{column['name']} must be true or false")
        elif column_type == "select" and value not in column["options"]:
            raise HTTPException(status_code=422, detail=f"{column['name']} must match one of its configured options")
        validated[column_id] = value
    return validated


def serialize_table(table: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(table["_id"]),
        "name": table["name"],
        "columns": table.get("columns", []),
        "created_at": table["created_at"].isoformat(),
        "updated_at": table["updated_at"].isoformat(),
    }


def serialize_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(record["_id"]),
        "table_id": str(record["table_id"]),
        "values": record.get("values", {}),
        "version": int(record.get("version", 1)),
        "created_at": record["created_at"].isoformat(),
        "updated_at": record["updated_at"].isoformat(),
    }
