# PDF Tools

Local PDF toolkit — SmallPDF-style tools that run entirely on your machine.

## Prerequisites

| Tool | Install |
|---|---|
| Node.js 18+ | already installed |
| Python 3.11+ | already installed |
| uv | `pip install uv` ✅ done |
| MSVC Build Tools | `winget install Microsoft.VisualStudio.2022.BuildTools` ✅ done |
| Rust + Cargo | `winget install Rustlang.Rustup` (pending) |

> **Note:** Use `npm install` (not pnpm). pnpm v11 blocks esbuild's postinstall script which Vite requires.

## Development (two terminals)

**Terminal 1 — Python backend**
```powershell
cd backend
# First time only:
python -m uv venv
python -m uv pip install --python .venv\Scripts\python.exe fastapi "uvicorn[standard]" python-multipart PyMuPDF pikepdf Pillow

# Start server:
.venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 7342 --reload
```

**Terminal 2 — Browser-only mode (works now, no Rust needed)**
```powershell
npm install   # first time only
npm run dev
# Open http://localhost:5173
```

**Terminal 2 — Tauri native window (requires Rust + MSVC)**
```powershell
npm run tauri dev
```

The Vite dev server proxies `/api/*` → `http://localhost:7342`.

## Features

| Tool | Route |
|---|---|
| PDF Viewer | `/viewer` |
| Merge PDFs | `/merge` |
| Split PDF | `/split` |
| Rearrange Pages | `/rearrange` |
| Rotate / Delete Pages | `/rotate-delete` |
| Extract Pages | `/extract` |
| Images → PDF | `/images-to-pdf` |

### PDF Viewer / Annotator

Full-featured document reviewer with:

- **8 annotation types:** notes, highlights, underline, strikethrough, freetext, ink/freehand, shapes (rect, ellipse, line, arrow), stamps
- **Text-aware selection:** drag-select actual PDF text for highlight/underline/strike markup
- **Continuous scroll:** scrolling past a page edge advances to the next/previous page
- **In-document search** (`Ctrl+F`) with match navigation
- **Annotations sidebar** with filtering, status tracking, and jump-to-annotation
- **Command palette** (`Ctrl+Shift+P`) for fuzzy-search across all actions
- **Keyboard-first workflow:** every action has a binding; press `?` for the cheat sheet
- **Export annotations** as a Markdown review report
- **Redact** and **crop** modes with drag-select regions

## Production build

```powershell
# 1. Build Python sidecar
cd backend
uv run pyinstaller --onefile --name pdftools-server main.py
copy dist\pdftools-server.exe ..\src-tauri\binaries\pdftools-server-x86_64-pc-windows-msvc.exe

# 2. Build Tauri app
cd ..
pnpm tauri build
# Installer at: src-tauri/target/release/bundle/
```

## Architecture

```
Tauri window (WebView2)
    ↕ HTTP on localhost:5173 (dev) / embedded (prod)
React + Vite frontend
    ↕ /api/* proxied to :7342
FastAPI Python server
    ↕ in-process
PyMuPDF (fitz) — all PDF operations
```
