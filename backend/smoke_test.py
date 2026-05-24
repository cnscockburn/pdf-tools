"""Smoke test — exercises every pdf_engine code path without HTTP.

Run from `backend/` with the venv Python:
    .venv/Scripts/python.exe smoke_test.py
"""
import sys
sys.path.insert(0, ".")

import fitz
from services import pdf_engine

failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  [OK]   {name}")
    else:
        print(f"  [FAIL] {name}  {detail}")
        failures.append(name)


# ── Create a 3-page test PDF ─────────────────────────────────────────────────
doc = fitz.open()
for i in range(3):
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 100 + i * 30), f"Page {i + 1} body text", fontsize=14)
pdf_bytes = doc.tobytes()
doc.close()
print(f"Created test PDF: {len(pdf_bytes)} bytes, 3 pages\n")


# ── ANNOTATE: every supported type ───────────────────────────────────────────
print("== annotate ==")
annotations = [
    # Tier 0
    {"type": "note",          "page": 1, "x": 0.5,  "y": 0.3,  "text": "Test note"},
    {"type": "highlight",     "page": 1, "x0": 0.05, "y0": 0.10, "x1": 0.9, "y1": 0.14,
     "color": [1, 1, 0]},
    {"type": "freetext",      "page": 1, "x0": 0.05, "y0": 0.50, "x1": 0.9, "y1": 0.65,
     "text": "Hello freetext"},
    # Tier 1
    {"type": "underline",     "page": 2, "x0": 0.05, "y0": 0.20, "x1": 0.95, "y1": 0.24,
     "rects": [{"x0": 0.05, "y0": 0.20, "x1": 0.5, "y1": 0.22},
               {"x0": 0.05, "y0": 0.22, "x1": 0.7, "y1": 0.24}]},
    {"type": "strikethrough", "page": 2, "x0": 0.05, "y0": 0.30, "x1": 0.95, "y1": 0.34,
     "color": [0.9, 0.1, 0.1]},
    # Tier 2
    {"type": "ink",           "page": 2,
     "strokes": [[{"x": 0.1, "y": 0.5}, {"x": 0.3, "y": 0.55}, {"x": 0.5, "y": 0.5}]],
     "color": [0, 0, 0.8], "strokeWidth": 3},
    {"type": "shape",         "page": 3, "x0": 0.1, "y0": 0.1, "x1": 0.4, "y1": 0.3,
     "shape": "rect", "color": [0.2, 0.6, 0.2]},
    {"type": "shape",         "page": 3, "x0": 0.5, "y0": 0.1, "x1": 0.9, "y1": 0.3,
     "shape": "ellipse", "color": [0.6, 0.2, 0.2]},
    {"type": "shape",         "page": 3, "x0": 0.1, "y0": 0.4, "x1": 0.9, "y1": 0.4,
     "shape": "line", "color": [0.1, 0.1, 0.6]},
    {"type": "shape",         "page": 3, "x0": 0.1, "y0": 0.5, "x1": 0.9, "y1": 0.5,
     "shape": "arrow", "color": [0.1, 0.1, 0.6]},
    {"type": "stamp",         "page": 3, "x0": 0.3, "y0": 0.7, "x1": 0.7, "y1": 0.78,
     "label": "APPROVED", "color": [0.6, 0, 0]},
]
result_bytes = pdf_engine.annotate(pdf_bytes, annotations)
result_doc = fitz.open(stream=result_bytes, filetype="pdf")
total_annots = sum(len(list(p.annots())) for p in result_doc)
check("all 11 annotations were written",
      total_annots == len(annotations),
      f"expected {len(annotations)}, got {total_annots}")

# Confirm types per page
page1 = [a.type[1] for a in result_doc[0].annots()]
page2 = [a.type[1] for a in result_doc[1].annots()]
page3 = [a.type[1] for a in result_doc[2].annots()]
check("page 1 has note/highlight/freetext",
      all(t in page1 for t in ("Text", "Highlight", "FreeText")),
      f"got {page1}")
check("page 2 has underline/strikeout/ink",
      all(t in page2 for t in ("Underline", "StrikeOut", "Ink")),
      f"got {page2}")
check("page 3 has rect/ellipse/lines/stamp",
      page3.count("Line") == 2 and "Square" in page3 and "Circle" in page3 and "FreeText" in page3,
      f"got {page3}")
result_doc.close()

# Replace-semantics: second annotate call wipes the first
result_bytes2 = pdf_engine.annotate(result_bytes, [
    {"type": "note", "page": 1, "x": 0.5, "y": 0.5, "text": "second"},
])
result_doc2 = fitz.open(stream=result_bytes2, filetype="pdf")
total2 = sum(len(list(p.annots())) for p in result_doc2)
check("replace-semantics: clearing existing annotations works",
      total2 == 1, f"expected 1, got {total2}")
result_doc2.close()

# Empty annotation list clears everything
result_bytes3 = pdf_engine.annotate(result_bytes, [])
result_doc3 = fitz.open(stream=result_bytes3, filetype="pdf")
total3 = sum(len(list(p.annots())) for p in result_doc3)
check("empty annotations list clears all", total3 == 0, f"got {total3}")
result_doc3.close()


# ── REDACT ───────────────────────────────────────────────────────────────────
print("\n== redact ==")
regions = [{"page": 1, "x0": 0.0, "y0": 0.0, "x1": 0.5, "y1": 0.1}]
redact_bytes = pdf_engine.redact(pdf_bytes, regions)
redact_doc = fitz.open(stream=redact_bytes, filetype="pdf")
check("redact produces valid PDF", redact_doc.page_count == 3)
redact_doc.close()


# ── SPLIT ────────────────────────────────────────────────────────────────────
print("\n== split ==")
single = pdf_engine.split(pdf_bytes, [(1, 2)])
single_doc = fitz.open(stream=single, filetype="pdf")
check("split single range returns a PDF", single_doc.page_count == 2)
single_doc.close()


# ── ROTATE / DELETE / REORDER / EXTRACT ──────────────────────────────────────
print("\n== page ops ==")
rotated = pdf_engine.rotate(pdf_bytes, [1], 90)
check("rotate returns bytes", len(rotated) > 0)

deleted = pdf_engine.delete_pages(pdf_bytes, [2])
deleted_doc = fitz.open(stream=deleted, filetype="pdf")
check("delete_pages drops the page", deleted_doc.page_count == 2)
deleted_doc.close()

reordered = pdf_engine.reorder(pdf_bytes, [3, 1, 2])
reord_doc = fitz.open(stream=reordered, filetype="pdf")
check("reorder preserves total count", reord_doc.page_count == 3)
reord_doc.close()

extracted = pdf_engine.extract(pdf_bytes, [1, 3])
extract_doc = fitz.open(stream=extracted, filetype="pdf")
check("extract returns the right pages", extract_doc.page_count == 2)
extract_doc.close()


# ── COMPRESS / WATERMARK / CROP ──────────────────────────────────────────────
print("\n== compress / watermark / crop ==")
compressed = pdf_engine.compress(pdf_bytes, "ebook")
check("compress returns valid PDF", compressed.startswith(b"%PDF"))

watermarked = pdf_engine.watermark_text(pdf_bytes, "DRAFT")
check("watermark returns valid PDF", watermarked.startswith(b"%PDF"))

cropped = pdf_engine.crop(pdf_bytes, 0.1, 0.1, 0.9, 0.9)
check("crop returns valid PDF", cropped.startswith(b"%PDF"))


# ── PDF → IMAGES ─────────────────────────────────────────────────────────────
print("\n== pdf_to_images ==")
zip_bytes = pdf_engine.pdf_to_images(pdf_bytes, dpi=72, fmt="png")
# A ZIP file starts with PK\x03\x04
check("pdf_to_images returns a ZIP", zip_bytes.startswith(b"PK"))


# ── Final result ─────────────────────────────────────────────────────────────
print()
if failures:
    print(f"FAILED: {len(failures)} checks did not pass:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("All smoke tests PASSED")
