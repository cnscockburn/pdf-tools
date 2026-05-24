import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/redact")
async def redact_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    regions: str = Form(...),  # JSON: [{page,x0,y0,x1,y1}, ...]
):
    data, filename = payload

    try:
        region_list: list[dict] = json.loads(regions)
        if not isinstance(region_list, list):
            raise ValueError
        for r in region_list:
            if not isinstance(r, dict):
                raise ValueError
            for k in ("page", "x0", "y0", "x1", "y1"):
                if k not in r:
                    raise ValueError
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(
            status_code=400,
            detail="regions must be a JSON array of {page,x0,y0,x1,y1} objects.",
        )

    if not region_list:
        raise HTTPException(status_code=400, detail="Provide at least one redaction region.")

    result = run_engine(pdf_engine.redact, data, region_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"redacted_{filename}"),
    )
