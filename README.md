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

| Tool | Description |
|---|---|
| PDF Viewer | Full document reviewer with annotations, search, redact, crop |
| Merge PDFs | Combine multiple files into one document |
| Split PDF | Divide a PDF into separate files by page range |
| Rearrange Pages | Reorder, rotate, and remove pages |
| Images to PDF | Turn images into a single PDF |

### Tabbed Documents

Every tool opens in its own tab. Tabs persist their full React state (loaded PDF, annotations, scroll position, mode) even when inactive. Switch freely between multiple open documents without losing work.

- `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle
- `Ctrl+1`-`9` jump to tab by position
- Middle-click a tab to close it
- Ephemeral Home tabs auto-close when you open something from them

### Side by Side

View two documents (or the same document twice) side by side:

- **Same Document**: duplicates the current PDF into a second pane with synchronized annotations; markup in one pane appears in the other
- **New Document**: opens an independent viewer alongside the current one
- The secondary pane uses cyan accents (vs. amber for the primary) for visual distinction
- Toggle via the toolbar button, `View` menu, command palette, or `Ctrl+\`

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
React + Vite frontend (tab-based navigation, no router)
    ↕ /api/* proxied to :7342
FastAPI Python server
    ↕ in-process
PyMuPDF (fitz) — all PDF operations
```

### Frontend structure

- `TabShell` is the top-level component; all pages mount simultaneously (inactive ones hidden via `display:none` to preserve state)
- `TabContext` provides `openTab` / `closeTab` / `switchTab` to all components
- Side-by-side mode renders two tab panes; mirror mode syncs annotations via a lightweight pub/sub channel (`mirrorSync.ts`)
