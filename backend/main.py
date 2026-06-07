import sys
import os
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Per-launch shared secret. The Rust launcher generates a random token and
# passes it to this sidecar via the STRIA_API_TOKEN env var, then hands the
# same token to the WebView through a Tauri command. Every API request must
# carry it in the `X-Stria-Token` header. This defeats:
#   * malicious web pages the user visits (they cannot read the token, and
#     sending a custom header forces a CORS preflight that our origin list
#     rejects), and
#   * other unprivileged local processes (they don't know the per-launch token).
# When the env var is absent (local dev), enforcement is disabled so the Vite
# proxy and manual curl testing keep working.
API_TOKEN = os.environ.get("STRIA_API_TOKEN", "").strip()

# When bundled as a PyInstaller exe with console=False, sys.stdout/stderr
# are None. Uvicorn's DefaultFormatter calls .isatty() on them and crashes.
# Redirect to devnull so the process starts silently in the background.
if getattr(sys, "frozen", False):
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")

from routers import annotate, compress, convert, crop, export, forms, merge, pages, redact, security, split, watermark

app = FastAPI(
    title="PDF Tools API",
    version="0.1.0",
    # Don't expose the interactive docs in production builds.
    docs_url=None if getattr(sys, "frozen", False) else "/docs",
    redoc_url=None if getattr(sys, "frozen", False) else "/redoc",
    openapi_url=None if getattr(sys, "frozen", False) else "/openapi.json",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# The sidecar only binds to 127.0.0.1, so this list is the last line of defence
# against cross-origin calls from other browser tabs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:7342",   # direct API access in dev
        "tauri://localhost",       # production Tauri WebView
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept", "X-Stria-Token"],
    expose_headers=["Content-Disposition"],
)


# ── Token authentication ──────────────────────────────────────────────────────
# Rejects any /api request that doesn't present the per-launch token. Skipped
# entirely when no token is configured (dev). OPTIONS preflights pass through so
# CORSMiddleware can answer them (the browser never attaches custom headers to a
# preflight anyway).
@app.middleware("http")
async def require_api_token(request: Request, call_next) -> Response:
    if API_TOKEN and request.method != "OPTIONS" and request.url.path.startswith("/api"):
        if request.headers.get("X-Stria-Token") != API_TOKEN:
            return JSONResponse(status_code=403, content={"detail": "Forbidden."})
    return await call_next(request)


# ── Security headers ──────────────────────────────────────────────────────────
# Applied to every response from the sidecar.
@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    # The sidecar is localhost-only; HSTS would break dev, so we omit it.
    return response


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
app.include_router(forms.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    frozen = getattr(sys, "frozen", False)
    # When frozen (PyInstaller bundle):
    #   - Pass the `app` OBJECT, not the "main:app" import string. Inside a
    #     PyInstaller bundle the entry script runs as `__main__`, so uvicorn's
    #     import-by-name machinery cannot find a module called "main" and exits
    #     with "Error loading ASGI app. Could not import module 'main'." Handing
    #     uvicorn the already-constructed app object sidesteps the import entirely.
    #   - reload=False — the reloader needs an import string and spawns a
    #     subprocess watcher, which is unsafe in a frozen exe.
    #   - log_config=None — disables uvicorn's DefaultFormatter entirely,
    #     which avoids any remaining .isatty() calls on the devnull streams.
    #   - access_log=False — no request logging needed for the background sidecar.
    #
    # In dev (not frozen) we keep the "main:app" string so --reload works.
    target = app if frozen else "main:app"
    run_kwargs: dict = {"host": "127.0.0.1", "port": 7342, "reload": not frozen}
    if frozen:
        run_kwargs["log_config"] = None
        run_kwargs["access_log"] = False
    uvicorn.run(target, **run_kwargs)
