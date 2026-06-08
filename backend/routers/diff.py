"""PDF comparison / diff route (B6).

Accepts two PDFs and returns word-level diff regions with fractional page
coordinates (0–1), ready to be overlaid as coloured highlights in the frontend.
"""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from services import pdf_engine
from routers._deps import _read_capped, _UPLOAD_SLOTS, MAX_UPLOAD_BYTES

router = APIRouter()


@router.post("/diff")
async def diff_pdfs(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
):
    """Return word-level differences between two PDFs.

    Response shape::

        {
          "pages": [
            {
              "page": 1,
              "diffs_a": [{"type": "remove", "x0": 0.1, "y0": 0.2, "x1": 0.3, "y1": 0.25, "text": "old"}],
              "diffs_b": [{"type": "add",    "x0": 0.1, "y0": 0.2, "x1": 0.3, "y1": 0.25, "text": "new"}]
            },
            ...
          ]
        }

    ``diffs_a`` contains words present in *file1* but not *file2* (removed).
    ``diffs_b`` contains words present in *file2* but not *file1* (added).
    Both use fractional coordinates normalised to each page's own dimensions.
    """
    async with _UPLOAD_SLOTS:
        data1 = await _read_capped(file1, MAX_UPLOAD_BYTES)
        data2 = await _read_capped(file2, MAX_UPLOAD_BYTES)

    if not data1.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="file1 is not a valid PDF.")
    if not data2.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="file2 is not a valid PDF.")

    result = pdf_engine.compare_pdfs(data1, data2)
    return JSONResponse(result)
