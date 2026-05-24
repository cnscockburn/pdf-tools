from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/to-images")
async def pdf_to_images(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    dpi: int = Form(150),
    fmt: str = Form("png"),  # png | jpg
):
    data, filename = payload
    if fmt not in ("png", "jpg"):
        raise HTTPException(status_code=400, detail="fmt must be 'png' or 'jpg'.")
    if not (36 <= dpi <= 600):
        raise HTTPException(status_code=400, detail="dpi must be between 36 and 600.")

    result = run_engine(pdf_engine.pdf_to_images, data, dpi=dpi, fmt=fmt)
    # Strip .pdf extension case-insensitively
    stem = filename
    for ext in (".pdf", ".PDF"):
        if stem.endswith(ext):
            stem = stem[: -len(ext)]
            break
    if not stem:
        stem = "pages"
    return Response(
        content=result,
        media_type="application/zip",
        headers=content_disposition(f"{stem}_images.zip", default="images.zip"),
    )
