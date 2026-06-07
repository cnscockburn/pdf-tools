# Stria — Implementation Plan

> Reference doc for all ongoing implementation work. Update this as phases complete.

---

## Product constraints (immutable)

- **Local only, no cloud.** Everything runs in the bundled Tauri + PyInstaller sidecar. No network calls leave the machine.
- **Keep the name Stria.**
- **Viewer is the hub.** The app does not have separate standalone pages for each tool. Tools live in the Viewer's RightPanel (already implemented) and are opened via menus, home-page cards, or keyboard shortcuts.
- **New tab = Home page.** When tabs land, each tab can be a viewer document, the Home page, the Merge flow, etc.

---

## Architecture snapshot

```
src/
  App.tsx                    ← router; eventually replaced by TabShell
  pages/
    Home.tsx                 ← tool cards; navigate to /viewer with { tool: "compress" } etc.
    Viewer.tsx               ← ~1534 lines; THE hub. Canvas, overlays, RightPanel, RightRail
    Merge.tsx                ← multi-file merge; standalone for now, becomes a tab later
    Rearrange.tsx            ← drag-reorder pages; standalone for now
    ImagesToPDF.tsx          ← images → PDF; standalone for now
  components/
    MenuBar.tsx              ← [NEW Phase 1] dropdown menu bar in Viewer top bar
    RightPanel.tsx           ← side panel with: Compress, Watermark, Split, Extract,
                               RotateDelete, Security, PdfToImages, Snippets
    RightRail.tsx            ← persistent rail: Annotations | Outline | Bookmarks
    AnnotationLayer.tsx      ← canvas overlay: create/edit/delete all annotation types
    ThumbnailSidebar.tsx     ← left sidebar with page thumbnails + annotation dot badges
    TextLayer.tsx            ← PDF.js text layer for text selection / search
    QuickActionBar.tsx       ← floating bar on text selection
    SearchBar.tsx            ← Ctrl+F search bar
    CommandPalette.tsx       ← Ctrl+Shift+P command palette
    KeyboardCheatSheet.tsx   ← ? cheat sheet modal
    AnnotationsListPanel.tsx ← list of all annotations (in RightRail)
    OutlinePanel.tsx         ← PDF TOC (in RightRail)
    BookmarksPanel.tsx       ← user bookmarks (in RightRail)
    ContinuousCanvas.tsx     ← [PLANNED Phase 0.3] multi-page continuous scroll view
  lib/
    storage.ts               ← useSettings, useBookmarks (localStorage)
    utils.ts                 ← cn(), downloadBlob(), parsePageRanges()
    annotationReport.ts      ← Markdown export
    undoStack.ts             ← [PLANNED Phase 2.1] generic undo/redo hook
    useDocumentTabs.ts       ← [PLANNED Phase 4] tab state management
  api/
    client.ts                ← all fetch wrappers for backend API
backend/
  main.py                    ← FastAPI app, CORSMiddleware, all routers
  routers/
    annotate.py, compress.py, convert.py, crop.py, export.py,
    merge.py, pages.py, redact.py, security.py, split.py, watermark.py
  services/
    pdf_engine.py            ← PyMuPDF operations
    pikepdf_engine.py        ← pikepdf encrypt/decrypt
```

### Key invariants

- `LocalAnnot[]` is the source of truth for in-session annotations. Saved to PDF on mode-switch via `annotatePDF()`.
- `workingBlob` is the current modified PDF blob. Every backend operation takes `workingFile` (= blob or original file) and returns a new blob → `applyBlob()`.
- `RightPanel` panels replace the right rail when open (`panelTool !== null`).
- All document-level operations (compress, watermark, split, etc.) are **already implemented** in `RightPanel.tsx` and exposed via `togglePanel(tool)` + Command Palette. Phase 1 makes them discoverable via a proper menu bar.

---

## Phase log

| Phase | Status | Summary |
|---|---|---|
| 0.2 | ✅ | Keyboard shortcuts G (shape) + P (stamp) |
| 0.1 | ✅ | Stamp: CSS container-query font sizing + auto-sized bounding box on creation |
| 0.3 scroll fix | ✅ | Page-flip-on-overscroll only fires when page content actually overflows viewport |
| 1.1 | ✅ | MenuBar component + top-bar restructure: File / Document / View dropdowns |
| 1.2 | ✅ | Home page tool cards pass `tool` hint → Viewer auto-activates panel/mode |
| 2.2 | ✅ | Hide/show annotations toggle (Shift+H, View menu, `annotationsVisible` state) |
| — | planned | 0.3 true continuous scroll (ContinuousCanvas component) |
| — | planned | 2.1 Multi-level undo/redo (undoStack.ts) |
| — | planned | 3.1 Image attachments persisted to PDF |
| — | planned | 4 Tabbed documents (TabShell + useDocumentTabs) |
| — | planned | 5 Split view (ViewPane extraction) |
| — | planned | 6.1 Mini-map |
| — | planned | 6.2 Connection annotations |

---

## Toolbar contract (post Phase 1)

### Top bar (menu bar row)
```
[Stria logo + Home] [filename (editable)] | File ▾ | Document ▾ | View ▾ | → | [author] [backend dot] [Download]
```

**File menu:** Open, Save (Ctrl+S), Export to Images, Export Review Report  
**Document menu:** Annotate (A), Redact (R), Crop (C), — , Compress, Watermark, Encrypt/Decrypt, — , Split, Extract, Rotate/Delete, Rearrange, Merge, — , Export to Images  
**View menu:** Zoom In/Out/Fit, — , Show Annotations (Shift+H), Show Thumbnails, — , Annotations/TOC/Bookmarks panels

### Bottom toolbar (annotation + navigation)
```
[Annotate toggle (A)] | [Zoom − % +] [Fit] | ◂ n/N ▸ | [🔍 Ctrl+F] | [⌘P] [?]
```

When in **Annotate mode**, the annotation context bar appears above the bottom toolbar (unchanged).  
When in **Redact / Crop mode** (entered via Document menu or R/C keys), those context bars appear above the bottom toolbar (unchanged).

---

## Tool surface map (post Phase 1)

| User intent | Entry point | Mechanism |
|---|---|---|
| Open a file | Home drop zone / File > Open | navigate to /viewer, or `openFilePicker()` |
| Highlight text | H key / Annotate toolbar | `canvasMode = "annotate"`, sub-mode "highlight" |
| Add note / comment | A key / Annotate toolbar | sub-mode "note" |
| Draw shape | G key / Annotate toolbar | sub-mode "shape" |
| Place stamp | P key / Annotate toolbar | sub-mode "stamp" |
| Redact content | R key / Document menu | `canvasMode = "redact"` |
| Crop pages | C key / Document menu | `canvasMode = "crop"` |
| Compress PDF | Document menu / Ctrl+Shift+P | `togglePanel("compress")` |
| Watermark | Document menu / Ctrl+Shift+P | `togglePanel("watermark")` |
| Encrypt/Decrypt | Document menu / Ctrl+Shift+P | `togglePanel("security")` |
| Split / Extract / Rotate-Delete | Document menu / Ctrl+Shift+P | `togglePanel(tool)` |
| Rearrange pages | Document menu | `navigate("/rearrange", { state: { file } })` |
| Merge PDFs | Document menu / Home card | `navigate("/merge")` |
| Export to images | Document menu / File menu | `togglePanel("pdf-to-images")` |
| Search | Ctrl+F / bottom bar | `setSearchOpen(true)` |
| All commands | Ctrl+Shift+P | CommandPalette |

---

## Home page wiring (Phase 1.2)

Cards that need a file open the Viewer with a `tool` hint in router state:
- "Split" → `/viewer` + `{ tool: "split" }` (user picks file in Viewer's empty-state drop zone)
- "Compress" → `/viewer` + `{ tool: "compress" }`
- "Redact" → `/viewer` + `{ tool: "redact" }` (enters redact mode after file load)
- "Organize" → `/rearrange` (stays standalone until tabs)
- "Merge" → `/merge` (stays standalone until tabs)
- "Convert" → `/images-to-pdf` (stays standalone, image input not PDF)

Viewer reads `location.state.tool` on mount → sets `pendingTool`. When `pdf` becomes non-null → `activatePendingTool()`.

---

## Stamp sizing spec (Phase 0.1)

Font size: CSS container query `55cqh` on StampDiv (no JS ResizeObserver).  
Bounding box on creation:
```
h    = 0.06   (fraction of page height)
charW = 0.028  (empirical fraction of page width per character, bold tracking-widest)
w    = max(0.14, label.length * charW + 0.04)
```

User can resize via drag handles after placement.

---

## Planned architecture changes (phases 4-5)

### Phase 4: Tabbed documents

Replace `App.tsx` router with `TabShell`. Each tab has a `type`: `"home" | "viewer" | "merge" | "images-to-pdf"`. Opening a new tab shows the Home page. Viewer tab state is stored in `useDocumentTabs` hook. PDFDocumentProxy is cached (last 3 tabs) to avoid re-parse on tab switch.

New files: `src/components/TabShell.tsx`, `src/components/TabBar.tsx`, `src/lib/useDocumentTabs.ts`

### Phase 5: Split view (subsumes Compare)

Split view lives inside a viewer tab. State: `splitMode: "single" | "split"`, `panes: [PaneState, PaneState?]`, `focusedPane: 0 | 1`, `syncScroll: boolean`.

Extract canvas + overlays section of Viewer.tsx into `src/components/ViewPane.tsx`. When split is active, render two ViewPane instances side by side. Right rail and thumbnails respond to focused pane. No separate Compare route — split view with sync scroll is the same feature.

---

## Key decisions

1. **No separate toolbox pages.** All tools are in RightPanel, accessed via Document menu or Command Palette. Phase A from the original plan is superseded.
2. **Compare is split view.** No separate /compare route. One feature: split view with optional sync scroll.
3. **Image attachments must persist to PDF.** Using PyMuPDF file attachment annotations linked to parent annotation via `subject` field.
4. **Continuous scroll is a separate mode.** Paged view (current, fixed) is default. True continuous scroll (ContinuousCanvas with virtualized page rendering + IntersectionObserver) is Phase 0.3.
5. **Tabs before split view.** Split view requires the ViewPane extraction which naturally follows the tab refactor.
