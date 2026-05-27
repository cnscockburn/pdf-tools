# PDF Tools — User Guide & Developer Reference

## Table of Contents

1. [Running the app](#1-running-the-app)
2. [Tool reference](#2-tool-reference)
   - [PDF Viewer](#pdf-viewer)
   - [Merge PDFs](#merge-pdfs)
   - [Split PDF](#split-pdf)
   - [Rearrange Pages](#rearrange-pages)
   - [Rotate / Delete Pages](#rotate--delete-pages)
   - [Extract Pages](#extract-pages)
   - [Images to PDF](#images-to-pdf)
3. [Architecture](#3-architecture)
4. [Adding a new tool](#4-adding-a-new-tool)
5. [Troubleshooting](#5-troubleshooting)

---

## 1. Running the app

You need two terminals running simultaneously.

### Terminal 1 — Python backend

```powershell
cd C:\Users\cnsco\Git\pdf-tools\backend
.venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 7342 --reload
```

The `--reload` flag restarts the server automatically when you edit Python files.

### Terminal 2 — React frontend

```powershell
cd C:\Users\cnsco\Git\pdf-tools
npm run dev
```

Then open **http://localhost:5173** in your browser.

> **Why two processes?** The React app runs in Vite's dev server and talks to the Python server over HTTP on port 7342. Vite proxies `/api/*` requests automatically — you never need to think about CORS in development.

### First-time setup

```powershell
# 1. Install Node packages (one-time)
cd C:\Users\cnsco\Git\pdf-tools
npm install

# 2. Create Python virtual environment and install packages (one-time)
cd backend
python -m uv venv
python -m uv pip install --python .venv\Scripts\python.exe `
    fastapi "uvicorn[standard]" python-multipart PyMuPDF pikepdf Pillow
```

### Tauri native window (requires Rust)

Once Rust is installed (`winget install Rustlang.Rustup`, then restart your terminal):

```powershell
cd C:\Users\cnsco\Git\pdf-tools
npm run tauri:dev
```

This opens a native desktop window instead of a browser tab. The Python server still needs to be running separately in Terminal 1.

---

## 2. Tool reference

### PDF Viewer

Open and read any PDF file entirely in your browser — nothing is uploaded anywhere. Opens as a tab; each viewer tab preserves its full state independently.

| Control | Action |
|---|---|
| Click or drop | Open a PDF file |
| `−` / `+` buttons | Zoom out / in (10% steps) |
| `<` / `>` buttons | Previous / next page |
| Page number strip (bottom) | Click any number to jump directly |
| **Open…** button | Load a different PDF |

**Keyboard shortcuts** (click the canvas area first):
- `←` / `→` / `↑` / `↓` — previous/next page
- `Home` / `End` — first/last page
- `+` / `−` — zoom in/out
- `V` — view mode, `A` — annotate (note), `H` — highlight, `U` — underline, `S` — strikethrough, `T` — text box, `I` — ink, `R` — redact, `C` — crop
- `1`–`4` — switch highlight colour (while annotating)
- `Del` / `Backspace` — delete selected annotation
- `Ctrl+Z` — undo last annotation
- `Ctrl+F` — search in document
- `Ctrl+S` — download PDF
- `Ctrl+Shift+P` — command palette
- `Ctrl+\` — toggle side by side view
- `?` — keyboard cheat sheet
- **Continuous scroll:** scrolling past the edge of a page advances to the next/previous page automatically
- **Side by side:** view the same document in two panes (shared annotations) or two different documents. Secondary pane uses cyan accents for visual distinction

---

### Merge PDFs

Combine two or more PDF files into a single PDF in the order you add them.

1. Drop your first PDF onto the drop zone (or click to browse)
2. Drop additional PDFs — each one appears in the list below
3. Remove any file you don't want with the **Remove** link
4. Click **Merge N files** — `merged.pdf` downloads automatically

**Notes:**
- There is no limit on the number of files
- Page order in the output follows the list order top-to-bottom
- File drag-and-drop into the list for reordering is not yet implemented — remove and re-add to change order

---

### Split PDF

Break a single PDF into multiple separate files.

**Split every page** — creates one PDF per page. If your source has 10 pages you get 10 single-page PDFs packaged in `split.zip`.

**Custom ranges** — you specify which page ranges become separate PDFs using this syntax:

| Input | Meaning |
|---|---|
| `1-3` | Pages 1, 2, and 3 as one PDF |
| `5` | Page 5 as its own PDF |
| `1-3, 5, 7-10` | Three separate PDFs |

When multiple ranges are specified the download is a `.zip` archive. A single range downloads as a `.pdf` directly.

---

### Rearrange Pages

Drag and drop page thumbnails into any order.

1. Drop a PDF onto the drop zone
2. Wait for thumbnails to render (rendered locally in your browser using PDF.js)
3. Drag pages into the order you want — the label shows `p.{original} → {new position}`
4. Click **Save reordered PDF** — the result downloads automatically

**Tip:** For large PDFs thumbnail rendering may take a few seconds. The app renders progressively so you can start rearranging before all thumbnails appear.

---

### Rotate / Delete Pages

Two tools in one — select pages from the thumbnail grid and either rotate them or delete them.

**To rotate:**
1. Choose **Rotate** mode (default)
2. Pick an angle: 90°, 180°, or 270° (rotation is cumulative — rotating 90° twice gives 180°)
3. Click the thumbnails of the pages to rotate (highlighted in blue)
4. Click **Rotate N page(s)**

**To delete:**
1. Switch to **Delete** mode
2. Click the thumbnails of pages to remove
3. Click **Delete N page(s)**

**Select all** selects every page at once. **Clear** deselects everything.

---

### Extract Pages

Pull a subset of pages from a PDF into a new file.

1. Drop a PDF
2. Type a page range using the same syntax as Split: `1-3, 5, 8-10`
3. The thumbnail strip highlights the pages that will be extracted
4. Click **Extract N page(s)** — the result downloads as `extracted_<original name>`

---

### Images to PDF

Convert one or more images into a PDF where each image becomes one page.

**Supported formats:** JPEG, PNG, TIFF, BMP, GIF, WebP

1. Drop images onto the drop zone (you can drop multiple at once)
2. Each image appears in the list with a preview thumbnail
3. Use **Remove** to remove any you don't want
4. The order in the list is the order they appear in the PDF
5. Click **Convert N image(s) to PDF** — downloads as `images.pdf`

**Note on page size:** Each page is sized to match the image's pixel dimensions at 72 DPI. Very large images will produce very large PDF pages.

---

## 3. Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (http://localhost:5173)            │
│                                             │
│  React 18 + Vite + TypeScript               │
│  Tailwind CSS + shadcn-style components     │
│  PDF.js — client-side rendering             │
│  @dnd-kit — drag-and-drop reordering        │
│                                             │
│  /api/* ──proxy──►                          │
└─────────────────────────────────────────────┘
                    │ HTTP (localhost:7342)
┌─────────────────────────────────────────────┐
│  FastAPI + Uvicorn (Python 3.13)            │
│                                             │
│  PyMuPDF (fitz 1.27) — all PDF operations  │
│  pikepdf — available for low-level work     │
│  Pillow — image processing                  │
└─────────────────────────────────────────────┘
```

### Key files

| File | Purpose |
|---|---|
| `src/lib/tabs.ts` | Tab types, context, helpers (replaces React Router) |
| `src/lib/mirrorSync.ts` | Pub/sub for annotation sync between mirrored panes |
| `src/components/TabShell.tsx` | Top-level shell: tab state, side-by-side layout |
| `src/components/TabBar.tsx` | Tab strip UI with keyboard shortcuts |
| `src/pages/Viewer.tsx` | PDF viewer/annotator (largest component) |
| `src/api/client.ts` | All HTTP calls to the backend (typed) |
| `src/components/PageThumbnailGrid.tsx` | PDF.js thumbnail renderer + `usePdfThumbnails` hook |
| `src/components/Layout.tsx` | Page shell with back button + header |
| `backend/services/pdf_engine.py` | All PyMuPDF operations |
| `backend/routers/*.py` | FastAPI route handlers (thin — delegate to `pdf_engine`) |
| `src-tauri/src/lib.rs` | Tauri app setup + sidecar spawn in release builds |
| `src-tauri/tauri.conf.json` | Window size, identifier, build config |

### How a tool call works end-to-end

1. User drops a file → stored as a browser `File` object in React state
2. User clicks a process button
3. `src/api/client.ts` builds a `FormData` with the file + parameters and POSTs to `/api/<operation>`
4. Vite dev server proxies the request to `http://localhost:7342/api/<operation>`
5. FastAPI reads the multipart body, calls `pdf_engine.<operation>(bytes, params)`
6. PyMuPDF processes the bytes in-memory (no temp files for most operations)
7. FastAPI returns the result as a streaming `application/pdf` response
8. The browser receives it as a `Blob`, `downloadBlob()` triggers a save dialog

### Why PDF.js for thumbnails instead of the server?

Generating thumbnails server-side would require a stateful session (upload file once, request thumbnails multiple times). Instead, PDF.js renders pages directly in the browser from the `File` object — no upload needed, works instantly, and keeps the server stateless. The tradeoff is slightly slower rendering for very large PDFs (100+ pages).

---

## 4. Adding a new tool

Here's the full checklist for adding a tool — e.g. "Compress PDF".

### Step 1 — Backend service function

Add to `backend/services/pdf_engine.py`:

```python
def compress(file_bytes: bytes, quality: str = "ebook") -> bytes:
    """quality: screen | ebook | printer | prepress"""
    doc = _open(file_bytes)
    # PyMuPDF deflate + garbage collect unreferenced objects
    return doc.tobytes(garbage=4, deflate=True, clean=True)
```

For better compression (requires Ghostscript installed separately):
```python
import subprocess, tempfile, os

def compress_gs(file_bytes: bytes, quality: str = "ebook") -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_in:
        tmp_in.write(file_bytes)
        in_path = tmp_in.name
    out_path = in_path.replace(".pdf", "_out.pdf")
    subprocess.run([
        "gswin64c", "-dNOPAUSE", "-dBATCH", "-sDEVICE=pdfwrite",
        f"-dPDFSETTINGS=/{quality}", f"-sOutputFile={out_path}", in_path
    ], check=True)
    result = open(out_path, "rb").read()
    os.unlink(in_path); os.unlink(out_path)
    return result
```

### Step 2 — Backend router

Create `backend/routers/compress.py`:

```python
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from services import pdf_engine

router = APIRouter()

@router.post("/compress")
async def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Form("ebook"),
):
    data = await file.read()
    result = pdf_engine.compress(data, quality)
    return Response(
        content=result,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=compressed_{file.filename}"},
    )
```

Register it in `backend/main.py`:
```python
from routers import compress
app.include_router(compress.router, prefix="/api")
```

### Step 3 — API client function

Add to `src/api/client.ts`:

```typescript
export async function compressPDF(file: File, quality: string): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("quality", quality);
  return handleResponse(await fetch(`${BASE}/compress`, { method: "POST", body: form }));
}
```

### Step 4 — React page

Create `src/pages/Compress.tsx` using the existing pages as a template — drop zone, options, process button, error display. Accept an `initialFile?: File` prop for tab integration.

### Step 5 — Wire up the tab system

1. Add `"compress"` to the `TabType` union in `src/lib/tabs.ts`:
   ```ts
   export type TabType = "home" | "viewer" | "merge" | "rearrange" | "images-to-pdf" | "compress";
   ```
2. Add a case in `TabContent` inside `src/components/TabShell.tsx`:
   ```tsx
   case "compress":
     return <Compress initialFile={tab.initialFile} />;
   ```
3. In `src/pages/Home.tsx`, add a card to the tools list with `tabType: "compress"`.
4. Add an icon entry in `TAB_ICONS` in `src/components/TabBar.tsx`.

---

## 5. Troubleshooting

### "Backend not reachable" / API calls return 502

The Python server isn't running. Start it:
```powershell
cd backend
.venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 7342 --reload
```

Check it's responding:
```powershell
Invoke-WebRequest http://localhost:7342/api/health
```

### PDF viewer shows black canvas

This was a bug in the initial build — fixed in the latest version by adding a white canvas fill before PDF.js renders. If you still see it, hard-refresh the browser (`Ctrl+Shift+R`).

### Thumbnails are blank or don't appear

Same root cause as the viewer bug — canvas fill fix applied to `PageThumbnailGrid.tsx`. Hard-refresh to pick up the fix.

### `npm run tauri:dev` fails — "cargo not found"

Rust isn't installed or isn't in `PATH`. Install it:
```powershell
winget install Rustlang.Rustup
```
Then **close and reopen** your terminal so PATH is updated.

### Split ZIP download opens as a PDF

This happens if only one range was specified. A single range returns a `.pdf` directly; multiple ranges return `.zip`. Specify at least two comma-separated ranges to get a zip.

### Large PDFs are slow to show thumbnails

Thumbnail rendering is done client-side in the browser via PDF.js. For PDFs with many pages or high-resolution content this takes time. The thumbnails render progressively — you'll see them appear page by page. Server-side thumbnail generation can be added later as an optimisation.

### `pnpm install` fails with esbuild build script error

pnpm v11 blocks postinstall scripts by default. Use `npm install` instead — it has no such restriction.

### Port 7342 already in use

Kill the existing process:
```powershell
netstat -ano | findstr :7342
# Note the PID in the last column
taskkill /PID <PID> /F
```
