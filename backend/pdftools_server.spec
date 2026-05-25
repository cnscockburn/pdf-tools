# PyInstaller spec for the PDF Tools backend server.
#
# Produces: dist\pdftools-server.exe  (a self-contained Windows executable)
#
# Usage (from the backend\ directory, with the venv active):
#   .venv\Scripts\pyinstaller.exe pdftools_server.spec
#
# The output exe is then copied to src-tauri\binaries\ before running
# `npm run tauri:build`.

import sys
import os
from PyInstaller.utils.hooks import collect_dynamic_libs, collect_data_files

block_cipher = None

# ── Collect PyMuPDF's native DLLs ─────────────────────────────────────────────
# PyMuPDF ships mupdf and related native libs that PyInstaller won't find
# automatically — we must pull them in explicitly.
pymupdf_binaries = collect_dynamic_libs("fitz")
pymupdf_datas    = collect_data_files("fitz")

a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=pymupdf_binaries,
    datas=pymupdf_datas + [
        # Bundle our own application modules
        ("routers",  "routers"),
        ("services", "services"),
    ],
    hiddenimports=[
        # FastAPI / Starlette internals that PyInstaller misses
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "starlette.routing",
        "fastapi",
        "fastapi.responses",
        "python_multipart",
        "multipart",
        # PyMuPDF
        "fitz",
        "fitz.fitz",
        # Pikepdf / lxml (used by pikepdf)
        "pikepdf",
        "lxml",
        "lxml.etree",
        # Pillow
        "PIL",
        "PIL.Image",
        "PIL.JpegImagePlugin",
        "PIL.PngImagePlugin",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="pdftools-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,   # no console window — runs silently in background
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
