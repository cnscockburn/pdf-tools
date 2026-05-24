"""Shared FastAPI dependencies + helpers for all routers.

Centralises:
  * file-size enforcement (DoS guard)
  * PDF magic-byte validation
  * safe Content-Disposition header construction
  * uniform engine-error → HTTPException translation
"""
from __future__ import annotations

import re
from typing import Annotated
from urllib.parse import quote

from fastapi import File, HTTPException, UploadFile

# Upload size cap — refuse files larger than this to prevent OOM/DoS.
# 100 MB is generous for typical PDFs and small enough to fit in memory comfortably.
MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB

# Limit for multi-file routes (merge, images-to-pdf).
MAX_TOTAL_UPLOAD_BYTES = 300 * 1024 * 1024  # 300 MB


# --------------------------------------------------------------------------- #
# Single PDF upload
# --------------------------------------------------------------------------- #

async def read_pdf_upload(file: Annotated[UploadFile, File(...)]) -> tuple[bytes, str]:
    """Read an uploaded file, enforce size cap, validate it is a PDF.

    Returns (raw_bytes, original_filename). Raises HTTPException on bad input.
    """
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

def run_engine(fn, *args, **kwargs) -> bytes:
    """Invoke an engine function, mapping exceptions to clean HTTP errors.

    PyMuPDF and pikepdf both throw a variety of exceptions for corrupt or
    unsupported PDFs. We want to expose those as 4xx (user input is bad) and
    leak nothing about internals.
    """
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except ValueError as e:
        # Engine ValueErrors are user-input failures (e.g. wrong password).
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected — log to stderr for debugging but return a clean 422.
        import sys, traceback
        print(f"[engine error] {fn.__name__}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(
            status_code=422,
            detail=f"PDF processing failed: {type(e).__name__}",
        )
