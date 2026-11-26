"""A lost analysis (queue message expired, worker never started or crashed) must not block the project forever."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import update


def _set(pid: int, **values) -> None:
    from app.database import SessionLocal
    from app.models import Project

    with SessionLocal() as db:
        db.execute(update(Project).where(Project.id == pid).values(**values))
        db.commit()


def test_queued_analysis_that_never_started_can_be_run_again(client, auth):
    pid = client.post("/api/projects", json={"name": "Lost job"}, headers=auth).json()["id"]
    old = datetime.now(timezone.utc) - timedelta(minutes=20)
    _set(pid, status="analyzing", progress=0, stage="Queued", updated_at=old)

    project = client.get(f"/api/projects/{pid}", headers=auth).json()
    assert project["status"] == "failed"
    assert "never started" in project["error"]


def test_recent_and_running_analyses_are_left_alone(client, auth):
    pid = client.post("/api/projects", json={"name": "Busy job"}, headers=auth).json()["id"]
    _set(pid, status="analyzing", progress=0, stage="Queued", updated_at=datetime.now(timezone.utc))
    assert client.get(f"/api/projects/{pid}", headers=auth).json()["status"] == "analyzing"

    # Started an hour ago and still within the worker's time limit: still running.
    _set(pid, status="analyzing", progress=40, stage="Parsing sources",
         updated_at=datetime.now(timezone.utc) - timedelta(hours=1))
    assert client.get(f"/api/projects/{pid}", headers=auth).json()["status"] == "analyzing"

    _set(pid, updated_at=datetime.now(timezone.utc) - timedelta(hours=7))
    assert client.get(f"/api/projects/{pid}", headers=auth).json()["status"] == "failed"
