import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from services import pdf_engine

router = APIRouter()


@router.post("/watermark")
async def watermark_pdf(
    file: UploadFile = File(...),
    text: str = Form(...),
    opacity: float = Form(0.3),
    angle: float = Form(45.0),
    fontsize: float = Form(60.0),
    color: str = Form("0.5,0.5,0.5"),  # comma-separated R,G,B (0–1)
):
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Not a valid PDF.")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Watermark text cannot be empty.")

    try:
        r, g, b = (float(v) for v in color.split(","))
        color_tuple: tuple[float, float, float] = (r, g, b)
    except Exception:
        color_tuple = (0.5, 0.5, 0.5)

    result = pdf_engine.watermark_text(
        data,
        text=text,
        opacity=max(0.05, min(opacity, 1.0)),
        angle=angle % 360,
        fontsize=max(8.0, fontsize),
        color=color_tuple,
    )
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=watermarked_{file.filename}"},
    )
