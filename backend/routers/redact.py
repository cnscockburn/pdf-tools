import json
import math

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()

MAX_REGIONS = 2_000


def _is_unit_float(v: object) -> bool:
    """Return True if v is a finite float in [0, 1]."""
    return isinstance(v, (int, float)) and not math.isnan(v) and not math.isinf(v) and 0.0 <= float(v) <= 1.0


@router.post("/redact")
async def redact_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    regions: str = Form(...),  # JSON: [{page,x0,y0,x1,y1}, ...]
):
    data, filename = payload

    try:
        region_list: list[dict] = json.loads(regions)
        if not isinstance(region_list, list):
            raise ValueError("regions must be a JSON array")
        if len(region_list) > MAX_REGIONS:
            raise ValueError(f"Too many redaction regions (max {MAX_REGIONS})")
        for r in region_list:
            if not isinstance(r, dict):
                raise ValueError("each region must be an object")
            page = r.get("page")
            if not isinstance(page, int) or page < 1 or page > 100_000:
                raise ValueError(f"region.page must be a positive integer (got {page!r})")
            for k in ("x0", "y0", "x1", "y1"):
                if not _is_unit_float(r.get(k)):
                    raise ValueError(
                        f"region.{k} must be a finite number in [0, 1] (got {r.get(k)!r})"
                    )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="regions must be valid JSON: array of {page,x0,y0,x1,y1} objects.",
        )

    if not region_list:
        raise HTTPException(status_code=400, detail="Provide at least one redaction region.")

    result = run_engine(pdf_engine.redact, data, region_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"redacted_{filename}"),
    )
