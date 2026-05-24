from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_multiple_uploads, run_engine

router = APIRouter()


@router.post("/merge")
async def merge_pdfs(files: list[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 PDF files.")

    pairs = await read_multiple_uploads(files)
    file_bytes: list[bytes] = []
    for data, f in pairs:
        if not data.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail=f"{f.filename or 'file'} is not a valid PDF.")
        file_bytes.append(data)

    result = run_engine(pdf_engine.merge, file_bytes)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition("merged.pdf"),
    )
