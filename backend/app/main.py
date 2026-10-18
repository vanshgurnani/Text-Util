from __future__ import annotations

import base64
import hashlib
import html
import io
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bson import ObjectId
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .auth import create_access_token, create_mcp_token, create_oauth_token, current_user, hash_mcp_token, hash_password, public_user, user_from_token, verify_password
from .config import settings
from .database import data_records_collection, data_tables_collection, lifespan, notes_collection, oauth_clients_collection, oauth_codes_collection, oauth_tokens_collection, summaries_collection, users_collection
from .schemas import LoginRequest, MCPCall, NoteCreate, NoteUpdate, RegisterRequest, SummaryCreate
from .serializers import serialize_note, serialize_public_note
from .structured_data import normalize_columns, serialize_record, serialize_table, validate_record_values
from .structured_schemas import DataColumn, DataRecordCreate, DataRecordUpdate, DataTableCreate, DataTableUpdate
from .workspace_archive import MAX_ARCHIVE_BYTES, MAX_ARCHIVE_NOTES, create_workspace_archive, parse_workspace_archive


app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    body = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorization Error — NoteOS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #f7f7f5;
      --card-bg: #ffffff;
      --text: #37352f;
      --muted: #6b7280;
      --border: rgba(55, 53, 47, 0.12);
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #191919;
        --card-bg: #222222;
        --text: rgba(255, 255, 255, 0.92);
        --muted: rgba(255, 255, 255, 0.55);
        --border: rgba(255, 255, 255, 0.12);
      }}
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }}
    .error-card {{
      width: 100%;
      max-width: 440px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04);
    }}
    .error-icon {{
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: rgba(235, 87, 87, 0.1);
      color: #eb5757;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      margin: 0 auto 16px;
    }}
    h1 {{ font-size: 20px; font-weight: 700; margin-bottom: 8px; color: var(--text); }}
    p {{ font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 22px; }}
    a {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 18px;
      background: #2383e2;
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.15s ease;
    }}
    a:hover {{ background: #1a73e8; }}
  </style>
</head>
<body>
  <main class="error-card">
    <div class="error-icon">⚠️</div>
    <h1>Authorization Error</h1>
    <p>{html.escape(message)}</p>
    <a href="/">Return to NoteOS Home</a>
  </main>
</body>
</html>"""
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


def render_oauth_authorize_page(fields: dict, error: str = "", email_val: str = "") -> str:
    hidden = "".join(f"<input type='hidden' name='{html.escape(key)}' value='{html.escape(str(value))}' />" for key, value in fields.items())
    error_html = f"""
    <div class="alert-error" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>{html.escape(error)}</span>
    </div>
    """ if error else ""

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Claude / MCP — NoteOS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #f7f7f5;
      --card-bg: #ffffff;
      --text: #37352f;
      --muted: #6b7280;
      --border: rgba(55, 53, 47, 0.12);
      --border-focus: #2383e2;
      --primary: #2383e2;
      --primary-hover: #1a73e8;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #191919;
        --card-bg: #222222;
        --text: rgba(255, 255, 255, 0.92);
        --muted: rgba(255, 255, 255, 0.55);
        --border: rgba(255, 255, 255, 0.12);
        --border-focus: #2383e2;
        --primary: #2383e2;
        --primary-hover: #3b82f6;
      }}
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }}
    .auth-card {{
      width: 100%;
      max-width: 440px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 36px 32px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04);
    }}
    .auth-header {{
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 24px;
    }}
    .brand-icon {{
      width: 46px;
      height: 46px;
      border-radius: 10px;
      background: rgba(35, 131, 226, 0.1);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      margin-bottom: 12px;
      border: 1px solid rgba(35, 131, 226, 0.2);
    }}
    .eyebrow {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 4px;
    }}
    .title {{
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.01em;
      margin-bottom: 6px;
    }}
    .subtitle {{
      font-size: 13px;
      color: var(--muted);
      line-height: 1.45;
    }}
    .scopes-box {{
      background: rgba(55, 53, 47, 0.04);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 20px;
      font-size: 12px;
    }}
    @media (prefers-color-scheme: dark) {{
      .scopes-box {{ background: rgba(255, 255, 255, 0.04); }}
    }}
    .scopes-title {{
      font-weight: 600;
      color: var(--text);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .scopes-list {{
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--muted);
    }}
    .scopes-list li {{
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .scopes-list svg {{
      color: #0e9f6e;
      flex-shrink: 0;
    }}
    .alert-error {{
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 6px;
      background: #fdf2f2;
      border: 1px solid rgba(235, 87, 87, 0.25);
      color: #9b1c1c;
      font-size: 12px;
      margin-bottom: 18px;
    }}
    @media (prefers-color-scheme: dark) {{
      .alert-error {{
        background: rgba(235, 87, 87, 0.15);
        color: #fca5a5;
        border-color: rgba(235, 87, 87, 0.3);
      }}
    }}
    .form-group {{
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }}
    .form-label {{
      font-size: 12px;
      font-weight: 600;
      color: var(--text);
    }}
    .form-input {{
      width: 100%;
      height: 38px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 14px;
      color: var(--text);
      background: transparent;
      outline: none;
      transition: all 0.15s ease;
    }}
    .form-input:focus {{
      border-color: var(--border-focus);
      box-shadow: 0 0 0 2.5px rgba(35, 131, 226, 0.2);
    }}
    .submit-btn {{
      width: 100%;
      height: 40px;
      background: var(--primary);
      color: #ffffff;
      border: 0;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(35, 131, 226, 0.3);
      transition: all 0.15s ease;
      margin-top: 8px;
    }}
    .submit-btn:hover {{
      background: var(--primary-hover);
      box-shadow: 0 2px 6px rgba(35, 131, 226, 0.4);
    }}
    .footer-note {{
      margin-top: 20px;
      text-align: center;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.4;
    }}
  </style>
</head>
<body>
  <main class="auth-card">
    <div class="auth-header">
      <div class="brand-icon">✦</div>
      <p class="eyebrow">NOTEOS CONNECT</p>
      <h1 class="title">Authorize MCP Client</h1>
      <p class="subtitle">Sign in to your NoteOS account to grant Claude or external assistant access to your workspace.</p>
    </div>

    {error_html}

    <div class="scopes-box">
      <div class="scopes-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Requested Capabilities</span>
      </div>
      <ul class="scopes-list">
        <li>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Read & search workspace notes and tables</span>
        </li>
        <li>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Create and update notes on your behalf</span>
        </li>
      </ul>
    </div>

    <form method="post" action="/oauth/authorize">
      {hidden}
      <div class="form-group">
        <label class="form-label" for="email">Email</label>
        <input class="form-input" id="email" name="email" type="email" value="{html.escape(email_val)}" placeholder="you@example.com" required autofocus />
      </div>

      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input class="form-input" id="password" name="password" type="password" placeholder="Enter your password" required />
      </div>

      <button class="submit-btn" type="submit">
        <span>Authorize & Connect</span>
        <span>→</span>
      </button>
    </form>

    <p class="footer-note">
      Your password is never shared with Claude or the MCP client. NoteOS generates a temporary, revocable OAuth session token.
    </p>
  </main>
</body>
</html>"""


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
    return HTMLResponse(render_oauth_authorize_page(fields), headers={"Cache-Control": "no-store"})


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
        fields = {"response_type": response_type, "client_id": client_id, "redirect_uri": redirect_uri, "scope": scope, "state": state, "code_challenge": code_challenge, "code_challenge_method": code_challenge_method, "resource": resource}
        return HTMLResponse(render_oauth_authorize_page(fields, error="Invalid NoteOS email or password.", email_val=email), status_code=401, headers={"Cache-Control": "no-store"})
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
    search: str = "",
    category: Optional[str] = None,
    tag: Annotated[Optional[str], Query(min_length=1, max_length=32)] = None,
    bookmarked: Optional[bool] = None,
    inbox: Optional[bool] = None,
    user: dict = Depends(current_user),
):
    # Safe defensive normalization for direct Python invocations & FastAPI params
    search_str = "" if hasattr(search, "default") or not isinstance(search, str) else search.strip()
    cat_str = None if hasattr(category, "default") or not isinstance(category, str) else category.strip()
    tag_str = None if hasattr(tag, "default") or not isinstance(tag, str) else tag.strip()
    b_val = None if hasattr(bookmarked, "default") or not isinstance(bookmarked, bool) else bookmarked
    i_val = None if hasattr(inbox, "default") or not isinstance(inbox, bool) else inbox

    query: dict[str, Any] = owner_filter(user)
    if cat_str and cat_str.lower() != "all":
        if cat_str.lower() == "pinned":
            query["pinned"] = True
        else:
            query["category"] = cat_str
    if b_val is not None:
        query["bookmarked"] = b_val
    if i_val is not None:
        query["inbox"] = i_val
    if tag_str:
        query["tags"] = tag_str.casefold()
    if search_str:
        query["$or"] = [
            {"title": {"$regex": search_str, "$options": "i"}},
            {"content": {"$regex": search_str, "$options": "i"}},
            {"source_url": {"$regex": search_str, "$options": "i"}},
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


@app.post("/notes/{note_id}/share")
def share_note(note_id: str, user: dict = Depends(current_user)):
    note = note_or_404(note_id, user)
    public_id = note.get("public_id")
    if not public_id:
        public_id = f"pub_{secrets.token_urlsafe(12)}"
    now = datetime.now(timezone.utc)
    notes_collection().update_one(
        {"_id": ObjectId(note_id), **owner_filter(user)},
        {"$set": {"is_public": True, "public_id": public_id, "updated_at": now}},
    )
    updated = note_or_404(note_id, user)
    return {"is_public": True, "public_id": public_id, "note": serialize_note(updated)}


@app.delete("/notes/{note_id}/share")
def unshare_note(note_id: str, user: dict = Depends(current_user)):
    note_or_404(note_id, user)
    now = datetime.now(timezone.utc)
    notes_collection().update_one(
        {"_id": ObjectId(note_id), **owner_filter(user)},
        {"$set": {"is_public": False, "updated_at": now}},
    )
    updated = note_or_404(note_id, user)
    return {"is_public": False, "note": serialize_note(updated)}


@app.get("/public/notes/{public_id}")
def get_public_note(public_id: str):
    note = notes_collection().find_one({"public_id": public_id, "is_public": True})
    if not note and ObjectId.is_valid(public_id):
        note = notes_collection().find_one({"_id": ObjectId(public_id), "is_public": True})
    if not note:
        raise HTTPException(status_code=404, detail="This note is private or does not exist")
    return {"note": serialize_public_note(note)}


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


async def read_workspace_upload(file: UploadFile) -> dict[str, Any]:
    data = await file.read(MAX_ARCHIVE_BYTES + 1)
    if len(data) > MAX_ARCHIVE_BYTES:
        raise HTTPException(status_code=413, detail="Workspace archive exceeds the 20 MB import limit")
    try:
        return parse_workspace_archive(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/workspace/import/preview")
async def preview_workspace_import(file: UploadFile = File(...), user: dict = Depends(current_user)):
    archive = await read_workspace_upload(file)
    notes = archive["pages"]
    return {
        "count": len(notes),
        "skipped_files": archive["skipped_files"],
        "pages": [{"title": note["title"], "path": note["path"]} for note in notes[:5]],
    }


@app.post("/workspace/import")
async def import_workspace(file: UploadFile = File(...), user: dict = Depends(current_user)):
    archive = await read_workspace_upload(file)
    notes = archive["pages"]
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


@app.post("/notes/{note_id}/pin")
def toggle_pin(note_id: str, user: dict = Depends(current_user)):
    note = note_or_404(note_id, user)
    pinned = not bool(note.get("pinned", False))
    version_filter = (
        {"version": int(note["version"])}
        if "version" in note
        else {"version": {"$exists": False}}
    )
    updated = notes_collection().find_one_and_update(
        {"_id": ObjectId(note_id), **owner_filter(user), **version_filter},
        {
            "$set": {"pinned": pinned, "updated_at": datetime.now(timezone.utc)},
            "$inc": {"version": 1},
        },
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="This page changed elsewhere. Reload it and try again.")
    return {"pinned": pinned, "version": int(updated.get("version", 1))}


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


def data_table_or_404(table_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(table_id):
        raise HTTPException(status_code=400, detail="Invalid table id")
    table = data_tables_collection().find_one({"_id": ObjectId(table_id), **owner_filter(user)})
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return table


def data_record_or_404(table_id: str, record_id: str, user: dict) -> tuple[dict, dict]:
    table = data_table_or_404(table_id, user)
    if not ObjectId.is_valid(record_id):
        raise HTTPException(status_code=400, detail="Invalid record id")
    record = data_records_collection().find_one({
        "_id": ObjectId(record_id),
        "table_id": table["_id"],
        **owner_filter(user),
    })
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    return table, record


@app.get("/tables")
def list_data_tables(user: dict = Depends(current_user)):
    tables = data_tables_collection().find(owner_filter(user)).sort("updated_at", -1).limit(200)
    return {"tables": [serialize_table(table) for table in tables]}


@app.post("/tables", status_code=status.HTTP_201_CREATED)
def create_data_table(payload: DataTableCreate, user: dict = Depends(current_user)):
    now = datetime.now(timezone.utc)
    table = {
        "owner_id": user["_id"],
        "name": payload.name,
        "columns": [column.model_dump() for column in payload.columns],
        "created_at": now,
        "updated_at": now,
    }
    result = data_tables_collection().insert_one(table)
    table["_id"] = result.inserted_id
    return {"table": serialize_table(table)}


@app.get("/tables/{table_id}")
def get_data_table(table_id: str, user: dict = Depends(current_user)):
    return {"table": serialize_table(data_table_or_404(table_id, user))}


@app.patch("/tables/{table_id}")
def update_data_table(table_id: str, payload: DataTableUpdate, user: dict = Depends(current_user)):
    data_table_or_404(table_id, user)
    changes = {key: value for key, value in payload.model_dump().items() if value is not None}
    if not changes:
        raise HTTPException(status_code=422, detail="A table name is required")
    changes["updated_at"] = datetime.now(timezone.utc)
    table = data_tables_collection().find_one_and_update(
        {"_id": ObjectId(table_id), **owner_filter(user)},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    return {"table": serialize_table(table)}


@app.delete("/tables/{table_id}")
def delete_data_table(table_id: str, user: dict = Depends(current_user)):
    table = data_table_or_404(table_id, user)
    data_records_collection().delete_many({"table_id": table["_id"], **owner_filter(user)})
    data_tables_collection().delete_one({"_id": table["_id"], **owner_filter(user)})
    return {"success": True}


@app.post("/tables/{table_id}/columns", status_code=status.HTTP_201_CREATED)
def add_data_column(table_id: str, payload: DataColumn, user: dict = Depends(current_user)):
    table = data_table_or_404(table_id, user)
    columns = normalize_columns([*table.get("columns", []), payload.model_dump()])
    updated = data_tables_collection().find_one_and_update(
        {"_id": table["_id"], **owner_filter(user)},
        {"$set": {"columns": columns, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    return {"table": serialize_table(updated)}


@app.get("/tables/{table_id}/records")
def list_data_records(table_id: str, limit: Annotated[int, Query(ge=1, le=500)] = 200, user: dict = Depends(current_user)):
    actual_limit = 200 if hasattr(limit, "default") or not isinstance(limit, int) else limit
    table = data_table_or_404(table_id, user)
    records = data_records_collection().find({
        "table_id": table["_id"],
        **owner_filter(user),
    }).sort([("created_at", 1), ("_id", 1)]).limit(actual_limit)
    return {"records": [serialize_record(record) for record in records]}


@app.post("/tables/{table_id}/records", status_code=status.HTTP_201_CREATED)
def create_data_record(table_id: str, payload: DataRecordCreate, user: dict = Depends(current_user)):
    table = data_table_or_404(table_id, user)
    now = datetime.now(timezone.utc)
    record = {
        "owner_id": user["_id"],
        "table_id": table["_id"],
        "values": validate_record_values(table.get("columns", []), payload.values),
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }
    result = data_records_collection().insert_one(record)
    record["_id"] = result.inserted_id
    return {"record": serialize_record(record)}


@app.patch("/tables/{table_id}/records/{record_id}")
def update_data_record(table_id: str, record_id: str, payload: DataRecordUpdate, user: dict = Depends(current_user)):
    table, record = data_record_or_404(table_id, record_id, user)
    if payload.version != int(record.get("version", 1)):
        raise HTTPException(status_code=409, detail="This record changed elsewhere. Reload it before saving.")
    current_values = record.get("values", {})
    values = validate_record_values(table.get("columns", []), {**current_values, **payload.values})
    updated = data_records_collection().find_one_and_update(
        {"_id": record["_id"], **owner_filter(user), "version": payload.version},
        {"$set": {"values": values, "updated_at": datetime.now(timezone.utc)}, "$inc": {"version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="This record changed elsewhere. Reload it before saving.")
    return {"record": serialize_record(updated)}


@app.delete("/tables/{table_id}/records/{record_id}")
def delete_data_record(table_id: str, record_id: str, user: dict = Depends(current_user)):
    _, record = data_record_or_404(table_id, record_id, user)
    data_records_collection().delete_one({"_id": record["_id"], **owner_filter(user)})
    return {"success": True}


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
                {"name": "list_tables", "description": "List structured-data tables in the connected user's workspace.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {}}},
                {"name": "create_table", "description": "Create a structured-data table. Supported column types: text, number, date, checkbox, select.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "columns": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "type": {"type": "string", "enum": ["text", "number", "date", "checkbox", "select"]}, "options": {"type": "array", "items": {"type": "string"}}}, "required": ["name", "type"]}}}, "required": ["name"]}},
                {"name": "get_table", "description": "Get a table's column definitions by table id.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}}, "required": ["table_id"]}},
                {"name": "add_table_column", "description": "Add a typed column to a table. Select columns require options.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}, "column": {"type": "object", "properties": {"name": {"type": "string"}, "type": {"type": "string", "enum": ["text", "number", "date", "checkbox", "select"]}, "options": {"type": "array", "items": {"type": "string"}}}, "required": ["name", "type"]}}, "required": ["table_id", "column"]}},
                {"name": "list_table_records", "description": "List records in a table. Returns at most 500 records.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:read"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 500}}, "required": ["table_id"]}},
                {"name": "create_table_record", "description": "Create a record. Values are keyed by column id; get_table provides the ids and types.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}, "values": {"type": "object"}}, "required": ["table_id", "values"]}},
                {"name": "update_table_record", "description": "Update a record using its version and a partial values object.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}, "record_id": {"type": "string"}, "version": {"type": "integer", "minimum": 1}, "values": {"type": "object"}}, "required": ["table_id", "record_id", "version", "values"]}},
                {"name": "delete_table_record", "description": "Permanently delete one record from a table.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}, "record_id": {"type": "string"}}, "required": ["table_id", "record_id"]}},
                {"name": "delete_table", "description": "Permanently delete a table and all its records.", "securitySchemes": [{"type": "oauth2", "scopes": ["notes:write"]}], "inputSchema": {"type": "object", "properties": {"table_id": {"type": "string"}}, "required": ["table_id"]}},
            ]})
        if call.method != "tools/call":
            return mcp_error(call.id, -32601, "Method not found")
        tool = call.params.get("name")
        values = call.params.get("arguments", {}) or {}
        if tool == "search_notes":
            search_query = str(values.get("query") or values.get("search") or values.get("q") or "").strip()
            notes = list_notes(search=search_query, user=user)["notes"]
            if not notes:
                text = f"No notes found matching '{search_query}'." if search_query else "No notes found in workspace."
            else:
                formatted = []
                for note in notes:
                    tags_str = f" [tags: {', '.join(note.get('tags', []))}]" if note.get("tags") else ""
                    formatted.append(f"[{note['id']}] {note['title']}{tags_str}\n{note.get('content', '')}")
                text = "\n\n---\n\n".join(formatted)
        elif tool == "get_note":
            note_id = str(values.get("note_id") or values.get("id") or "").strip()
            if not note_id:
                return mcp_error(call.id, -32602, "Missing required argument 'note_id'")
            try:
                note = get_note(note_id, user=user)["note"]
                text = (
                    f"Title: {note.get('title', 'Untitled')}\n"
                    f"ID: {note.get('id', '')}\n"
                    f"Category: {note.get('category', 'General')}\n"
                    f"Tags: {', '.join(note.get('tags', [])) if note.get('tags') else 'None'}\n"
                    f"Bookmarked: {note.get('bookmarked', False)}\n"
                    f"Pinned: {note.get('pinned', False)}\n"
                    f"Updated: {note.get('updated_at', '')}\n\n"
                    f"{note.get('content', '')}"
                )
            except HTTPException as exc:
                if exc.status_code == 404:
                    text = f"Note with ID '{note_id}' was not found in your workspace."
                else:
                    raise
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
        elif tool == "list_tables":
            text = json.dumps(list_data_tables(user=user)["tables"], ensure_ascii=False)
        elif tool == "create_table":
            table = create_data_table(DataTableCreate.model_validate(values), user=user)["table"]
            text = json.dumps(table, ensure_ascii=False)
        elif tool == "get_table":
            text = json.dumps(get_data_table(str(values.get("table_id", "")), user=user)["table"], ensure_ascii=False)
        elif tool == "add_table_column":
            table_id = str(values.get("table_id", ""))
            column = DataColumn.model_validate(values.get("column", {}))
            text = json.dumps(add_data_column(table_id, column, user=user)["table"], ensure_ascii=False)
        elif tool == "list_table_records":
            table_id = str(values.get("table_id", ""))
            limit = int(values.get("limit", 200))
            text = json.dumps(list_data_records(table_id, limit=limit, user=user)["records"], ensure_ascii=False)
        elif tool == "create_table_record":
            table_id = str(values.get("table_id", ""))
            record = create_data_record(table_id, DataRecordCreate.model_validate({"values": values.get("values", {})}), user=user)["record"]
            text = json.dumps(record, ensure_ascii=False)
        elif tool == "update_table_record":
            table_id = str(values.get("table_id", ""))
            record_id = str(values.get("record_id", ""))
            payload_values = {key: values[key] for key in ("version", "values") if key in values}
            record = update_data_record(table_id, record_id, DataRecordUpdate.model_validate(payload_values), user=user)["record"]
            text = json.dumps(record, ensure_ascii=False)
        elif tool == "delete_table_record":
            table_id = str(values.get("table_id", ""))
            record_id = str(values.get("record_id", ""))
            delete_data_record(table_id, record_id, user=user)
            text = f"Deleted record {record_id}"
        elif tool == "delete_table":
            table_id = str(values.get("table_id", ""))
            delete_data_table(table_id, user=user)
            text = f"Deleted table {table_id} and its records"
        else:
            return mcp_error(call.id, -32602, f"Unknown tool: {tool}")
        return mcp_result(call.id, {"content": [{"type": "text", "text": text or "No matching notes."}]})
    except HTTPException as exc:
        if exc.status_code == 401:
            mcp_unauthorized(exc)
        return mcp_error(call.id, -32001, exc.detail)
    except ValidationError as exc:
        return mcp_error(call.id, -32602, str(exc))
    except Exception as exc:
        return mcp_error(call.id, -32000, str(exc))
