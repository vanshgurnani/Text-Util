from __future__ import annotations

import base64
import hashlib
import html
import io
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bson import ObjectId
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .auth import create_access_token, create_mcp_token, create_oauth_token, current_user, hash_mcp_token, hash_password, public_user, user_from_token, verify_password
from .config import settings
from .database import lifespan, notes_collection, oauth_clients_collection, oauth_codes_collection, oauth_tokens_collection, summaries_collection, users_collection
from .schemas import LoginRequest, MCPCall, NoteCreate, NoteUpdate, RegisterRequest, SummaryCreate
from .serializers import serialize_note
from .workspace_archive import MAX_ARCHIVE_BYTES, MAX_ARCHIVE_NOTES, create_workspace_archive, parse_workspace_archive


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


@app.post("/auth/mcp-token")
def issue_mcp_token(user: dict = Depends(current_user)):
    token, token_hash = create_mcp_token()
    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {"mcp_token_hash": token_hash, "mcp_token_created_at": datetime.now(timezone.utc)}},
    )
    return {"token": token, "message": "MCP token created. Copy it now; it will not be shown again."}


@app.delete("/auth/mcp-token")
def revoke_mcp_token(user: dict = Depends(current_user)):
    users_collection().update_one({"_id": user["_id"]}, {"$unset": {"mcp_token_hash": "", "mcp_token_created_at": ""}})
    return {"success": True, "message": "MCP token revoked"}


def oauth_issuer() -> str:
    return settings.mcp_public_url[:-4] if settings.mcp_public_url.endswith("/mcp") else settings.mcp_public_url


def oauth_error_page(message: str, code: int = 400):
    body = f"<!doctype html><title>Noteform authorization</title><main style='font:16px system-ui;max-width:500px;margin:10vh auto'><h1>Noteform</h1><p>{html.escape(message)}</p></main>"
    return HTMLResponse(body, status_code=code, headers={"Cache-Control": "no-store"})


def valid_oauth_client(client_id: str, redirect_uri: str) -> Optional[dict]:
    client = oauth_clients_collection().find_one({"client_id": client_id})
    if not client or redirect_uri not in client.get("redirect_uris", []):
        return None
    return client


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def protected_resource_metadata_payload():
    return {
        "resource": settings.mcp_public_url,
        "authorization_servers": [oauth_issuer()],
        "scopes_supported": ["notes:read", "notes:write"],
        "bearer_methods_supported": ["header"],
    }


@app.get("/.well-known/oauth-protected-resource")
def protected_resource_metadata():
    return protected_resource_metadata_payload()


@app.get("/.well-known/oauth-protected-resource/mcp")
def protected_resource_metadata_for_mcp_path():
    # Some MCP clients append the resource path to the well-known URL.
    return protected_resource_metadata_payload()


@app.get("/.well-known/oauth-authorization-server")
def authorization_server_metadata():
    issuer = oauth_issuer()
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/oauth/authorize",
        "token_endpoint": f"{issuer}/oauth/token",
        "registration_endpoint": f"{issuer}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": ["notes:read", "notes:write"],
    }


@app.post("/oauth/register")
async def oauth_register(request: Request):
    payload = await request.json()
    redirect_uris = payload.get("redirect_uris", [])
    if not isinstance(redirect_uris, list) or not redirect_uris or not all(isinstance(uri, str) for uri in redirect_uris):
        return {"error": "invalid_client_metadata", "error_description": "redirect_uris is required"}
    client_id = f"nf_client_{secrets.token_urlsafe(18)}"
    oauth_clients_collection().insert_one({"client_id": client_id, "client_name": payload.get("client_name", "MCP client"), "redirect_uris": redirect_uris, "created_at": datetime.now(timezone.utc)})
    return {"client_id": client_id, "client_name": payload.get("client_name", "MCP client"), "redirect_uris": redirect_uris, "token_endpoint_auth_method": "none"}


@app.get("/oauth/authorize", response_class=HTMLResponse)
def oauth_authorize(
    response_type: str = Query(default=""), client_id: str = Query(default=""), redirect_uri: str = Query(default=""),
    scope: str = Query(default="notes:read notes:write"), state: str = Query(default=""), code_challenge: str = Query(default=""),
    code_challenge_method: str = Query(default=""), resource: str = Query(default=""),
):
    if response_type != "code" or code_challenge_method != "S256" or not code_challenge:
        return oauth_error_page("This authorization request must use PKCE with S256.")
    if resource and resource.rstrip("/") != settings.mcp_public_url:
        return oauth_error_page("This authorization request targets a different MCP resource.")
    if not valid_oauth_client(client_id, redirect_uri):
        return oauth_error_page("The OAuth client or redirect URI is not registered.")
    fields = {"response_type": response_type, "client_id": client_id, "redirect_uri": redirect_uri, "scope": scope, "state": state, "code_challenge": code_challenge, "code_challenge_method": code_challenge_method, "resource": resource}
    hidden = "".join(f"<input type='hidden' name='{html.escape(key)}' value='{html.escape(value)}'>" for key, value in fields.items())
    body = f"""<!doctype html><title>Connect Noteform</title><main style='font:16px system-ui;max-width:420px;margin:10vh auto;padding:28px;border:1px solid #ddd;border-radius:8px'><h1>Connect Noteform</h1><p>Sign in to let ChatGPT access your notes.</p><form method='post' action='/oauth/authorize'>{hidden}<label>Email<br><input name='email' type='email' required style='width:100%;padding:9px;margin:6px 0 14px'></label><label>Password<br><input name='password' type='password' required style='width:100%;padding:9px;margin:6px 0 18px'></label><button type='submit' style='padding:10px 16px'>Authorize</button></form></main>"""
    return HTMLResponse(body, headers={"Cache-Control": "no-store"})


@app.post("/oauth/authorize")
def oauth_authorize_submit(
    email: str = Form(...), password: str = Form(...), response_type: str = Form(...), client_id: str = Form(...), redirect_uri: str = Form(...),
    scope: str = Form("notes:read notes:write"), state: str = Form(""), code_challenge: str = Form(...), code_challenge_method: str = Form(...), resource: str = Form(""),
):
    if response_type != "code" or code_challenge_method != "S256" or not valid_oauth_client(client_id, redirect_uri):
        return oauth_error_page("Invalid authorization request.")
    if resource and resource.rstrip("/") != settings.mcp_public_url:
        return oauth_error_page("This authorization request targets a different MCP resource.")
    user = users_collection().find_one({"email": email.lower()})
    if not user or not verify_password(password, user.get("password_hash", "")):
        return oauth_error_page("Invalid Noteform email or password.")
    code = f"nf_code_{secrets.token_urlsafe(40)}"
    oauth_codes_collection().insert_one({"code_hash": hash_mcp_token(code), "user_id": user["_id"], "client_id": client_id, "redirect_uri": redirect_uri, "code_challenge": code_challenge, "scope": scope, "resource": resource, "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)})
    query = {"code": code}
    if state:
        query["state"] = state
    parts = urlsplit(redirect_uri)
    redirect = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode({**dict(parse_qsl(parts.query)), **query}), parts.fragment))
    return RedirectResponse(redirect, status_code=303, headers={"Cache-Control": "no-store"})


@app.post("/oauth/token")
def oauth_token(
    grant_type: str = Form(...), client_id: str = Form(...), code: Optional[str] = Form(default=None), redirect_uri: Optional[str] = Form(default=None),
    code_verifier: Optional[str] = Form(default=None), refresh_token: Optional[str] = Form(default=None),
):
    now = datetime.now(timezone.utc)
    if grant_type == "authorization_code":
        if not code or not redirect_uri or not code_verifier:
            return {"error": "invalid_request", "error_description": "code, redirect_uri, and code_verifier are required"}
        # Put expiry in the Mongo query. PyMongo decodes BSON dates as naive
        # UTC datetimes, so comparing a decoded value with an aware Python
        # datetime raises TypeError inside the request handler.
        stored = oauth_codes_collection().find_one_and_delete({"code_hash": hash_mcp_token(code), "expires_at": {"$gt": now}})
        if not stored or stored["client_id"] != client_id or stored["redirect_uri"] != redirect_uri or pkce_challenge(code_verifier) != stored["code_challenge"]:
            return {"error": "invalid_grant", "error_description": "Authorization code is invalid or expired"}
        user_id, scope, resource_value = stored["user_id"], stored.get("scope", "notes:read notes:write"), stored.get("resource", "")
    elif grant_type == "refresh_token" and refresh_token:
        stored = oauth_tokens_collection().find_one({"token_hash": hash_mcp_token(refresh_token), "token_type": "refresh", "client_id": client_id, "expires_at": {"$gt": now}})
        if not stored:
            return {"error": "invalid_grant", "error_description": "Refresh token is invalid or expired"}
        user_id, scope, resource_value = stored["user_id"], stored.get("scope", "notes:read notes:write"), stored.get("resource", "")
    else:
        return {"error": "unsupported_grant_type"}
    access_token, access_hash = create_oauth_token("nf_oauth")
    refresh_value, refresh_hash = create_oauth_token("nf_refresh")
    oauth_tokens_collection().insert_many([
        {"token_hash": access_hash, "token_type": "access", "user_id": user_id, "client_id": client_id, "scope": scope, "resource": resource_value, "expires_at": now + timedelta(hours=1)},
        {"token_hash": refresh_hash, "token_type": "refresh", "user_id": user_id, "client_id": client_id, "scope": scope, "resource": resource_value, "expires_at": now + timedelta(days=30)},
    ])
    response = {"access_token": access_token, "token_type": "Bearer", "expires_in": 3600, "refresh_token": refresh_value, "scope": scope}
    if resource_value:
        response["resource"] = resource_value
    return response


@app.get("/notes")
def list_notes(
    search: str = Query(default=""),
    category: Optional[str] = Query(default=None),
    bookmarked: Optional[bool] = Query(default=None),
    inbox: Optional[bool] = Query(default=None),
    user: dict = Depends(current_user),
):
    query: dict[str, Any] = owner_filter(user)
    if category and category.lower() != "all":
        query["category"] = category
    if bookmarked is not None:
        query["bookmarked"] = bookmarked
    if inbox is not None:
        query["inbox"] = inbox
    if search.strip():
        query["$or"] = [
            {"title": {"$regex": search.strip(), "$options": "i"}},
            {"content": {"$regex": search.strip(), "$options": "i"}},
            {"source_url": {"$regex": search.strip(), "$options": "i"}},
        ]
    notes = notes_collection().find(query).sort("updated_at", -1)
    return {"notes": [serialize_note(note) for note in notes]}


@app.post("/notes", status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, user: dict = Depends(current_user)):
    now = datetime.now(timezone.utc)
    note_data = payload.model_dump(exclude={"parent_id"})
    if payload.parent_id:
        parent = note_or_404(payload.parent_id, user)
        note_data["parent_id"] = parent["_id"]
    else:
        note_data["parent_id"] = None
    note = {**note_data, "owner_id": user["_id"], "bookmarked": False, "version": 1, "created_at": now, "updated_at": now}
    result = notes_collection().insert_one(note)
    note["_id"] = result.inserted_id
    return {"note": serialize_note(note)}


@app.get("/notes/{note_id}")
def get_note(note_id: str, user: dict = Depends(current_user)):
    return {"note": serialize_note(note_or_404(note_id, user))}


@app.patch("/notes/{note_id}")
def update_note(note_id: str, payload: NoteUpdate, user: dict = Depends(current_user)):
    note = note_or_404(note_id, user)
    current_version = int(note.get("version", 1))
    if payload.version is not None and payload.version != current_version:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This page changed elsewhere. Reload it or explicitly overwrite the newer version.",
                "current_version": current_version,
            },
        )
    changes = {
        key: value
        for key, value in payload.model_dump(exclude={"version"}).items()
        if value is not None
    }
    if not changes:
        return {"note": serialize_note(note)}
    changes["updated_at"] = datetime.now(timezone.utc)
    changes["version"] = current_version + 1
    version_filter = (
        {"version": current_version}
        if "version" in note
        else {"version": {"$exists": False}}
    )
    result = notes_collection().update_one(
        {"_id": ObjectId(note_id), **owner_filter(user), **version_filter},
        {"$set": changes},
    )
    if result.modified_count != 1:
        latest = note_or_404(note_id, user)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This page changed elsewhere. Reload it or explicitly overwrite the newer version.",
                "current_version": int(latest.get("version", 1)),
            },
        )
    updated = note_or_404(note_id, user)
    return {"note": serialize_note(updated)}


@app.delete("/notes/{note_id}")
def delete_note(note_id: str, user: dict = Depends(current_user)):
    note_or_404(note_id, user)
    if notes_collection().find_one({"parent_id": ObjectId(note_id), **owner_filter(user)}):
        raise HTTPException(status_code=409, detail="Move or delete this page's child pages before deleting it")
    notes_collection().delete_one({"_id": ObjectId(note_id), **owner_filter(user)})
    return {"success": True}


@app.get("/workspace/export")
def export_workspace(user: dict = Depends(current_user)):
    notes = [
        serialize_note(note)
        for note in notes_collection().find(owner_filter(user)).sort("created_at", 1).limit(MAX_ARCHIVE_NOTES + 1)
    ]
    if len(notes) > MAX_ARCHIVE_NOTES:
        raise HTTPException(status_code=413, detail="Workspace export is limited to 500 pages")
    try:
        archive = create_workspace_archive(notes)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    return StreamingResponse(
        io.BytesIO(archive),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="noteform-workspace.zip"'},
    )


async def read_workspace_upload(file: UploadFile) -> list[dict[str, Any]]:
    data = await file.read(MAX_ARCHIVE_BYTES + 1)
    if len(data) > MAX_ARCHIVE_BYTES:
        raise HTTPException(status_code=413, detail="Workspace archive exceeds the 20 MB import limit")
    try:
        return parse_workspace_archive(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/workspace/import/preview")
async def preview_workspace_import(file: UploadFile = File(...), user: dict = Depends(current_user)):
    notes = await read_workspace_upload(file)
    return {
        "count": len(notes),
        "pages": [{"title": note["title"], "path": note["path"]} for note in notes[:5]],
    }


@app.post("/workspace/import")
async def import_workspace(file: UploadFile = File(...), user: dict = Depends(current_user)):
    notes = await read_workspace_upload(file)
    if not notes:
        return {"imported": 0}
    now = datetime.now(timezone.utc)
    id_map = {note["id"]: ObjectId() for note in notes}
    documents = []
    for note in notes:
        documents.append({
            "owner_id": user["_id"],
            "title": note["title"],
            "content": note["content"],
            "category": note["category"],
            "icon": note["icon"],
            "parent_id": id_map[note["parent_id"]] if note["parent_id"] else None,
            "source_url": note["source_url"],
            "inbox": note["inbox"],
            "bookmarked": note["bookmarked"],
            "version": 1,
            "created_at": note["created_at"] or now,
            "updated_at": note["updated_at"] or now,
        })
    notes_collection().insert_many(documents)
    return {"imported": len(documents)}


@app.post("/notes/{note_id}/bookmark")
def toggle_bookmark(note_id: str, user: dict = Depends(current_user)):
    note = note_or_404(note_id, user)
    bookmarked = not bool(note.get("bookmarked", False))
    version_filter = (
        {"version": int(note["version"])}
        if "version" in note
        else {"version": {"$exists": False}}
    )
    updated = notes_collection().find_one_and_update(
        {"_id": ObjectId(note_id), **owner_filter(user), **version_filter},
        {
            "$set": {"bookmarked": bookmarked, "updated_at": datetime.now(timezone.utc)},
            "$inc": {"version": 1},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="This page changed elsewhere. Reload it and try again.")
    return {"bookmarked": bookmarked, "version": int(updated.get("version", 1))}


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
    bearer = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else ""
    supplied_token = api_key or bearer
    if supplied_token.startswith("nf_oauth_"):
        token = oauth_tokens_collection().find_one({"token_hash": hash_mcp_token(supplied_token), "token_type": "access", "expires_at": {"$gt": datetime.now(timezone.utc)}})
        if token:
            user = users_collection().find_one({"_id": token["user_id"]})
            if user:
                return user
    if supplied_token.startswith("nf_mcp_"):
        user = users_collection().find_one({"mcp_token_hash": hash_mcp_token(supplied_token)})
        if user:
            return user
    if settings.mcp_api_key and api_key == settings.mcp_api_key and settings.mcp_user_id:
        if ObjectId.is_valid(settings.mcp_user_id):
            user = users_collection().find_one({"_id": ObjectId(settings.mcp_user_id)})
            if user:
                return user
    if auth.lower().startswith("bearer "):
        return user_from_token(bearer)
    raise HTTPException(status_code=401, detail="OAuth or MCP API token required")


def mcp_unauthorized(exc: HTTPException):
    metadata_url = f"{oauth_issuer()}/.well-known/oauth-protected-resource"
    raise HTTPException(status_code=401, detail=exc.detail, headers={"WWW-Authenticate": f'Bearer resource_metadata="{metadata_url}"'})


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
    try:
        user = mcp_user(request)
        if call.method == "tools/list":
            return mcp_result(call.id, {"tools": [
                {"name": "search_notes", "description": "Search the connected user's notes by title or content.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
                {"name": "get_note", "description": "Read one note by id.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"note_id": {"type": "string"}}, "required": ["note_id"]}},
                {"name": "create_note", "description": "Save a new note to the connected user's workspace.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}, "required": ["content"]}},
                {"name": "update_note", "description": "Edit an existing note. Only the supplied fields are changed. Pass the version read from get_note to detect conflicting edits.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"note_id": {"type": "string"}, "version": {"type": "integer", "minimum": 1}, "title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}, "required": ["note_id"]}},
                {"name": "delete_note", "description": "Permanently delete a note from the connected user's workspace.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"note_id": {"type": "string"}}, "required": ["note_id"]}},
                {"name": "list_bookmarks", "description": "List the connected user's bookmarked notes.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {}}},
            ]})
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
        elif tool == "update_note":
            note_id = str(values.get("note_id", ""))
            changes = {key: values[key] for key in ("version", "title", "content", "category") if key in values}
            if not any(key in changes for key in ("title", "content", "category")):
                return mcp_error(call.id, -32602, "At least one of title, content, or category is required")
            updated = update_note(note_id, NoteUpdate(**changes), user=user)
            text = f"Updated note {updated['note']['id']}: {updated['note']['title']}"
        elif tool == "delete_note":
            note_id = str(values.get("note_id", ""))
            delete_note(note_id, user=user)
            text = f"Deleted note {note_id}"
        elif tool == "list_bookmarks":
            notes = list_notes(bookmarked=True, user=user)["notes"]
            text = "\n\n".join(f"[{note['id']}] {note['title']}\n{note['content']}" for note in notes) or "No bookmarked notes."
        else:
            return mcp_error(call.id, -32602, f"Unknown tool: {tool}")
        return mcp_result(call.id, {"content": [{"type": "text", "text": text or "No matching notes."}]})
    except HTTPException as exc:
        if exc.status_code == 401:
            mcp_unauthorized(exc)
        return mcp_error(call.id, -32001, exc.detail)
    except Exception as exc:
        return mcp_error(call.id, -32000, str(exc))
