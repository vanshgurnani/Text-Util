from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from ..database import categories_collection


DEFAULT_CATEGORIES = ("Personal", "Work", "Ideas", "Reading", "General")


def _serialize(category: dict) -> dict:
    return {
        "id": str(category["_id"]),
        "name": category["name"],
        "key": category["key"],
        "color": category.get("color", "sage"),
        "system": bool(category.get("system", False)),
    }


def ensure_default_categories(workspace_id: ObjectId) -> None:
    now = datetime.now(timezone.utc)
    for name in DEFAULT_CATEGORIES:
        categories_collection().update_one(
            {"workspace_id": workspace_id, "key": name.lower()},
            {"$setOnInsert": {"workspace_id": workspace_id, "name": name, "key": name.lower(), "color": "sage", "system": True, "created_at": now}},
            upsert=True,
        )


def list_categories(workspace_id: ObjectId) -> list[dict]:
    ensure_default_categories(workspace_id)
    return [_serialize(item) for item in categories_collection().find({"workspace_id": workspace_id}).sort([("system", -1), ("name", 1)])]


def create_category(workspace_id: ObjectId, name: str, color: str = "sage") -> dict:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    now = datetime.now(timezone.utc)
    document = {"workspace_id": workspace_id, "name": name, "key": name.lower(), "color": color.strip()[:24] or "sage", "system": False, "created_at": now}
    try:
        result = categories_collection().insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Category already exists")
    document["_id"] = result.inserted_id
    return _serialize(document)


def delete_category(workspace_id: ObjectId, category_id: str) -> None:
    if not ObjectId.is_valid(category_id):
        raise HTTPException(status_code=400, detail="Invalid category id")
    result = categories_collection().delete_one({"_id": ObjectId(category_id), "workspace_id": workspace_id, "system": False})
    if result.deleted_count != 1:
        raise HTTPException(status_code=404, detail="Category not found or cannot be deleted")
