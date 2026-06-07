# Stria PDF Toolkit

A local, private PDF toolkit. Everything runs on your machine — no cloud, no uploads, no account.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| Python | 3.11+ | https://python.org |
| Rust + Cargo | stable | `winget install Rustlang.Rustup` then restart terminal |
| MSVC Build Tools | 2022 | `winget install Microsoft.VisualStudio.2022.BuildTools` |

> **Note:** Use `npm install` (not pnpm). pnpm v11 blocks esbuild's postinstall script.

---

## Development

Two terminals are needed to run the full dev environment.

### Terminal 1 — Python backend

```powershell
cd backend

# First time only — create venv and install deps
python -m uv venv
python -m uv pip install --python .venv\Scripts\python.exe -r requirements.txt

# Start dev server (hot-reload)
.venv\Scripts\python.exe main.py
```

### Terminal 2 — Tauri dev window (recommended)

```powershell
npm install        # first time only
npm run tauri dev
```

This opens a native window. The Vite dev server (port 5173) is started automatically and proxies `/api/*` to the backend.

### Browser-only mode (no Rust required)

```powershell
npm run dev
# Open http://localhost:5173
```

File-system features (recent files, native drag-drop, file associations) require Tauri and won't work in the browser.

---

## Building

```powershell
# 1. Build the backend sidecar (requires PyInstaller in the venv)
cd backend
.venv\Scripts\pyinstaller.exe pdftools_server.spec --noconfirm

# 2. Copy sidecar to Tauri binaries dir
Copy-Item dist\pdftools-server.exe ..\src-tauri\binaries\pdftools-server-x86_64-pc-windows-msvc.exe

# 3. Build the installer
cd ..
npm run tauri:build
```

The NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

---

## Feature overview

| Feature | Description |
|---------|-------------|
| **Viewer** | Full-featured PDF reader with annotations, search, redact, crop, form fill, print |
| **Annotate** | Notes, highlights, underlines, strikethroughs, ink drawings, shapes, stamps |
| **Merge** | Combine multiple PDFs into one |
| **Organise** | Reorder, rotate, delete, extract pages; place split dividers between pages |
| **Compress** | Reduce file size (lossy or lossless modes) |
| **Watermark** | Add text watermark with opacity/angle/color controls |
| **Redact** | Permanently remove content from page regions |
| **Crop** | Crop page margins (one page or all) |
| **Encrypt / Decrypt** | Password-protect PDFs with AES-256 |
| **Fill Forms** | Fill PDF form fields interactively |
| **Export to Images** | Render each page as PNG or JPEG |
| **Images to PDF** | Combine images into a single PDF |
| **Batch** | Apply compress/watermark/export-to-images to multiple PDFs at once |

### Viewer features

- **Tabs:** every document opens in its own tab; state (scroll, annotations, mode) persists across tab switches
- **Side by side:** compare two documents in split-view; mirror mode syncs annotations and navigation between panes
- **MiniMap:** wave-scrub strip for rapid navigation in long documents
- **Annotation export:** save annotations as Markdown, CSV, JSON, or a formatted PDF report
- **Recent files:** re-open recently used documents from the Home screen (Tauri build only)
- **Auto-save:** working state is checkpointed every 2 minutes and recoverable after a crash
- **Help mode:** press `H` for contextual tool explanations
- **Password PDFs:** opens an unlock dialog for encrypted documents

### Keyboard shortcuts (partial)

| Shortcut | Action |
|----------|--------|
| `?` | Show all shortcuts |
| `Ctrl+K` | Command palette |
| `A` | Annotate mode |
| `R` | Redact mode |
| `C` | Crop mode |
| `Ctrl+F` | Search in document |
| `Ctrl+S` | Download / save |
| `Ctrl+\` | Toggle side-by-side |
| `Ctrl+T` / `Ctrl+W` | New tab / close tab |

Press `?` in the viewer for the full list.

---

## Running tests

```powershell
# Frontend unit tests (TypeScript/React)
npm run test:run

# TypeScript type check
npm run typecheck

# Backend smoke tests
cd backend
.venv\Scripts\python.exe smoke_test.py

# Rust dependency audit
cd src-tauri
cargo audit

# Full security audit (npm audit, pip-audit, bandit, semgrep, cargo audit)
.\scripts\security-audit.ps1
```

---

## Architecture

```
src/                         React + TypeScript (Vite)
  pages/
    Home.tsx                 landing page, recent files, tool cards
    Viewer.tsx               PDF viewer hub
    Merge.tsx                multi-file merge
    Rearrange.tsx            Organise tool (reorder / rotate / split)
    ImagesToPDF.tsx          images to PDF
    Batch.tsx                batch operations
  components/
    TabShell.tsx             tab provider, settings context, native drop handler
    TabBar.tsx               tab strip
    AnnotationLayer.tsx      canvas overlay (all annotation types)
    AnnotationsListPanel.tsx right-rail annotation list with stats + export
    RightPanel.tsx           document tool panels (compress, watermark, split, …)
    MiniMap.tsx              wave-scrub canvas strip
    CommandPalette.tsx       Ctrl+K command palette
  lib/
    storage.ts               useSettings, useBookmarks (localStorage)
    fileIntake.ts            Tauri-native file picker + recent files
    mirrorSync.ts            pub/sub for split-pane annotation + scroll sync
    annotationReport.ts      Markdown / CSV / JSON export
    tabs.ts                  tab context and types

src-tauri/                   Rust + Tauri v2
  src/lib.rs                 sidecar launcher, IPC commands, per-launch token

backend/                     Python + FastAPI sidecar
  main.py                    app, CORS, token middleware, security headers
  routers/                   one router per operation
  services/
    pdf_engine.py            PyMuPDF operations
    pikepdf_engine.py        pikepdf encrypt/decrypt
```

### Key invariants

- `LocalAnnot[]` is the in-session annotation source of truth. Saved to PDF on mode-switch via `annotatePDF()`.
- `workingBlob` is the current modified PDF. Every backend op returns a new blob; `applyBlob()` loads it into PDF.js.
- The sidecar is authenticated per-launch via `STRIA_API_TOKEN`; every request carries `X-Stria-Token`.
- Port is negotiated at launch (ephemeral); the frontend reads it via `invoke("api_port")`.
- All processing is local. No network calls leave the machine.
