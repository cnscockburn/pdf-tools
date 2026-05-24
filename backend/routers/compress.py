from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


@router.post("/compress")
async def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Form("ebook"),  # screen | ebook | printer
):
    if quality not in ("screen", "ebook", "printer"):
        raise HTTPException(status_code=400, detail="quality must be screen, ebook, or printer.")
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")
    result = pdf_engine.compress(data, quality)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=compressed_{file.filename}"},
    )
