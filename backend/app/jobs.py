from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument

from .database import jobs_collection


def enqueue_job(owner_id: ObjectId, kind: str, payload: dict[str, Any]) -> dict:
    now = datetime.now(timezone.utc)
    document = {
        "owner_id": owner_id,
        "kind": kind,
        "payload": payload,
        "status": "queued",
        "attempts": 0,
        "created_at": now,
        "updated_at": now,
    }
    result = jobs_collection().insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_job(document)


def serialize_job(job: dict) -> dict:
    return {
        "id": str(job["_id"]),
        "kind": job["kind"],
        "status": job["status"],
        "attempts": job.get("attempts", 0),
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job["created_at"].isoformat(),
        "updated_at": job["updated_at"].isoformat(),
    }


def get_job(job_id: str, owner_id: ObjectId) -> dict:
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    job = jobs_collection().find_one({"_id": ObjectId(job_id), "owner_id": owner_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_job(job)


def claim_job() -> Optional[dict]:
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(minutes=10)
    return jobs_collection().find_one_and_update(
        {"$or": [{"status": "queued", "attempts": {"$lt": 3}}, {"status": "running", "attempts": {"$lt": 3}, "updated_at": {"$lt": stale_before}}]},
        {"$set": {"status": "running", "updated_at": now}, "$inc": {"attempts": 1}},
        sort=[("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )


def complete_job(job_id: ObjectId, result: dict[str, Any]) -> None:
    jobs_collection().update_one({"_id": job_id}, {"$set": {"status": "completed", "result": result, "updated_at": datetime.now(timezone.utc)}})


def fail_job(job_id: ObjectId, error: str) -> None:
    job = jobs_collection().find_one({"_id": job_id}, {"attempts": 1})
    attempts = int(job.get("attempts", 3)) if job else 3
    status = "dead_letter" if attempts >= 3 else "queued"
    jobs_collection().update_one({"_id": job_id}, {"$set": {"status": status, "error": error[:1000], "updated_at": datetime.now(timezone.utc)}})
