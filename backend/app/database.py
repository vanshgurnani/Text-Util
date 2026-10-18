from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo import ASCENDING, DESCENDING, MongoClient

from .config import settings


client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=3000)
db = client[settings.mongo_db]


def notes_collection():
    return db.notes


def users_collection():
    return db.users


def web_sessions_collection():
    return db.web_sessions


def workspaces_collection():
    return db.workspaces


def workspace_members_collection():
    return db.workspace_members


def workspace_invites_collection():
    return db.workspace_invites


def categories_collection():
    return db.categories


def summaries_collection():
    return db.summaries


def note_revisions_collection():
    return db.note_revisions


def audit_collection():
    return db.audit_events


def jobs_collection():
    return db.jobs


def oauth_clients_collection():
    return db.oauth_clients


def oauth_codes_collection():
    return db.oauth_codes


def oauth_tokens_collection():
    return db.oauth_tokens


def mongo_is_ready() -> bool:
    try:
        client.admin.command("ping")
        return True
    except Exception:
        return False


def backfill_personal_workspaces() -> None:
    from .domain.workspaces import ensure_personal_workspace

    for user in users_collection().find({}, {"username": 1, "primary_workspace_id": 1}):
        workspace = ensure_personal_workspace(user)
        notes_collection().update_many(
            {"owner_id": user["_id"], "workspace_id": {"$exists": False}},
            {"$set": {"workspace_id": workspace["_id"]}},
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        client.admin.command("ping")
        users_collection().create_index("email", unique=True)
        users_collection().create_index("username", unique=True)
        web_sessions_collection().create_index("token_hash", unique=True)
        web_sessions_collection().create_index("expires_at", expireAfterSeconds=0)
        workspaces_collection().create_index("personal_owner_id", unique=True, sparse=True)
        workspace_members_collection().create_index([("workspace_id", ASCENDING), ("user_id", ASCENDING)], unique=True)
        workspace_members_collection().create_index([("user_id", ASCENDING), ("created_at", ASCENDING)])
        workspace_invites_collection().create_index("token_hash", unique=True)
        workspace_invites_collection().create_index("expires_at", expireAfterSeconds=0)
        categories_collection().create_index([("workspace_id", ASCENDING), ("key", ASCENDING)], unique=True)
        notes_collection().create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
        notes_collection().create_index([("workspace_id", ASCENDING), ("updated_at", DESCENDING)])
        notes_collection().create_index([("owner_id", ASCENDING), ("title", ASCENDING)])
        notes_collection().create_index([("owner_id", ASCENDING), ("category", ASCENDING), ("updated_at", DESCENDING)])
        notes_collection().create_index([("title", "text"), ("content", "text")])
        note_revisions_collection().create_index([("note_id", ASCENDING), ("version", DESCENDING)])
        audit_collection().create_index([("created_at", DESCENDING)])
        jobs_collection().create_index([("status", ASCENDING), ("created_at", ASCENDING)])
        jobs_collection().create_index([("owner_id", ASCENDING), ("created_at", DESCENDING)])
        oauth_clients_collection().create_index("client_id", unique=True)
        oauth_codes_collection().create_index("code_hash", unique=True)
        oauth_tokens_collection().create_index("token_hash", unique=True)
        backfill_personal_workspaces()
    except Exception as exc:
        # The API can still start while Mongo is coming up; requests will report a useful error.
        print(f"MongoDB is not ready yet: {exc}")
    yield
    client.close()
