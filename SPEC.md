# PDF Tools — Local SmallPDF Clone: Implementation Spec

## 1. Goals

A self-hosted, local-first PDF toolkit running entirely on Windows (targeting Windows 11, portable to macOS/Linux). No cloud dependency, no file upload, no subscription. Feature parity with SmallPDF's core tools.

---

## 2. Feature Inventory

| Tool | Priority | Complexity |
|---|---|---|
| PDF Reader / Viewer | P0 | Low |
| Merge PDF | P0 | Low |
| Split PDF | P0 | Low |
| Delete Pages | P0 | Low |
| Rearrange Pages | P0 | Medium |
| Rotate PDF / Pages | P0 | Low |
| Extract Pages | P0 | Low |
| JPEG → PDF | P0 | Low |
| Compress PDF | P1 | Medium |
| Watermark PDF | P1 | Medium |
| Crop PDF | P1 | Medium |
| Annotate PDF (comments, highlights) | P1 | High |
| Redact PDF | P1 | High |
| PDF → Image export | P2 | Low |
| OCR (scanned PDF → searchable) | P2 | High |
| Encrypt / Decrypt PDF | P2 | Low |
| Fill PDF Forms | P2 | Medium |

---

## 3. Architecture Options

### Option A — Local Web App (FastAPI + React) ✅ RECOMMENDED

```
[Browser / Electron shell]
        |  HTTP/REST
[FastAPI Python server]  ←→  [PDF processing libraries]
        |
  [Local filesystem]
```

**How it works:** A Python FastAPI server runs on localhost (e.g. port 7341). The UI is a React SPA served by that same server. Users open `http://localhost:7341` in their browser, or the whole thing is wrapped in an Electron/Tauri shell to make it feel like a native app.

**Pros:**
- Best-in-class PDF libraries live in the Python ecosystem
- Familiar web development stack for the UI (React, Tailwind, shadcn/ui)
- Easy to iterate on UI without recompiling native code
- Can optionally run headless (scriptable via curl/HTTP)
- Packaging: PyInstaller bundles the Python server; Electron/Tauri wraps it into a `.exe`

**Cons:**
- Two runtimes (Python + Node for the shell) add startup overhead
- Electron adds ~150 MB to binary size (Tauri reduces this to ~10 MB)
- File drag-and-drop requires careful CORS/security config

---

### Option B — Tauri (Rust shell + Python sidecar)

```
[Tauri native window (Rust)]
        |  WebView
    [React UI]
        |  Tauri IPC commands
[Rust glue] → spawns → [Python sidecar process]
```

**Pros:**
- Tiny installer (~10-15 MB vs Electron's ~150 MB)
- System webview, lower RAM usage
- Rust shell is very secure (no Node.js attack surface)
- Good Windows 11 integration (system tray, file associations)

**Cons:**
- Tauri + Python sidecar integration is non-trivial to set up
- Sidecar IPC (stdin/stdout JSON) is less ergonomic than HTTP
- Rust build toolchain required on dev machine
- Smaller ecosystem than Electron

---

### Option C — Electron + Python subprocess

```
[Electron main process (Node.js)]
        ↕  IPC
[Renderer (React UI)]
        ↕  calls
[Python child process via node-python-bridge]
```

**Pros:**
- Most mature desktop-web hybrid ecosystem
- Large plugin/extension community
- File system access is straightforward

**Cons:**
- Heaviest option: ~150-200 MB installer
- Two runtimes (Chromium + Node + Python) = more RAM
- Node ↔ Python bridge adds latency for large files

---

### Option D — Pure Python Desktop (PyQt6 / PySide6)

```
[PyQt6 / PySide6 native GUI]
        ↕
[Python PDF libraries]
```

**Pros:**
- Single runtime, no web stack needed
- Native OS look and feel
- Tightest integration with Python libraries (in-process calls)
- Smallest footprint after PyInstaller packaging (~60-80 MB)

**Cons:**
- Qt UI development is slower and more verbose than React
- Harder to get polished, modern UI (SmallPDF-quality aesthetics)
- PDF rendering widget (for the viewer) is less capable than browser-native rendering
- Smaller talent pool for UI development

---

### Option E — NiceGUI or Streamlit (Python-native web UI)

**Pros:** Fastest to prototype; pure Python; no JavaScript needed.

**Cons:** Not designed for production desktop apps; NiceGUI has limited component library; Streamlit's stateless model fights against multi-step workflows. **Reject for production use.**

---

## 4. Recommended Stack

### 4.1 Core Architecture: **Option A — FastAPI + React, packaged with PyInstaller + optional Electron wrapper**

**Development phase:** Run as `uvicorn` localhost server, open in browser.
**Distribution phase:** PyInstaller → single `.exe` that auto-opens the browser, OR wrap with Electron for native window experience.

This gives you:
- The fastest development loop (no compile step for UI or Python changes)
- The best PDF library ecosystem
- A clear upgrade path to a native app later

### 4.2 Backend: Python 3.12+

| Library | Role | License | Notes |
|---|---|---|---|
| **PyMuPDF (fitz) 1.24+** | Primary workhorse | AGPL-3.0 / commercial | Rendering, annotation, redaction, compression, text extraction, image export. Fastest Python PDF lib by far — C-based via MuPDF. |
| **pikepdf 9+** | Low-level manipulation | MIT | Built on QPDF. Best for merge/split/encrypt/decrypt, linearization, PDF/A compliance. Complement to PyMuPDF, not a replacement. |
| **Pillow 10+** | Image processing | MIT-like HPND | JPEG/PNG/TIFF → PDF conversion; image extraction; watermark image handling. |
| **FastAPI 0.115+** | HTTP server | MIT | Async, auto OpenAPI docs, fast. |
| **Uvicorn** | ASGI server | MIT | Run FastAPI. |
| **python-multipart** | File uploads | Apache 2.0 | Multipart form data for file upload endpoint. |

**PyMuPDF licensing note:** AGPL means if you distribute the app, you must open-source it, OR buy a commercial license (~$400/year for indie). For a personal local tool, AGPL is fine. Alternatives if you need MIT-clean: `pypdf` (slower, less capable) + `pdfium2` (Apache 2.0, Google's PDFium bindings).

**Optional / P2:**
- **Tesseract + pytesseract** — OCR for scanned PDFs
- **ocrmypdf** — wraps Tesseract + Ghostscript for OCR-to-PDF pipeline
- **Ghostscript** (external binary) — superior compression vs pure Python; call via subprocess

### 4.3 Frontend: React + TypeScript

| Library | Role |
|---|---|
| **React 18 + Vite** | UI framework + dev server |
| **TypeScript** | Type safety |
| **Tailwind CSS 3** | Styling |
| **shadcn/ui** | Component library (built on Radix UI) |
| **PDF.js (pdfjs-dist)** | In-browser PDF rendering for the viewer |
| **react-pdf** | React wrapper around PDF.js |
| **@dnd-kit/core** | Drag-and-drop page rearrangement |
| **react-dropzone** | File drag-and-drop upload |
| **Zustand** | Lightweight state management |
| **React Query (TanStack)** | Server state, loading/error handling for API calls |
| **Lucide React** | Icon set |

### 4.4 Tooling

| Tool | Purpose |
|---|---|
| **uv** | Python package/env management (replaces pip+venv) |
| **Ruff** | Python linter + formatter |
| **pnpm** | Node package manager |
| **Vitest** | Frontend unit tests |
| **pytest** | Backend unit tests |
| **PyInstaller** | Package Python app → Windows `.exe` |
| **Electron Builder** (optional) | Wrap into native `.exe` with system tray |

---

## 5. Project Structure

```
pdf-tools/
├── backend/
│   ├── main.py                  # FastAPI app entrypoint
│   ├── routers/
│   │   ├── compress.py
│   │   ├── merge.py
│   │   ├── split.py
│   │   ├── pages.py             # delete, extract, rearrange, rotate
│   │   ├── convert.py           # images → PDF, PDF → images
│   │   ├── annotate.py
│   │   ├── redact.py
│   │   ├── watermark.py
│   │   ├── crop.py
│   │   └── encrypt.py
│   ├── services/
│   │   ├── pdf_engine.py        # PyMuPDF wrappers
│   │   ├── pikepdf_engine.py    # pikepdf wrappers
│   │   └── image_engine.py      # Pillow wrappers
│   ├── models.py                # Pydantic request/response schemas
│   ├── temp/                    # Working directory (auto-cleaned)
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── Viewer.tsx
│   │   │   ├── Merge.tsx
│   │   │   ├── Split.tsx
│   │   │   ├── Compress.tsx
│   │   │   ├── Annotate.tsx
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── PageThumbnails.tsx
│   │   │   ├── FileDropZone.tsx
│   │   │   └── ...
│   │   ├── api/
│   │   │   └── client.ts        # Typed API calls
│   │   └── store/
│   │       └── useAppStore.ts
│   ├── package.json
│   └── vite.config.ts
├── electron/                    # Optional native wrapper
│   └── main.ts
└── SPEC.md
```

---

## 6. API Design (Key Endpoints)

All endpoints accept `multipart/form-data` with one or more PDF files plus JSON config. They return the processed PDF as a file download (`application/pdf`).

```
POST /api/merge          body: files[] → PDF
POST /api/split          body: file, ranges (e.g. "1-3,5,7-") → ZIP of PDFs
POST /api/compress       body: file, quality (screen|ebook|printer|prepress) → PDF
POST /api/rotate         body: file, pages[], degrees → PDF
POST /api/delete-pages   body: file, pages[] → PDF
POST /api/reorder-pages  body: file, order[] → PDF
POST /api/extract-pages  body: file, pages[] → PDF
POST /api/crop           body: file, pages[], rect (x,y,w,h) → PDF
POST /api/watermark      body: file, text|image, position, opacity → PDF
POST /api/annotate       body: file, annotations[] → PDF
POST /api/redact         body: file, regions[] → PDF (pixels burned in)
POST /api/convert/images body: images[] → PDF
POST /api/convert/to-images body: file, format, dpi → ZIP of images
POST /api/encrypt        body: file, password → PDF
POST /api/decrypt        body: file, password → PDF

GET  /api/health
```

---

## 7. Key Implementation Notes by Feature

### Compress
Use PyMuPDF's `Document.save()` with `deflate=True, garbage=4, clean=True`. For aggressive compression, shell out to Ghostscript: `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook ...`. Ghostscript gives 40-60% better compression than pure Python for image-heavy PDFs.

### Annotate
PyMuPDF has first-class annotation support: `Page.add_text_annot()`, `Page.add_highlight_annot()`, `Page.add_freetext_annot()`. Store annotation data as JSON (for undo/redo) and render to PDF on save. The viewer component uses PDF.js for rendering and a canvas overlay for interactive annotation placement.

### Redact
True redaction (not just black box overlay) requires burning pixels: use `Page.add_redact_annot()` + `Page.apply_redactions()` in PyMuPDF. This removes underlying text/image data, not just draws over it. Expose a region-selection UI on top of the PDF.js viewer.

### Page Rearrangement
UI: thumbnail strip with `@dnd-kit` drag-and-drop. Backend: `pikepdf.Pdf` assemble pages in new order. Render thumbnails via PyMuPDF (`Page.get_pixmap(matrix=fitz.Matrix(0.2, 0.2))`).

### JPEG → PDF
Pillow: `Image.open(jpeg).save(output, "PDF")` for single images. For multiple images, use PyMuPDF to insert each image as a page.

### Crop
PyMuPDF: set `Page.set_cropbox(fitz.Rect(x0,y0,x1,y1))`. Note: this is non-destructive metadata — actual page content outside the cropbox is preserved in the file. For destructive crop, use a clipping path or re-render.

---

## 8. File Handling & Security

- All uploaded files go to a per-request temp directory: `backend/temp/{uuid}/`
- Cleanup: delete temp dirs on response completion (FastAPI `BackgroundTask`)
- No file is stored persistently; processed PDFs are streamed back as download
- Bind only to `127.0.0.1`, never `0.0.0.0`, to prevent LAN exposure
- File size limit: configurable, default 200 MB
- Validate that uploaded files are actually PDFs (check `%PDF-` magic bytes), not just by extension

---

## 9. Packaging & Distribution

### Phase 1 — Developer mode
```
# Terminal 1
cd backend && uv run uvicorn main:app --port 7341

# Terminal 2
cd frontend && pnpm dev  # proxies /api → localhost:7341
```

### Phase 2 — Single portable binary

1. `pnpm build` → static files into `backend/static/`
2. FastAPI serves static files from `/`
3. `pyinstaller --onefile main.py` → `pdf-tools.exe`
4. User double-clicks `pdf-tools.exe`, server starts, browser auto-opens at `http://localhost:7341`

### Phase 3 — Native app (optional)
Wrap with Electron Builder:
- Electron main process spawns `pdf-tools.exe` as child process
- Opens `BrowserWindow` pointing at `http://localhost:7341`
- System tray icon, minimize-to-tray, file association for `.pdf`
- `electron-builder` produces NSIS installer for Windows

---

## 10. Phased Delivery

| Phase | Features | Effort |
|---|---|---|
| **MVP** (2-3 weeks) | Viewer, Merge, Split, Delete pages, Rotate, Rearrange, Extract, JPEG→PDF | ~40h |
| **Phase 2** (1-2 weeks) | Compress, Watermark, Crop, Encrypt/Decrypt, PDF→Images | ~20h |
| **Phase 3** (2-3 weeks) | Annotate, Redact, Form fill | ~40h |
| **Phase 4** (2-3 weeks) | OCR, Electron packaging, file associations | ~30h |

---

## 11. Alternatives Rejected

| Alternative | Reason rejected |
|---|---|
| **iText7** (.NET/Java) | AGPL like PyMuPDF but Java/C# ecosystem is heavier; Python has better rapid-dev tooling |
| **PDF.js only (no server)** | Browser JS PDF libs are read-only or very limited for manipulation |
| **pdf-lib (Node.js)** | Good library but Python has superior manipulation libs; mixing Node+Python adds complexity |
| **Streamlit/NiceGUI** | Not suitable for multi-step interactive workflows at production quality |
| **Ghostscript-only** | CLI-only, no GUI, hard to build UX on top of |
| **pdfium2 + pypdf** | Viable MIT-clean alternative to PyMuPDF; weaker annotation/redaction support |

---

## 12. Open Questions Before Starting

1. **AGPL acceptable?** PyMuPDF (AGPL) is fine for personal use, but if you ever distribute this, you'll need to either open-source everything or buy a commercial MuPDF license. Alternative: swap PyMuPDF for `pdfium2` + `pypdf` for an MIT-clean stack (10-20% performance hit).

2. **Electron wrapper or browser tab?** Browser tab is simpler. Electron adds native feel (system tray, file open dialog, `.pdf` file association) but ~150 MB to the installer. Tauri is a good middle ground if you're willing to add a Rust toolchain.

3. **Ghostscript dependency?** Installing Ghostscript separately gives much better PDF compression. If you want a zero-dependency install, stick with pure PyMuPDF compression (good but not as aggressive).

4. **OCR in scope for MVP?** Tesseract + ocrmypdf adds significant complexity and a large binary dependency. Recommend deferring to Phase 4.
