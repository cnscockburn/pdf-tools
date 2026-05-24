import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import annotate, compress, convert, crop, export, merge, pages, redact, security, split, watermark

app = FastAPI(title="PDF Tools API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:7341", "tauri://localhost"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(merge.router, prefix="/api")
app.include_router(split.router, prefix="/api")
app.include_router(pages.router, prefix="/api")
app.include_router(convert.router, prefix="/api")
app.include_router(compress.router, prefix="/api")
app.include_router(watermark.router, prefix="/api")
app.include_router(crop.router, prefix="/api")
app.include_router(redact.router, prefix="/api")
app.include_router(annotate.router, prefix="/api")
app.include_router(security.router, prefix="/api")
app.include_router(export.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=7341, reload=True)
