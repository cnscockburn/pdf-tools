"""Shared FastAPI dependencies + helpers for all routers.

Centralises:
  * file-size enforcement (DoS guard)
  * PDF magic-byte validation
  * safe Content-Disposition header construction
  * uniform engine-error → HTTPException translation
"""
from __future__ import annotations

import asyncio
import functools
import re
from typing import IO, Annotated, Iterator
from urllib.parse import quote

import anyio
from fastapi import File, HTTPException, UploadFile

# Upload size cap — refuse files larger than this to prevent OOM/DoS.
# 100 MB is generous for typical PDFs and small enough to fit in memory comfortably.
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

# Limit for multi-file routes (merge, images-to-pdf).
MAX_TOTAL_UPLOAD_BYTES = 300 * 1024 * 1024  # 300 MB

# Cap how many uploads are buffered into memory concurrently. Without this, many
# simultaneous requests could each allocate up to MAX_UPLOAD_BYTES at once and
# exhaust RAM (CWE-770). 4 in-flight reads ⇒ ≤ ~400 MB of upload buffers.
_UPLOAD_SLOTS = asyncio.Semaphore(4)


def stream_file(f: IO[bytes], chunk_size: int = 64 * 1024) -> Iterator[bytes]:
    """Yield a file-like object in chunks, then close it.

    Used to stream large archives (ZIPs from split / to-images) straight from a
    SpooledTemporaryFile to the HTTP response without holding the whole payload
    in memory a second time. The `finally` closes the temp file, which also
    deletes it if it had spilled to disk.
    """
    try:
        while True:
            block = f.read(chunk_size)
            if not block:
                break
            yield block
    finally:
        f.close()


# --------------------------------------------------------------------------- #
# Single PDF upload
# --------------------------------------------------------------------------- #

async def read_pdf_upload(file: Annotated[UploadFile, File(...)]) -> tuple[bytes, str]:
    """Read an uploaded file, enforce size cap, validate it is a PDF.

    Returns (raw_bytes, original_filename). Raises HTTPException on bad input.
    """
    async with _UPLOAD_SLOTS:
        data = await _read_capped(file, MAX_UPLOAD_BYTES)
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")
    return data, file.filename or "document.pdf"


async def _read_capped(file: UploadFile, cap: int) -> bytes:
    """Read up to `cap` bytes; reject if the file exceeds it."""
    # Streaming read so a malicious huge upload is rejected early.
    chunks: list[bytes] = []
    total = 0
    chunk_size = 1024 * 1024  # 1 MB
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > cap:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum {cap // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def read_multiple_uploads(files: list[UploadFile], per_file_cap: int = MAX_UPLOAD_BYTES,
                                total_cap: int = MAX_TOTAL_UPLOAD_BYTES) -> list[tuple[bytes, UploadFile]]:
    """Read multiple uploads with per-file and total caps."""
    out: list[tuple[bytes, UploadFile]] = []
    total = 0
    async with _UPLOAD_SLOTS:
        for f in files:
            data = await _read_capped(f, per_file_cap)
            total += len(data)
            if total > total_cap:
                raise HTTPException(
                    status_code=413,
                    detail=f"Combined upload too large. Maximum {total_cap // (1024 * 1024)} MB.",
                )
            out.append((data, f))
    return out


# --------------------------------------------------------------------------- #
# Safe Content-Disposition header
# --------------------------------------------------------------------------- #

_BAD_HEADER_CHARS = re.compile(r"[\r\n\x00-\x1f\x7f]")


def _safe_ascii_filename(name: str, default: str = "document.pdf") -> str:
    """Strip control characters and quotes for the ASCII `filename=` token."""
    # Replace control chars + quotes + backslashes that would break the header
    cleaned = _BAD_HEADER_CHARS.sub("", name).replace('"', "").replace("\\", "")
    # Best-effort ASCII fallback (drop non-ASCII).
    ascii_only = cleaned.encode("ascii", errors="ignore").decode("ascii").strip()
    return ascii_only or default


def content_disposition(filename: str, default: str = "document.pdf") -> dict[str, str]:
    """Build a safe Content-Disposition header.

    Uses RFC 5987 filename* for UTF-8 filenames (e.g. accented chars) and an
    ASCII-sanitised `filename=` fallback for older clients.
    """
    safe_name = _safe_ascii_filename(filename, default)
    encoded   = quote(filename or default, safe="")
    return {
        "Content-Disposition": (
            f'attachment; filename="{safe_name}"; '
            f"filename*=UTF-8''{encoded}"
        )
    }


# --------------------------------------------------------------------------- #
# Engine call wrapper
# --------------------------------------------------------------------------- #

# Bound the number of CPU-bound engine operations running at once. Each call
# can consume significant RAM/CPU (a 100 MB PDF, image recompression, page
# rendering), so a flood of concurrent requests could otherwise exhaust memory.
# This caps that, and also bounds the worker-thread pool used for offloading.
_ENGINE_LIMITER = anyio.CapacityLimiter(4)


async def run_engine(fn, *args, **kwargs):
    """Run a synchronous engine function in a worker thread, mapping exceptions
    to clean HTTP errors.

    PyMuPDF, pikepdf, and Pillow are synchronous and CPU-bound. Running them
    directly inside an ``async def`` handler would block the asyncio event loop,
    freezing health checks and every other in-flight request until the operation
    finished. Offloading to a thread (bounded by ``_ENGINE_LIMITER``) keeps the
    server responsive.

    Corrupt or unsupported PDFs throw a variety of exceptions; we expose those
    as 4xx (bad user input) and leak nothing about internals to the client.
    """
    call = functools.partial(fn, *args, **kwargs)
    try:
        return await anyio.to_thread.run_sync(call, limiter=_ENGINE_LIMITER)
    except HTTPException:
        raise
    except ValueError as e:
        # Engine ValueErrors are user-input failures (e.g. wrong password).
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected — log full detail to stderr for debugging, but return a
        # generic message so we don't leak the internal exception class name.
        import sys, traceback
        print(f"[engine error] {getattr(fn, '__name__', 'engine')}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=422, detail="PDF processing failed.")
