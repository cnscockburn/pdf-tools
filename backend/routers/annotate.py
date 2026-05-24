import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()

VALID_TYPES = {
    "note", "highlight", "freetext",
    "underline", "strikethrough",
    "ink", "shape", "stamp",
}

VALID_SHAPES = {"rect", "ellipse", "line", "arrow"}


def _validate_annotation(ann: dict) -> None:
    """Quick structural validation per annotation type. Raises ValueError."""
    if not isinstance(ann, dict):
        raise ValueError("annotation must be an object")
    t = ann.get("type")
    if t not in VALID_TYPES:
        raise ValueError(f"Unknown annotation type: {t}")
    page = ann.get("page")
    if not isinstance(page, int) or page < 1:
        raise ValueError(f"annotation page must be a positive integer (got {page})")
    if t == "shape" and ann.get("shape") not in VALID_SHAPES:
        raise ValueError(f"shape must be one of {sorted(VALID_SHAPES)}")
    if t == "ink":
        strokes = ann.get("strokes")
        if not isinstance(strokes, list):
            raise ValueError("ink annotation requires a 'strokes' array")
    if t == "stamp" and not isinstance(ann.get("label"), str):
        raise ValueError("stamp annotation requires a 'label' string")


@router.post("/annotate")
async def annotate_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    annotations: str = Form(...),
):
    data, filename = payload

    try:
        ann_list = json.loads(annotations)
        if not isinstance(ann_list, list):
            raise ValueError("annotations must be a JSON array")
        for a in ann_list:
            _validate_annotation(a)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="annotations must be valid JSON.")

    # Empty list is now valid — frontend uses replace-semantics: an empty list
    # means "clear all annotations". Forcing a non-empty list breaks that flow.
    result = run_engine(pdf_engine.annotate, data, ann_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"annotated_{filename}"),
    )
