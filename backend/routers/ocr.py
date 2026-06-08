"""
/api/ocr — make a scanned PDF searchable using Tesseract OCR.

POST /api/ocr → searchable PDF bytes

Requires Tesseract >= 4 to be installed and available on the system PATH.
Returns HTTP 503 with install instructions when Tesseract is absent so the
frontend can show a user-friendly message instead of a generic 422.
"""
import shutil

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/ocr")
async def ocr_pdf(payload: tuple[bytes, str] = Depends(read_pdf_upload)):
    """Run Tesseract OCR on every image-only page; return a searchable PDF."""
    # Check for Tesseract before doing any work — fail fast with a useful message.
    if not shutil.which("tesseract"):
        raise HTTPException(
            status_code=503,
            detail=(
                "Tesseract OCR is not installed on this system. "
                "Install it from https://github.com/tesseract-ocr/tesseract "
                "and make sure 'tesseract' is on the system PATH, then restart Stria."
            ),
        )

    data, filename = payload
    result = await run_engine(pdf_engine.ocr_pdf, data)
    stem = filename.removesuffix(".pdf").removesuffix(".PDF")
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"{stem}_ocr.pdf"),
    )
