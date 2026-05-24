import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


@router.post("/redact")
async def redact_pdf(
    file: UploadFile = File(...),
    regions: str = Form(...),  # JSON: [{page,x0,y0,x1,y1}, ...]
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    try:
        region_list: list[dict] = json.loads(regions)
        for r in region_list:
            assert all(k in r for k in ("page", "x0", "y0", "x1", "y1"))
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="regions must be a JSON array of {page,x0,y0,x1,y1} objects.",
        )

    if not region_list:
        raise HTTPException(status_code=400, detail="Provide at least one redaction region.")

    result = pdf_engine.redact(data, region_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=redacted_{file.filename}"},
    )
