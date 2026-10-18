from __future__ import annotations

import json
import logging
import time
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request

from .metrics import record_request


request_id_context: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_context.get(),
        }
        for key in ("method", "path", "duration_ms"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def install_request_logging(app: FastAPI) -> None:
    logger = logging.getLogger("noteform.http")

    @app.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        token = request_id_context.set(request_id)
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
            record_request(request.method, request.url.path, response.status_code)
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.info("request_complete", extra={"method": request.method, "path": request.url.path, "duration_ms": elapsed_ms})
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception:
            record_request(request.method, request.url.path, 500)
            logger.exception("request_failed", extra={"method": request.method, "path": request.url.path})
            raise
        finally:
            request_id_context.reset(token)
