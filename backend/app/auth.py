from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from jose import JWTError, jwt

from .config import settings
from .database import users_collection, web_sessions_collection


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return f"pbkdf2_sha256$210000${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(candidate.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def hash_mcp_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_mcp_token() -> tuple[str, str]:
    token = f"nf_mcp_{secrets.token_urlsafe(40)}"
    return token, hash_mcp_token(token)


def create_oauth_token(prefix: str) -> tuple[str, str]:
    token = f"{prefix}_{secrets.token_urlsafe(40)}"
    return token, hash_mcp_token(token)


def create_web_session(user_id: ObjectId) -> tuple[str, datetime]:
    token = f"nf_session_{secrets.token_urlsafe(48)}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.web_session_days)
    web_sessions_collection().insert_one({"token_hash": hash_mcp_token(token), "user_id": user_id, "created_at": datetime.now(timezone.utc), "expires_at": expires_at})
    return token, expires_at


def revoke_web_session(token: str) -> None:
    web_sessions_collection().delete_one({"token_hash": hash_mcp_token(token)})


def user_from_session(token: str) -> dict:
    session = web_sessions_collection().find_one({"token_hash": hash_mcp_token(token), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    user = users_collection().find_one({"_id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


def create_access_token(user_id: str, username: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes)
    return jwt.encode({"sub": user_id, "username": username, "exp": expires}, settings.jwt_secret, algorithm="HS256")


def public_user(user: dict) -> dict:
    payload = {"id": str(user["_id"]), "username": user["username"], "email": user["email"]}
    if user.get("primary_workspace_id"):
        payload["workspace_id"] = str(user["primary_workspace_id"])
    return payload


def user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id or not ObjectId.is_valid(user_id):
            raise ValueError
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = users_collection().find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    return user


def current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    session_cookie: Optional[str] = Cookie(default=None, alias="noteform_session"),
) -> dict:
    if authorization and authorization.lower().startswith("bearer "):
        return user_from_token(authorization.split(" ", 1)[1].strip())
    if session_cookie:
        return user_from_session(session_cookie)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token or web session required")
