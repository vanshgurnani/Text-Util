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


def summaries_collection():
    return db.summaries


def oauth_clients_collection():
    return db.oauth_clients


def oauth_codes_collection():
    return db.oauth_codes


def oauth_tokens_collection():
    return db.oauth_tokens


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        client.admin.command("ping")
        users_collection().create_index("email", unique=True)
        users_collection().create_index("username", unique=True)
        notes_collection().create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
        notes_collection().create_index([("owner_id", ASCENDING), ("title", ASCENDING)])
    except Exception as exc:
        # The API can still start while Mongo is coming up; requests will report a useful error.
        print(f"MongoDB is not ready yet: {exc}")
    yield
    client.close()
