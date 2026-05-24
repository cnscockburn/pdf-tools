from fastapi import APIRouter, Depends, Form, HTTPException
from fastapi.responses import Response

from services import pdf_engine

from ._deps import content_disposition, read_pdf_upload, run_engine

router = APIRouter()


@router.post("/watermark")
async def watermark_pdf(
    payload: tuple[bytes, str] = Depends(read_pdf_upload),
    text: str = Form(...),
    opacity: float = Form(0.3),
    angle: float = Form(45.0),
    fontsize: float = Form(60.0),
    color: str = Form("0.5,0.5,0.5"),  # comma-separated R,G,B (0–1)
):
    data, filename = payload
    if not text.strip():
        raise HTTPException(status_code=400, detail="Watermark text cannot be empty.")

    try:
        r, g, b = (float(v) for v in color.split(","))
        color_tuple: tuple[float, float, float] = (
            max(0.0, min(r, 1.0)),
            max(0.0, min(g, 1.0)),
            max(0.0, min(b, 1.0)),
        )
    except Exception:
        color_tuple = (0.5, 0.5, 0.5)

    result = run_engine(
        pdf_engine.watermark_text,
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
        headers=content_disposition(f"watermarked_{filename}"),
    )
