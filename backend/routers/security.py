from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pikepdf_engine

router = APIRouter()


@router.post("/encrypt")
async def encrypt_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
    owner_password: str = Form(""),
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")
    if not password:
        raise HTTPException(status_code=400, detail="Password cannot be empty.")

    result = pikepdf_engine.encrypt(data, password, owner_password or password)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=encrypted_{file.filename}"},
    )


@router.post("/decrypt")
async def decrypt_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")

    try:
        result = pikepdf_engine.decrypt(data, password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=decrypted_{file.filename}"},
    )
