from __future__ import annotations

import base64
import binascii
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException

from ..database import note_revisions_collection, notes_collection
from ..schemas import NoteCreate, NoteUpdate
from ..serializers import serialize_note


def owner_filter(user: dict) -> dict:
    return {"owner_id": user["_id"]}


def _decode_cursor(cursor: Optional[str]) -> Optional[dict]:
    if not cursor:
        return None
    try:
        value = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii") + b"=" * (-len(cursor) % 4)))
        timestamp = datetime.fromisoformat(value["updated_at"])
        if timestamp.tzinfo:
            timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
        return {"updated_at": timestamp, "_id": ObjectId(value["id"])}
    except (ValueError, TypeError, KeyError, binascii.Error):
        raise HTTPException(status_code=400, detail="Invalid notes cursor")


def _encode_cursor(note: dict) -> str:
    value = {"updated_at": note["updated_at"].isoformat(), "id": str(note["_id"])}
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()


def list_user_notes(
    *,
    user: dict,
    search: str = "",
    category: Optional[str] = None,
    bookmarked: Optional[bool] = None,
    limit: int = 50,
    cursor: Optional[str] = None,
) -> dict:
    limit = max(1, min(limit, 100))
    filters: list[dict[str, Any]] = [owner_filter(user)]
    if category and category.lower() != "all":
        filters.append({"category": category})
    if bookmarked is not None:
        filters.append({"bookmarked": bookmarked})
    if search.strip():
        normalized_search = search.strip()
        if " " in normalized_search:
            filters.append({"$text": {"$search": normalized_search}})
        else:
            escaped = re.escape(normalized_search)
            filters.append({"$or": [{"title": {"$regex": escaped, "$options": "i"}}, {"content": {"$regex": escaped, "$options": "i"}}]})
    decoded = _decode_cursor(cursor)
    if decoded:
        filters.append({"$or": [
            {"updated_at": {"$lt": decoded["updated_at"]}},
            {"updated_at": decoded["updated_at"], "_id": {"$lt": decoded["_id"]}},
        ]})
    query = filters[0] if len(filters) == 1 else {"$and": filters}
    documents = list(notes_collection().find(query).sort([("updated_at", -1), ("_id", -1)]).limit(limit + 1))
    next_cursor = None
    if len(documents) > limit:
        last = documents.pop()
        next_cursor = _encode_cursor(last)
    return {"notes": [serialize_note(note) for note in documents], "next_cursor": next_cursor}


def get_user_note(note_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(note_id):
        raise HTTPException(status_code=400, detail="Invalid note id")
    note = notes_collection().find_one({"_id": ObjectId(note_id), **owner_filter(user)})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def create_user_note(payload: NoteCreate, user: dict, *, actor: str = "web") -> dict:
    now = datetime.now(timezone.utc)
    note = {**payload.model_dump(), "owner_id": user["_id"], "workspace_id": user.get("primary_workspace_id"), "bookmarked": False, "version": 1, "created_at": now, "updated_at": now}
    result = notes_collection().insert_one(note)
    note["_id"] = result.inserted_id
    note_revisions_collection().insert_one({"note_id": result.inserted_id, "owner_id": user["_id"], "workspace_id": note.get("workspace_id"), "version": 1, "title": note["title"], "content": note["content"], "changed_by": actor, "created_at": now})
    return note


def update_user_note(note_id: str, payload: NoteUpdate, user: dict, *, actor: str = "web") -> dict:
    current = get_user_note(note_id, user)
    changes = {key: value for key, value in payload.model_dump().items() if value is not None and key != "version"}
    new_version = int(current.get("version", 1)) + 1
    expected_version = payload.version
    if expected_version is not None and expected_version != current.get("version", 1):
        raise HTTPException(status_code=409, detail="Note changed elsewhere; reload before saving")
    changes.update({"version": new_version, "updated_at": datetime.now(timezone.utc)})
    result = notes_collection().update_one({"_id": current["_id"], **owner_filter(user), "version": current.get("version", 1)}, {"$set": changes})
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Note changed elsewhere; reload before saving")
    updated = get_user_note(note_id, user)
    note_revisions_collection().insert_one({"note_id": current["_id"], "owner_id": user["_id"], "workspace_id": updated.get("workspace_id"), "version": new_version, "title": updated["title"], "content": updated["content"], "changed_by": actor, "created_at": updated["updated_at"]})
    return updated


def delete_user_note(note_id: str, user: dict) -> dict:
    current = get_user_note(note_id, user)
    notes_collection().delete_one({"_id": current["_id"], **owner_filter(user)})
    return current


def list_note_revisions(note_id: str, user: dict) -> list[dict]:
    note = get_user_note(note_id, user)
    revisions = note_revisions_collection().find({"note_id": note["_id"], **owner_filter(user)}).sort("version", -1)
    return [{
        "id": str(revision["_id"]),
        "version": revision["version"],
        "title": revision.get("title", "Untitled"),
        "content": revision.get("content", ""),
        "changed_by": revision.get("changed_by", "web"),
        "created_at": revision["created_at"].isoformat(),
    } for revision in revisions]


def restore_note_revision(note_id: str, version: int, user: dict) -> dict:
    current = get_user_note(note_id, user)
    revision = note_revisions_collection().find_one({"note_id": current["_id"], "owner_id": user["_id"], "version": version})
    if not revision:
        raise HTTPException(status_code=404, detail="Note revision not found")
    next_version = int(current.get("version", 1)) + 1
    now = datetime.now(timezone.utc)
    result = notes_collection().update_one(
        {"_id": current["_id"], **owner_filter(user), "version": current.get("version", 1)},
        {"$set": {"title": revision.get("title", "Untitled"), "content": revision.get("content", ""), "version": next_version, "updated_at": now}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Note changed elsewhere; reload before restoring")
    updated = get_user_note(note_id, user)
    note_revisions_collection().insert_one({"note_id": current["_id"], "owner_id": user["_id"], "workspace_id": updated.get("workspace_id"), "version": next_version, "title": updated["title"], "content": updated["content"], "changed_by": "restore", "restored_from": version, "created_at": now})
    return updated
