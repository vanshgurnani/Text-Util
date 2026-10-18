from __future__ import annotations

import logging
import time

from .database import client, notes_collection
from .jobs import claim_job, complete_job, fail_job


logger = logging.getLogger("noteform.worker")


def process_job(job: dict) -> None:
    if job["kind"] != "insights":
        raise ValueError(f"Unsupported job type: {job['kind']}")
    owner_id = job["owner_id"]
    notes = list(notes_collection().find({"owner_id": owner_id}, {"category": 1, "content": 1}))
    categories: dict[str, int] = {}
    total_words = 0
    for note in notes:
        category = note.get("category", "General")
        categories[category] = categories.get(category, 0) + 1
        total_words += len(note.get("content", "").split())
    complete_job(job["_id"], {"total_notes": len(notes), "total_words": total_words, "categories": categories})


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    try:
        while True:
            job = claim_job()
            if not job:
                time.sleep(2)
                continue
            try:
                process_job(job)
            except Exception as exc:
                logger.exception("job_failed", extra={"job_id": str(job["_id"])})
                fail_job(job["_id"], str(exc))
    finally:
        client.close()


if __name__ == "__main__":
    run()
