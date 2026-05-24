import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


@router.post("/split")
async def split_pdf(
    file: UploadFile = File(...),
    ranges: str = Form(...),  # JSON: [[1,3],[4,6]]
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    try:
        raw = json.loads(ranges)
        parsed: list[tuple[int, int]] = [(int(r[0]), int(r[1])) for r in raw]
    except Exception:
        raise HTTPException(status_code=400, detail="ranges must be JSON array of [start, end] pairs.")

    if not parsed:
        raise HTTPException(status_code=400, detail="Provide at least one range.")

    result = pdf_engine.split(data, parsed)
    is_zip = pdf_engine.split_returns_zip(parsed)

    if is_zip:
        return Response(
            content=result,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=split.zip"},
        )
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=split.pdf"},
    )
