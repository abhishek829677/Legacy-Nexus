"""Chunked, resumable Document Q&A uploads and background processing.

App modules are imported inside the tests (see test_doc_qa.py for why).
"""
import pytest

SPEC = (b"# Login Feature\nThe login screen lets a user sign in with an email address and a password.\n"
        b"If the password is entered incorrectly three times the account is locked for 15 minutes.\n\n"
        b"## Password rules\nPasswords must be at least 8 characters long and contain at least one number.\n") * 3


@pytest.fixture
def small_chunks(monkeypatch):
    from app.services import doc_uploads
    monkeypatch.setattr(doc_uploads, "CHUNK_SIZE", 64)
    return 64


def _start(client, auth, name="spec.md", size=len(SPEC)):
    return client.post("/api/doc-qa/uploads", json={"filename": name, "size": size}, headers=auth)


def _put(client, auth, upload_id, index, data):
    return client.put(f"/api/doc-qa/uploads/{upload_id}/chunks/{index}", content=data,
                      headers={**auth, "Content-Type": "application/octet-stream"})


def _pieces(data, size):
    return [data[i:i + size] for i in range(0, len(data), size)]


def test_chunked_upload_end_to_end(client, auth, small_chunks):
    s = _start(client, auth).json()
    assert s["chunk_size"] == small_chunks and s["total_chunks"] == len(_pieces(SPEC, small_chunks)) and s["received"] == []
    pieces = _pieces(SPEC, small_chunks)
    # Out of order, and the first piece sent twice (a retry) — both must be fine.
    for i in reversed(range(len(pieces))):
        assert _put(client, auth, s["upload_id"], i, pieces[i]).status_code == 200
    assert _put(client, auth, s["upload_id"], 0, pieces[0]).status_code == 200
    assert client.get(f"/api/doc-qa/uploads/{s['upload_id']}", headers=auth).json()["received"] == list(range(len(pieces)))

    r = client.post(f"/api/doc-qa/uploads/{s['upload_id']}/complete", headers=auth)
    assert r.status_code == 202 and r.json()["status"] == "processing" and r.json()["size_bytes"] == len(SPEC)
    doc_id = r.json()["id"]

    # The test client runs background tasks before returning, so processing has finished.
    doc = client.get(f"/api/doc-qa/documents/{doc_id}", headers=auth).json()
    assert doc["status"] == "ready" and doc["chunk_count"] > 0 and doc["format"] == "md"
    a = client.post(f"/api/doc-qa/documents/{doc_id}/ask", json={"question": "How long is the account locked?", "role": "end_user"},
                    headers=auth)
    assert a.status_code == 200 and "15 minutes" in json_text(a.json())

    # The session folder (pieces) and the parked file are gone.
    from app.config import get_settings
    from app.services import doc_uploads
    assert not any((get_settings().storage_dir / "docqa-uploads").rglob(s["upload_id"]))
    assert not doc_uploads.pending_dir(doc_id).exists()


def json_text(d) -> str:
    import json
    return json.dumps(d)


def test_start_rejects_bad_type_empty_and_too_large(client, auth, monkeypatch):
    assert _start(client, auth, name="setup.exe").status_code == 400
    assert _start(client, auth, size=0).status_code == 422
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "docqa_max_file_mb", 1)
    r = _start(client, auth, size=2 * 1024 * 1024)
    assert r.status_code == 413 and "1 MB" in r.json()["detail"]


def test_bad_pieces_are_rejected(client, auth, small_chunks):
    s = _start(client, auth).json()
    assert _put(client, auth, s["upload_id"], 0, b"x" * 10).status_code == 400  # too short
    assert _put(client, auth, s["upload_id"], 0, b"x" * 100).status_code == 400  # too long
    assert _put(client, auth, s["upload_id"], 999, b"x" * 64).status_code == 400  # out of range
    assert client.get(f"/api/doc-qa/uploads/{s['upload_id']}", headers=auth).json()["received"] == []


def test_complete_needs_every_piece(client, auth, small_chunks):
    s = _start(client, auth).json()
    _put(client, auth, s["upload_id"], 0, _pieces(SPEC, small_chunks)[0])
    r = client.post(f"/api/doc-qa/uploads/{s['upload_id']}/complete", headers=auth)
    assert r.status_code == 400 and "have not arrived" in r.json()["detail"]


def test_cancel_and_unknown_sessions(client, auth, small_chunks):
    s = _start(client, auth).json()
    assert client.delete(f"/api/doc-qa/uploads/{s['upload_id']}", headers=auth).status_code == 204
    assert client.get(f"/api/doc-qa/uploads/{s['upload_id']}", headers=auth).status_code == 404
    assert client.get("/api/doc-qa/uploads/../../etc", headers=auth).status_code in (404, 405)
    assert client.get("/api/doc-qa/uploads/not-a-real-id", headers=auth).status_code == 404


def test_sessions_are_private(client, auth, small_chunks):
    from app.database import SessionLocal
    from app.models import User
    from app.security import hash_password

    with SessionLocal() as db:
        if db.query(User).filter_by(email="third@test.local").first() is None:
            db.add(User(email="third@test.local", full_name="Third", password_hash=hash_password("Third@1234"),
                        role="viewer", preferences={}))
            db.commit()
    tok = client.post("/api/auth/login", json={"email": "third@test.local", "password": "Third@1234"}).json()["access_token"]
    other = {"Authorization": f"Bearer {tok}"}
    s = _start(client, auth).json()
    assert client.get(f"/api/doc-qa/uploads/{s['upload_id']}", headers=other).status_code == 404
    assert _put(client, other, s["upload_id"], 0, b"x" * 64).status_code == 404


def test_unreadable_document_fails_and_cannot_be_asked(client, auth):
    data = b"   \n\n   "
    s = _start(client, auth, name="blank.txt", size=len(data)).json()
    _put(client, auth, s["upload_id"], 0, data)
    doc_id = client.post(f"/api/doc-qa/uploads/{s['upload_id']}/complete", headers=auth).json()["id"]
    doc = client.get(f"/api/doc-qa/documents/{doc_id}", headers=auth).json()
    assert doc["status"] == "failed" and doc["error"]
    r = client.post(f"/api/doc-qa/documents/{doc_id}/ask", json={"question": "anything here?", "role": "end_user"}, headers=auth)
    assert r.status_code == 409


def _orphan(client, auth, content: bytes | None, filename="orphan.md"):
    """A document left "processing" by a worker that died; optionally with its parked file still on disk."""
    from app.database import DocSessionLocal
    from app.models_docqa import DocQADocument
    from app.services import doc_uploads

    me = client.get("/api/auth/me", headers=auth).json()["id"]
    with DocSessionLocal() as ddb:
        d = DocQADocument(owner_id=me, filename=filename, format="md", size_bytes=len(content or b""), status="processing")
        ddb.add(d)
        ddb.commit()
        doc_id = d.id
    if content is not None:
        folder = doc_uploads.pending_dir(doc_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "document.bin").write_bytes(content)
        (folder / "filename").write_text(filename, encoding="utf-8")
    return doc_id


def _status(client, auth, doc_id):
    return {d["id"]: d for d in client.get("/api/doc-qa/documents", headers=auth).json()}[doc_id]


def test_lost_worker_is_restarted_from_the_parked_file(client, auth):
    import time

    from app.services import doc_uploads
    doc_id = _orphan(client, auth, SPEC)
    deadline = time.time() + 15
    while _status(client, auth, doc_id)["status"] == "processing" and time.time() < deadline:
        time.sleep(0.2)
    d = _status(client, auth, doc_id)
    assert d["status"] == "ready" and d["chunk_count"] > 0
    assert not doc_uploads.pending_dir(doc_id).exists()


def test_busy_worker_is_left_alone(client, auth):
    from app.services import doc_uploads
    doc_id = _orphan(client, auth, SPEC)
    lock = doc_uploads.WorkLock(doc_uploads.pending_dir(doc_id))
    assert lock.acquire()
    try:
        assert _status(client, auth, doc_id)["status"] == "processing"  # someone holds the lock: not restarted
    finally:
        lock.release()


def test_lost_worker_without_its_file_is_reported_failed(client, auth):
    from datetime import datetime, timedelta, timezone

    from app.database import DocSessionLocal
    from app.models_docqa import DocQADocument

    doc_id = _orphan(client, auth, None)
    assert _status(client, auth, doc_id)["status"] == "processing"  # brand new: its file may not be parked yet
    with DocSessionLocal() as ddb:
        ddb.get(DocQADocument, doc_id).updated_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        ddb.commit()
    d = _status(client, auth, doc_id)
    assert d["status"] == "failed" and "interrupted" in d["error"]


def test_documents_stuck_in_processing_are_reported_failed(client, auth):
    from datetime import datetime, timedelta, timezone

    from app.database import DocSessionLocal
    from app.models_docqa import DocQADocument

    with DocSessionLocal() as ddb:
        me = client.get("/api/auth/me", headers=auth).json()["id"]
        stuck = DocQADocument(owner_id=me, filename="stuck.pdf", format="pdf", size_bytes=10, status="processing",
                              updated_at=datetime.now(timezone.utc) - timedelta(hours=3))
        ddb.add(stuck)
        ddb.commit()
        stuck_id = stuck.id
    docs = {d["id"]: d for d in client.get("/api/doc-qa/documents", headers=auth).json()}
    assert docs[stuck_id]["status"] == "failed" and "interrupted" in docs[stuck_id]["error"]
