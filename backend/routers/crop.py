import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/crop")
async def crop_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    x0: float = Form(...),
    y0: float = Form(...),
    x1: float = Form(...),
    y1: float = Form(...),
    pages: str = Form("all"),  # "all" or JSON array of 1-indexed page numbers
):
    data, filename = payload

    for val, name in ((x0, "x0"), (y0, "y0"), (x1, "x1"), (y1, "y1")):
        if not (0.0 <= val <= 1.0):
            raise HTTPException(status_code=400, detail=f"{name} must be between 0 and 1.")
    if x1 <= x0 or y1 <= y0:
        raise HTTPException(status_code=400, detail="Crop rectangle has zero or negative area.")

    page_list: list[int] | None = None
    if pages != "all":
        try:
            page_list = [int(p) for p in json.loads(pages)]
        except Exception:
            raise HTTPException(status_code=400, detail="pages must be 'all' or a JSON int array.")

    result = run_engine(pdf_engine.crop, data, x0=x0, y0=y0, x1=x1, y1=y1, pages=page_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"cropped_{filename}"),
    )
