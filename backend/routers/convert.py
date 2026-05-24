from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()

ALLOWED_IMAGE_TYPES = {
    "image/jpeg", "image/jpg", "image/png",
    "image/tiff", "image/tif", "image/bmp",
    "image/gif", "image/webp",
}


@router.post("/images-to-pdf")
async def images_to_pdf(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Provide at least one image.")

    image_data: list[tuple[bytes, str]] = []
    for f in files:
        ct = (f.content_type or "image/jpeg").lower()
        if ct not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"{f.filename}: unsupported type '{ct}'. Use JPEG, PNG, TIFF, BMP, GIF, or WebP.",
            )
        data = await f.read()
        image_data.append((data, ct))

    result = pdf_engine.images_to_pdf(image_data)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=images.pdf"},
    )
