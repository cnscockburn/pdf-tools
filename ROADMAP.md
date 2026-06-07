# Stria — Master Roadmap

**Last updated:** 2026-06-07  
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

## A — Deferred items (already decided — implement when prioritised)

These were scoped and deferred during the original build phases. No decision required — just prioritisation.

### A1. Tab-close guard: "unsaved modified PDF" flag
**What:** Currently the close guard only fires for uncommitted *annotations*. After a redact, crop, or compress that hasn't been downloaded, closing the tab silently discards that work.  
**Fix:** Add a `modifiedSinceDownload` boolean — set on any `applyBlob()` call (working blob updated), cleared on download. The close-guard checks it alongside `annotations.length > 0`.  
**Effort:** Small (one state flag, two or three wiring points).

### A2. Sync scroll between split panes (UX-32)
**What:** In side-by-side mode, scrolling one pane doesn't move the other. For version-diff use cases, synced navigation is essential.  
**Fix:** Extend the existing `mirrorSync` pub/sub channel (already used for annotation mirroring) with a `page` field. Add a "Sync navigation" toggle to the View menu (on by default when the same document is mirrored; off by default for two different documents).  
**Effort:** Small-medium. The pub/sub plumbing exists; this adds a page-change event.

### A3. Organise tool v2 — split divider builder
**What:** Currently Split is a separate tab tool (enter page ranges as text). Organise v2 merges them: click between thumbnails to place a split boundary; drag pages from another PDF into the grid to merge inline.  
**Fix:** Add a `|` divider dropzone between pages in the Organise grid; render visual boundary markers; compute ranges from boundary positions on Save. Remove the standalone Split tab (fold into Organise).  
**Effort:** Medium. The Organise grid + `dnd-kit` are already in place; the boundary concept is new UI.

### A4. Annotation re-edit from right rail (UX-08)
**What:** Double-clicking a baked annotation in the canvas already re-edits it. Double-clicking it in the right-rail list does nothing.  
**Fix:** Double-click in the annotations list sets `focusAnnotId` (existing) *and* programmatically enters edit mode on the canvas via a new `forceEditAnnotId` state.  
**Effort:** Small.

### A5. Arrowhead styles for shape annotations (UX-06)
**What:** The shape tool produces rect/ellipse/line/arrow but the "arrow" is a single fixed closed-arrow head. The original plan anticipated a style picker (open/closed/double arrowheads, no arrowhead).  
**Fix:** Add `arrowStart` and `arrowEnd` sub-fields to `ShapeAnnot`; extend the sub-mode toolbar with a compact style selector; update the SVG overlay render and backend `annotate()`.  
**Effort:** Medium. Touches type, overlay, sub-toolbar, and backend.

### A6. Dynamic port negotiation (security review #9)
**What:** Port 7342 is hardcoded. If another process occupies it, the sidecar silently fails to start (the frontend shows the offline dot, but users don't know why).  
**Fix:** Rust launcher binds an ephemeral TCP port, stores it in app state, passes it to the sidecar via env var alongside the existing token, and exposes it via a `api_port` command. The frontend reads it at startup via `invoke("api_port")` before the first API call, replacing the hardcoded `7342`.  
**Effort:** Medium-small. Mirrors the existing token handshake exactly.

### A7. Full viewer-light panel theming
**What:** In Viewer-theme=Light, the main canvas surround lightens but the right rail, thumbnail sidebar, and floating panels stay dark.  
**Fix:** Apply `viewer-light:` variants systematically to every panel (AnnotationsListPanel, OutlinePanel, ThumbnailSidebar, RightPanel) using the same dual-axis Tailwind approach.  
**Effort:** Medium (surface area; mechanical once the token approach is applied). Needs a live design review on each panel surface.

---

## B — New features (needs your decision)

These are features not in the original plan. For each one I've given a brief rationale, estimated effort, and anything you'd need to decide about scope before I build it.

---

### B1. Continuous scroll / multi-page view
**What:** Currently the viewer renders one page at a time; you navigate between them. Continuous scroll renders all pages in a vertical column and scrolls through the whole document naturally (like a browser or Acrobat's default).  
**Why:** The single-page model is a known friction point for reading-flow documents. Continuous scroll would eliminate the awkward page-advance gesture and make annotation positioning feel more natural.  
**How:** A `ContinuousCanvas` component renders a virtualised list of pages (only the ±2 visible pages actually have active canvases; others are placeholder divs of the correct height). The scroll position determines the current page number for the minimap and thumbnail indicator.  
**Effort:** High. This is the largest single structural change remaining — it touches the entire Viewer scroll model, the annotation coordinate system, and MiniMap.  
**Decision needed:** Do you want this? If yes, should it be the default view, an optional toggle (View → Continuous Scroll), or replace the current model entirely?

---

### B2. Annotation export formats (beyond Markdown)
**What:** "Export Review Report" currently produces a `.md` file. Researchers sharing annotations with non-Markdown users need more.  
**Options:**
- **CSV/TSV** — flat table (page, type, text, author, status, tags) — trivial to add alongside the existing `.md`
- **JSON** — full structured export (already exists as the in-memory format; trivially serialised)
- **Annotated PDF summary** — render a cover sheet with a table of annotations, then append the source PDF (moderate effort; uses PyMuPDF's layout engine)
**Effort:** CSV + JSON are trivial (add to the frontend `annotationReport.ts`). Annotated PDF is medium.  
**Decision needed:** Which formats? CSV/JSON can be added without a decision loop. The annotated PDF summary is worth a separate discussion.

---

### B3. OCR (scanned PDF → searchable)
**What:** A scanned PDF is a sequence of images. The current viewer can display it but cannot search it, and text selection produces nothing. OCR would embed a text layer, making the document searchable in Stria and in external viewers.  
**Why:** Several user personas (researchers, analysts) deal with scanned research papers and legacy documents.  
**How:** Backend route `/ocr` calling Tesseract via the `pytesseract` Python wrapper (Tesseract must be bundled or pre-installed). PyMuPDF's `page.apply_ocr()` can produce a searchable PDF in one call when Tesseract is available.  
**Caveat:** Bundling Tesseract adds ~30 MB to the installer. Language packs add more (English is ~5 MB; CJK is 100 MB+). Alternatively, require Tesseract to be installed separately.  
**Effort:** Medium (backend route + frontend panel). Bundling complexity is the main cost.  
**Decision needed:** Yes/no on OCR. If yes: bundle Tesseract or require external install? English only or multi-language?

---

### B4. Digital signatures
**What:** Apply a cryptographic signature to a PDF (not just a freehand ink stroke, but a true digital signature that external validators can verify).  
**Why:** A common request for professional document workflows.  
**How:** `pikepdf` has basic signing support via an external certificate. The UI would be a signature panel (select cert, enter PIN, choose position) similar to the stamp tool.  
**Caveat:** Requires the user to have a certificate (PFX/P12 file). Stria cannot generate one. Self-signed certificates work but aren't trusted by Adobe.  
**Effort:** Medium-high (certificate management UI is the hard part; the signing call is one pikepdf line).  
**Decision needed:** Yes/no. If yes, scope: PFX/P12 import only (no cert generation), with a "use self-signed" option?

---

### B5. Batch operations
**What:** Apply a single operation (compress, watermark, redact a specific phrase) to multiple PDFs at once from the Home page.  
**Why:** Power users who process document sets (10–100 PDFs) repeatedly want this.  
**How:** A new "Batch" tab on Home: drop multiple PDFs → pick an operation → configure it once → apply to all → download as a ZIP.  
**Effort:** Medium. The backend per-operation routes already exist; this is a UI + response-aggregation layer.  
**Decision needed:** Yes/no. If yes, which operations in scope for v1? (Compress, watermark, and page-delete are the natural first three.)

---

### B6. PDF comparison / diff view
**What:** Open two PDFs side-by-side and visually highlight what changed between them — added/removed text, moved images, page insertions.  
**Why:** Reviewers comparing document versions (contracts, proposals) currently have to do this manually or in Acrobat Pro.  
**How:** Backend route using PyMuPDF's `page.get_text("dict")` to extract structured text from both documents, then diff the word stream. The diff is overlaid as highlights on the split-view panes (green = added, red = removed).  
**Effort:** High. The diff algorithm, coordinate mapping, and overlay rendering are all non-trivial.  
**Decision needed:** Yes/no. This is a significant, distinctive feature but genuinely hard to do well.

---

### B7. Annotation statistics panel
**What:** A summary view in the right rail showing: annotation count by type (N highlights, N notes, N stamps…), by author (if multi-author), by status (N open, N resolved), and a per-page distribution bar chart.  
**Why:** Useful for tracking review completeness on a long document.  
**How:** Derived entirely from the in-memory `annotations` + `bakedAnnotations` arrays; no backend needed. A small collapsible summary at the top of the annotations panel.  
**Effort:** Small. This is a pure frontend computation and rendering exercise.  
**Decision needed:** Yes/no. Low risk, reasonable discoverability value.

---

### B8. Snippet quick-insert from canvas
**What:** Snippets (saved text fragments) are currently in Settings and accessible via the freetext annotation editor. A palette shortcut (e.g. right-click in freetext mode → insert snippet) would make the workflow faster.  
**How:** A small `SnippetPicker` popover triggered by right-click in freetext mode, or a `Ctrl+Space` shortcut in the freetext edit textarea.  
**Effort:** Small.  
**Decision needed:** Yes/no. Niche but low-effort.

---

### B9. Keyboard shortcut customisation
**What:** Currently all shortcuts are hardcoded. Users who have muscle memory from other tools (or non-QWERTY layouts) can't remap them.  
**How:** A `keybindings.json` in the app data dir; a "Keyboard shortcuts" sub-section in Settings showing all current bindings with inline edit fields; the keyboard handler reads from settings at startup.  
**Effort:** Medium-high. The keyboard handler is a large useEffect in Viewer.tsx; refactoring it to be binding-table-driven is mechanical but verbose.  
**Decision needed:** Yes/no. This is a quality-of-life feature for keyboard-native users.

---

### B10. Auto-save / crash recovery
**What:** Periodically write the working blob + pending annotations to a recovery file in `%AppData%\Stria\recovery\`. On startup, if a recovery file exists, offer to restore it.  
**Why:** If the app or the sidecar crashes mid-session (e.g. on a very large PDF), work is lost.  
**How:** A `useEffect` interval (every 2 minutes) that serialises the state to a temp file via `write_file` IPC. On startup, TabShell checks for recovery files and prompts.  
**Effort:** Medium. The serialisation is straightforward; the recovery UI prompt needs care.  
**Decision needed:** Yes/no. High user-value insurance feature.

---

### B11. Export annotation report to PDF
**What:** A printable one-page-per-annotation PDF report: each entry shows the annotation type, page, author, text, and a thumbnail crop of the annotated area.  
**Why:** The `.md` export is useful for developers; a formatted PDF report is more appropriate for sharing with non-technical reviewers.  
**How:** Backend route using PyMuPDF to render each annotated page region into a small thumbnail, then lay out a formatted summary page per annotation.  
**Effort:** Medium. PyMuPDF's layout primitives can do this; the main cost is the template design.  
**Decision needed:** Yes/no (and whether this replaces or supplements the existing `.md` export).

---

### B12. Table of contents editor
**What:** View and edit the PDF's internal outline (table of contents). Add, remove, rename, and reorder entries; set page targets.  
**Why:** Power users preparing final documents often need to fix TOC entries that don't match the actual headings.  
**How:** Backend route exposing `fitz.Document.outline` as a tree; frontend tree editor in the Document panel. Save back via `fitz.set_toc()`.  
**Effort:** Medium.  
**Decision needed:** Yes/no.

---

### B13. Authenticode code-signing (security review #4)
**What:** Sign `pdf-tools.exe` and `pdftools-server.exe` with a certificate. Unsigned binaries trigger Windows SmartScreen on first run; signed binaries install silently and can't be tampered with by local malware without invalidating the signature.  
**This is an operational/release step, not a code change.** Requires a purchased EV code-signing certificate (~$100–500/year from DigiCert, Sectigo, etc.). Once you have the `.pfx`, I can wire it into the `tauri.conf.json` `bundle.windows.certificateThumbprint` field.  
**Decision needed:** Do you want to pursue signing? If yes, what certificate provider?

---

## C — Infrastructure / maintenance items (no decision needed, implement at will)

These are maintenance improvements that have no user-facing risk:

| # | Item | Effort | Notes |
|---|------|--------|-------|
| C1 | Update README to reflect current build (Rust required, tauri:build command) | Tiny | README still references some placeholder content |
| C2 | Consolidate PLAN.md, SPEC.md, DOCS.md → archive or remove | Tiny | Superseded by this doc; clutters root |
| C3 | Expand unit test coverage for Viewer state logic (annotation add/undo/bake) | Medium | Currently tested via smoke_test.py; pure-TS unit tests would be faster |
| C4 | Add a `bandit` + `semgrep` pre-commit hook via `scripts/security-audit.ps1` | Small | Currently manual |
| C5 | Upgrade PDF.js from 4.6 to current (4.9+) | Small-medium | Check for API breaks in TextLayer/annotation layer; likely none |
| C6 | Backend `requirements.txt` hash-locking (`pip-compile --generate-hashes`) | Small | Current file is pinned versions without hashes; hashes prevent tampered PyPI packages |

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
