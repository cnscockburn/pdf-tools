from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


@router.post("/merge")
async def merge_pdfs(files: list[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 PDF files.")

    file_bytes = []
    for f in files:
        data = await f.read()
        if not data.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail=f"{f.filename} is not a valid PDF.")
        file_bytes.append(data)

    result = pdf_engine.merge(file_bytes)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=merged.pdf"},
    )
