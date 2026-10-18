from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import DuplicateKeyError

from .auth import create_access_token, current_user, hash_password, public_user, user_from_token, verify_password
from .config import settings
from .database import lifespan, notes_collection, summaries_collection, users_collection
from .schemas import LoginRequest, MCPCall, NoteCreate, NoteUpdate, RegisterRequest, SummaryCreate
from .serializers import serialize_note


app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def owner_filter(user: dict) -> dict:
    return {"owner_id": user["_id"]}


def note_or_404(note_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(note_id):
        raise HTTPException(status_code=400, detail="Invalid note id")
    note = notes_collection().find_one({"_id": ObjectId(note_id), **owner_filter(user)})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs", "mcp": "/mcp"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "noteform-api"}


@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest):
    now = datetime.now(timezone.utc)
    user = {"username": payload.username.strip(), "email": payload.email.lower(), "password_hash": hash_password(payload.password), "created_at": now}
    try:
        result = users_collection().insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Username or email is already in use")
    user["_id"] = result.inserted_id
    return {"user": public_user(user), "token": create_access_token(str(result.inserted_id), user["username"])}


@app.post("/auth/login")
def login(payload: LoginRequest):
    user = users_collection().find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"user": public_user(user), "token": create_access_token(str(user["_id"]), user["username"])}


@app.get("/auth/me")
def me(user: dict = Depends(current_user)):
    return {"user": public_user(user)}


@app.get("/notes")
def list_notes(
    search: str = Query(default=""),
    category: Optional[str] = Query(default=None),
    bookmarked: Optional[bool] = Query(default=None),
    user: dict = Depends(current_user),
):
    query: dict[str, Any] = owner_filter(user)
    if category and category.lower() != "all":
        query["category"] = category
    if bookmarked is not None:
        query["bookmarked"] = bookmarked
    if search.strip():
        query["$or"] = [{"title": {"$regex": search.strip(), "$options": "i"}}, {"content": {"$regex": search.strip(), "$options": "i"}}]
    notes = notes_collection().find(query).sort("updated_at", -1)
    return {"notes": [serialize_note(note) for note in notes]}


@app.post("/notes", status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, user: dict = Depends(current_user)):
    now = datetime.now(timezone.utc)
    note = {**payload.model_dump(), "owner_id": user["_id"], "bookmarked": False, "created_at": now, "updated_at": now}
    result = notes_collection().insert_one(note)
    note["_id"] = result.inserted_id
    return {"note": serialize_note(note)}


@app.get("/notes/{note_id}")
def get_note(note_id: str, user: dict = Depends(current_user)):
    return {"note": serialize_note(note_or_404(note_id, user))}


@app.patch("/notes/{note_id}")
def update_note(note_id: str, payload: NoteUpdate, user: dict = Depends(current_user)):
    note_or_404(note_id, user)
    changes = {key: value for key, value in payload.model_dump().items() if value is not None}
    changes["updated_at"] = datetime.now(timezone.utc)
    notes_collection().update_one({"_id": ObjectId(note_id), **owner_filter(user)}, {"$set": changes})
    return {"note": serialize_note(note_or_404(note_id, user))}


@app.delete("/notes/{note_id}")
def delete_note(note_id: str, user: dict = Depends(current_user)):
    note_or_404(note_id, user)
    notes_collection().delete_one({"_id": ObjectId(note_id), **owner_filter(user)})
    return {"success": True}


@app.post("/notes/{note_id}/bookmark")
def toggle_bookmark(note_id: str, user: dict = Depends(current_user)):
    note = note_or_404(note_id, user)
    bookmarked = not bool(note.get("bookmarked", False))
    notes_collection().update_one({"_id": ObjectId(note_id), **owner_filter(user)}, {"$set": {"bookmarked": bookmarked, "updated_at": datetime.now(timezone.utc)}})
    return {"bookmarked": bookmarked}


@app.post("/summaries", status_code=status.HTTP_201_CREATED)
def save_summary(payload: SummaryCreate, user: dict = Depends(current_user)):
    doc = {**payload.model_dump(), "owner_id": user["_id"], "created_at": datetime.now(timezone.utc)}
    result = summaries_collection().insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Summary saved"}


@app.get("/summaries")
def list_summaries(user: dict = Depends(current_user)):
    summaries = summaries_collection().find(owner_filter(user)).sort("created_at", -1).limit(30)
    return {"summaries": [{**summary, "_id": str(summary["_id"]), "owner_id": str(summary["owner_id"])} for summary in summaries]}


@app.get("/insights")
def insights(user: dict = Depends(current_user)):
    notes = list(notes_collection().find(owner_filter(user), {"category": 1, "content": 1, "created_at": 1}))
    by_category: dict[str, int] = {}
    words = 0
    for note in notes:
        category = note.get("category", "General")
        by_category[category] = by_category.get(category, 0) + 1
        words += len(note.get("content", "").split())
    return {"total_notes": len(notes), "total_words": words, "categories": by_category}


def mcp_error(request_id: Any, code: int, message: str):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def mcp_result(request_id: Any, result: dict):
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def mcp_user(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    api_key = request.headers.get("x-mcp-api-key", "")
    if settings.mcp_api_key and api_key == settings.mcp_api_key and settings.mcp_user_id:
        return user_from_token(create_access_token(settings.mcp_user_id, "mcp"))
    if auth.lower().startswith("bearer "):
        return user_from_token(auth.split(" ", 1)[1].strip())
    raise HTTPException(status_code=401, detail="Use a bearer token or configured MCP API key")


@app.post("/mcp")
async def mcp(request: Request):
    payload = await request.json()
    try:
        call = MCPCall.model_validate(payload)
    except Exception:
        return mcp_error(payload.get("id"), -32600, "Invalid JSON-RPC request")
    if call.method == "notifications/initialized":
        return {}
    if call.method == "initialize":
        return mcp_result(call.id, {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}, "serverInfo": {"name": "noteform", "version": "2.0.0"}})
    if call.method == "tools/list":
        return mcp_result(call.id, {"tools": [
            {"name": "search_notes", "description": "Search the connected user's notes by title or content.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
            {"name": "get_note", "description": "Read one note by id.", "inputSchema": {"type": "object", "properties": {"note_id": {"type": "string"}}, "required": ["note_id"]}},
            {"name": "create_note", "description": "Save a new note to the connected user's workspace.", "inputSchema": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}, "required": ["content"]}},
            {"name": "list_bookmarks", "description": "List the connected user's bookmarked notes.", "inputSchema": {"type": "object", "properties": {}}},
        ]})
    try:
        user = mcp_user(request)
        if call.method != "tools/call":
            return mcp_error(call.id, -32601, "Method not found")
        tool = call.params.get("name")
        values = call.params.get("arguments", {}) or {}
        if tool == "search_notes":
            notes = list_notes(search=str(values.get("query", "")), user=user)["notes"]
            text = "\n\n".join(f"[{note['id']}] {note['title']}\n{note['content']}" for note in notes)
        elif tool == "get_note":
            text = str(get_note(str(values.get("note_id", "")), user=user)["note"])
        elif tool == "create_note":
            created = create_note(NoteCreate(title=values.get("title", "Untitled"), content=values.get("content", ""), category=values.get("category", "General")), user=user)
            text = f"Created note {created['note']['id']}: {created['note']['title']}"
        elif tool == "list_bookmarks":
            notes = list_notes(bookmarked=True, user=user)["notes"]
            text = "\n\n".join(f"[{note['id']}] {note['title']}\n{note['content']}" for note in notes) or "No bookmarked notes."
        else:
            return mcp_error(call.id, -32602, f"Unknown tool: {tool}")
        return mcp_result(call.id, {"content": [{"type": "text", "text": text or "No matching notes."}]})
    except HTTPException as exc:
        return mcp_error(call.id, -32001, exc.detail)
    except Exception as exc:
        return mcp_error(call.id, -32000, str(exc))
