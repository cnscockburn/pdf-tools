import json
import math

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

# Hard caps on text content to prevent DoS via oversized string processing.
MAX_TEXT_LEN   = 10_000   # note/freetext/underline/strikethrough content
MAX_LABEL_LEN  = 200      # stamp labels (rendered in PDF, so keep short)
MAX_STROKES    = 500      # ink strokes per annotation
MAX_POINTS     = 2_000    # points per ink stroke
MAX_ANNOTS     = 2_000    # annotations per save operation


def _is_unit_float(v: object) -> bool:
    """Return True if v is a finite float in [0, 1]."""
    return isinstance(v, (int, float)) and not math.isnan(v) and not math.isinf(v) and 0.0 <= v <= 1.0


def _validate_annotation(ann: dict) -> None:
    """Structural + bounds validation per annotation type. Raises ValueError."""
    if not isinstance(ann, dict):
        raise ValueError("annotation must be an object")
    t = ann.get("type")
    if t not in VALID_TYPES:
        raise ValueError(f"Unknown annotation type: {t!r}")
    page = ann.get("page")
    if not isinstance(page, int) or page < 1 or page > 100_000:
        raise ValueError(f"annotation page must be a positive integer (got {page!r})")

    # Coordinate fields that must be unit floats (0–1 fractions of page size)
    coord_fields: list[str] = []
    if t in ("highlight", "freetext", "underline", "strikethrough", "shape", "stamp"):
        coord_fields = ["x0", "y0", "x1", "y1"]
    elif t == "note":
        for k in ("x", "y"):
            if not _is_unit_float(ann.get(k)):
                raise ValueError(f"note.{k} must be a float in [0, 1]")

    for k in coord_fields:
        if not _is_unit_float(ann.get(k)):
            raise ValueError(f"{t}.{k} must be a float in [0, 1]")

    # Type-specific checks
    if t == "shape" and ann.get("shape") not in VALID_SHAPES:
        raise ValueError(f"shape must be one of {sorted(VALID_SHAPES)}")

    if t == "ink":
        strokes = ann.get("strokes")
        if not isinstance(strokes, list):
            raise ValueError("ink annotation requires a 'strokes' array")
        if len(strokes) > MAX_STROKES:
            raise ValueError(f"ink annotation has too many strokes (max {MAX_STROKES})")
        for stroke in strokes:
            if not isinstance(stroke, list) or len(stroke) > MAX_POINTS:
                raise ValueError(f"each ink stroke may have at most {MAX_POINTS} points")
            for pt in stroke:
                if not (isinstance(pt, dict)
                        and _is_unit_float(pt.get("x"))
                        and _is_unit_float(pt.get("y"))):
                    raise ValueError("ink stroke points must be {x, y} objects with floats in [0, 1]")

    if t == "stamp":
        label = ann.get("label")
        if not isinstance(label, str):
            raise ValueError("stamp annotation requires a 'label' string")
        if len(label) > MAX_LABEL_LEN:
            raise ValueError(f"stamp label too long (max {MAX_LABEL_LEN} characters)")

    # Text content caps
    text = ann.get("text")
    if text is not None:
        if not isinstance(text, str):
            raise ValueError(f"{t}.text must be a string")
        if len(text) > MAX_TEXT_LEN:
            raise ValueError(f"{t}.text too long (max {MAX_TEXT_LEN} characters)")


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
        if len(ann_list) > MAX_ANNOTS:
            raise ValueError(f"Too many annotations (max {MAX_ANNOTS})")
        for a in ann_list:
            _validate_annotation(a)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="annotations must be valid JSON.")

    # Empty list is valid — frontend uses replace-semantics: an empty list
    # means "clear all annotations".
    result = run_engine(pdf_engine.annotate, data, ann_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"annotated_{filename}"),
    )
