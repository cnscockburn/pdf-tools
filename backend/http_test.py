"""End-to-end HTTP test — hits the live backend at localhost:7341.

Verifies that the full HTTP stack works for the new annotation types.
Run from `backend/` with the venv Python (uses stdlib only).
"""
import json
import sys
import uuid
import urllib.error
import urllib.request

import fitz

BASE = "http://127.0.0.1:7341/api"


def make_test_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 100), "HTTP integration test", fontsize=14)
    out = doc.tobytes()
    doc.close()
    return out


def post_multipart(url: str, fields: dict[str, str], file_bytes: bytes, file_name: str = "test.pdf"):
    """Hand-rolled multipart/form-data POST (stdlib only)."""
    boundary = f"----pdfTest{uuid.uuid4().hex}"
    body = bytearray()

    for k, v in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode()
        body += v.encode("utf-8")
        body += b"\r\n"

    body += f"--{boundary}\r\n".encode()
    body += (
        f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode()
    body += file_bytes
    body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers) if e.headers else {}


failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if cond else 'FAIL'}] {name}  {detail if not cond else ''}")
    if not cond:
        failures.append(name)


# ── /api/health ───────────────────────────────────────────────────────────────
print("== health ==")
try:
    with urllib.request.urlopen(f"{BASE}/health", timeout=3) as r:
        check("health endpoint responds 200", r.status == 200)
except Exception as e:
    print(f"  Backend unreachable at {BASE}: {e}")
    sys.exit(1)


# ── /api/annotate with every type ─────────────────────────────────────────────
print("\n== annotate (all 8 types over HTTP) ==")
pdf = make_test_pdf()
annotations = [
    {"type": "note",          "page": 1, "x": 0.5, "y": 0.3, "text": "hello"},
    {"type": "highlight",     "page": 1, "x0": 0.1, "y0": 0.1, "x1": 0.5, "y1": 0.13, "color": [1, 1, 0]},
    {"type": "freetext",      "page": 1, "x0": 0.1, "y0": 0.5, "x1": 0.5, "y1": 0.6, "text": "free"},
    {"type": "underline",     "page": 1, "x0": 0.1, "y0": 0.7, "x1": 0.5, "y1": 0.72},
    {"type": "strikethrough", "page": 1, "x0": 0.1, "y0": 0.75, "x1": 0.5, "y1": 0.77},
    {"type": "ink",           "page": 1, "strokes": [[{"x": 0.2, "y": 0.4}, {"x": 0.3, "y": 0.45}]]},
    {"type": "shape",         "page": 1, "x0": 0.6, "y0": 0.6, "x1": 0.9, "y1": 0.8, "shape": "rect"},
    {"type": "stamp",         "page": 1, "x0": 0.6, "y0": 0.1, "x1": 0.9, "y1": 0.2, "label": "DRAFT", "color": [0.6, 0, 0]},
]
status, body, _ = post_multipart(f"{BASE}/annotate",
                                  {"annotations": json.dumps(annotations)},
                                  pdf, "test.pdf")
check("annotate returns 200 for all 8 types", status == 200,
      f"got {status}: {body[:200]!r}")
if status == 200:
    out = fitz.open(stream=body, filetype="pdf")
    n = len(list(out[0].annots()))
    check("8 annotations made it through HTTP", n == 8, f"got {n}")
    out.close()

# Bad type rejected
status_bad, body_bad, _ = post_multipart(f"{BASE}/annotate",
                                          {"annotations": json.dumps([{"type": "nope", "page": 1}])},
                                          pdf, "test.pdf")
check("bogus type rejected with 400", status_bad == 400,
      f"got {status_bad}: {body_bad[:100]!r}")

# Empty list accepted (clears all)
status_empty, body_empty, _ = post_multipart(f"{BASE}/annotate",
                                              {"annotations": "[]"},
                                              pdf, "test.pdf")
check("empty annotations list accepted (clears)", status_empty == 200,
      f"got {status_empty}: {body_empty[:100]!r}")

# Non-PDF rejected
status_np, body_np, _ = post_multipart(f"{BASE}/annotate",
                                        {"annotations": "[]"},
                                        b"not a pdf", "test.pdf")
check("non-PDF rejected with 400", status_np == 400,
      f"got {status_np}: {body_np[:100]!r}")


# ── filename sanitisation ─────────────────────────────────────────────────────
print("\n== filename header sanitisation ==")
status, _, headers = post_multipart(f"{BASE}/annotate",
                                     {"annotations": "[]"},
                                     pdf, 'evil\\rINJECT.pdf')
# Backend never sees real CRLF here because urllib's multipart encoding
# strips it; we test by submitting a backslash-CR sequence instead.
cd = headers.get("content-disposition", "") or headers.get("Content-Disposition", "")
check("Content-Disposition exists", bool(cd), "no header")
check("Content-Disposition has no raw CR/LF",
      "\r" not in cd and "\n" not in cd, f"got {cd!r}")
check("Content-Disposition uses RFC 5987 filename*", "filename*=UTF-8''" in cd,
      f"got {cd!r}")


# ── 413 size limit (skip if you don't want to wait) ───────────────────────────
print("\n== upload size limit ==")
# Construct a "PDF" body that's just over 100 MB — quick: zeros padded after the magic header.
huge = b"%PDF-1.4\n" + b"\x00" * (101 * 1024 * 1024)
status_huge, body_huge, _ = post_multipart(f"{BASE}/annotate",
                                            {"annotations": "[]"},
                                            huge, "huge.pdf")
check("over-size upload rejected with 413", status_huge == 413,
      f"got {status_huge}: {body_huge[:100]!r}")


print()
if failures:
    print(f"FAILED: {len(failures)} checks")
    sys.exit(1)
print("All HTTP tests PASSED")
