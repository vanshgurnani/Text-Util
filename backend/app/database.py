from contextlib import asynccontextmanager

from fastapi import FastAPI
from pymongo import ASCENDING, DESCENDING, MongoClient

from .config import settings


client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=3000)
db = client[settings.mongo_db]


def notes_collection():
    return db.notes


def data_tables_collection():
    return db.data_tables


def data_records_collection():
    return db.data_records


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


def note_chunks_collection():
    return db.note_chunks


def conversations_collection():
    return db.conversations


def chat_messages_collection():
    return db.chat_messages


def rag_query_cache_collection():
    return db.rag_query_cache


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        client.admin.command("ping")
        users_collection().create_index("email", unique=True)
        users_collection().create_index("username", unique=True)
        notes_collection().create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
        notes_collection().create_index([("owner_id", ASCENDING), ("title", ASCENDING)])
        data_tables_collection().create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
        data_records_collection().create_index([("owner_id", ASCENDING), ("table_id", ASCENDING), ("updated_at", DESCENDING)])
        # RAG and Chat indexes
        note_chunks_collection().create_index([("owner_id", ASCENDING), ("note_id", ASCENDING)])
        note_chunks_collection().create_index([("owner_id", ASCENDING), ("content_hash", ASCENDING)])
        note_chunks_collection().create_index([("owner_id", ASCENDING), ("category", ASCENDING)])
        note_chunks_collection().create_index([("owner_id", ASCENDING), ("tags", ASCENDING)])
        conversations_collection().create_index([("owner_id", ASCENDING), ("updated_at", DESCENDING)])
        conversations_collection().create_index([("owner_id", ASCENDING), ("is_pinned", DESCENDING), ("updated_at", DESCENDING)])
        chat_messages_collection().create_index([("conversation_id", ASCENDING), ("created_at", ASCENDING)])
        rag_query_cache_collection().create_index("query_hash", unique=True)
        rag_query_cache_collection().create_index("expires_at", expireAfterSeconds=0)
    except Exception as exc:
        # The API can still start while Mongo is coming up; requests will report a useful error.
        print(f"MongoDB is not ready yet: {exc}")
    yield
    client.close()
