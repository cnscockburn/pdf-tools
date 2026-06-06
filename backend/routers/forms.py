import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import JSONResponse, Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()

MAX_FIELDS = 5_000
MAX_VALUE_LEN = 10_000


@router.post("/form-fields")
async def form_fields(payload: tuple[bytes, str] = Depends(read_pdf_upload)):
    """Return the fillable form fields in a PDF as JSON."""
    data, _ = payload
    fields = run_engine(pdf_engine.list_form_fields, data)
    return JSONResponse({"fields": fields})


@router.post("/fill-form")
async def fill_form(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    values: str = Form(...),  # JSON object: { fieldName: value }
):
    data, filename = payload
    try:
        parsed = json.loads(values)
        if not isinstance(parsed, dict):
            raise ValueError("values must be a JSON object")
        if len(parsed) > MAX_FIELDS:
            raise ValueError(f"too many fields (max {MAX_FIELDS})")
        for k, v in parsed.items():
            if not isinstance(k, str):
                raise ValueError("field names must be strings")
            if isinstance(v, str) and len(v) > MAX_VALUE_LEN:
                raise ValueError(f"value for {k!r} too long (max {MAX_VALUE_LEN})")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="values must be valid JSON.")

    result = run_engine(pdf_engine.fill_form, data, parsed)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"filled_{filename}"),
    )
