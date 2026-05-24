from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


@router.post("/to-images")
async def pdf_to_images(
    file: UploadFile = File(...),
    dpi: int = Form(150),
    fmt: str = Form("png"),  # png | jpg
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")
    if fmt not in ("png", "jpg"):
        raise HTTPException(status_code=400, detail="fmt must be 'png' or 'jpg'.")
    if not (36 <= dpi <= 600):
        raise HTTPException(status_code=400, detail="dpi must be between 36 and 600.")

    result = pdf_engine.pdf_to_images(data, dpi=dpi, fmt=fmt)
    stem = file.filename.removesuffix(".pdf") if file.filename else "pages"
    return Response(
        content=result,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={stem}_images.zip"},
    )
