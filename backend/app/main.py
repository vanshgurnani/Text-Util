from __future__ import annotations

import base64
import hashlib
import html
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bson import ObjectId
from fastapi import Cookie, Depends, FastAPI, Form, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from pymongo.errors import DuplicateKeyError

from .audit import record_audit
from .auth import create_access_token, create_mcp_token, create_oauth_token, create_web_session, current_user, hash_mcp_token, hash_password, public_user, revoke_web_session, user_from_token, verify_password
from .config import settings
from .database import audit_collection, lifespan, mongo_is_ready, notes_collection, oauth_clients_collection, oauth_codes_collection, oauth_tokens_collection, summaries_collection, users_collection
from .domain.categories import create_category, delete_category, list_categories
from .domain.notes import create_user_note, delete_user_note, get_user_note, list_note_revisions, list_user_notes, restore_note_revision, update_user_note
from .domain.workspaces import accept_workspace_invite, create_workspace, create_workspace_invite, ensure_personal_workspace, get_workspace, list_workspace_members, list_workspaces, serialize_workspace
from .jobs import enqueue_job, get_job
from .observability import configure_logging, install_request_logging, request_id_context
from .rate_limit import ProcessRateLimitMiddleware
from .metrics import render_prometheus
from .schemas import CategoryCreate, LoginRequest, MCPCall, NoteCreate, NoteImportRequest, NoteUpdate, RegisterRequest, SummaryCreate, WorkspaceCreate, WorkspaceInviteCreate
from .serializers import serialize_note


settings.validate()
configure_logging()
app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)
install_request_logging(app)
app.add_middleware(ProcessRateLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def owner_filter(user: dict) -> dict:
    return {"owner_id": user["_id"]}


def note_or_404(note_id: str, user: dict) -> dict:
    return get_user_note(note_id, user)


@app.get("/")
def root():
    return {"name": settings.app_name, "docs": "/docs", "mcp": "/mcp"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "noteform-api"}


@app.get("/health/live")
def health_live():
    return {"status": "ok", "service": "noteform-api"}


@app.get("/health/ready")
def health_ready():
    if not mongo_is_ready():
        raise HTTPException(status_code=503, detail="MongoDB is not ready")
    return {"status": "ready", "service": "noteform-api"}


@app.get("/metrics")
def metrics(request: Request):
    if settings.metrics_token and request.headers.get("x-metrics-token") != settings.metrics_token:
        raise HTTPException(status_code=401, detail="Metrics token required")
    return PlainTextResponse(render_prometheus(), media_type="text/plain; version=0.0.4")


def auth_response(user: dict, request: Request, status_code: int = 200) -> JSONResponse:
    token = create_access_token(str(user["_id"]), user["username"])
    session, expires_at = create_web_session(user["_id"])
    response = JSONResponse({"user": public_user(user), "token": token}, status_code=status_code, headers={"Cache-Control": "no-store"})
    max_age = max(60, int((expires_at - datetime.now(timezone.utc)).total_seconds()))
    response.set_cookie(
        key="noteform_session",
        value=session,
        max_age=max_age,
        expires=max_age,
        httponly=True,
        secure=settings.cookie_secure or settings.is_production,
        samesite="lax",
        path="/",
    )
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request):
    now = datetime.now(timezone.utc)
    user = {"username": payload.username.strip(), "email": payload.email.lower(), "password_hash": hash_password(payload.password), "created_at": now}
    try:
        result = users_collection().insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Username or email is already in use")
    user["_id"] = result.inserted_id
    ensure_personal_workspace(user)
    record_audit(action="auth.register", actor_type="user", actor_id=str(result.inserted_id), request_id=request.state.request_id)
    return auth_response(user, request, status.HTTP_201_CREATED)


@app.post("/auth/login")
def login(payload: LoginRequest, request: Request):
    user = users_collection().find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    ensure_personal_workspace(user)
    record_audit(action="auth.login", actor_type="user", actor_id=str(user["_id"]), request_id=request.state.request_id)
    return auth_response(user, request)


@app.get("/auth/me")
def me(user: dict = Depends(current_user)):
    ensure_personal_workspace(user)
    return {"user": public_user(user)}


@app.post("/auth/logout")
def logout(request: Request, session_cookie: Optional[str] = Cookie(default=None, alias="noteform_session"), user: dict = Depends(current_user)):
    if session_cookie:
        revoke_web_session(session_cookie)
    record_audit(action="auth.logout", actor_type="user", actor_id=str(user["_id"]), request_id=request.state.request_id)
    response = JSONResponse({"success": True}, headers={"Cache-Control": "no-store"})
    response.delete_cookie("noteform_session", path="/")
    return response


@app.get("/workspaces")
def get_workspaces(user: dict = Depends(current_user)):
    return {"workspaces": list_workspaces(user)}


@app.post("/workspaces", status_code=status.HTTP_201_CREATED)
def add_workspace(payload: WorkspaceCreate, request: Request, user: dict = Depends(current_user)):
    workspace = create_workspace(user, payload.name)
    record_audit(action="workspace.created", actor_type="user", actor_id=str(user["_id"]), resource_type="workspace", resource_id=str(workspace["_id"]), request_id=request.state.request_id)
    return {"workspace": serialize_workspace(workspace)}


@app.get("/workspaces/{workspace_id}")
def read_workspace(workspace_id: str, user: dict = Depends(current_user)):
    return {"workspace": get_workspace(workspace_id, user)}


@app.get("/workspaces/{workspace_id}/members")
def get_workspace_members(workspace_id: str, user: dict = Depends(current_user)):
    return {"members": list_workspace_members(workspace_id, user)}


@app.post("/workspaces/{workspace_id}/invites", status_code=status.HTTP_201_CREATED)
def invite_workspace_member(workspace_id: str, payload: WorkspaceInviteCreate, request: Request, user: dict = Depends(current_user)):
    invite = create_workspace_invite(workspace_id, user, str(payload.email), payload.role)
    record_audit(action="workspace.invite_created", actor_type="user", actor_id=str(user["_id"]), resource_type="workspace", resource_id=workspace_id, request_id=request.state.request_id, metadata={"email": invite["email"], "role": invite["role"]})
    return {"invite": invite, "message": "Send this one-time invite token to the workspace member."}


@app.post("/workspaces/invites/{token}/accept")
def accept_invite(token: str, request: Request, user: dict = Depends(current_user)):
    result = accept_workspace_invite(token, user)
    record_audit(action="workspace.invite_accepted", actor_type="user", actor_id=str(user["_id"]), resource_type="workspace", resource_id=result["workspace"]["id"], request_id=request.state.request_id)
    return result


@app.get("/categories")
def get_categories(user: dict = Depends(current_user)):
    workspace = ensure_personal_workspace(user)
    return {"categories": list_categories(workspace["_id"])}


@app.post("/categories", status_code=status.HTTP_201_CREATED)
def add_category(payload: CategoryCreate, request: Request, user: dict = Depends(current_user)):
    workspace = ensure_personal_workspace(user)
    category = create_category(workspace["_id"], payload.name, payload.color)
    record_audit(action="category.created", actor_type="user", actor_id=str(user["_id"]), resource_type="category", resource_id=category["id"], request_id=request.state.request_id)
    return {"category": category}


@app.delete("/categories/{category_id}")
def remove_category(category_id: str, request: Request, user: dict = Depends(current_user)):
    workspace = ensure_personal_workspace(user)
    delete_category(workspace["_id"], category_id)
    record_audit(action="category.deleted", actor_type="user", actor_id=str(user["_id"]), resource_type="category", resource_id=category_id, request_id=request.state.request_id)
    return {"success": True}


@app.post("/auth/mcp-token")
def issue_mcp_token(request: Request, user: dict = Depends(current_user)):
    token, token_hash = create_mcp_token()
    users_collection().update_one(
        {"_id": user["_id"]},
        {"$set": {"mcp_token_hash": token_hash, "mcp_token_scopes": list(settings.mcp_token_scopes), "mcp_token_created_at": datetime.now(timezone.utc)}},
    )
    record_audit(action="mcp.token_created", actor_type="user", actor_id=str(user["_id"]), request_id=request.state.request_id)
    return {"token": token, "message": "MCP token created. Copy it now; it will not be shown again."}


@app.delete("/auth/mcp-token")
def revoke_mcp_token(request: Request, user: dict = Depends(current_user)):
    users_collection().update_one({"_id": user["_id"]}, {"$unset": {"mcp_token_hash": "", "mcp_token_scopes": "", "mcp_token_created_at": ""}})
    record_audit(action="mcp.token_revoked", actor_type="user", actor_id=str(user["_id"]), request_id=request.state.request_id)
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


SUPPORTED_SCOPES = {"notes:read", "notes:write"}


def normalize_scopes(value: str) -> str:
    scopes = [scope for scope in value.split() if scope in SUPPORTED_SCOPES]
    return " ".join(dict.fromkeys(scopes)) or "notes:read"


def has_scope(scopes: set[str], required: str) -> bool:
    return required in scopes


def valid_redirect_uri(uri: str) -> bool:
    parts = urlsplit(uri)
    if parts.fragment or not parts.netloc:
        return False
    if parts.scheme == "https":
        return True
    return parts.scheme == "http" and parts.hostname in {"localhost", "127.0.0.1", "::1"}


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
        "revocation_endpoint": f"{issuer}/oauth/revoke",
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
    if not isinstance(redirect_uris, list) or not redirect_uris or not all(isinstance(uri, str) and valid_redirect_uri(uri) for uri in redirect_uris):
        return {"error": "invalid_client_metadata", "error_description": "redirect_uris is required"}
    client_id = f"nf_client_{secrets.token_urlsafe(18)}"
    oauth_clients_collection().insert_one({"client_id": client_id, "client_name": payload.get("client_name", "MCP client"), "redirect_uris": redirect_uris, "created_at": datetime.now(timezone.utc)})
    return {"client_id": client_id, "client_name": payload.get("client_name", "MCP client"), "redirect_uris": redirect_uris, "token_endpoint_auth_method": "none"}


@app.post("/oauth/revoke")
def oauth_revoke(token: str = Form(...), client_id: Optional[str] = Form(default=None)):
    query: dict[str, Any] = {"token_hash": hash_mcp_token(token)}
    if client_id:
        query["client_id"] = client_id
    oauth_tokens_collection().delete_many(query)
    return JSONResponse({}, headers={"Cache-Control": "no-store"})


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
    scope = normalize_scopes(scope)
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
        stored = oauth_tokens_collection().find_one_and_delete({"token_hash": hash_mcp_token(refresh_token), "token_type": "refresh", "client_id": client_id, "expires_at": {"$gt": now}})
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
    search: str = "",
    category: Optional[str] = None,
    bookmarked: Optional[bool] = None,
    limit: int = 50,
    cursor: Optional[str] = None,
    user: dict = Depends(current_user),
):
    return list_user_notes(user=user, search=search, category=category, bookmarked=bookmarked, limit=limit, cursor=cursor)


@app.get("/notes/export")
def export_notes(format: str = Query(default="json", pattern="^(json|markdown)$"), user: dict = Depends(current_user)):
    notes = list_user_notes(user=user, limit=100)["notes"]
    if format == "markdown":
        blocks = [f"# {note['title']}\n\n{note['content']}\n\n<!-- category: {note['category']} -->" for note in notes]
        return PlainTextResponse("\n\n---\n\n".join(blocks), media_type="text/markdown", headers={"Content-Disposition": "attachment; filename=noteform-export.md"})
    return JSONResponse({"notes": notes}, headers={"Content-Disposition": "attachment; filename=noteform-export.json"})


def parse_markdown_import(source: str) -> NoteImportRequest:
    notes = []
    for block in source.split("\n\n---\n\n"):
        block = block.strip()
        if not block:
            continue
        lines = block.splitlines()
        if not lines or not lines[0].startswith("# "):
            raise HTTPException(status_code=400, detail="Markdown import blocks must start with '# title'")
        title = lines[0][2:].strip() or "Untitled"
        body = "\n".join(lines[1:]).strip()
        category = "General"
        marker = "<!-- category:"
        if marker in body:
            body, category_part = body.rsplit(marker, 1)
            category = category_part.split("-->", 1)[0].strip() or category
        notes.append(NoteCreate(title=title, content=body.strip(), category=category))
    if not notes:
        raise HTTPException(status_code=400, detail="Markdown import contains no notes")
    return NoteImportRequest(notes=notes)


@app.post("/notes/import", status_code=status.HTTP_201_CREATED)
async def import_notes(request: Request, user: dict = Depends(current_user)):
    import_format = request.query_params.get("format", "json")
    if import_format == "markdown":
        payload = parse_markdown_import((await request.body()).decode("utf-8"))
    elif import_format == "json":
        try:
            payload = NoteImportRequest.model_validate(await request.json())
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON note import") from exc
    else:
        raise HTTPException(status_code=400, detail="format must be json or markdown")
    imported = []
    for note_payload in payload.notes:
        note = create_user_note(note_payload, user, actor="import")
        imported.append(serialize_note(note))
    record_audit(action="notes.imported", actor_type="user", actor_id=str(user["_id"]), request_id=request.state.request_id, metadata={"count": len(imported)})
    return {"notes": imported, "count": len(imported)}


@app.post("/notes", status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, request: Request, user: dict = Depends(current_user)):
    note = create_user_note(payload, user, actor="web")
    record_audit(action="note.created", actor_type="user", actor_id=str(user["_id"]), resource_type="note", resource_id=str(note["_id"]), request_id=request.state.request_id)
    return {"note": serialize_note(note)}


@app.get("/notes/{note_id}")
def get_note(note_id: str, user: dict = Depends(current_user)):
    return {"note": serialize_note(get_user_note(note_id, user))}


@app.patch("/notes/{note_id}")
def update_note(note_id: str, payload: NoteUpdate, request: Request, user: dict = Depends(current_user)):
    note = update_user_note(note_id, payload, user, actor="web")
    record_audit(action="note.updated", actor_type="user", actor_id=str(user["_id"]), resource_type="note", resource_id=note_id, request_id=request.state.request_id)
    return {"note": serialize_note(note)}


@app.get("/notes/{note_id}/revisions")
def get_note_revisions(note_id: str, user: dict = Depends(current_user)):
    return {"revisions": list_note_revisions(note_id, user)}


@app.post("/notes/{note_id}/revisions/{version}/restore")
def restore_revision(note_id: str, version: int, request: Request, user: dict = Depends(current_user)):
    note = restore_note_revision(note_id, version, user)
    record_audit(action="note.revision_restored", actor_type="user", actor_id=str(user["_id"]), resource_type="note", resource_id=note_id, request_id=request.state.request_id, metadata={"restored_from": version})
    return {"note": serialize_note(note)}


@app.delete("/notes/{note_id}")
def delete_note(note_id: str, request: Request, user: dict = Depends(current_user)):
    delete_user_note(note_id, user)
    record_audit(action="note.deleted", actor_type="user", actor_id=str(user["_id"]), resource_type="note", resource_id=note_id, request_id=request.state.request_id)
    return {"success": True}


@app.post("/notes/{note_id}/bookmark")
def toggle_bookmark(note_id: str, request: Request, user: dict = Depends(current_user)):
    note = note_or_404(note_id, user)
    bookmarked = not bool(note.get("bookmarked", False))
    notes_collection().update_one({"_id": ObjectId(note_id), **owner_filter(user)}, {"$set": {"bookmarked": bookmarked, "updated_at": datetime.now(timezone.utc)}})
    record_audit(action="note.bookmark_toggled", actor_type="user", actor_id=str(user["_id"]), resource_type="note", resource_id=note_id, request_id=request.state.request_id, metadata={"bookmarked": bookmarked})
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


@app.post("/jobs/insights", status_code=status.HTTP_202_ACCEPTED)
def enqueue_insights(request: Request, user: dict = Depends(current_user)):
    job = enqueue_job(user["_id"], "insights", {})
    record_audit(action="job.enqueued", actor_type="user", actor_id=str(user["_id"]), resource_type="job", resource_id=job["id"], request_id=request.state.request_id, metadata={"kind": "insights"})
    return {"job": job}


@app.get("/jobs/{job_id}")
def read_job(job_id: str, user: dict = Depends(current_user)):
    return {"job": get_job(job_id, user["_id"])}


def mcp_error(request_id: Any, code: int, message: str):
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def mcp_result(request_id: Any, result: dict):
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def mcp_principal(request: Request) -> tuple[dict, set[str], str]:
    auth = request.headers.get("authorization", "")
    api_key = request.headers.get("x-mcp-api-key", "")
    bearer = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else ""
    supplied_token = api_key or bearer
    if supplied_token.startswith("nf_oauth_"):
        token = oauth_tokens_collection().find_one({"token_hash": hash_mcp_token(supplied_token), "token_type": "access", "expires_at": {"$gt": datetime.now(timezone.utc)}})
        if token:
            user = users_collection().find_one({"_id": token["user_id"]})
            if user:
                return user, set(token.get("scope", "notes:read").split()), "oauth"
    if supplied_token.startswith("nf_mcp_"):
        user = users_collection().find_one({"mcp_token_hash": hash_mcp_token(supplied_token)})
        if user:
            return user, set(user.get("mcp_token_scopes", settings.mcp_token_scopes)), "api_token"
    if settings.mcp_api_key and api_key == settings.mcp_api_key and settings.mcp_user_id:
        if ObjectId.is_valid(settings.mcp_user_id):
            user = users_collection().find_one({"_id": ObjectId(settings.mcp_user_id)})
            if user:
                return user, set(settings.mcp_token_scopes), "service_token"
    if auth.lower().startswith("bearer "):
        return user_from_token(bearer), set(settings.mcp_token_scopes), "web_session"
    raise HTTPException(status_code=401, detail="OAuth or MCP API token required")


def mcp_unauthorized(exc: HTTPException):
    metadata_url = f"{oauth_issuer()}/.well-known/oauth-protected-resource"
    raise HTTPException(status_code=401, detail=exc.detail, headers={"WWW-Authenticate": f'Bearer resource_metadata="{metadata_url}"'})


def require_mcp_scope(scopes: set[str], required: str) -> None:
    if not has_scope(scopes, required):
        raise HTTPException(status_code=403, detail=f"MCP scope required: {required}")


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
        user, scopes, auth_kind = mcp_principal(request)
        if call.method == "tools/list":
            return mcp_result(call.id, {"tools": [
                {"name": "search_notes", "description": "Search the connected user's notes by title or content with cursor pagination.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "category": {"type": "string"}, "bookmarked": {"type": "boolean"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}, "cursor": {"type": "string"}}, "required": ["query"]}},
                {"name": "get_note", "description": "Read one note by id.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"note_id": {"type": "string"}}, "required": ["note_id"]}},
                {"name": "create_note", "description": "Save a new note to the connected user's workspace.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}, "required": ["content"]}},
                {"name": "update_note", "description": "Update a note using optimistic version checking.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"note_id": {"type": "string"}, "title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}, "icon": {"type": "string"}, "version": {"type": "integer", "minimum": 1}}, "required": ["note_id", "version"]}},
                {"name": "list_bookmarks", "description": "List the connected user's bookmarked notes.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {}}},
                {"name": "export_notes", "description": "Export up to 100 of the connected user's notes as JSON or Markdown.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"format": {"type": "string", "enum": ["json", "markdown"]}}}},
                {"name": "queue_insights", "description": "Queue an asynchronous insights calculation for the connected user's notes.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {}}},
            ]})
        if call.method != "tools/call":
            return mcp_error(call.id, -32601, "Method not found")
        tool = call.params.get("name")
        values = call.params.get("arguments", {}) or {}
        if not isinstance(values, dict):
            return mcp_error(call.id, -32602, "Tool arguments must be an object")
        structured: Optional[dict] = None
        if tool == "search_notes":
            require_mcp_scope(scopes, "notes:read")
            try:
                requested_limit = int(values.get("limit", 50))
            except (TypeError, ValueError):
                return mcp_error(call.id, -32602, "limit must be an integer")
            page = list_user_notes(user=user, search=str(values.get("query", "")), category=values.get("category"), bookmarked=values.get("bookmarked"), limit=requested_limit, cursor=values.get("cursor"))
            structured = page
            text = "\n\n".join(f"[{note['id']}] {note['title']}\n{note['content']}" for note in page["notes"])
            if page.get("next_cursor"):
                text += f"\n\nNext cursor: {page['next_cursor']}"
        elif tool == "get_note":
            require_mcp_scope(scopes, "notes:read")
            text = str(get_note(str(values.get("note_id", "")), user=user)["note"])
        elif tool == "create_note":
            require_mcp_scope(scopes, "notes:write")
            created = create_user_note(NoteCreate(title=values.get("title", "Untitled"), content=values.get("content", ""), category=values.get("category", "General")), user=user, actor="mcp")
            record_audit(action="note.created", actor_type="mcp", actor_id=str(user["_id"]), resource_type="note", resource_id=str(created["_id"]), request_id=request.state.request_id)
            text = f"Created note {created['_id']}: {created['title']}"
        elif tool == "update_note":
            require_mcp_scope(scopes, "notes:write")
            note_id = str(values.get("note_id", ""))
            if values.get("version") is None:
                return mcp_error(call.id, -32602, "version is required for update_note")
            payload = NoteUpdate(title=values.get("title"), content=values.get("content"), category=values.get("category"), icon=values.get("icon"), version=values.get("version"))
            updated = update_user_note(note_id, payload, user, actor="mcp")
            record_audit(action="note.updated", actor_type="mcp", actor_id=str(user["_id"]), resource_type="note", resource_id=note_id, request_id=request.state.request_id)
            text = f"Updated note {note_id} to version {updated.get('version', 1)}"
        elif tool == "list_bookmarks":
            require_mcp_scope(scopes, "notes:read")
            notes = list_notes(bookmarked=True, user=user)["notes"]
            text = "\n\n".join(f"[{note['id']}] {note['title']}\n{note['content']}" for note in notes) or "No bookmarked notes."
        elif tool == "export_notes":
            require_mcp_scope(scopes, "notes:read")
            page = list_user_notes(user=user, limit=100)
            if values.get("format", "markdown") == "json":
                text = json.dumps({"notes": page["notes"]}, ensure_ascii=False)
            else:
                text = "\n\n---\n\n".join(f"# {note['title']}\n\n{note['content']}" for note in page["notes"])
            structured = page
        elif tool == "queue_insights":
            require_mcp_scope(scopes, "notes:read")
            job = enqueue_job(user["_id"], "insights", {})
            record_audit(action="job.enqueued", actor_type="mcp", actor_id=str(user["_id"]), resource_type="job", resource_id=job["id"], request_id=request.state.request_id, metadata={"kind": "insights"})
            text = f"Queued insights job {job['id']}"
            structured = {"job": job}
        else:
            return mcp_error(call.id, -32602, f"Unknown tool: {tool}")
        result = {"content": [{"type": "text", "text": text or "No matching notes."}]}
        if structured is not None:
            result["structuredContent"] = structured
        return mcp_result(call.id, result)
    except HTTPException as exc:
        if exc.status_code == 401:
            mcp_unauthorized(exc)
        return mcp_error(call.id, -32001, exc.detail)
    except Exception as exc:
        return mcp_error(call.id, -32000, str(exc))
