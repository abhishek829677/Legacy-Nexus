"""Import project source code directly from a git repository URL.

A shallow clone is made into a temporary directory, the analysable source files are copied into the
project (reusing the same filtering as uploads and archive extraction), and the clone is discarded.
Only http(s) git URLs are accepted; credential prompts are disabled so a private URL fails fast
instead of hanging.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from app.config import get_settings
from app.services import storage


class RepoImportError(ValueError):
    """The repository could not be imported (bad URL, clone failed, limits exceeded)."""


# A conservative view of what counts as a public, promptless git URL.
_ALLOWED_SCHEMES = {"http", "https", "git"}


def normalise_repo_url(url: str) -> str:
    """Validate a user-supplied repository URL and return it trimmed, or raise RepoImportError."""
    cleaned = (url or "").strip()
    if not cleaned:
        raise RepoImportError("Enter a repository URL")
    if len(cleaned) > 2048:
        raise RepoImportError("Repository URL is too long")
    # Reject anything git could read as a command-line option, and scp-style host:path SSH syntax.
    if cleaned.startswith("-"):
        raise RepoImportError("Invalid repository URL")
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES or not parsed.netloc:
        raise RepoImportError(
            "Enter a public git URL over http(s), for example https://github.com/owner/repo.git")
    return cleaned


def validate_branch(branch: str | None) -> str | None:
    """Accept a plain branch/tag name; reject anything that could be an option or a ref-injection."""
    if not branch:
        return None
    name = branch.strip()
    if not name:
        return None
    if name.startswith("-") or ".." in name or not re.fullmatch(r"[\w.\-/]{1,255}", name):
        raise RepoImportError("Invalid branch or tag name")
    return name


def list_remote_branches(url: str) -> dict:
    """List a repository's branches without cloning it. Returns {"default": name|None, "branches": [...]}."""
    settings = get_settings()
    if not settings.allow_repo_import:
        raise RepoImportError("Importing from a repository URL is disabled on this server")
    repo_url = normalise_repo_url(url)
    if shutil.which("git") is None:
        raise RepoImportError("git is not available on the server, so repository import is unavailable")

    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never",
           "GIT_ASKPASS": "", "GIT_CONFIG_NOSYSTEM": "1"}
    cmd = ["git", "ls-remote", "--symref", "--heads", "--", repo_url, "HEAD", "refs/heads/*"]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, env=env,
                              timeout=min(60, settings.repo_clone_timeout_seconds))
    except subprocess.TimeoutExpired:
        raise RepoImportError("Listing the repository's branches timed out")
    except OSError as exc:
        raise RepoImportError(f"Could not start git: {exc}")
    if proc.returncode != 0:
        raise RepoImportError(_clone_message(proc.stderr, False))

    default: str | None = None
    branches: list[str] = []
    for line in proc.stdout.splitlines():
        # "ref: refs/heads/main\tHEAD" marks the default branch; "<sha>\trefs/heads/<name>" lists each head.
        if line.startswith("ref:"):
            ref = line[4:].strip().split("\t", 1)[0].strip()
            if ref.startswith("refs/heads/"):
                default = ref[len("refs/heads/"):]
            continue
        parts = line.split("\t", 1)
        if len(parts) == 2 and parts[1].startswith("refs/heads/"):
            branches.append(parts[1][len("refs/heads/"):])
    branches = sorted(set(branches))
    return {"default": default if default in branches else (default or (branches[0] if branches else None)),
            "branches": branches}


def clone_repo(project_id: int, url: str, branch: str | None = None) -> storage.StoreResult:
    """Shallow-clone `url` and copy its analysable source files into the project. Blocking; run in a threadpool."""
    settings = get_settings()
    if not settings.allow_repo_import:
        raise RepoImportError("Importing from a repository URL is disabled on this server")
    repo_url = normalise_repo_url(url)
    ref = validate_branch(branch)
    if shutil.which("git") is None:
        raise RepoImportError("git is not available on the server, so repository import is unavailable")

    tmp = Path(tempfile.mkdtemp(prefix=f"lnx-clone-{project_id}-"))
    clone_dir = tmp / "repo"
    try:
        cmd = ["git", "clone", "--depth", "1", "--single-branch", "--no-tags"]
        if ref:
            cmd += ["--branch", ref]
        cmd += ["--", repo_url, str(clone_dir)]
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never",
               "GIT_ASKPASS": "", "GIT_CONFIG_NOSYSTEM": "1"}
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, env=env,
                                  timeout=settings.repo_clone_timeout_seconds)
        except subprocess.TimeoutExpired:
            raise RepoImportError(
                f"Cloning the repository timed out after {settings.repo_clone_timeout_seconds}s")
        except OSError as exc:
            raise RepoImportError(f"Could not start git: {exc}")
        if proc.returncode != 0:
            raise RepoImportError(_clone_message(proc.stderr, bool(ref)))
        return _copy_sources(project_id, clone_dir)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _copy_sources(project_id: int, clone_dir: Path) -> storage.StoreResult:
    """Copy analysable files from a cloned tree into the project, honouring the per-project limits."""
    settings = get_settings()
    root = clone_dir.resolve()
    max_files = settings.max_files_per_project or None
    max_bytes = settings.mb_limit(settings.max_extracted_mb)

    result = storage.StoreResult()
    kept: list[tuple[Path, str, int]] = []
    total = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        rel = path.relative_to(root).as_posix()
        if rel.split("/", 1)[0] == ".git":
            continue
        size = path.stat().st_size
        if not storage.is_analysable(rel, size):
            result.skipped += 1
            result.skipped_bytes += size
            continue
        kept.append((path, rel, size))
        total += size

    if max_files is not None and len(kept) > max_files:
        raise RepoImportError(f"The repository has {len(kept)} source files; the limit is {max_files}")
    if max_bytes is not None and total > max_bytes:
        raise RepoImportError(
            f"The repository's source files expand beyond the {max_bytes // (1024 * 1024)} MB import limit")

    dest = storage.project_dir(project_id)
    for path, rel, _ in kept:
        target = dest / storage.safe_relative_path(rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        result.stored.append(rel)
    return result


def _clone_message(stderr: str, had_ref: bool) -> str:
    """Turn git's stderr into a short, user-facing reason."""
    text = (stderr or "").strip()
    low = text.lower()
    if "authentication" in low or "could not read" in low or "terminal prompts disabled" in low:
        return "The repository is private or the URL requires credentials. Only public repositories can be imported."
    if "not found" in low or "repository not found" in low:
        return "The repository was not found. Check the URL."
    if had_ref and ("remote branch" in low or "not found in upstream" in low):
        return "That branch or tag was not found in the repository."
    if "could not resolve host" in low or "unable to access" in low:
        return "Could not reach the repository host. Check the URL and the server's network access."
    last = text.splitlines()[-1] if text else "git clone failed"
    return f"Could not clone the repository: {last}"
