from __future__ import annotations

from collections import Counter
from threading import Lock


_lock = Lock()
_requests: Counter[tuple[str, str, int]] = Counter()


def record_request(method: str, path: str, status_code: int) -> None:
    with _lock:
        _requests[(method, path, status_code)] += 1


def render_prometheus() -> str:
    lines = [
        "# HELP noteform_http_requests_total Total HTTP requests handled by Noteform.",
        "# TYPE noteform_http_requests_total counter",
    ]
    with _lock:
        snapshot = dict(_requests)
    for (method, path, status_code), value in sorted(snapshot.items()):
        safe_path = path.replace('\\', '\\\\').replace('"', '\\"')
        lines.append(f'noteform_http_requests_total{{method="{method}",path="{safe_path}",status_code="{status_code}"}} {value}')
    return "\n".join(lines) + "\n"
