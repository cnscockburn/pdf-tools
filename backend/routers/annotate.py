import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()

VALID_TYPES = {"note", "highlight", "freetext"}


@router.post("/annotate")
async def annotate_pdf(
    file: UploadFile = File(...),
    annotations: str = Form(...),  # JSON array of annotation objects
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    try:
        ann_list: list[dict] = json.loads(annotations)
        for a in ann_list:
            if a.get("type") not in VALID_TYPES:
                raise ValueError(f"Unknown annotation type: {a.get('type')}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="annotations must be a valid JSON array.")

    if not ann_list:
        raise HTTPException(status_code=400, detail="Provide at least one annotation.")

    result = pdf_engine.annotate(data, ann_list)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=annotated_{file.filename}"},
    )
