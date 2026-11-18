"""Built-in embedding models: run inside the app, so semantic search works with no external service or key."""
import os

import numpy as np
import pytest

from app.llm import embeddings
from app.llm.embeddings import BUILTIN_MODELS, EMBEDDING_CATALOG, EmbeddingConfig, EmbeddingError, embed_texts

BGE = "BAAI/bge-small-en-v1.5"
MINILM = "sentence-transformers/all-MiniLM-L6-v2"


class FakeModel:
    def __init__(self):
        self.seen: list[list[str]] = []

    def embed(self, texts, batch_size=32):
        self.seen.append(list(texts))
        for t in texts:
            yield np.array([float(len(t)), 1.0, 0.5], dtype=np.float32)


@pytest.fixture
def fake(monkeypatch):
    model = FakeModel()
    monkeypatch.setattr(embeddings, "_builtin_models", {BGE: model, MINILM: model})
    return model


def test_catalog_offers_only_bundled_models():
    entry = EMBEDDING_CATALOG["builtin"]
    assert entry["fixed_models"] and entry["local"] and entry["model_suggestions"] == list(BUILTIN_MODELS)
    assert EmbeddingConfig(provider="builtin", model=BGE).configured
    assert EmbeddingConfig(provider="builtin", model=MINILM).configured
    assert not EmbeddingConfig(provider="builtin", model="nomic-embed-text").configured


def test_builtin_batches_reports_progress_and_uses_query_prefix(fake):
    done = []
    cfg = EmbeddingConfig(provider="builtin", model=BGE, batch_size=2)
    vectors = embed_texts(cfg, ["a", "b", "c"], progress=lambda d, t: done.append((d, t)))
    assert len(vectors) == 3 and all(len(v) == 3 for v in vectors)
    assert [len(b) for b in fake.seen] == [2, 1] and done == [(2, 3), (3, 3)]

    fake.seen.clear()
    embed_texts(cfg, ["interest"], kind="query")
    assert fake.seen[0][0].startswith("Represent this sentence")  # bge models expect this query prefix


def test_unknown_builtin_model_is_a_clear_error():
    with pytest.raises(EmbeddingError, match="not a built-in model"):
        embed_texts(EmbeddingConfig(provider="builtin", model="made-up"), ["x"])


def test_settings_api_accepts_builtin_and_rejects_other_models(client, auth, fake):
    from app.database import SessionLocal
    from app.models import EmbeddingSettings

    fields = ("enabled", "provider", "model", "updated_by")
    with SessionLocal() as db:
        saved = {f: getattr(db.get(EmbeddingSettings, 1) or EmbeddingSettings(), f) for f in fields}
    try:
        r = client.put("/api/settings/embeddings", json={"enabled": True, "provider": "builtin", "model": ""}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["model"] == MINILM and r.json()["active"]  # empty model -> the recommended one

        r = client.put("/api/settings/embeddings", json={"model": "nomic-embed-text"}, headers=auth)
        assert r.status_code == 400 and "not a built-in model" in r.json()["detail"]
        assert client.get("/api/settings/embeddings", headers=auth).json()["model"] == MINILM  # unchanged

        test = client.post("/api/settings/embeddings/test", headers=auth).json()
        assert test["ok"], test
    finally:
        with SessionLocal() as db:
            row = db.get(EmbeddingSettings, 1)
            for f, v in saved.items():
                setattr(row, f, v)
            db.commit()


@pytest.mark.parametrize("profile, base_url, switched", [
    ("cloud", "", True),
    ("cloud", "http://localhost:11434", True),
    ("cloud", "http://ollama.internal:11434", False),  # a real Ollama server the admin set up
    ("local", "", False),  # on a laptop Ollama on localhost is normal
])
def test_cloud_replaces_unreachable_local_ollama(client, monkeypatch, profile, base_url, switched):
    from app.config import get_settings
    from app.database import SessionLocal
    from app.models import EmbeddingSettings
    from app.services import env_config, semantic

    s = get_settings()
    for k, v in {"deployment_profile": profile, "embedding_provider": "builtin", "embedding_model": MINILM,
                 "ai_provider": None}.items():
        monkeypatch.setattr(s, k, v)
    fields = ("enabled", "provider", "model", "base_url", "updated_by")
    with SessionLocal() as db:
        row = semantic.get_row(db)
        saved = {f: getattr(row, f) for f in fields}
        row.enabled, row.provider, row.model, row.base_url, row.updated_by = True, "ollama", "nomic-embed-text", base_url, 1
        db.commit()
        try:
            env_config.apply(db)
            row = semantic.get_row(db)
            assert (row.provider, row.model) == (("builtin", MINILM) if switched else ("ollama", "nomic-embed-text"))
        finally:
            row = db.get(EmbeddingSettings, 1)
            for f, v in saved.items():
                setattr(row, f, v)
            db.commit()


@pytest.mark.skipif(not os.getenv("LNX_REAL_EMBEDDINGS"), reason="downloads the real models; set LNX_REAL_EMBEDDINGS=1")
@pytest.mark.parametrize("model", list(BUILTIN_MODELS))
def test_real_builtin_models_rank_meaning_over_words(model):
    pytest.importorskip("fastembed")
    cfg = EmbeddingConfig(provider="builtin", model=model)
    docs = ["CALC-INTR-PARA. COMPUTE WS-INT-AMT = WS-BAL * WS-RATE / 100.",
            "PRINT-HEADER-PARA. MOVE SPACES TO WS-REPORT-LINE. WRITE REPORT-REC."]
    d = np.array(embed_texts(cfg, docs))
    q = np.array(embed_texts(cfg, ["How is interest calculated on the balance?"], kind="query"))[0]
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    q /= np.linalg.norm(q)
    assert d.shape[1] == 384
    assert d[0] @ q > d[1] @ q


def test_rebuild_shows_building_until_a_queued_worker_finishes(client, auth, sample_project, fake, monkeypatch):
    """On a queue the worker starts later; the old result must not be shown as the outcome meanwhile."""
    from datetime import datetime, timedelta, timezone

    from app.database import SessionLocal
    from app.models import EmbeddingIndex, EmbeddingSettings
    from app.services import jobs, semantic

    queued = []
    monkeypatch.setattr(jobs, "submit", lambda kind, pid, background=None: queued.append(pid))
    fields = ("enabled", "provider", "model", "updated_by")
    with SessionLocal() as db:
        saved = {f: getattr(semantic.get_row(db), f) for f in fields}
        idx = db.get(EmbeddingIndex, sample_project) or EmbeddingIndex(project_id=sample_project)
        db.add(idx)
        idx.status, idx.error = "failed", "Could not reach ollama"  # an old failure, as on the live site
        db.commit()
    try:
        assert client.put("/api/settings/embeddings", json={"enabled": True, "provider": "builtin"}, headers=auth).status_code == 200
        url = f"/api/projects/{sample_project}/semantic-index"
        assert client.post(url, headers=auth).status_code == 202 and queued == [sample_project]
        state = client.get(url, headers=auth).json()
        assert state["status"] == "building" and not state["error"]

        semantic.build_index(sample_project)  # what the worker does when it picks the job up
        state = client.get(url, headers=auth).json()
        assert state["status"] == "ready" and state["usable"] and state["model_key"].startswith("builtin:")

        # A job that never runs is reported as lost instead of spinning forever.
        assert client.post(url, headers=auth).status_code == 202
        with SessionLocal() as db:
            db.get(EmbeddingIndex, sample_project).updated_at = datetime.now(timezone.utc) - timedelta(hours=1)
            db.commit()
        state = client.get(url, headers=auth).json()
        assert state["status"] == "failed" and "stopped responding" in state["error"]

        # Semantic search switched off while the job waited: the worker says so.
        assert client.post(url, headers=auth).status_code == 202
        client.put("/api/settings/embeddings", json={"enabled": False}, headers=auth)
        semantic.build_index(sample_project)
        assert "Semantic search is off" in client.get(url, headers=auth).json()["error"]
    finally:
        with SessionLocal() as db:
            row = db.get(EmbeddingSettings, 1)
            for f, v in saved.items():
                setattr(row, f, v)
            semantic.delete_index(db, sample_project)  # the sample project is shared with other tests
            idx = db.get(EmbeddingIndex, sample_project)
            if idx:
                db.delete(idx)
            db.commit()
