from fastapi.testclient import TestClient

from app.main import app, parse_markdown_import


def test_liveness_and_mcp_initialize_contract():
    with TestClient(app) as client:
        live = client.get("/health/live")
        assert live.status_code == 200
        assert live.json()["status"] == "ok"
        assert live.headers["x-request-id"]

        initialize = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        assert initialize.status_code == 200
        assert initialize.json()["result"]["serverInfo"]["name"] == "noteform"


def test_protected_metadata_has_scopes():
    with TestClient(app) as client:
        response = client.get("/.well-known/oauth-protected-resource")
        assert response.status_code == 200
        assert "notes:read" in response.json()["scopes_supported"]


def test_metrics_endpoint_exposes_request_counter_format():
    with TestClient(app) as client:
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "noteform_http_requests_total" in response.text


def test_markdown_import_parser_preserves_title_content_and_category():
    payload = parse_markdown_import("# First note\n\nBody text\n\n<!-- category: Work -->")

    assert len(payload.notes) == 1
    assert payload.notes[0].title == "First note"
    assert payload.notes[0].content == "Body text"
    assert payload.notes[0].category == "Work"
