"""
/api/annotation-report — generate a formatted PDF review report.

Accepts the source PDF and a JSON annotations array (same shape as /annotate).
Returns a stand-alone report PDF: cover summary + one entry per annotation with
a thumbnail crop of the annotated region.
"""
import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()

# Per-report limits: too many annotations would make the report very slow to
# generate and the output large. Cap generously.
MAX_REPORT_ANNOTS = 2_000


@router.post("/annotation-report")
async def annotation_report(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    annotations: str = Form(...),
):
    data, filename = payload

    try:
        ann_list = json.loads(annotations)
        if not isinstance(ann_list, list):
            raise ValueError("annotations must be a JSON array")
        if len(ann_list) > MAX_REPORT_ANNOTS:
            raise ValueError(f"Too many annotations for report (max {MAX_REPORT_ANNOTS})")
        # Minimal shape-check — we only need type/page/coords/text/author
        for a in ann_list:
            if not isinstance(a, dict):
                raise ValueError("each annotation must be an object")
            if not isinstance(a.get("page"), int):
                raise ValueError("each annotation must have an integer 'page'")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="annotations must be valid JSON.")

    result = await run_engine(pdf_engine.annotation_report, data, ann_list)
    stem = filename.removesuffix(".pdf").removesuffix(".PDF")
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"{stem}_review_report.pdf"),
    )
