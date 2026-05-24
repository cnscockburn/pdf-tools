from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_multiple_uploads, run_engine

router = APIRouter()


# Magic-byte prefixes used to detect image format from content (not Content-Type).
# We never trust the client-declared MIME type.
IMAGE_MAGIC = (
    (b"\xff\xd8\xff",                            "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n",                       "image/png"),
    (b"GIF87a",                                  "image/gif"),
    (b"GIF89a",                                  "image/gif"),
    (b"BM",                                      "image/bmp"),
    (b"RIFF",                                    "image/webp"),   # WebP is "RIFF....WEBP"
    (b"II*\x00",                                 "image/tiff"),
    (b"MM\x00*",                                 "image/tiff"),
)


def _detect_image_type(data: bytes) -> str | None:
    """Return the detected MIME type or None if we don't recognise the file."""
    for magic, mime in IMAGE_MAGIC:
        if data.startswith(magic):
            # WebP has additional check: RIFF....WEBP
            if mime == "image/webp" and not (len(data) >= 12 and data[8:12] == b"WEBP"):
                continue
            return mime
    return None


@router.post("/images-to-pdf")
async def images_to_pdf(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Provide at least one image.")

    pairs = await read_multiple_uploads(files)
    image_data: list[tuple[bytes, str]] = []
    for data, f in pairs:
        mime = _detect_image_type(data)
        if mime is None:
            raise HTTPException(
                status_code=400,
                detail=f"{f.filename or 'file'}: unrecognised image format. "
                       "Supported: JPEG, PNG, GIF, BMP, WebP, TIFF.",
            )
        image_data.append((data, mime))

    result = run_engine(pdf_engine.images_to_pdf, image_data)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition("images.pdf"),
    )
