import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/split")
async def split_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    ranges: str = Form(...),  # JSON: [[1,3],[4,6]]
):
    data, _filename = payload

    try:
        raw = json.loads(ranges)
        if not isinstance(raw, list):
            raise ValueError
        parsed: list[tuple[int, int]] = [(int(r[0]), int(r[1])) for r in raw]
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=400, detail="ranges must be JSON array of [start, end] pairs.")

    if not parsed:
        raise HTTPException(status_code=400, detail="Provide at least one range.")

    result = run_engine(pdf_engine.split, data, parsed)
    is_zip = pdf_engine.split_returns_zip(parsed)

    if is_zip:
        return Response(
            content=result,
            media_type="application/zip",
            headers=content_disposition("split.zip", default="split.zip"),
        )
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition("split.pdf"),
    )
