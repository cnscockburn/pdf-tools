# Stria — Master Roadmap

**Last updated:** 2026-06-08  
**Supersedes:** `IMPLEMENTATION_PLAN.md`, `PLAN.md`, `SPEC.md` (all now historical artefacts)

This is the single source of truth for all planned, deferred, and suggested work. Items marked **NEEDS DECISION** require your go/no-go before implementation begins. Everything else is either already done or already has a clear direction.

---

## Current state

All five original implementation phases are **complete and shipped** in the production installer (`Stria_0.2.0_x64-setup.exe`).

| Area | Status | Notes |
|---|---|---|
| Annotation pipeline (all 8 types) | ✅ Done | Round-trip, author, multi-layer, undo/redo |
| Tab system + split view | ✅ Done | Multi-tab, side-by-side, mirror sync |
| All toolbox operations | ✅ Done | Merge, split, compress, watermark, crop, redact, rotate, extract, images-to-PDF, organise, encrypt/decrypt, form fill, export-to-images |
| File intake (Tauri-native) | ✅ Done | Dialog picker, window drag-drop, recent files |
| Password-protected PDFs | ✅ Done | Unlock dialog, decrypt-once |
| Help mode | ✅ Done | Contextual strip per tool |
| MiniMap wave-scrub | ✅ Done | Canvas strip, dock-magnification, thumbnail-on-settle |
| Light/dark mode | ✅ Done | Independent app + viewer axes |
| Security hardening | ✅ Done | Per-launch token, CSP, decompression bomb cap, streaming ZIP, upload semaphore, dep pinning |
| Design/a11y fixes | ✅ Done | Tab contrast, capability chips, first-run hint, backend-offline label |
| Build (sidecar startup) | ✅ Done | Frozen exe import fix, resilient window-first launcher |
| npm/cargo audits | ✅ Done | 0 vulnerabilities |

---

## A — Deferred items ✅ ALL COMPLETE

These were scoped and deferred during the original build phases. All implemented in waves 1–5.

### A1. Tab-close guard: "unsaved modified PDF" flag ✅
**Implemented:** `modifiedSinceDownload` state in Viewer.tsx — set on any `applyBlob()` call, cleared on download. Close guard checks it alongside `annotations.length > 0`.

### A2. Sync scroll between split panes (UX-32) ✅
**Implemented:** `mirrorSync` pub/sub extended with a `page` field. View menu "Sync navigation" toggle (on by default for mirror groups).

### A3. Organise tool v2 — split divider builder ✅
**Implemented:** Scissors click-zones between pages in Rearrange.tsx. Dividers compute split ranges on Save (→ ZIP). Home "Split" card now opens Organise.

### A4. Annotation re-edit from right rail (UX-08) ✅
**Implemented:** `forceEditAnnotId` state in Viewer.tsx; double-click in AnnotationsListPanel triggers canvas edit mode.

### A5. Arrowhead styles for shape annotations (UX-06) ✅
**Implemented:** `arrowOpen` ShapeSubType (chevron polyline) in AnnotationLayer.tsx + shape sub-toolbar + backend PDF_ANNOT_LE_OPEN_ARROW.

### A6. Dynamic port negotiation (security review #9) ✅
**Implemented:** `bind_free_port()` in Rust, `STRIA_API_PORT` env, `api_port` IPC command. Frontend reads port at startup via `invoke("api_port")`.

### A7. Full viewer-light panel theming ✅
**Implemented:** `viewer-light:` Tailwind variants applied to all panels — ThumbnailSidebar, RightRail, AnnotationsListPanel, DocumentPanel, OutlinePanel, BookmarksPanel, SearchBar, RightPanel, MiniMap.

---

## B — New features (needs your decision)

These are features not in the original plan. For each one I've given a brief rationale, estimated effort, and anything you'd need to decide about scope before I build it.

---

### B1. Continuous scroll / multi-page view ✅
**Implemented:** `ContinuousCanvas.tsx` — virtualized scroll of all pages in one column (±2 RENDER_BUFFER). Only visible pages have live canvases; others render as correctly-sized placeholder divs. `programmaticScrollRef` prevents scroll→page echo loops. The view is toggled via View menu "Continuous Scroll" (Ctrl+Alt+S) or the command palette — it is not the default, so the single-page model remains unchanged. All overlays (annotations, search, diff, redact, crop) are supported in continuous mode. Viewer's `canvasWrapRef` and `canvasAreaRef` are updated on every scroll to the currently-active page so all existing coordinate calculations (QuickActionBar, free-rect drag, focus-annotation scroll) continue working.

---

### B2. Annotation export formats (beyond Markdown) ✅
**Implemented:** CSV (RFC-4180) and JSON export in `annotationReport.ts`. `.pdf` annotation report via backend `/api/annotation-report` using PyMuPDF layout engine. All three formats accessible from the annotation panel footer.

---

### B3. OCR (scanned PDF → searchable) ✅
**Implemented:** Backend `/api/ocr` route using PyMuPDF `page.apply_ocr(language="eng", dpi=300)`. Requires Tesseract installed on system PATH (returns HTTP 503 with install link otherwise). Frontend: Document menu "Make Searchable (OCR)" + command palette entry. OCR'd result replaces working blob.

---

### B4. Digital signatures
**What:** Apply a cryptographic signature to a PDF (not just a freehand ink stroke, but a true digital signature that external validators can verify).  
**Why:** A common request for professional document workflows.  
**How:** `pikepdf` has basic signing support via an external certificate. The UI would be a signature panel (select cert, enter PIN, choose position) similar to the stamp tool.  
**Caveat:** Requires the user to have a certificate (PFX/P12 file). Stria cannot generate one. Self-signed certificates work but aren't trusted by Adobe.  
**Effort:** Medium-high (certificate management UI is the hard part; the signing call is one pikepdf line).  
**Decision needed:** Yes/no. If yes, scope: PFX/P12 import only (no cert generation), with a "use self-signed" option?

---

### B5. Batch operations ✅
**Implemented:** Batch.tsx tab — drop multiple PDFs, pick Compress/Watermark/PDF→Images, configure once, run sequentially, download individually or as a ZIP. Wired into Home tool cards and tab system.

---

### B6. PDF comparison / diff view ✅
**Implemented:** Backend `POST /api/diff` uses PyMuPDF `page.get_text("words")` + Python `difflib.SequenceMatcher` to produce per-page word-level diff regions in fractional page coordinates. Frontend: Document menu "Compare with PDF…" — picks a second file, calls the API, stores results in `diffStore.ts` (module-level Map keyed by UUID), sets red ("remove") highlights on the primary pane, opens a side-by-side pane for the comparison file with `toolHint="diff:UUID"` so the secondary pane loads its green ("add") highlights on mount. "Close Diff View" clears both the highlights and the store entry. Works in both single-page and continuous scroll modes.

---

### B7. Annotation statistics panel ✅
**Implemented:** Collapsible stats block at the top of AnnotationsListPanel — count by type, by status, by author. Computed from live annotations array, no backend needed.

---

### B8. Snippet quick-insert from canvas ✅
**Implemented:** Ctrl+Space in freetext textarea opens an inline snippet picker (mouseDown so blur doesn't fire first); clicking a snippet inserts at cursor position.

---

### B9. Keyboard shortcut reference ✅ (partial)
**Implemented:** A comprehensive "Keyboard shortcuts" section added to SettingsDialog — grouped reference table covering Navigation, Tools, Annotations, and Interface shortcuts. Full re-binding (custom keybindings.json + binding-table-driven keyboard handler) remains a future enhancement given the refactor complexity.

---

### B10. Auto-save / crash recovery ✅
**Implemented:** `startAutoSave()` in autoSave.ts with 2-min interval writes working blob to `%AppData%\Stria\recovery\<tabId>.pdf` via three Rust IPC commands (`write_recovery_file`, `delete_recovery_file`, `list_recovery_files`). TabShell checks for recovery files on startup and shows a restore dialog.

---

### B11. Export annotation report to PDF ✅
**Implemented:** Backend `/api/annotation-report` generates an A4 review PDF (type badge, page/author/status row, wrapped text, thumbnail crop per annotation). Frontend exports via File menu and annotation panel footer. Supplements (does not replace) the existing `.md` export.

---

### B12. Table of contents editor ✅
**Implemented:** Backend `/api/toc/read` and `/api/toc/update` routes using `fitz.get_toc()` / `fitz.set_toc()`. Frontend: `TocEditorDialog.tsx` modal (add/remove/rename/reorder/promote/demote entries, inline title and page editing). Accessible via Document menu "Edit Table of Contents" and command palette.

---

### B13. Authenticode code-signing (security review #4)
**What:** Sign `pdf-tools.exe` and `pdftools-server.exe` with a certificate. Unsigned binaries trigger Windows SmartScreen on first run; signed binaries install silently and can't be tampered with by local malware without invalidating the signature.  
**This is an operational/release step, not a code change.** Requires a purchased EV code-signing certificate (~$100–500/year from DigiCert, Sectigo, etc.). Once you have the `.pfx`, I can wire it into the `tauri.conf.json` `bundle.windows.certificateThumbprint` field.  
**Decision needed:** Do you want to pursue signing? If yes, what certificate provider?

---

## C — Infrastructure / maintenance items ✅ ALL COMPLETE

| # | Item | Status | Notes |
|---|------|--------|-------|
| C1 | Update README to reflect current build | ✅ Done | Full rewrite — prereqs, dev setup, build steps, feature table, architecture diagram |
| C2 | Consolidate PLAN.md, SPEC.md, DOCS.md → archive | ✅ Done | All moved to `archive/` |
| C3 | Expand unit test coverage | ✅ Done | 138 tests (up from ~119) — annotationReport CSV/JSON, mirrorSync page events, autoSave no-ops |
| C4 | Add `bandit` + `semgrep` to security-audit.ps1 | ✅ Done | CLAUDE.md updated; `-CI` flag fails on findings; auto-installs tools |
| C5 | Upgrade PDF.js from 4.6 to 4.10 | ✅ Done | Same major; no API breaks in TextLayer/annotation layer |
| C6 | Backend `requirements.txt` hash-locking | ✅ Done | `requirements-hashed.txt` via `pip-compile --generate-hashes` |

---

## Open questions / decisions still pending from original build

These were logged in `IMPLEMENTATION_NOTES.md` as "Needs Your Decision":

**D1 (tab-close guard scope)** — See A1 above. Should closing a tab with an undownloaded redact/crop result warn? Recommendation: yes.

**D2 (stamp visual style)** — Current stamp renders as a white-fill annotation with coloured bold text + coloured border. The original plan anticipated a filled-colour-background stamp. Recommend: leave as-is (it renders correctly and round-trips cleanly); raise again if you want a different aesthetic.

---

## Suggested first sprint

Based on effort-to-value, here are the items I'd recommend tackling first. Adjust based on your decisions above:

1. **A1** — Tab-close guard (small, closes a genuine data-loss hole)
2. **A2** — Sync scroll (small, completes the split-view story)
3. **B7** — Annotation statistics (small, no risk, good discoverability)
4. **B2** — CSV/JSON annotation export (trivial, multiple people asked for this type of thing)
5. **A6** — Dynamic port (small, eliminates the hardcoded-7342 failure mode)
6. **A4** — Rail double-click re-edit (small quality-of-life)
7. **B8** — Snippet quick-insert (small, completes the snippets feature)
8. **C1, C2** — README + doc cleanup (tiny)

The larger items (**B1** continuous scroll, **B3** OCR, **B5** batch ops, **B6** diff) each warrant their own focused sprint and a scoping decision before starting.
