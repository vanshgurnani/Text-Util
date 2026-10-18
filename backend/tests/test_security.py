from app.auth import create_mcp_token, create_oauth_token, hash_mcp_token, hash_password, verify_password
from app.domain.workspaces import serialize_workspace
from app.jobs import serialize_job
from bson import ObjectId
from datetime import datetime, timezone


def test_password_hash_is_not_reversible_and_verifies():
    encoded = hash_password("correct horse battery staple")

    assert encoded != "correct horse battery staple"
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("wrong password", encoded)


def test_bearer_tokens_are_hashed_and_prefixed():
    mcp_token, mcp_hash = create_mcp_token()
    oauth_token, oauth_hash = create_oauth_token("nf_oauth")

    assert mcp_token.startswith("nf_mcp_")
    assert oauth_token.startswith("nf_oauth_")
    assert mcp_hash == hash_mcp_token(mcp_token)
    assert oauth_hash == hash_mcp_token(oauth_token)
    assert mcp_hash != mcp_token


def test_workspace_serialization_is_stable():
    workspace_id = ObjectId()
    workspace = {
        "_id": workspace_id,
        "name": "Personal workspace",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    serialized = serialize_workspace(workspace, "owner")

    assert serialized["id"] == str(workspace_id)
    assert serialized["role"] == "owner"
    assert serialized["name"] == "Personal workspace"


def test_cookie_session_is_preferred_when_no_bearer_token(monkeypatch):
    from app import auth

    expected = {"_id": ObjectId(), "username": "vansh", "email": "vansh@example.com"}

    class FakeCollection:
        def find_one(self, query):
            if "token_hash" in query:
                return {"user_id": expected["_id"]}
            return expected

    monkeypatch.setattr(auth, "web_sessions_collection", lambda: FakeCollection())
    monkeypatch.setattr(auth, "users_collection", lambda: FakeCollection())

    user = auth.current_user(request=None, authorization=None, session_cookie="nf_session_test")

    assert user["_id"] == expected["_id"]


def test_job_serialization_exposes_retry_state():
    job_id = ObjectId()
    now = datetime.now(timezone.utc)
    serialized = serialize_job({"_id": job_id, "kind": "insights", "status": "queued", "attempts": 1, "created_at": now, "updated_at": now})

    assert serialized["id"] == str(job_id)
    assert serialized["attempts"] == 1
    assert serialized["status"] == "queued"
