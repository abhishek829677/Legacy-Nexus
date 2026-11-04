"""Chunked, resumable uploads for Document Q&A.

Large documents are sent in fixed-size pieces instead of one request:

* every piece is streamed straight to disk in small buffers, so memory use stays flat whatever the file size;
* each request stays well under proxy and gateway body limits;
* a failed piece is retried on its own (writes are idempotent), and an interrupted upload can resume;
* the browser can show real progress.

Session layout (one folder per upload, owned by one user)::

    <storage>/docqa-uploads/<user_id>/<upload_id>/meta.json
                                                 /part-00000 … part-NNNNN
                                                 /document.bin            (after assembly)

Sessions older than ``STALE_AFTER`` are removed whenever the same user starts a new upload.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.services import doc_extract

CHUNK_SIZE = 4 * 1024 * 1024  # 4 MiB: large enough to be efficient, small enough for any proxy limit
BUFFER = 256 * 1024  # bytes written to disk per step while a piece streams in
STALE_AFTER = 24 * 3600  # seconds before an unfinished upload is discarded
_ID = re.compile(r"^[a-f0-9]{32}$")


class UploadError(ValueError):
    """A request the client can fix (bad piece, missing pieces, unknown upload)."""


class UploadNotFound(UploadError):
    pass


class UploadTooLarge(UploadError):
    pass


@dataclass
class Session:
    upload_id: str
    filename: str
    size: int
    chunk_size: int
    total_chunks: int
    folder: Path

    def public(self) -> dict:
        return {"upload_id": self.upload_id, "filename": self.filename, "size": self.size,
                "chunk_size": self.chunk_size, "total_chunks": self.total_chunks, "received": received(self)}


def _root(user_id: int) -> Path:
    return get_settings().storage_dir / "docqa-uploads" / str(user_id)


def _cleanup_stale(user_id: int) -> None:
    root = _root(user_id)
    if not root.is_dir():
        return
    cutoff = time.time() - STALE_AFTER
    for folder in root.iterdir():
        try:
            if folder.is_dir() and folder.stat().st_mtime < cutoff:
                shutil.rmtree(folder, ignore_errors=True)
        except OSError:
            pass


def start(user_id: int, filename: str, size: int) -> Session:
    """Open an upload session after checking the file type and the size limit up front."""
    name = (filename or "").strip()[:512]
    if not name or doc_extract.format_for(name) is None:
        raise UploadError("Unsupported file type. Upload a PDF, Word (.docx), text (.txt) or Markdown (.md) file.")
    if size <= 0:
        raise UploadError("The file is empty.")
    s = get_settings()
    limit = s.mb_limit(s.docqa_max_file_mb)
    if limit is not None and size > limit:
        raise UploadTooLarge(f"The document is larger than the {s.docqa_max_file_mb} MB limit.")
    _cleanup_stale(user_id)
    upload_id = secrets.token_hex(16)
    folder = _root(user_id) / upload_id
    folder.mkdir(parents=True, exist_ok=False)
    total = (size + CHUNK_SIZE - 1) // CHUNK_SIZE
    (folder / "meta.json").write_text(json.dumps(
        {"filename": name, "size": size, "chunk_size": CHUNK_SIZE, "total_chunks": total, "created": time.time()}))
    return Session(upload_id, name, size, CHUNK_SIZE, total, folder)


def get(user_id: int, upload_id: str) -> Session:
    if not _ID.match(upload_id or ""):
        raise UploadNotFound("Upload not found.")
    folder = _root(user_id) / upload_id
    meta_file = folder / "meta.json"
    if not meta_file.is_file():
        raise UploadNotFound("Upload not found. It may have expired; start the upload again.")
    m = json.loads(meta_file.read_text())
    return Session(upload_id, m["filename"], m["size"], m["chunk_size"], m["total_chunks"], folder)


def _part(session: Session, index: int) -> Path:
    return session.folder / f"part-{index:05d}"


def expected_length(session: Session, index: int) -> int:
    if index < 0 or index >= session.total_chunks:
        raise UploadError(f"Piece {index} is outside this upload (0 to {session.total_chunks - 1}).")
    if index < session.total_chunks - 1:
        return session.chunk_size
    return session.size - session.chunk_size * (session.total_chunks - 1)


async def write_chunk(session: Session, index: int, body: AsyncIterator[bytes]) -> int:
    """Stream one piece to disk. Re-sending a piece replaces it, so retries are safe."""
    want = expected_length(session, index)
    tmp = session.folder / f".part-{index:05d}.{secrets.token_hex(4)}.tmp"
    got = 0
    try:
        with open(tmp, "wb", buffering=BUFFER) as fh:
            async for data in body:
                got += len(data)
                if got > want:
                    raise UploadError(f"Piece {index} is larger than expected ({want} bytes).")
                fh.write(data)
        if got != want:
            raise UploadError(f"Piece {index} is incomplete: received {got} of {want} bytes. Send it again.")
        os.replace(tmp, _part(session, index))  # atomic: a half-written piece is never visible
    finally:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
    os.utime(session.folder)  # keep an active session from being treated as stale
    return got


def received(session: Session) -> list[int]:
    return sorted(int(p.name[5:]) for p in session.folder.glob("part-*") if p.name[5:].isdigit())


def assemble(session: Session) -> Path:
    """Join the pieces in order into one file and check its size. Returns the file path."""
    have = set(received(session))
    missing = [i for i in range(session.total_chunks) if i not in have]
    if missing:
        shown = ", ".join(str(i) for i in missing[:10]) + ("…" if len(missing) > 10 else "")
        raise UploadError(f"{len(missing)} piece(s) have not arrived yet: {shown}.")
    out = session.folder / "document.bin"
    with open(out, "wb") as dst:
        for i in range(session.total_chunks):
            with open(_part(session, i), "rb") as src:
                shutil.copyfileobj(src, dst, BUFFER)
    if out.stat().st_size != session.size:
        out.unlink(missing_ok=True)
        raise UploadError("The assembled file does not have the expected size. Upload it again.")
    for i in range(session.total_chunks):
        _part(session, i).unlink(missing_ok=True)
    return out


def discard(session: Session) -> None:
    shutil.rmtree(session.folder, ignore_errors=True)


def discard_folder(folder: Path) -> None:
    shutil.rmtree(folder, ignore_errors=True)


# ------------------------------------------------------------------ files waiting for background processing

def pending_dir(document_id: int) -> Path:
    """Where an assembled document waits until it has been read and indexed (keyed by document id)."""
    return get_settings().storage_dir / "docqa-pending" / str(document_id)


def park(session: Session, assembled: Path, document_id: int) -> Path:
    """Move the assembled file next to its document id, then drop the upload session."""
    folder = pending_dir(document_id)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "document.bin"
    os.replace(assembled, target)
    (folder / "filename").write_text(session.filename, encoding="utf-8")
    discard(session)
    return target


def parked_filename(document_id: int) -> str | None:
    f = pending_dir(document_id) / "filename"
    return f.read_text(encoding="utf-8") if f.is_file() else None


class WorkLock:
    """An operating-system lock on a file: held while a document is processed, released automatically if the
    process dies. Lets any worker tell "someone is processing this" from "the worker is gone"."""

    def __init__(self, folder: Path):
        self.path = folder / "worker.lock"
        self._fh = None

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fh = open(self.path, "a+b")
        try:
            if os.name == "nt":
                import msvcrt
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            fh.close()
            return False
        self._fh = fh
        return True

    def release(self) -> None:
        if self._fh is None:
            return
        try:
            if os.name == "nt":
                import msvcrt
                self._fh.seek(0)
                msvcrt.locking(self._fh.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        self._fh.close()
        self._fh = None

    def is_free(self) -> bool:
        """True when nobody holds the lock (checked by briefly taking it)."""
        if self.acquire():
            self.release()
            return True
        return False
