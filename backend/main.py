import sys
import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# When bundled as a PyInstaller exe with console=False, sys.stdout/stderr
# are None. Uvicorn's DefaultFormatter calls .isatty() on them and crashes.
# Redirect to devnull so the process starts silently in the background.
if getattr(sys, "frozen", False):
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

from routers import annotate, compress, convert, crop, export, merge, pages, redact, security, split, watermark

app = FastAPI(title="PDF Tools API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:7342", "tauri://localhost"],
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
    frozen = getattr(sys, "frozen", False)
    # When frozen (PyInstaller bundle):
    #   - reload=False  — subprocess watcher is unsafe in a frozen exe
    #   - log_config=None — disables uvicorn's DefaultFormatter entirely,
    #     which avoids any remaining .isatty() calls on the devnull streams
    #   - access_log=False — no request logging needed for the background sidecar
    run_kwargs: dict = {"host": "127.0.0.1", "port": 7342, "reload": not frozen}
    if frozen:
        run_kwargs["log_config"] = None
        run_kwargs["access_log"] = False
    uvicorn.run("main:app", **run_kwargs)
