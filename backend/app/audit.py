from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from .database import audit_collection


logger = logging.getLogger("noteform.audit")


def record_audit(
    *,
    action: str,
    actor_type: str,
    actor_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    request_id: str = "-",
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    try:
        audit_collection().insert_one({
            "action": action,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "request_id": request_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        # Auditing must never make a successful note operation fail.
        logger.exception("audit_write_failed")
