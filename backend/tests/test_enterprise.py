"""Accounts (sign-up, password reset, roles), the AI model library, plain-language rules with review, and
the file-level business map."""
import pytest


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ------------------------------------------------------------------ accounts


def test_signup_then_sign_in(client):
    assert client.get("/api/auth/options").json()["allow_signup"] is True
    r = client.post("/api/auth/register", json={"full_name": "Priya Analyst", "email": "Priya@Bank.test",
                                                "password": "Secure123"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["role"] == "analyst" and r.json()["user"]["email"] == "priya@bank.test"
    assert _login(client, "priya@bank.test", "Secure123")
    dup = client.post("/api/auth/register", json={"full_name": "X", "email": "priya@bank.test", "password": "Secure123"})
    assert dup.status_code == 400 and "already exists" in dup.json()["detail"]


@pytest.mark.parametrize("password", ["short1", "allletters", "12345678"])
def test_weak_passwords_are_refused(client, password):
    r = client.post("/api/auth/register", json={"full_name": "W", "email": f"weak{len(password)}{password[:2]}@bank.test",
                                                "password": password})
    assert r.status_code in (400, 422)


def test_forgot_and_reset_password(client):
    client.post("/api/auth/register", json={"full_name": "Reset Me", "email": "reset@bank.test", "password": "OldPass123"})
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@bank.test"}).json()
    known = client.post("/api/auth/forgot-password", json={"email": "reset@bank.test"}).json()
    assert unknown["message"] == known["message"]  # never reveals whether an account exists
    assert "dev_reset_url" not in unknown
    token = known["dev_reset_url"].split("token=")[1]

    assert client.post("/api/auth/reset-password", json={"token": token, "password": "NewPass456"}).status_code == 200
    again = client.post("/api/auth/reset-password", json={"token": token, "password": "Other789x"})
    assert again.status_code == 400  # one-time link
    assert client.post("/api/auth/login", json={"email": "reset@bank.test", "password": "OldPass123"}).status_code == 401
    assert _login(client, "reset@bank.test", "NewPass456")


def test_change_password_and_profile(client):
    client.post("/api/auth/register", json={"full_name": "Chg", "email": "chg@bank.test", "password": "First123"})
    h = _login(client, "chg@bank.test", "First123")
    bad = client.post("/api/auth/change-password", json={"current_password": "wrong", "new_password": "Second123"}, headers=h)
    assert bad.status_code == 400
    ok = client.post("/api/auth/change-password", json={"current_password": "First123", "new_password": "Second123"}, headers=h)
    assert ok.status_code == 200
    assert client.patch("/api/auth/me", json={"full_name": "Changed Name"}, headers=h).json()["full_name"] == "Changed Name"


def test_admin_manages_users_and_viewers_are_read_only(client, auth):
    client.post("/api/auth/register", json={"full_name": "Vic Viewer", "email": "vic@bank.test", "password": "Viewer123"})
    users = client.get("/api/users", headers=auth).json()
    vic = next(u for u in users if u["email"] == "vic@bank.test")
    assert client.patch(f"/api/users/{vic['id']}", json={"role": "viewer"}, headers=auth).json()["role"] == "viewer"
    h = _login(client, "vic@bank.test", "Viewer123")
    assert client.get("/api/users", headers=h).status_code == 403
    assert client.post("/api/projects", json={"name": "Not allowed"}, headers=h).status_code == 403
    assert client.get("/api/projects", headers=h).status_code == 200

    link = client.post(f"/api/users/{vic['id']}/reset-link", headers=auth).json()
    assert link["reset_url"] and not link["emailed"]
    assert client.patch(f"/api/users/{vic['id']}", json={"is_active": False}, headers=auth).status_code == 200
    assert client.post("/api/auth/login", json={"email": "vic@bank.test", "password": "Viewer123"}).status_code == 401

    me = next(u for u in users if u["email"] == "admin@test.local")
    r = client.patch(f"/api/users/{me['id']}", json={"role": "analyst"}, headers=auth)
    assert r.status_code == 400 and "administrator" in r.json()["detail"]


# ------------------------------------------------------------------ AI model library


def test_model_library_add_switch_delete(client, auth):
    gemini = client.post("/api/settings/models", json={"provider": "gemini", "model": "gemini-2.5-flash",
                                                       "api_key": "gemini-key-1234567890"}, headers=auth).json()
    claude = client.post("/api/settings/models", json={"name": "Claude for Q&A", "provider": "anthropic",
                                                       "model": "claude-sonnet-5-5", "api_key": "sk-ant-abcdef123456"},
                         headers=auth).json()
    models = client.get("/api/settings/models", headers=auth).json()
    assert {m["name"] for m in models} >= {"Google Gemini · gemini-2.5-flash", "Claude for Q&A"}
    assert all("1234567890" not in m["api_key_masked"] for m in models)
    active = [m for m in models if m["is_active"]]
    assert len(active) == 1

    client.post(f"/api/settings/models/{claude['id']}/activate", headers=auth)
    ai = client.get("/api/settings/ai", headers=auth).json()
    assert ai["provider"] == "anthropic" and ai["model"] == "claude-sonnet-5-5" and ai["configured"]

    assert client.delete(f"/api/settings/models/{claude['id']}", headers=auth).status_code == 204
    assert client.get("/api/settings/ai", headers=auth).json()["provider"] == "gemini"  # the remaining model took over
    client.post(f"/api/settings/models/{gemini['id']}/activate", headers=auth)
    assert client.get("/api/settings/ai", headers=auth).json()["provider"] == "gemini"
    client.post("/api/settings/models/deactivate", headers=auth)
    assert client.get("/api/settings/ai", headers=auth).json()["provider"] == "none"
    assert client.delete(f"/api/settings/models/{gemini['id']}", headers=auth).status_code == 204


def test_direct_settings_edit_appears_in_library(client, auth):
    client.put("/api/settings/ai", json={"provider": "ollama", "model": "llama3.1"}, headers=auth)
    models = client.get("/api/settings/models", headers=auth).json()
    active = [m for m in models if m["is_active"]]
    assert len(active) == 1 and active[0]["provider"] == "ollama" and active[0]["model"] == "llama3.1"
    client.delete(f"/api/settings/models/{active[0]['id']}", headers=auth)


# ------------------------------------------------------------------ business-friendly views


def test_rules_in_plain_english_with_review(client, auth, sample_project):
    r = client.get(f"/api/projects/{sample_project}/rules", headers=auth).json()
    rule = next(x for x in r["items"] if "minimum balance (500.00)" in x["plain"])
    assert rule["meaning"] and rule["capability"] == "Account Processing" and rule["review_status"] == "candidate"
    assert "WS-" not in rule["plain"]
    done = client.patch(f"/api/projects/{sample_project}/rules/{rule['id']}/review",
                        json={"status": "accepted", "note": "Confirmed by Finance"}, headers=auth).json()
    assert done["review_status"] == "accepted"
    accepted = client.get(f"/api/projects/{sample_project}/rules", params={"status": "accepted"}, headers=auth).json()
    assert [x["id"] for x in accepted["items"]] == [rule["id"]] and accepted["review_counts"]["accepted"] == 1


def test_file_level_business_map(client, auth, sample_project):
    v = client.get(f"/api/projects/{sample_project}/graph/files", headers=auth).json()
    files = {n["label"]: n for n in v["nodes"] if n["kind"] == "file"}
    assert files["PAYMENT.CBL"]["capability"] == "Payments"
    assert "Payment ledger" in files["PAYMENT.CBL"]["summary"]
    assert files["LEGACYTX.CBL"]["criticality"] == "Unused"
    sentences = {l["sentence"] for l in v["links"]}
    assert "NIGHTLY.jcl runs PAYMENT.CBL." in sentences
    assert any(s.startswith("PAYMENT.CBL saves data to Payment ledger") for s in sentences)
    assert "schema.sql defines Customer master." in sentences


def test_model_cannot_be_saved_without_its_required_fields(client, auth):
    before = len(client.get("/api/settings/models", headers=auth).json())
    empty = client.post("/api/settings/models", json={"provider": "anthropic", "model": "", "api_key": ""}, headers=auth)
    assert empty.status_code == 400 and empty.json()["detail"] == "Enter the API key and model name to save this model."
    no_key = client.post("/api/settings/models", json={"provider": "gemini", "model": "gemini-2.5-flash"}, headers=auth)
    assert no_key.status_code == 400 and "API key" in no_key.json()["detail"]
    azure = client.post("/api/settings/models", json={"provider": "azure_openai", "api_key": "k-0123456789"}, headers=auth)
    assert azure.status_code == 400 and azure.json()["detail"] == "Enter the endpoint and deployment name to save this model."
    assert len(client.get("/api/settings/models", headers=auth).json()) == before  # nothing was saved

    # Ollama runs locally and needs no key; an edit keeps the key already saved but cannot blank required fields.
    ok = client.post("/api/settings/models", json={"provider": "ollama", "model": "llama3.1"}, headers=auth)
    assert ok.status_code == 201
    claude = client.post("/api/settings/models", json={"provider": "anthropic", "model": "claude-x", "api_key": "sk-ant-0123456789"},
                         headers=auth).json()
    assert client.put(f"/api/settings/models/{claude['id']}", json={"name": "Renamed"}, headers=auth).status_code == 200
    blanked = client.put(f"/api/settings/models/{claude['id']}", json={"model": ""}, headers=auth)
    assert blanked.status_code == 400
    assert next(m for m in client.get("/api/settings/models", headers=auth).json() if m["id"] == claude["id"])["model"] == "claude-x"
    for m in (ok.json(), claude):
        client.delete(f"/api/settings/models/{m['id']}", headers=auth)


def test_failed_model_test_shows_a_generic_message(client, auth, monkeypatch, caplog):
    from app.llm.providers import LLMError
    from app.routers import settings as settings_router

    def boom(*_a, **_k):
        raise LLMError('anthropic returned HTTP 401: {"type":"error","error":{"type":"authentication_error"}}')

    monkeypatch.setattr(settings_router, "complete_json", boom)
    m = client.post("/api/settings/models", json={"provider": "anthropic", "model": "claude-x", "api_key": "sk-ant-0123456789"},
                    headers=auth).json()
    try:
        with caplog.at_level("WARNING", logger="app.routers.settings"):
            r = client.post(f"/api/settings/models/{m['id']}/test", headers=auth).json()
        assert r["ok"] is False and r["message"] == settings_router.MODEL_TEST_FAILED
        assert "HTTP 401" not in r["message"] and "anthropic returned" not in r["message"]
        assert "HTTP 401" in caplog.text  # the real reason is still in the server log
    finally:
        client.delete(f"/api/settings/models/{m['id']}", headers=auth)


def test_deleting_the_active_model_switches_to_the_next_one(client, auth):
    def add(**body):
        r = client.post("/api/settings/models", json=body, headers=auth)
        assert r.status_code == 201, r.text
        return r.json()

    def active():
        return [m for m in client.get("/api/settings/models", headers=auth).json() if m["is_active"]]

    for m in client.get("/api/settings/models", headers=auth).json():  # start from an empty library
        client.delete(f"/api/settings/models/{m['id']}", headers=auth)
    main = add(name="Main", provider="anthropic", model="claude-main", api_key="sk-ant-main-0123456789")
    small = add(name="Small", provider="ollama", model="llama3.1:8b", is_small=True)
    newest = add(name="Newest", provider="openai", model="gpt-new", api_key="sk-new-0123456789abcdef")
    backup = add(name="Backup", provider="gemini", model="gemini-x", api_key="gem-0123456789abcdef", is_fallback=True)
    client.post(f"/api/settings/models/{main['id']}/activate", headers=auth)

    client.delete(f"/api/settings/models/{main['id']}", headers=auth)
    assert [m["name"] for m in active()] == ["Backup"]  # the fallback model is preferred
    assert client.get("/api/settings/ai", headers=auth).json()["model"] == "gemini-x"

    client.delete(f"/api/settings/models/{backup['id']}", headers=auth)
    assert [m["name"] for m in active()] == ["Newest"]  # then a full-size model before the small one

    client.delete(f"/api/settings/models/{newest['id']}", headers=auth)
    assert [m["name"] for m in active()] == ["Small"]  # a small model is still better than none

    client.delete(f"/api/settings/models/{small['id']}", headers=auth)
    assert active() == [] and client.get("/api/settings/ai", headers=auth).json()["provider"] == "none"

    log = client.get("/api/settings/audit", params={"action": "ai_model_activated", "limit": 5}, headers=auth).json()["items"]
    assert log[0]["detail"].get("automatic") is True
