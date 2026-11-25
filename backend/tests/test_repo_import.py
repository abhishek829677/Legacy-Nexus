"""Importing a project straight from a git repository URL."""
import pytest

from app.services import repo_import, storage

COBOL = ("       IDENTIFICATION DIVISION.\n       PROGRAM-ID. HELLO.\n"
         "       PROCEDURE DIVISION.\n       MAIN.\n           STOP RUN.\n")


def test_normalise_repo_url_accepts_https():
    assert repo_import.normalise_repo_url("  https://github.com/owner/repo.git ") == "https://github.com/owner/repo.git"


@pytest.mark.parametrize("bad", [
    "", "   ", "not a url", "file:///etc/passwd", "git@github.com:owner/repo.git",
    "ssh://git@github.com/owner/repo.git", "--upload-pack=evil",
])
def test_normalise_repo_url_rejects_bad(bad):
    with pytest.raises(repo_import.RepoImportError):
        repo_import.normalise_repo_url(bad)


def test_validate_branch():
    assert repo_import.validate_branch(" main ") == "main"
    assert repo_import.validate_branch(None) is None
    assert repo_import.validate_branch("") is None
    for bad in ["--option", "a branch", "weird;rm", "..", "a\\b"]:
        with pytest.raises(repo_import.RepoImportError):
            repo_import.validate_branch(bad)


def test_from_repo_imports_sources_and_starts_analysis(client, auth, monkeypatch):
    def fake_clone(project_id, url, branch=None):
        return storage.StoreResult(stored=storage.save_upload(project_id, "src/HELLO.cbl", COBOL.encode()))

    monkeypatch.setattr(repo_import, "clone_repo", fake_clone)
    r = client.post("/api/projects/from-repo", headers=auth,
                    json={"name": "", "url": "https://github.com/owner/repo.git"})
    # name is blank -> validation error from the schema path? name has min_length=1, so expect 422.
    assert r.status_code == 422, r.text

    r = client.post("/api/projects/from-repo", headers=auth,
                    json={"name": "Imported", "url": "https://github.com/owner/repo.git"})
    assert r.status_code == 201, r.text
    assert r.json()["imported_files"] == 1
    pid = r.json()["id"]
    project = client.get(f"/api/projects/{pid}", headers=auth).json()
    assert project["status"] == "ready", project
    files = client.get(f"/api/projects/{pid}/files", headers=auth).json()
    assert any(f["path"] == "src/HELLO.cbl" for f in files)


def test_from_repo_bad_url_creates_no_project(client, auth):
    before = len(client.get("/api/projects", headers=auth).json())
    r = client.post("/api/projects/from-repo", headers=auth,
                    json={"name": "Nope", "url": "git@github.com:owner/repo.git"})
    assert r.status_code == 400, r.text
    after = len(client.get("/api/projects", headers=auth).json())
    assert after == before


def test_from_repo_without_sources_rolls_back(client, auth, monkeypatch):
    monkeypatch.setattr(repo_import, "clone_repo", lambda pid, url, branch=None: storage.StoreResult(skipped=3))
    before = len(client.get("/api/projects", headers=auth).json())
    r = client.post("/api/projects/from-repo", headers=auth,
                    json={"name": "Empty", "url": "https://github.com/owner/repo.git"})
    assert r.status_code == 400, r.text
    assert "No analysable source files" in r.json()["detail"]
    after = len(client.get("/api/projects", headers=auth).json())
    assert after == before


def test_repo_branches_endpoint(client, auth, monkeypatch):
    monkeypatch.setattr(repo_import, "list_remote_branches",
                        lambda url: {"default": "develop", "branches": ["develop", "main"]})
    r = client.post("/api/projects/repo-branches", headers=auth,
                    json={"url": "https://github.com/owner/repo.git"})
    assert r.status_code == 200, r.text
    assert r.json() == {"default": "develop", "branches": ["develop", "main"]}


def test_repo_branches_bad_url(client, auth):
    r = client.post("/api/projects/repo-branches", headers=auth, json={"url": "git@github.com:o/r.git"})
    assert r.status_code == 400, r.text


def test_from_repo_disabled(client, auth, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "allow_repo_import", False)
    r = client.post("/api/projects/from-repo", headers=auth,
                    json={"name": "X", "url": "https://github.com/owner/repo.git"})
    assert r.status_code == 403, r.text
