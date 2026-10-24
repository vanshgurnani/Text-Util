from __future__ import annotations

import logging
from typing import Any, Optional

import requests
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .auth import current_user, hash_password, verify_password
from .config import settings
from .database import note_chunks_collection, notes_collection, rag_query_cache_collection, users_collection
from .rag.cache import invalidate_user_rag_cache
from .rag.retriever import index_all_user_notes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["Settings"])


def redact_key(key: Optional[str]) -> str:
    """Redact API key, displaying only the first 4 and last 4 characters."""
    if not key:
        return ""
    clean = str(key).strip()
    if len(clean) <= 8:
        return "••••••••"
    return f"{clean[:4]}••••••••••••{clean[-4:]}"


def is_redacted_value(val: Optional[str]) -> bool:
    if not val:
        return False
    return "••••" in val or "****" in val


class AISettingsPayload(BaseModel):
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    default_model: Optional[str] = None
    rag_chunk_size: Optional[int] = Field(None, ge=100, le=1200)
    rag_chunk_overlap: Optional[int] = Field(None, ge=10, le=200)
    rag_top_k: Optional[int] = Field(None, ge=1, le=20)
    auto_rag_sync: Optional[bool] = None


class PreferencesPayload(BaseModel):
    theme: Optional[str] = None  # 'light' | 'dark' | 'system'
    font_style: Optional[str] = None  # 'sans' | 'serif' | 'mono'
    default_category: Optional[str] = None
    editor_width: Optional[str] = None  # 'standard' | 'full'


class UpdateSettingsRequest(BaseModel):
    ai: Optional[AISettingsPayload] = None
    preferences: Optional[PreferencesPayload] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class TestKeyRequest(BaseModel):
    provider: str  # 'gemini' | 'groq' | 'ollama'
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None


def get_user_ai_config(user_id: Any) -> dict[str, Any]:
    """Helper to fetch raw user AI keys for internal execution."""
    uid = ObjectId(user_id) if not isinstance(user_id, ObjectId) else user_id
    u = users_collection().find_one({"_id": uid}) or {}
    ai = u.get("settings", {}).get("ai", {})
    return ai


@router.get("")
async def get_settings(user: dict = Depends(current_user)):
    user_doc = users_collection().find_one({"_id": user["_id"]}) or {}
    saved_settings = user_doc.get("settings", {})
    ai_saved = saved_settings.get("ai", {})
    prefs_saved = saved_settings.get("preferences", {})

    # Redact sensitive keys before returning to the frontend
    redacted_ai = {
        "gemini_api_key": redact_key(ai_saved.get("gemini_api_key")),
        "groq_api_key": redact_key(ai_saved.get("groq_api_key")),
        "ollama_base_url": ai_saved.get("ollama_base_url", settings.ollama_base_url),
        "ollama_model": ai_saved.get("ollama_model", settings.ollama_model),
        "default_model": ai_saved.get("default_model", settings.default_ai_model),
        "rag_chunk_size": ai_saved.get("rag_chunk_size", settings.rag_chunk_size),
        "rag_chunk_overlap": ai_saved.get("rag_chunk_overlap", settings.rag_chunk_overlap),
        "rag_top_k": ai_saved.get("rag_top_k", 5),
        "auto_rag_sync": ai_saved.get("auto_rag_sync", True),
        # Indicate configured status without exposing keys
        "has_custom_gemini": bool(ai_saved.get("gemini_api_key")),
        "has_custom_groq": bool(ai_saved.get("groq_api_key")),
    }

    preferences = {
        "theme": prefs_saved.get("theme", "system"),
        "font_style": prefs_saved.get("font_style", "sans"),
        "default_category": prefs_saved.get("default_category", "General"),
        "editor_width": prefs_saved.get("editor_width", "standard"),
    }

    # Workspace statistics
    uid_str = str(user["_id"])
    notes_count = notes_collection().count_documents({"owner_id": user["_id"]})
    chunks_count = note_chunks_collection().count_documents({"owner_id": uid_str})
    cached_queries = rag_query_cache_collection().count_documents({"owner_id": uid_str})

    return {
        "user": {
            "id": uid_str,
            "username": user_doc.get("username", ""),
            "email": user_doc.get("email", ""),
            "created_at": str(user_doc.get("created_at", "")),
            "has_mcp_token": bool(user_doc.get("mcp_token_hash")),
        },
        "ai": redacted_ai,
        "preferences": preferences,
        "stats": {
            "notes_count": notes_count,
            "chunks_count": chunks_count,
            "cached_queries_count": cached_queries,
        },
    }


@router.patch("")
async def update_settings(payload: UpdateSettingsRequest, user: dict = Depends(current_user)):
    user_doc = users_collection().find_one({"_id": user["_id"]}) or {}
    current_settings = user_doc.get("settings", {})
    current_ai = current_settings.get("ai", {})
    current_prefs = current_settings.get("preferences", {})

    updates: dict[str, Any] = {}

    if payload.ai:
        ai_data = payload.ai.dict(exclude_unset=True)
        for key, val in ai_data.items():
            if key in ("gemini_api_key", "groq_api_key"):
                # If key is redacted (user didn't change it), keep current stored key
                if is_redacted_value(val):
                    continue
                # If user cleared the input (empty string), remove/clear key
                if val == "":
                    current_ai[key] = None
                elif val:
                    current_ai[key] = val.strip()
            else:
                if val is not None:
                    current_ai[key] = val
        updates["settings.ai"] = current_ai

    if payload.preferences:
        prefs_data = payload.preferences.dict(exclude_unset=True)
        for key, val in prefs_data.items():
            if val is not None:
                current_prefs[key] = val
        updates["settings.preferences"] = current_prefs

    if updates:
        users_collection().update_one({"_id": user["_id"]}, {"$set": updates})

    return {"status": "ok", "message": "Settings updated successfully"}


@router.post("/ai/test-key")
async def test_ai_key(payload: TestKeyRequest, user: dict = Depends(current_user)):
    """Test AI model connection with either a provided key or the user's saved key."""
    provider = payload.provider.lower()
    ai_saved = get_user_ai_config(user["_id"])

    # Resolve key
    key_to_test = payload.api_key
    if not key_to_test or is_redacted_value(key_to_test):
        if provider == "gemini":
            key_to_test = ai_saved.get("gemini_api_key") or settings.gemini_api_key
        elif provider == "groq":
            key_to_test = ai_saved.get("groq_api_key") or settings.groq_api_key

    if provider == "gemini":
        if not key_to_test:
            raise HTTPException(status_code=400, detail="No Gemini API key provided or found")
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key_to_test}"
            res = requests.get(url, timeout=8)
            if res.status_code == 200:
                data = res.json()
                models = [m.get("name", "") for m in data.get("models", []) if "gemini" in m.get("name", "")]
                return {
                    "valid": True,
                    "provider": "gemini",
                    "message": f"Gemini API connection verified! ({len(models)} models available)",
                }
            return {
                "valid": False,
                "provider": "gemini",
                "message": f"Gemini returned HTTP {res.status_code}: {res.text[:120]}",
            }
        except Exception as e:
            return {"valid": False, "provider": "gemini", "message": f"Connection failed: {str(e)}"}

    elif provider == "groq":
        if not key_to_test:
            raise HTTPException(status_code=400, detail="No Groq API key provided or found")
        try:
            url = "https://api.groq.com/openai/v1/models"
            res = requests.get(url, headers={"Authorization": f"Bearer {key_to_test}"}, timeout=8)
            if res.status_code == 200:
                data = res.json()
                count = len(data.get("data", []))
                return {
                    "valid": True,
                    "provider": "groq",
                    "message": f"Groq API connection verified! ({count} models available)",
                }
            return {
                "valid": False,
                "provider": "groq",
                "message": f"Groq returned HTTP {res.status_code}: {res.text[:120]}",
            }
        except Exception as e:
            return {"valid": False, "provider": "groq", "message": f"Connection failed: {str(e)}"}

    elif provider == "ollama":
        base_url = (payload.base_url or ai_saved.get("ollama_base_url") or settings.ollama_base_url).rstrip("/")
        try:
            res = requests.get(f"{base_url}/api/tags", timeout=5)
            if res.status_code == 200:
                data = res.json()
                models = [m.get("name") for m in data.get("models", [])]
                return {
                    "valid": True,
                    "provider": "ollama",
                    "message": f"Ollama is running locally! Models found: {', '.join(models[:4]) or 'none'}",
                }
            return {
                "valid": False,
                "provider": "ollama",
                "message": f"Ollama returned HTTP {res.status_code}",
            }
        except Exception as e:
            return {
                "valid": False,
                "provider": "ollama",
                "message": f"Could not reach Ollama at {base_url} (is 'ollama serve' running?): {str(e)}",
            }

    raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")


@router.post("/rag/clear-cache")
async def clear_rag_cache(user: dict = Depends(current_user)):
    count = invalidate_user_rag_cache(str(user["_id"]))
    return {"status": "ok", "deleted_count": count, "message": f"Cleared {count} cached queries"}


@router.post("/rag/reindex")
async def trigger_reindex(user: dict = Depends(current_user)):
    res = index_all_user_notes(str(user["_id"]))
    invalidate_user_rag_cache(str(user["_id"]))
    return {
        "status": "ok",
        "notes_indexed": res.get("notes_indexed", 0),
        "chunks_indexed": res.get("chunks_indexed", 0),
    }


@router.post("/account/password")
async def change_password(payload: ChangePasswordRequest, user: dict = Depends(current_user)):
    user_doc = users_collection().find_one({"_id": user["_id"]})
    if not user_doc or not verify_password(payload.current_password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    new_hash = hash_password(payload.new_password)
    users_collection().update_one({"_id": user["_id"]}, {"$set": {"password_hash": new_hash}})
    return {"status": "ok", "message": "Password updated successfully"}
