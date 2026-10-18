from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings


class ProcessRateLimitMiddleware(BaseHTTPMiddleware):
    """Small local guardrail; use a shared Redis limiter for multiple replicas."""

    def __init__(self, app):
        super().__init__(app)
        self._events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _policy(self, path: str) -> tuple[str, int] | None:
        if path in {"/auth/login", "/auth/register", "/oauth/token", "/oauth/authorize"}:
            return "auth", settings.auth_rate_limit
        if path == "/mcp":
            return "mcp", settings.mcp_rate_limit
        return None

    async def dispatch(self, request: Request, call_next):
        policy = self._policy(request.url.path)
        if not policy:
            return await call_next(request)
        bucket, limit = policy
        client = request.client.host if request.client else "unknown"
        key = (bucket, client)
        now = monotonic()
        with self._lock:
            events = self._events[key]
            while events and now - events[0] >= 60:
                events.popleft()
            if len(events) >= limit:
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
            events.append(now)
        return await call_next(request)
