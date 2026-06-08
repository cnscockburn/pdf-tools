"""
/api/toc — read and write the PDF table of contents (outline).

POST /api/toc/read   → JSON { entries: [{level, title, page}, …] }
POST /api/toc/update → updated PDF bytes with the new TOC embedded
"""
import json

from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import JSONResponse, Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()

# Hard cap: a PDF with 500 TOC entries is already extremely unusual.
MAX_TOC_ENTRIES = 500
MAX_TITLE_LEN   = 500


@router.post("/toc/read")
async def read_toc(payload: tuple[bytes, str] = Depends(read_pdf_upload)):
    """Return the PDF's outline/TOC as a flat [{level, title, page}] array."""
    data, _ = payload
    entries = await run_engine(pdf_engine.read_toc, data)
    return JSONResponse({"entries": entries})


@router.post("/toc/update")
async def update_toc(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    entries: str = Form(...),
):
    """Apply a new table of contents to the PDF and return the updated file."""
    data, filename = payload

    try:
        parsed = json.loads(entries)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="entries must be valid JSON.")

    try:
        if not isinstance(parsed, list):
            raise ValueError("entries must be a JSON array")
        if len(parsed) > MAX_TOC_ENTRIES:
            raise ValueError(f"too many TOC entries (max {MAX_TOC_ENTRIES})")
        for e in parsed:
            if not isinstance(e, dict):
                raise ValueError("each entry must be an object")
            if not isinstance(e.get("title"), str):
                raise ValueError("each entry must have a string 'title'")
            if len(e["title"]) > MAX_TITLE_LEN:
                raise ValueError(f"entry title too long (max {MAX_TITLE_LEN} chars)")
            pg = e.get("page")
            if not isinstance(pg, int) or pg < 1:
                raise ValueError("each entry must have a positive integer 'page'")
            lvl = e.get("level")
            if not isinstance(lvl, int) or not (1 <= lvl <= 6):
                raise ValueError("each entry level must be between 1 and 6")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await run_engine(pdf_engine.update_toc, data, parsed)
    stem = filename.removesuffix(".pdf").removesuffix(".PDF")
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"{stem}_toc.pdf"),
    )
