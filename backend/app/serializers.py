from datetime import datetime


def serialize_note(note: dict) -> dict:
    tags = note.get("tags")
    if not isinstance(tags, list):
        tags = []
    else:
        tags = [tag for tag in tags if isinstance(tag, str)]

    return {
        "id": str(note["_id"]),
        "title": note.get("title", "Untitled"),
        "content": note.get("content", ""),
        "category": note.get("category", "General"),
        "icon": note.get("icon", "✦"),
        "parent_id": str(note["parent_id"]) if note.get("parent_id") else None,
        "source_url": note.get("source_url"),
        "inbox": bool(note.get("inbox", False)),
        "version": int(note.get("version", 1)),
        "bookmarked": bool(note.get("bookmarked", False)),
        "pinned": bool(note.get("pinned", False)),
        "tags": tags,
        "created_at": note.get("created_at", datetime.utcnow()).isoformat(),
        "updated_at": note.get("updated_at", datetime.utcnow()).isoformat(),
    }
