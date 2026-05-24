"""Quick smoke test — calls the service functions directly (no HTTP)."""
import sys, json
sys.path.insert(0, ".")

import fitz
from services import pdf_engine

# ── Create a simple 1-page test PDF ──────────────────────────────────────────
doc = fitz.open()
page = doc.new_page(width=595, height=842)
page.insert_text((50, 100), "PDF annotation smoke test", fontsize=14)
pdf_bytes = doc.tobytes()
doc.close()
print(f"Created test PDF: {len(pdf_bytes)} bytes")

# ── Annotate ──────────────────────────────────────────────────────────────────
annotations = [
    {"type": "note",      "page": 1, "x": 0.5,  "y": 0.3,  "text": "Test note"},
    {"type": "highlight", "page": 1, "x0": 0.05, "y0": 0.1, "x1": 0.9, "y1": 0.14, "color": [1, 1, 0]},
    {"type": "freetext",  "page": 1, "x0": 0.05, "y0": 0.5, "x1": 0.9, "y1": 0.65, "text": "Hello freetext"},
]
result_bytes = pdf_engine.annotate(pdf_bytes, annotations)
result_doc = fitz.open(stream=result_bytes, filetype="pdf")
rpage = result_doc[0]
annots = list(rpage.annots())
print(f"[annotate] annotations in output: {len(annots)}")
for a in annots:
    t = a.type[1]
    content = a.info.get("content", "")[:40] or a.info.get("subject", "")[:40]
    print(f"  type={t}  info={content!r}")
result_doc.close()

# ── Redact ────────────────────────────────────────────────────────────────────
regions = [
    {"page": 1, "x0": 0.0, "y0": 0.0, "x1": 0.5, "y1": 0.1},
]
redact_bytes = pdf_engine.redact(pdf_bytes, regions)
redact_doc = fitz.open(stream=redact_bytes, filetype="pdf")
print(f"[redact]   output_size={len(redact_bytes)} bytes  pages={redact_doc.page_count}")
redact_doc.close()

print("\nSmoke test PASSED")
