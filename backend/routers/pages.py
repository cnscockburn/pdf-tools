import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


def _read_page_list(raw: str, name: str = "pages") -> list[int]:
    try:
        pages = json.loads(raw)
        if not isinstance(pages, list):
            raise ValueError
        return [int(p) for p in pages]
    except (ValueError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail=f"{name} must be a JSON array of integers.")


@router.post("/rotate")
async def rotate_pages(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    pages: str = Form(...),
    angle: int = Form(...),
):
    data, filename = payload
    if angle not in (90, 180, 270):
        raise HTTPException(status_code=400, detail="angle must be 90, 180, or 270.")

    page_list = _read_page_list(pages)
    result = run_engine(pdf_engine.rotate, data, page_list, angle)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"rotated_{filename}"),
    )


@router.post("/delete-pages")
async def delete_pages(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    pages: str = Form(...),
):
    data, filename = payload
    page_list = _read_page_list(pages)
    if not page_list:
        raise HTTPException(status_code=400, detail="Provide at least one page to delete.")

    result = run_engine(pdf_engine.delete_pages, data, page_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"deleted_{filename}"),
    )


@router.post("/reorder")
async def reorder_pages(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    order: str = Form(...),
):
    data, filename = payload
    order_list = _read_page_list(order, "order")
    if not order_list:
        raise HTTPException(status_code=400, detail="Provide at least one page in the order.")
    result = run_engine(pdf_engine.reorder, data, order_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"reordered_{filename}"),
    )


@router.post("/extract")
async def extract_pages(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    pages: str = Form(...),
):
    data, filename = payload
    page_list = _read_page_list(pages)
    if not page_list:
        raise HTTPException(status_code=400, detail="Provide at least one page to extract.")

    result = run_engine(pdf_engine.extract, data, page_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"extracted_{filename}"),
    )
