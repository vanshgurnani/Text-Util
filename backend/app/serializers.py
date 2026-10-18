from datetime import datetime


def serialize_note(note: dict) -> dict:
    return {
        "id": str(note["_id"]),
        "title": note.get("title", "Untitled"),
        "content": note.get("content", ""),
        "category": note.get("category", "General"),
        "icon": note.get("icon", "✦"),
        "content_format": note.get("content_format", "markdown"),
        "bookmarked": bool(note.get("bookmarked", False)),
        "version": int(note.get("version", 1)),
        "created_at": note.get("created_at", datetime.utcnow()).isoformat(),
        "updated_at": note.get("updated_at", datetime.utcnow()).isoformat(),
    }
