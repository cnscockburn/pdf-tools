from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/compress")
async def compress_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    quality: str = Form("ebook"),  # screen | ebook | printer
):
    if quality not in ("screen", "ebook", "printer"):
        raise HTTPException(status_code=400, detail="quality must be screen, ebook, or printer.")
    data, filename = payload
    result = run_engine(pdf_engine.compress, data, quality)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"compressed_{filename}"),
    )
