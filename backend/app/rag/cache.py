from __future__ import annotations

import datetime
import hashlib
from typing import Any, Optional

from ..database import rag_query_cache_collection


def compute_query_hash(owner_id: str, query: str, model: str) -> str:
    normalized = " ".join(query.lower().strip().split())
    raw = f"{owner_id}:{normalized}:{model}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_cached_rag_response(owner_id: str, query: str, model: str) -> Optional[dict[str, Any]]:
    col = rag_query_cache_collection()
    q_hash = compute_query_hash(owner_id, query, model)
    doc = col.find_one({"query_hash": q_hash, "owner_id": owner_id})
    if not doc:
        return None

    # Check TTL expiry
    expires_at = doc.get("expires_at")
    if isinstance(expires_at, datetime.datetime) and expires_at < datetime.datetime.utcnow():
        col.delete_one({"_id": doc["_id"]})
        return None

    return {
        "answer": doc.get("answer"),
        "citations": doc.get("citations", []),
        "model": doc.get("model", model),
        "from_cache": True,
    }


def set_cached_rag_response(
    owner_id: str,
    query: str,
    model: str,
    answer: str,
    citations: list[dict[str, Any]],
    ttl_seconds: int = 3600,
) -> None:
    col = rag_query_cache_collection()
    q_hash = compute_query_hash(owner_id, query, model)
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=ttl_seconds)

    col.update_one(
        {"query_hash": q_hash},
        {
            "$set": {
                "owner_id": owner_id,
                "query": query,
                "model": model,
                "answer": answer,
                "citations": citations,
                "created_at": datetime.datetime.utcnow().isoformat(),
                "expires_at": expires_at,
            }
        },
        upsert=True,
    )


def invalidate_user_rag_cache(owner_id: str) -> int:
    """Invalidate cached queries when user notes change."""
    res = rag_query_cache_collection().delete_many({"owner_id": owner_id})
    return res.deleted_count
