from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from ..database import users_collection, workspace_invites_collection, workspace_members_collection, workspaces_collection
from .categories import ensure_default_categories


def serialize_workspace(workspace: dict, role: str = "owner") -> dict:
    return {
        "id": str(workspace["_id"]),
        "name": workspace.get("name", "Personal workspace"),
        "role": role,
        "created_at": workspace["created_at"].isoformat(),
        "updated_at": workspace["updated_at"].isoformat(),
    }


def ensure_personal_workspace(user: dict) -> dict:
    workspace_id = user.get("primary_workspace_id")
    workspace = None
    if workspace_id:
        workspace = workspaces_collection().find_one({"_id": workspace_id})
    if not workspace:
        workspace = workspaces_collection().find_one({"personal_owner_id": user["_id"]})
    if not workspace:
        now = datetime.now(timezone.utc)
        document = {
            "name": "Personal workspace",
            "owner_id": user["_id"],
            "personal_owner_id": user["_id"],
            "created_at": now,
            "updated_at": now,
        }
        try:
            result = workspaces_collection().insert_one(document)
            document["_id"] = result.inserted_id
            workspace = document
        except DuplicateKeyError:
            workspace = workspaces_collection().find_one({"personal_owner_id": user["_id"]})
            if not workspace:
                raise
    now = datetime.now(timezone.utc)
    users_collection().update_one({"_id": user["_id"]}, {"$set": {"primary_workspace_id": workspace["_id"]}})
    user["primary_workspace_id"] = workspace["_id"]
    workspace_members_collection().update_one(
        {"workspace_id": workspace["_id"], "user_id": user["_id"]},
        {"$setOnInsert": {"workspace_id": workspace["_id"], "user_id": user["_id"], "role": "owner", "created_at": now}},
        upsert=True,
    )
    ensure_default_categories(workspace["_id"])
    return workspace


def create_workspace(user: dict, name: str) -> dict:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Workspace name cannot be empty")
    now = datetime.now(timezone.utc)
    document = {"name": name.strip(), "owner_id": user["_id"], "created_at": now, "updated_at": now}
    result = workspaces_collection().insert_one(document)
    document["_id"] = result.inserted_id
    workspace_members_collection().insert_one({"workspace_id": result.inserted_id, "user_id": user["_id"], "role": "owner", "created_at": now})
    ensure_default_categories(result.inserted_id)
    return document


def list_workspaces(user: dict) -> list[dict]:
    ensure_personal_workspace(user)
    memberships = workspace_members_collection().find({"user_id": user["_id"]}).sort("created_at", 1)
    result = []
    for membership in memberships:
        workspace = workspaces_collection().find_one({"_id": membership["workspace_id"]})
        if workspace:
            result.append(serialize_workspace(workspace, membership.get("role", "viewer")))
    return result


def get_workspace(workspace_id: str, user: dict) -> dict:
    if not ObjectId.is_valid(workspace_id):
        raise HTTPException(status_code=400, detail="Invalid workspace id")
    membership = workspace_members_collection().find_one({"workspace_id": ObjectId(workspace_id), "user_id": user["_id"]})
    if not membership:
        raise HTTPException(status_code=404, detail="Workspace not found")
    workspace = workspaces_collection().find_one({"_id": ObjectId(workspace_id)})
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {**serialize_workspace(workspace, membership.get("role", "viewer")), "owner_id": str(workspace["owner_id"])}


def _workspace_object_id(workspace_id: str, user: dict, require_owner: bool = False) -> ObjectId:
    if not ObjectId.is_valid(workspace_id):
        raise HTTPException(status_code=400, detail="Invalid workspace id")
    workspace_object_id = ObjectId(workspace_id)
    membership = workspace_members_collection().find_one({"workspace_id": workspace_object_id, "user_id": user["_id"]})
    if not membership or (require_owner and membership.get("role") != "owner"):
        raise HTTPException(status_code=403 if membership else 404, detail="Workspace access denied")
    return workspace_object_id


def list_workspace_members(workspace_id: str, user: dict) -> list[dict]:
    workspace_object_id = _workspace_object_id(workspace_id, user)
    result = []
    for membership in workspace_members_collection().find({"workspace_id": workspace_object_id}).sort("created_at", 1):
        member = users_collection().find_one({"_id": membership["user_id"]}, {"username": 1, "email": 1})
        if member:
            result.append({"user_id": str(member["_id"]), "username": member["username"], "email": member["email"], "role": membership.get("role", "viewer")})
    return result


def create_workspace_invite(workspace_id: str, user: dict, email: str, role: str) -> dict:
    workspace_object_id = _workspace_object_id(workspace_id, user, require_owner=True)
    email = email.lower().strip()
    raw_token = f"nf_invite_{secrets.token_urlsafe(36)}"
    now = datetime.now(timezone.utc)
    invite = {
        "workspace_id": workspace_object_id,
        "email": email,
        "role": role,
        "token_hash": hashlib.sha256(raw_token.encode()).hexdigest(),
        "created_by": user["_id"],
        "created_at": now,
        "expires_at": now.replace(microsecond=0) + timedelta(days=7),
    }
    workspace_invites_collection().insert_one(invite)
    return {"token": raw_token, "email": email, "role": role, "expires_at": invite["expires_at"].isoformat()}


def accept_workspace_invite(token: str, user: dict) -> dict:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    invite = workspace_invites_collection().find_one_and_delete({"token_hash": token_hash, "email": user["email"].lower(), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not invite:
        raise HTTPException(status_code=400, detail="Invite is invalid, expired, or belongs to another account")
    now = datetime.now(timezone.utc)
    workspace_members_collection().update_one(
        {"workspace_id": invite["workspace_id"], "user_id": user["_id"]},
        {"$set": {"role": invite["role"]}, "$setOnInsert": {"workspace_id": invite["workspace_id"], "user_id": user["_id"], "created_at": now}},
        upsert=True,
    )
    workspace = workspaces_collection().find_one({"_id": invite["workspace_id"]})
    return {"workspace": serialize_workspace(workspace, invite["role"])}
