"""Persistence of analysis artifacts and a small in-process cache for the Q&A index."""
from __future__ import annotations

import json
import os
import threading
from collections import OrderedDict

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.engine.qa import QAEngine
from app.models import AnalysisArtifact

_cache_lock = threading.Lock()
_qa_cache: OrderedDict[tuple[int, str], QAEngine] = OrderedDict()
_CACHE_SIZE = 16

# Analysis results as JSON text, keyed by (project id, kind) and checked against the row's id and creation time on every read.
_data_cache: OrderedDict[tuple[int, str], tuple[tuple[int, str], str]] = OrderedDict()
_data_cache_bytes = 0
_DATA_CACHE_MAX_BYTES = int(os.getenv("ARTIFACT_CACHE_MB", "256")) * 1024 * 1024


def save_artifacts(db: Session, project_id: int, artifacts: dict) -> None:
    db.execute(delete(AnalysisArtifact).where(AnalysisArtifact.project_id == project_id))
    for kind, data in artifacts.items():
        db.add(AnalysisArtifact(project_id=project_id, kind=kind, data=data))
    invalidate(project_id)


def load(db: Session, project_id: int, kind: str):
    return load_many(db, project_id, [kind]).get(kind)


def load_many(db: Session, project_id: int, kinds: list[str]) -> dict:
    """Artifacts by kind. Each is several MB of JSON, so it is fetched from the database only when it changed.

    A cheap query reads the row ids first: every analysis replaces the rows, so a new id/time means new data,
    whichever replica or worker wrote it. Callers get a freshly parsed copy and may change it freely."""
    where = (AnalysisArtifact.project_id == project_id, AnalysisArtifact.kind.in_(kinds))
    ids = {kind: (row_id, str(created)) for kind, row_id, created
           in db.execute(select(AnalysisArtifact.kind, AnalysisArtifact.id, AnalysisArtifact.created_at).where(*where))}
    out: dict = {}
    missing = []
    with _cache_lock:
        for kind, row_id in ids.items():
            hit = _data_cache.get((project_id, kind))
            if hit and hit[0] == row_id:
                _data_cache.move_to_end((project_id, kind))
                out[kind] = hit[1]
            else:
                missing.append(kind)
    if missing:
        rows = db.execute(select(AnalysisArtifact.kind, AnalysisArtifact.id, AnalysisArtifact.created_at, AnalysisArtifact.data)
                          .where(AnalysisArtifact.project_id == project_id, AnalysisArtifact.kind.in_(missing))).all()
        for kind, row_id, created, data in rows:
            text = json.dumps(data, separators=(",", ":"))
            out[kind] = text
            _remember((project_id, kind), (row_id, str(created)), text)
    return {kind: json.loads(text) for kind, text in out.items()}


def _remember(key: tuple[int, str], version: tuple[int, str], text: str) -> None:
    global _data_cache_bytes
    with _cache_lock:
        old = _data_cache.pop(key, None)
        if old:
            _data_cache_bytes -= len(old[1])
        if len(text) > _DATA_CACHE_MAX_BYTES // 4:  # one huge artifact must not push everything else out
            return
        _data_cache[key] = (version, text)
        _data_cache_bytes += len(text)
        while _data_cache_bytes > _DATA_CACHE_MAX_BYTES and _data_cache:
            _, (_, dropped) = _data_cache.popitem(last=False)
            _data_cache_bytes -= len(dropped)


def qa_engine(db: Session, project_id: int, version: str) -> QAEngine | None:
    key = (project_id, version)
    with _cache_lock:
        if key in _qa_cache:
            _qa_cache.move_to_end(key)
            return _qa_cache[key]
    data = load_many(db, project_id, ["chunks", "symbols", "graph", "lineage", "inventory"])
    if len(data) < 5:
        return None
    engine = QAEngine(data["chunks"], data["symbols"], data["graph"], data["lineage"],
                      {f["path"]: f for f in data["inventory"]})
    with _cache_lock:
        _qa_cache[key] = engine
        while len(_qa_cache) > _CACHE_SIZE:
            _qa_cache.popitem(last=False)
    return engine


def invalidate(project_id: int) -> None:
    global _data_cache_bytes
    with _cache_lock:
        for key in [k for k in _qa_cache if k[0] == project_id]:
            _qa_cache.pop(key, None)
        for key in [k for k in _data_cache if k[0] == project_id]:
            _data_cache_bytes -= len(_data_cache.pop(key)[1])
