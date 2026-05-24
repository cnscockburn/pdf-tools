from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pikepdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()

MIN_PASSWORD_LEN = 1     # PDF spec allows empty, but we require ≥ 1
MAX_PASSWORD_LEN = 127   # PDF 1.7 limit; PDF 2.0 allows longer but client UI caps it


@router.post("/encrypt")
async def encrypt_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    password: str = Form(...),
    owner_password: str = Form(""),
):
    data, filename = payload
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail="Password cannot be empty.")
    if len(password) > MAX_PASSWORD_LEN or len(owner_password) > MAX_PASSWORD_LEN:
        raise HTTPException(status_code=400, detail=f"Password too long (max {MAX_PASSWORD_LEN} chars).")

    result = run_engine(pikepdf_engine.encrypt, data, password, owner_password or password)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"encrypted_{filename}"),
    )


@router.post("/decrypt")
async def decrypt_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    password: str = Form(...),
):
    data, filename = payload
    result = run_engine(pikepdf_engine.decrypt, data, password)
    return Response(
        content=result,
        media_type="application/pdf",
        headers=content_disposition(f"decrypted_{filename}"),
    )
