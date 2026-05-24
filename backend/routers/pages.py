import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


def _read_page_list(raw: str, name: str = "pages") -> list[int]:
    try:
        pages = json.loads(raw)
        return [int(p) for p in pages]
    except Exception:
        raise HTTPException(status_code=400, detail=f"{name} must be a JSON array of integers.")


@router.post("/rotate")
async def rotate_pages(
    file: UploadFile = File(...),
    pages: str = Form(...),   # JSON: [1, 3, 5]
    angle: int = Form(...),   # 90 | 180 | 270
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")
    if angle not in (90, 180, 270):
        raise HTTPException(status_code=400, detail="angle must be 90, 180, or 270.")

    page_list = _read_page_list(pages)
    result = pdf_engine.rotate(data, page_list, angle)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=rotated_{file.filename}"},
    )


@router.post("/delete-pages")
async def delete_pages(
    file: UploadFile = File(...),
    pages: str = Form(...),  # JSON: [2, 4, 7]
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    page_list = _read_page_list(pages)
    if not page_list:
        raise HTTPException(status_code=400, detail="Provide at least one page to delete.")

    result = pdf_engine.delete_pages(data, page_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=deleted_{file.filename}"},
    )


@router.post("/reorder")
async def reorder_pages(
    file: UploadFile = File(...),
    order: str = Form(...),  # JSON: [3, 1, 2] (1-indexed new order)
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    order_list = _read_page_list(order, "order")
    result = pdf_engine.reorder(data, order_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=reordered_{file.filename}"},
    )


@router.post("/extract")
async def extract_pages(
    file: UploadFile = File(...),
    pages: str = Form(...),  # JSON: [1, 3, 5]
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    page_list = _read_page_list(pages)
    if not page_list:
        raise HTTPException(status_code=400, detail="Provide at least one page to extract.")

    result = pdf_engine.extract(data, page_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=extracted_{file.filename}"},
    )
