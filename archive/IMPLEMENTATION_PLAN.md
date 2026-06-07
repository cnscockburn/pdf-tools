# Stria PDF Toolkit — Implementation Plan

**Version:** 2026-06-06  
**Status:** Active working reference  
**Derived from:** Full manual test protocol review (sections A–X, UX-01–10, FC-01–12), architectural analysis of source code, and finalised user decisions.

---

## 1. Locked Decisions

All questions resolved. These are binding.

| Topic | Decision |
|---|---|
| Light/dark mode scope | Independently toggleable — viewer and app surfaces have separate toggles |
| Undo: note + initial text | One atomic undo step — placement and first text commit together |
| Empty note on click-away | Pending-note pattern: cancel on click-away with no text, never commit silently |
| QuickActionBar mode gate | Remove gate — show QuickActionBar on any text selection in any mode |
| Ink width keys 1–9 | Weighted scale: 1, 1.5, 2, 3, 4, 6, 8, 12, 20 px |
| Compress behaviour | Two-mode toggle: lossless (text-safe) vs. flatten+compress (rasterise) |
| Snippets | Phase 4 — storage schema already exists in `storage.ts`; only Settings UI + CommandPalette display needed |
| UI scale ↔ PDF zoom | Compensate: when UI scale changes, PDF zoom adjusts so apparent page size is constant |
| Download with uncommitted annotations | Modal: "commit first or download without them" (no silent download) |
| Split pane active indicator | Status label ("Active / Inactive") in each pane's header |
| Annotation round-trip | Phase 1: read-only display via PDF.js. Phase 2 (future): re-editable via sidecar |
| Outline + Bookmarks merge | Single tab — both sections when both exist; Outline section hidden if PDF has none |
| MiniMap wave-scrub | Thin strip, dock-magnification wave on hover, single thumbnail on settle, drag defers nav to mouse-up |
| Help mode | Hover-triggered tooltips (A) + contextual description panel on click (C), together |
| Annotation collaboration | No — local only, always |
| Viewer page rotation | No standalone button — goes into unified Organise tool |
| Annotation JSON export | No — markdown report is sufficient |
| Screen reader audit | Deferred to beta |
| Memory management | Deferred to backlog |

---

## 2. Technical Root Cause Analysis

Before the issue register, documenting root causes found in the source — these are not guesses, they are confirmed from reading the code.

### 2.1 E-08: Annotation Download Pipeline

**Four separate bugs share two root causes.**

#### Root Cause A — `annotationMode: 0` disables PDF.js annotation rendering

`src/pages/Viewer.tsx` line 367:
```typescript
const task = page.render({
  canvasContext: ctx,
  viewport: vp,
  annotationMode: 0,  // "Always 0: PDF.js annotation widgets are suppressed"
});
```

`annotationMode: 0` is `AnnotationMode.DISABLE` — PDF.js will not paint any embedded PDF annotations into the canvas. This was intentional: we render our own overlay. But it causes the round-trip failure:

- When a freshly downloaded PDF (with baked annotations) is re-opened, `annotations` and `bakedAnnotations` are both empty (fresh session).
- Our overlay renders nothing.
- PDF.js renders nothing (annotationMode: 0).
- The user sees a blank PDF with no annotations. ← **E-08d**

Shapes and ink annotations (`page.add_ink_annot`, `page.add_rect_annot`, etc.) are being written correctly to the PDF, but they too are invisible on re-open because of annotationMode: 0. ← **E-08a**

**Fix:** Set `annotationMode` dynamically:
```typescript
annotationMode: (bakedAnnotations.length === 0 && annotations.length === 0) ? 2 : 0,
```
When there are no JS-side overlays (re-opened PDF), use `annotationMode: 2` (`ENABLE`) so PDF.js renders embedded annotations. When we have overlays active (annotating session), keep 0 to avoid double-rendering.

A re-render must be triggered when `bakedAnnotations` changes from non-empty to empty (e.g. switching to view mode after baking). Add `bakedAnnotations.length` to the `renderPage` dependency list.

#### Root Cause B — Multi-layer saves only send current session annotations

`src/pages/Viewer.tsx` line 927:
```typescript
const blob = await annotatePDF(workingFile, toApiAnnotations(annotations));
```

`annotations` is only the current session's new annotations. `bakedAnnotations` (previously committed) is not included. The backend's `annotate()` function uses **replace semantics** — it clears ALL existing annotations from the PDF first, then writes the provided list. So:

- Session 1: bake [A, B] → `workingBlob₁` has A, B embedded, JS `bakedAnnotations = [A, B]`
- Session 2: new annotation [C]. Click Done → calls backend with `[C]` only
- Backend: clears A, B from `workingBlob₁`, writes [C] → `workingBlob₂` only has C ← **E-08c**

**Fix:**
```typescript
const blob = await annotatePDF(workingFile, toApiAnnotations([...bakedAnnotations, ...annotations]));
```
The replace-semantics design is correct and idempotent — just pass the full authoritative set.

#### Root Cause C — Stamp appearance stream not regenerating after border-colour injection

`backend/services/pdf_engine.py` stamp handler uses `add_freetext_annot` then writes the border colour via `xref_set_key(a.xref, "C", ...)` after calling `a.update()`. However, PyMuPDF generates the AP (appearance stream) dictionary during `add_freetext_annot`, not during `a.update()`. Manually setting the `C` key changes the annotation dict entry but does not trigger AP stream regeneration. PDF viewers render annotations using the AP stream, so the border colour does not appear in the rendered output. External viewers show the fallback: a red rectangle. ← **E-08b**

**Fix options:**
1. Call `a.update()` once more after `xref_set_key`, forcing AP regeneration (test with PyMuPDF version).
2. Replace `add_freetext_annot` for stamps with `page.draw_rect()` + `page.insert_text()` — permanent page content (not an annotation), guaranteed to render in all viewers, but loses annotation semantics.
3. Use PyMuPDF's `Stamp` annotation subtype via `page.add_stamp_annot(rect, stamp=N)` for standard stamps, and a custom FreeText for custom labels.

Option 2 is safest for Phase 1. Option 3 is better for Phase 2 when custom stamps land.

#### Root Cause D — Developer error message in backend-offline path

`src/pages/Viewer.tsx` line 922:
```typescript
setAnnotateError("Backend not running — start it: cd backend && uvicorn main:app --port 7342");
```
This is a separate instance from the tooltip copy that was already fixed. Same problem, different location. Needs the same user-facing copy: "Annotation service unavailable — backend is not running."

---

### 2.2 U-01: Tab Close Guard Architecture

`closeTab()` in `TabShell.tsx` has no access to Viewer annotation state — the Viewer is a child component that holds its own state. The guard cannot be implemented by reading props or context; the Viewer must register intent with TabShell.

**Fix:** Add a `registerCloseGuard` / `unregisterCloseGuard` pair to the tab context:
```typescript
// In TabContext:
registerCloseGuard: (tabId: string, guard: () => { isDirty: boolean; message?: string }) => void;
unregisterCloseGuard: (tabId: string) => void;
```
Viewer calls `registerCloseGuard(tabId, () => ({ isDirty: annotations.length > 0, message: "You have uncommitted annotations." }))` on mount and `unregisterCloseGuard` on unmount.

`closeTab()` checks the registered guard before removing the tab. If `isDirty`, it sets a `pendingClose` state that renders a confirmation dialog in TabShell (not inside the Viewer).

The same mechanism covers the split-close guard (N-01a).

---

### 2.3 O-03: Reduced Motion Not Auto-Detecting

`src/lib/storage.ts` line 115:
```typescript
reduceMotion: parsed.reduceMotion ?? d.reduceMotion,
```
`parsed.reduceMotion` is `false` when the user has not explicitly enabled reduce-motion but `false` was stored (on any previous launch). The `??` operator treats `false` as a valid value, so the stored `false` persists even when the OS preference later changes to `true`.

**Fix:** Never store `reduceMotion` in localStorage at all. Remove it from the persistence layer. Read from OS on every `loadSettings()` call, let the Settings toggle override it only for the current session (stored as a session variable in context, not localStorage). Alternatively, on each `loadSettings()` call, re-read the OS preference and override any stored `false` with the live OS value:
```typescript
reduceMotion: parsed.reduceMotion === true ? true : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
```
This means: OS preference wins unless the user has explicitly enabled it via Settings (stored `true`). Disabling it via Settings is ephemeral.

---

### 2.4 W-03: Settings Focus Trap

The Settings dialog uses `role="dialog"` + `aria-modal="true"` but has no programmatic focus trap. After one Tab cycle, focus escapes back to the background. Tab focus must be captured and cycled within the dialog's focusable children using either:
- A `useFocusTrap` hook that intercepts Tab/Shift+Tab when focus is inside the dialog
- Or the `inert` attribute on the background content (`<div inert>` on the rest of the app when a modal is open)

The `inert` attribute approach is cleaner and handles focus and pointer events without JS intervention. It is now supported in all current browsers. When a modal opens, apply `inert` to the `<div id="root">` children outside the modal.

---

### 2.5 Snippets Already in Storage Schema

`src/lib/storage.ts` line 75 shows `snippets: []` is already in the `Settings` type and default. The data layer exists. What's missing is the Settings UI for managing snippets and the CommandPalette integration to display them. This is lower complexity than initially assumed — the schema work is done.

---

### 2.6 `?` Key — Likely Context-Dependent Failure

The handler at `Viewer.tsx:670` is correctly wired. The condition `tag === "INPUT" || tag === "TEXTAREA") return` will suppress it when any input has focus. Most likely cause: the user had an input focused (page number field, search bar) when testing. Mark as "needs verification rather than a code fix" — if reproducible without any input focused, investigate further.

---

## 3. Bug Register

### P0 — Data Loss / Blocks Core Function

**[P0-01] E-08c: Multi-layer annotation saves overwrite previous baked annotations**
- Location: `src/pages/Viewer.tsx:927`
- Root cause: RCA 2.1 Root Cause B
- Fix: Pass `[...bakedAnnotations, ...annotations]` to `annotatePDF()`

**[P0-02] E-08d: Baked annotations invisible on PDF re-open**
- Location: `src/pages/Viewer.tsx:367`
- Root cause: RCA 2.1 Root Cause A (`annotationMode: 0`)
- Fix: Dynamic annotationMode based on overlay presence

**[P0-03] N-01b: Closing a split pane destroys surviving pane's annotations**
- Location: `src/components/TabShell.tsx:closeTab()`
- When the side-by-side tab is closed, the mirror group is cleared and the primary tab's annotations may be reset if the pane re-initialises.

### P1 — Functional Breakage

**[P1-01] E-08a: Ink and shape annotations invisible in downloaded PDF**
- Root cause: annotationMode: 0 (RCA 2.1 Root Cause A). Annotations ARE written; they just don't render on re-open.
- Fix: same as P0-02

**[P1-02] E-08b: Stamps render as red boxes in downloaded PDF**
- Root cause: RCA 2.1 Root Cause C (AP stream not regenerated after border-colour injection)
- Fix: Replace stamp with page content drawing (Phase 1) or fix `a.update()` call sequence

**[P1-03] U-01: Tab close does not guard uncommitted annotations**
- Location: `src/components/TabShell.tsx:closeTab()`
- Root cause: RCA 2.2 — no cross-boundary guard mechanism
- Fix: `registerCloseGuard` context API

**[P1-04] W-03: Settings modal focus trap broken**
- Location: `src/components/SettingsDialog.tsx`
- Root cause: RCA 2.4 — no focus containment
- Fix: `inert` attribute on background, or `useFocusTrap` hook

**[P1-05] G-01: Text selection and QuickActionBar gated behind Annotate mode**
- Decision: Show QuickActionBar on any text selection in any mode
- Fix: Enable TextLayer in View mode; move QuickActionBar trigger from Annotate-only to universal

**[P1-06] E-01: Empty note committed on accidental click**
- Decision: Pending-note pattern — cancel on click-away with no text
- Fix: `pendingNote` state in AnnotationLayer; confirm on first non-empty blur

**[P1-07] F-01: Note placement and initial text are separate undo steps**
- Decision: Atomic — one Ctrl+Z removes both
- Fix: Push one combined `{type: "create", annotation: {...withText}}` to undo stack after note text is confirmed

**[P1-08] E-02a: Highlight colour popup persists when pressing H again**
- Fix: Dismiss the popup on any annotation sub-mode change

**[P1-09] E-02b: Text annotation dialog opens when annotation tool already selected**
- Fix: Only open mode-selection dialog if canvasMode is "view"; suppress in annotate sub-modes

**[P1-10] T-01: Ctrl+S with no changes is silent**
- Fix: Show brief non-blocking toast ("No changes to download — annotate and commit to create a modified version")

**[P1-11] T-03: Ctrl+S with uncommitted annotations downloads without warning**
- Decision: Modal — "commit first or download without them"
- Fix: Check `annotations.length > 0` before download; if true, show modal with two actions
- **Additional scope:** Also review the `pendingNav` condition at Viewer.tsx:2049 (`workingBlob || annotations.length > 0`). This gates the "unsaved changes" navigation guard. Ensure the logic correctly distinguishes: (a) has baked changes to download (`workingBlob` is set), vs (b) has uncommitted annotations that haven't been baked yet (`annotations.length > 0`). Both are "dirty" but require different modal language — (a) "Download before leaving?" and (b) "Commit or discard annotations?"

**[P1-12] D-07: File rename does not mark PDF as modified**
- Fix: When filename changes via inline edit, if `workingBlob` is null (no backend operations yet), create a blob from the original `file` and set it as `workingBlob`. This makes `workingBlob` truthy, enabling the download button and Ctrl+S. If `workingBlob` is already set (backend operations done), rename only updates the filename string — the blob already exists and download is already enabled.
- **Edge case:** After rename only (no other changes), the downloaded "modified" PDF is byte-for-byte identical to the original but with a new filename. This is correct and intentional — the rename is the only change.

**[P1-13] F-03: Multi-select delete skips first selected annotation**
- Fix: Trace multi-select deletion logic in AnnotationLayer; verify the selection Set includes the first item

**[P1-14] F-04: No bulk status change for multi-selected annotations**
- Fix: Render a bulk-action bar when `selectedAnnotIds.size > 1`; add status cycle action

**[P1-15] F-09 / O-08: Custom colour labels don't propagate to right rail**
- Fix: Right rail AnnotationsListPanel reads labels from `settings.colorLabels` rather than hardcoded strings

**[P1-16] E-05: Freetext tag input field dismisses editor on click**
- Fix: Focus management in the freetext editor popup — `e.stopPropagation()` / `onMouseDown` prevention on the tag input

**[P1-17] E-07: Ellipse previews as rectangle during draw**
- Fix: Shape preview in InteractivePageCanvas should render `<ellipse>` SVG element when `shapeSubType === "ellipse"`

**[P1-18] H-03: No within-page indicator of current search match**
- Fix: The `currentSearchResult` (already tracked in state) should apply a distinct highlight class vs other on-page matches — different colour or pulsing border

**[P1-19] J-04: Outline parent entry collapses on first click**
- Fix: `handleClick()` in OutlinePanel — separate navigation from expand/collapse; navigation always fires, collapse only fires if `hasChildren && open` on second click

**[P1-20] L-01: `?` key may not open cheat sheet in all contexts**
- Status: Needs verification — may be a focus-related false positive. Code logic at Viewer.tsx:670 is correct (`e.key === "?" && !e.ctrlKey && !e.metaKey` → `setCheatSheetOpen`).
- **Mandatory verification step at start of Phase 2:** With a PDF open and no input focused, press Shift+/ (?) and confirm the cheat sheet opens. If it does not: (a) check whether the canvas element or its parent is consuming the event before it bubbles to `document`; (b) check whether `cheatSheetOpen` state is updating but `KeyboardCheatSheet` has a render condition that prevents display. Only investigate further if this verification step fails.

**[P1-21] L-03: Command palette shortcut shows Mac label in status bar**
- Fix: Find the status bar shortcut label for command palette and replace Mac-specific symbol with `Ctrl+Shift+P`

**[P1-22] O: Ctrl+, does not open settings**
- Fix: Register `Ctrl+,` in the global keyboard handler in TabShell or Viewer; call `openSettings()`

**[P1-23] O: Two settings gear icons visible in Viewer**
- Fix: Remove gear icon from Viewer menu bar. Add "Settings…" menu item under File menu in the Viewer's `MenuBar` definition.

**[P1-24] N-01a: No unsaved changes guard when closing split view**
- Fix: Covered by the `registerCloseGuard` mechanism (P1-03 fix applies to split pane tabs too)

**[P1-25] N-05a: Mirror sync shortcut in View menu non-functional**
- Fix: Verify the keyboard shortcut registered for mirror mode matches the label in the View menu

**[P1-26] N-05b: Right pane annotations don't appear in left pane until canvas refresh**
- Root cause: Mirror sync broadcasts via `publish(mirrorGroupId, ...)` but the subscriber may not trigger a re-render. Check `mirrorSync.ts` subscribe/publish timing and the React state update path.

**[P1-27] O-03: OS prefers-reduced-motion not auto-applying on first run**
- Root cause: RCA 2.3
- Fix: Change `reduceMotion` persistence strategy — OS preference wins unless explicitly overridden to `true`

**[P1-28] G-03: QuickActionBar overlaps selection and can appear above menu bar**
- Fix: Position calculation must constrain to viewport; clamp top edge below menu bar height, clamp bottom edge above toolbar

**[P1-29] I-01: Thumbnail toggle button partially obscured by canvas**
- Fix: Adjust z-index or position of the toggle button; it uses `absolute -right-3` which may be clipped. The `overflow-hidden` added in the recent polish pass to ThumbnailSidebar may be the cause — remove `overflow-hidden` from the sidebar container and use a clip-path or ensure the toggle is rendered outside the clipped container.

**[P1-30] D-02b: Page number input spinner arrows unstyled**
- Fix: Style or suppress the native `<input type="number">` spinners using CSS `::-webkit-inner-spin-button` + appearance: textfield

**[P1-31] E-08d-dev: Developer error message in annotation save path**
- Location: `src/pages/Viewer.tsx:922`
- Fix: Replace dev command with user-facing message

**[P1-32] ThumbnailSidebar toggle button clipped by `overflow-hidden` (regression)**
- Location: `src/components/ThumbnailSidebar.tsx`
- Root cause: The recent polish pass added `overflow-hidden` to fix `transition-[width]`. The collapse toggle button uses `absolute -right-3 top-3`, which extends outside the sidebar's border box and is now clipped by `overflow-hidden`.
- Fix: Move the toggle button outside the sidebar container — render it as a sibling in the parent flex layout rather than an absolute child of the sidebar. This keeps the button visible at all collapse states without needing `overflow: visible`.

**[P1-33] Onboard hint bar says "Ctrl+K" but the palette shortcut is "Ctrl+Shift+P" (regression from recent commit)**
- Location: `src/pages/Viewer.tsx` — first-run hint bar text
- Root cause: The onboard commit changed the hint to "Ctrl+K opens the command palette" but the actual registered shortcut is `Ctrl+Shift+P` (Viewer.tsx:683). `Ctrl+K` is not bound. The hint is actively incorrect.
- Fix: Change hint text to `Ctrl+Shift+P`. Separately, decide whether to also bind `Ctrl+K` as an alias — it's a widely expected palette shortcut. If adding the alias, register it alongside `Ctrl+Shift+P` in the keyboard handler.
- **Priority: Fix before any other work** — currently shipping wrong information to users.

**[P1-34] Author field not written to PDF annotation objects**
- Location: `backend/services/pdf_engine.py` — `annotate()` function
- Root cause: The `author` field from settings is stored in the JS overlay (`LocalAnnot.author`) and included in the markdown report, but is never passed to the backend or written into the PDF annotation dict. After the round-trip fix (annotationMode enabled), re-opened PDFs render via PDF.js's native annotation layer, which reads from the PDF `/T` (title/author) field. That field is empty.
- Fix Phase 1: Accept `author` in the annotation payload and call `a.set_info(title=author)` in the engine for all annotation types.
- Fix Phase 2: Ensure `toApiAnnotations()` in Viewer.tsx includes the author string in each annotation object sent to the backend.

**[P1-35] MirrorGroupId not cleared from primary tab when secondary pane closes**
- Location: `src/components/TabShell.tsx:closeTab()`
- Root cause: When `closeTab` removes the secondary viewer tab, it clears `sideBySideTabId` but does not clear the `mirrorGroupId` from the primary tab's metadata. The primary Viewer continues running `subscribe(mirrorGroupId, ...)` indefinitely against a topic with no publisher. If split view is re-activated later, a new `mirrorGroupId` is generated — but the old subscription in the primary Viewer never cleans up.
- Fix: In `closeTab()`, after identifying the tab as the side-by-side tab, also clear `mirrorGroupId` from the primary tab: `setTabs(prev => prev.map(t => t.mirrorGroupId === closedTab.mirrorGroupId ? { ...t, mirrorGroupId: undefined } : t))`.

---

## 4. UX Improvements

Bounded scope — no architectural changes required.

**[UX-01] Page transition animation**
Crossfade between pages (brief opacity transition on the canvas) for both button navigation and scroll-past-edge navigation. 100–150ms ease-out. Respect reduce-motion.

**[UX-02] Zoom: Ctrl+0 reset, Ctrl+scroll, snap-to-10%**
- Ctrl+0 → set scale to 1.0
- Ctrl+scroll → zoom in/out (0.1 steps)
- First zoom button click snaps to nearest 10% then continues in 10% increments

**[UX-03] Fit-mode transition animation on file load**
After initial render, the fit-mode calculation causes a visual scale jump. Pre-calculate target scale before first render call so the initial canvas paint uses the correct scale.

**[UX-04] UI scale compensates PDF zoom**
When `uiScale` changes (Settings save), recalculate `scale` so apparent page size in physical pixels stays constant: `newScale = currentScale * (previousUiScale / newUiScale)`.

**[UX-05] Ink improvements**
- Rename "Draw" → "Ink" in sub-mode toolbar label
- Colour picker for ink (same swatch row as highlight colour picker, positioned in ink sub-toolbar)
- Keys 1–9 in ink mode set widths [1, 1.5, 2, 3, 4, 6, 8, 12, 20] px
- Stroke smoothing: apply Catmull-Rom spline fitting to recorded ink points before rendering

**[UX-06] Arrow head style options**
At least: simple open arrow, closed/filled arrow, and none. Radio buttons in the shape sub-toolbar when arrow sub-type selected.

**[UX-07] Baked annotation appearance consistency**
Pre-bake overlays and post-bake overlays differ visually because they go through different rendering paths (JS overlay vs PDF.js rendering with annotationMode enabled). After the annotationMode fix, re-evaluate — the consistency issue may self-resolve.

**[UX-08] Note re-editing**
- Double-click on canvas note icon: reopen editor popup with existing text
- Double-click on note in right rail: navigate to page, open editor popup, pre-select text

**[UX-09] Note from QuickActionBar pre-populates selected text**
Currently creates a note at the click-position but discards selection. Pre-populate the note editor with the selected text as the initial value.

**[UX-10] Annotation scroll-to-centre on right rail click**
After `onGoTo(page)`, scroll the canvas container so the annotation's fractional position is vertically centred in the viewport.

**[UX-11] Selected annotation highlight in right rail**
When `focusAnnotId` is set, add a highlighted background to that row in AnnotationsListPanel.

**[UX-12] Annotation status: text lozenges**
Replace icon-only status indicator with text badge: "Open", "Resolved", "Won't fix". Small, coloured background.

**[UX-13] Tab max-width: 180px → 270px**
Update `max-w-[180px]` to `max-w-[270px]` in TabBar. Verify "+" button and gear remain visible when many tabs are open — may need the tab list to scroll horizontally or start truncating earlier.

**[UX-14] Scrollbar theming in ThumbnailSidebar**
CSS `::-webkit-scrollbar` rules in `index.css` to match dark theme. Width 4px, track transparent, thumb `stone-600`, thumb hover `stone-500`.

**[UX-15] Duplicate file detection in Merge tool**
Compare filename + size when adding a file; show warning badge if duplicate detected (don't block).

**[UX-16] Page count per file in Merge tool**
When a file is added to the merge list, load it with `pdfjsLib.getDocument()` in the browser, read `pdf.numPages`, display it next to the filename.

**[UX-17] Rearrange: "Download and open in viewer" action**
After apply, alongside the download, offer a button to `URL.createObjectURL` the result and open a new Viewer tab.

**[UX-18] Images to PDF: drag-to-reorder + expanded format support**
Add `@dnd-kit` reordering to the image list. Expand accepted types to include BMP, WebP, GIF (already supported in `pdf_engine.images_to_pdf`). Update the dropzone `accept` config and remove the user-facing restriction note.

**[UX-19] Backend restart from UI**
In the backend-offline state, show a "Restart service" button. In Tauri, this calls a Rust command `restart_sidecar` that kills and re-spawns the Python sidecar process. Requires a new Rust command in `src-tauri/src/lib.rs`.

**[UX-20] V in View mode: brief feedback pulse**
When `V` is pressed and mode is already "view", briefly animate the mode indicator (a 0.5s opacity pulse on the bottom toolbar or a brief flash of the view mode button).

**[UX-21] Compress two-mode toggle**
Add a "Mode" toggle to the compress panel: "Size-optimised (flatten)" / "Quality-preserving (lossless)". The lossless path uses only `doc.tobytes(garbage=4, deflate=True, clean=True)` without image recompression.

**[UX-22] Settings: right rail open-by-default toggle**
Add `rightRailOpenDefault: boolean` to Settings, similar to `thumbnailsOpenDefault`. Viewer reads this on file load.

**[UX-23] Split view: auto-collapse on activation + zoom sync**
When split activates, auto-collapse ThumbnailSidebar and RightRail on both panes. Each pane gets independent toggle buttons. Primary pane's zoom is copied to secondary pane's initial zoom.

**[UX-24] Home page and Viewer empty-state capability hints as clickable CTAs**
Two separate hint surfaces need updating:

1. **Home page hints** (B-05 — below the drop zone in `Home.tsx`): The existing 3 hints should each be a clickable shortcut chip. On click: open file picker, load selected PDF into a Viewer tab, then activate the indicated action:
   - "Annotate" chip → open annotate mode
   - "Side by side" chip → activate split view
   - "?" chip → open cheat sheet
   Display the key shortcut (A, Ctrl+\, ?) visually on each chip.

2. **Viewer empty-state hints** (the 4 hints shown in the viewer when no file is loaded, `Viewer.tsx`): These are already structured as key → description rows. No click behaviour needed here — the user has already navigated to the viewer. Just ensure the shortcut labels are correct (especially Ctrl+Shift+P, not Ctrl+K per P1-33).

Do not conflate the two surfaces — they have different contexts and different appropriate interaction patterns.

**[UX-25] Privacy footer: expanded popup**
The footer text opens a small popover listing: no uploads, no cloud, no telemetry, all processing is local via the Python sidecar, only file path metadata stored for recent files.

**[UX-26] Every feature accessible in command palette**
Audit: enumerate every menu item and toolbar action; add any missing entries. Particular gaps expected: compress, watermark, per-page operations, Settings sections.

**[UX-27] Remove `>` prefix from page-jump syntax**
Plain number input already works for page jump. Remove the `>` instruction from the palette placeholder or any UI hint.
- **Before implementing:** Verify in `CommandPalette.tsx` that plain number inputs (without `>`) are already handled in the filtering logic. If the `>` prefix is required in code (not just the UI hint), removing the hint would leave users unable to trigger page-jump. Fix the code first if needed, then remove the hint.

**[UX-28] Settings: add "Settings…" under File menu in Viewer**
`buildViewerMenus()` adds a File → Settings… item that calls `openSettings()`.

**[UX-29] Keyboard reordering documentation in Rearrange**
`@dnd-kit` keyboard sensor activates on Space (pick up), arrow keys (move), Space/Enter (drop), Escape (cancel). Add a visible hint near the grid or in the ? cheat sheet.

**[UX-30] MiniMap repositioned to not overlap annotation sub-mode toolbar**
When annotation sub-mode toolbar is visible (canvasMode === "annotate"), increase bottom margin of MiniMap by the toolbar's height or move it above the toolbar's bounding rect.

**[UX-31] Command palette shortcut in hint bar**
See P1-33 — this is confirmed wrong (says "Ctrl+K", actual shortcut is "Ctrl+Shift+P"). Fix is in P1-33 above. Resolved when P1-33 is done.

**[UX-32] Sync scroll between split panes**
When sync scroll is enabled, navigating to a page in one pane jumps the other pane to the same page. This was in the original spec (N-04) but is not yet implemented.

- UI: Toggle in View menu → "Sync scroll between panes" (checkbox). Only visible when split is active.
- State: `syncScrollEnabled: boolean` in TabShell's side-by-side state.
- Implementation: When `currentPage` changes in the primary Viewer and `syncScrollEnabled` is true, call `goTo(page)` on the secondary Viewer via a shared callback registered in TabShell (similar to the mirror sync mechanism but for page navigation only).
- **Loop prevention:** Set a `syncingRef = useRef(false)` flag. Before calling `goTo` on the secondary, set `syncingRef.current = true`. The secondary's `goTo` handler checks this flag and skips re-broadcasting if set. Reset after the `goTo` completes.

**[UX-33] Undo stack behaviour after baking — design decision documented**
When `autoSaveAnnotations()` succeeds, the code calls `setUndoStack([])`. This is intentional: baking is a commit point; the previous annotation session's undo history is cleared. Users cannot undo the bake itself.

- This is the correct behaviour but may confuse users pressing Ctrl+Z immediately after Done.
- **Action:** Add an entry to the keyboard cheat sheet and the Help mode content (5.8) explaining that "Done clears undo history — each annotation session starts fresh."
- No code change required; this is a documentation and copy task.

---

## 5. New Features (Confirmed Scope)

### 5.1 Recent Files List

**Storage:** Add `recentFiles: Array<{path: string; name: string; size: number; openedAt: number}>` to Settings. Cap at 10 entries. File content is never stored — path and metadata only.

**UI:** Below the Home page drop zone, add a "Recent" section showing the last 5 files as compact list items. Each item: filename, date opened, file size. Click → file picker opens pre-navigated to that path (Tauri: use `open()` from `@tauri-apps/plugin-dialog` with a pre-set path, or simply re-open from the stored path via `readFile`).

**Privacy:** Add "Clear recent files" link. Include in the privacy footer popup explanation.

**Tauri integration:** Reading a recent file requires either re-using the Tauri file picker (user re-selects) or using `@tauri-apps/plugin-fs` to read the file directly from the stored path. The latter requires adding the `fs` plugin and appropriate permissions. Decision: use the picker for now (security), display recent file name as a reminder to navigate to it. Add direct-open as Phase 2 when plugin permissions are audited.

### 5.2 Password-Protected PDF Support

**PDF.js side:** PDF.js throws a `PasswordException` when loading a protected PDF. Catch this in `loadFile()`:
```typescript
try {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
} catch (e) {
  if (e instanceof pdfjsLib.PasswordException) {
    setPasswordRequired(true);
    setPendingEncryptedData(data);
    return;
  }
}
```
Show a password entry dialog. On submission, retry: `pdfjsLib.getDocument({ data, password })`.

**Backend side:** When the PDF is sent to the backend for annotation/redact/crop, the password must be included in the request. Add an optional `password` field to all backend endpoints. PyMuPDF opens encrypted files with `fitz.open(stream=data, password=password)`.

**UX:** Password dialog is a small modal: single password input, show/hide toggle, Submit + Cancel.

### 5.3 PDF Form Filling

**Scope:** Display existing form fields; allow user to fill them; write values back to PDF on commit.

**PDF.js side:** PDF.js has `page.getAnnotations()` which returns form fields (widgets) with their type and current value. Render fillable widgets as interactive overlays on top of the canvas (separate layer from annotation overlays).

**Write-back:** New backend endpoint `/fill-form`. Accepts PDF blob + `{field_name: string, value: string}[]`. Uses PyMuPDF `page.widgets()` to iterate fields and `widget.field_value = value; widget.update()` to set values.

**UI mode:** Add "Form" as a new `CanvasMode` (`"view" | "annotate" | "redact" | "crop" | "form"`). In form mode, widget overlays are interactive (click to activate input).

**Interaction with annotations:** Form mode and annotation mode are mutually exclusive. `annotationMode` in form mode should be set to `AnnotationMode.ENABLE` to allow PDF.js to render the form field widgets.

### 5.4 Annotation Search (within right rail)

Add a search input at the top of the Annotations tab in RightRail. Filters the annotation list in real time by text content, author, type label, or tag. The filter is local (no backend). A small chip shows active filter. "Clear" dismisses.

Implementation: new `annotSearch` state string in AnnotationsListPanel; apply `.filter(a => ...)` to both `allComments` and `allMarkup` before grouping.

### 5.5 Custom Stamp Labels

**Storage:** Add `customStampLabels: string[]` to Settings (default: `[]`). The full stamp label list = `[...STAMP_LABELS, ...settings.customStampLabels]`.

**Settings UI:** Under Annotations section — "Stamp labels" sub-section with the existing labels shown (read-only) and an editable list for custom labels (add/delete, same pattern as colour labels).

**Backend:** No change — the label is just a string passed to the PDF engine.

### 5.6 Print

**Tauri approach:** Use `@tauri-apps/plugin-webview` print API, or inject the `workingBlob` URL into a hidden `<iframe>` and call `iframe.contentWindow.print()`. The latter works cross-platform without additional Tauri permissions.

**UI:** Add "Print…" to File menu in the Viewer.

**Keyboard shortcut: Ctrl+P — requires investigation before committing.**
On Windows, `Ctrl+P` is a well-known print shortcut but may be intercepted by Tauri's WebView before reaching the app's keyboard handler. Test in the actual Tauri build before assigning this keybinding. If it is intercepted, either: (a) use a different shortcut (e.g. Ctrl+Shift+P is taken — consider no keyboard shortcut and rely on the File menu), or (b) register Ctrl+P as an explicit Tauri global shortcut that routes to the webview. Do not assign the shortcut in the plan until this is verified.

### 5.7 Watermark from Viewer Toolbar

The backend `watermark_text()` already exists. Add "Watermark" to the Viewer's right panel tool list. UI: text input, opacity slider (0.1–0.9), angle picker (0°, 30°, 45°, 60°, 90°), colour picker. On apply, call the backend watermark endpoint.

### 5.8 Help Mode

**Toggle:** Available from the ? menu (the keyboard cheat sheet button) as a persistent toggle "Show help hints". Stored in localStorage (`helpModeEnabled: boolean`).

**Hover behaviour:** When active, elements decorated with `data-help-id="<key>"` show a longer tooltip on hover (using a custom tooltip component, not the native `title` attribute — native tooltips have a delay and styling we can't control).

**Click behaviour:** Clicking any element while in help mode opens a sliding description panel at the bottom of the right rail (or as a fixed bottom bar in the viewer). The panel shows: element name, description, keyboard shortcut if applicable.

**Descriptions registry:** A TypeScript `Record<string, {label: string; description: string; shortcut?: string}>` object in a new file `src/lib/helpContent.ts`. Every interactive element in the Viewer gets a `data-help-id`. This is significant copy-writing work.

**Scope for Phase 4:** Cover the Viewer toolbar, annotation mode buttons, and right rail. Other pages in a follow-up.

---

## 6. Architectural Specifications

### 6.1 Unified Organise Tool

**Replaces:** `src/pages/Split.tsx` (sidebar panel mode), `src/pages/Rearrange.tsx` (standalone tab).

**New tab type:** Add `"organise"` to `TabType` in `src/lib/tabs.ts`.

**New files:**
- `src/pages/Organise.tsx` — top-level page component
- `src/components/OrganiseGrid.tsx` — interactive thumbnail grid
- `src/components/SplitDivider.tsx` — visual divider component placed between page groups

**Feature set:**
- Thumbnail grid rendering via existing `PageThumbnailGrid` and `ThumbnailSidebar` logic
- Click to select, Shift+click for range, Ctrl+click for multi-select (highlight border)
- **Toolbar actions:** Delete (selected pages), Rotate CW (selected), Rotate CCW (selected), Extract (selected → download), Merge (drop PDFs at a position), Split (see below)
- **Split mode:** Toggle divider placement. Click between thumbnails to add a split divider (an amber vertical line with a drag handle). Each group gets a label "Part 1 (pp. 1–5)", etc. "Apply Split" downloads a ZIP with one PDF per group.
- **Split rules:** "Split every N pages" dialog — generates evenly-spaced dividers automatically
- **Apply:** "Apply & Download" creates the modified PDF. "Apply & Open in Viewer" also opens it in a new Viewer tab.

**Backend:** All underlying operations already exist (`rotate`, `delete_pages`, `reorder`, `extract`, `split`, `merge`). No new backend endpoints needed.

**Home page transition:** Once Organise is shipped:
- Remove "Split" and "Rearrange" tool cards from the home grid
- Add single "Organise" card
- Restructure home page into 3-tier CTA: primary (drop zone), secondary (Organise card, full-width or prominent), tertiary (remaining tool grid)

**Migration:** The existing Rearrange tab (`src/pages/Rearrange.tsx`) remains until Organise is verified. Deprecate by removing the home card and the tab type; keep the component until confirmed unused.

---

### 6.2 Light / Dark Mode System

**Two independent toggles, both in Settings → Interface:**
- "App theme": Light (default) / Dark — controls home page and tool tabs
- "Viewer theme": Dark (default) / Light — controls the viewer surfaces

**CSS strategy:** Use Tailwind's `class` dark mode strategy with two custom classes:
- `app-dark` applied to `<html>` when app theme is dark
- `viewer-dark` applied to `<html>` when viewer theme is dark (already dark by design — class may already be present implicitly)

Update `tailwind.config.js`:
```javascript
darkMode: ['selector', '.app-dark'],
```
For the viewer-light mode (inverting the dark viewer): add `viewer-light` variant tokens.

**Tailwind config additions:**
```javascript
// In theme.extend:
screens: {
  'app-dark': { raw: '.app-dark &' },
  'viewer-light': { raw: '.viewer-light &' },
}
```
Or use CSS variables for surface tokens that swap based on class.

**Settings storage:** Add `appTheme: "light" | "dark"` and `viewerTheme: "light" | "dark"` to `Settings` type. Both default to their current states.

**TabShell application:** When either setting changes, `document.documentElement.classList.toggle('app-dark', settings.appTheme === 'dark')`.

**Scope of changes:**
- App dark mode: All components in `Home.tsx`, `Merge.tsx`, `Rearrange.tsx`, `ImagesToPDF.tsx`, `Layout.tsx`, `ToolCard.tsx`, `FileDropZone.tsx` need `dark:` variant classes on every light-mode token.
- Viewer light mode: `Viewer.tsx`, all viewer-specific components (`ThumbnailSidebar`, `RightRail`, `AnnotationsListPanel`, etc.) need `viewer-light:` variant classes replacing dark tokens with light equivalents.
- This is the largest surface area change in the project. Plan a systematic token-by-token pass per component.

**Visual targets:**
- App dark: `bg-stone-950` page, `bg-stone-900` cards, `border-stone-800` dividers, `text-stone-100` headings, `text-stone-400` body. Amber accent unchanged.
- Viewer light: `bg-stone-100` canvas background, `bg-white` page panels, `border-stone-300` dividers, `text-stone-800` text. Amber accent unchanged.

---

### 6.3 MiniMap Wave-Scrub Redesign

**Replaces:** `src/components/MiniMap.tsx` (complete rewrite of internals; props interface changes minimally).

**Visual design:**
- Thin vertical strip, 8px wide at rest, positioned at the right edge of the canvas scroll area
- An amber accent band shows the current page proportionally (like a scrollbar thumb but constrained to exact page position)
- The strip has no background — just the accent band on a transparent overlay

**Hover interaction (no button press):**
1. Mouse enters the strip → strip expands to ~28px wide (smooth transition 100ms)
2. As mouse moves along the strip, a dock-magnification wave effect expands page segments near the cursor:
   - Each "segment" is a thin horizontal slice representing one page
   - Segments near the cursor scale up using a Gaussian distribution: `scale(1 + 3 * exp(-dist² / (2 * σ²)))`
   - The page number corresponding to the cursor position shows in the expanded segment
3. When mouse is still for >400ms: a thumbnail preview floats to the left of the strip, showing the page under cursor. Page number shown prominently above thumbnail.
4. Page number under the cursor is displayed in a floating badge next to the strip

**Drag / scrub interaction:**
1. `pointerdown` on strip → activate scrub mode (`pointer.setCapture()`)
2. During `pointermove`: same wave + thumbnail behaviour, but page navigation is deferred
3. On `pointerup`: navigate to the page under cursor; release pointer capture

**Sensitivity:** Natural emergent behaviour — the magnification makes the central area of the strip feel physically larger, so the same pixel distance covers fewer pages near the cursor (fine selection) vs. far from it (coarse). No additional sensitivity algorithm required.

**Implementation:**
```typescript
// MiniMap.tsx state:
const [hoverFrac, setHoverFrac] = useState<number | null>(null); // 0-1 of strip height
const [isDragging, setIsDragging] = useState(false);
const [dragFrac, setDragFrac] = useState<number | null>(null);

// Scale for segment i (0-indexed), total N pages:
function segmentScale(i: number, cursorFrac: number): number {
  const cursorPage = Math.floor(cursorFrac * N);
  const dist = Math.abs(i - cursorPage);
  return 1 + 3 * Math.exp(-(dist * dist) / (2 * 2 * 2)); // σ=2 pages
}
```

**Thumbnail generation:** On settle (>400ms still), call existing `renderPageThumbnail(pdf, page, scale: 0.15)` to generate a small canvas. Cache the last 5 thumbnails to avoid re-rendering on repeated hover.

**Toggle and persistence:** Strip is visible by default. Toggle via a button in the Viewer's bottom-right toolbar area. State stored in `Settings` as `minimapVisible: boolean` (default `true`) — add to `storage.ts` and the Settings → Interface section. When off, strip is completely hidden.

**Z-index:** Strip is `z-[30]`, positioned `absolute right-0` inside the canvas scroll area, `top-0 bottom-0`. Does not overlap the annotation sub-mode toolbar (which is rendered outside the scroll area, below it). If toolbar is inside the scroll area, wrap strip in a container that accounts for toolbar height.

---

### 6.4 Help Mode System

**Architecture:**
1. `src/lib/helpContent.ts` — registry: `Record<string, { label: string; description: string; shortcut?: string }>`
2. `src/components/HelpTooltip.tsx` — wraps any element; shows extended tooltip on hover when help mode is on
3. `src/contexts/HelpContext.tsx` — `helpModeEnabled: boolean`, `activeHelpId: string | null`, `setActiveHelpId`
4. `src/components/HelpPanel.tsx` — bottom-anchored panel in the Viewer showing the description for `activeHelpId`

**Usage pattern:**
```tsx
<HelpTooltip helpId="annotate-mode-button">
  <button ...>Annotate</button>
</HelpTooltip>
```

**Phase 4 scope:** Cover all Viewer toolbar buttons, annotation sub-mode toolbar, and right rail tabs. Home page tools in a follow-up.

---

### 6.5 Right Rail Refactor — Outline + Bookmarks Merge

**Current:** Three tabs — Annotations, Outline, Bookmarks.
**New:** Two tabs — Annotations, Document.

**"Document" tab:**
- If `outline.length > 0`: show Outline section at top (collapsible) with full existing OutlinePanel content
- Always show Bookmarks section below (with divider if Outline is present)
- If `outline.length === 0`: show only Bookmarks (no divider, no empty Outline header)

**Component changes:**
- `src/components/RightRail.tsx`: Change tab count from 3 to 2; rename third tab
- `src/components/DocumentPanel.tsx` (new): Combines `OutlinePanel` and `BookmarksPanel` with conditional rendering

**Tab type update:** `type RailTab = "annotations" | "document"` (was `"annotations" | "outline" | "bookmarks"`).

---

### 6.6 Tab Close Guard Architecture

**`src/lib/tabs.ts` additions:**
```typescript
interface TabContextValue {
  // ... existing ...
  registerCloseGuard: (tabId: string, guard: () => CloseGuardResult | Promise<CloseGuardResult>) => void;
  unregisterCloseGuard: (tabId: string) => void;
}

interface CloseGuardResult {
  safe: boolean;       // false = prevent close, show confirmation
  message?: string;   // shown in confirmation dialog
  details?: string;   // optional secondary line
}
```

**`src/components/TabShell.tsx` changes:**
- `closeGuards` ref: `Map<string, () => CloseGuardResult | Promise<CloseGuardResult>>`
- `closeTab()` becomes async: check guard before removing tab; if guard returns `{ safe: false }`, set `pendingCloseTabId` state which renders a confirmation dialog in TabShell
- The confirmation dialog is in TabShell, not Viewer — prevents the tab from needing to render its own modal while being closed

**`src/pages/Viewer.tsx` changes:**
- On mount: `registerCloseGuard(tabId, () => ({ safe: annotations.length === 0, message: "You have uncommitted annotations." }))`
- On unmount: `unregisterCloseGuard(tabId)`
- Also update guard dynamically when annotation count changes: use a ref (not a stale closure)

---

### 6.7 QuickActionBar in View Mode

**Current:** TextLayer is only mounted in Annotate mode. QuickActionBar only fires in Annotate sub-modes.

**Change:** Mount TextLayer in View mode too (when a PDF is loaded). The `active` prop on TextLayer controls whether text selection creates highlights — in View mode, pass `active={true}` so text is selectable. The QuickActionBar currently fires on text selection in `AnnotationLayer`. Move this trigger to `Viewer.tsx` level, not mode-gated.

**Flow:**
1. User selects text in View mode → TextLayer fires `onSelect` callback with selected rects
2. Viewer sets `quickBarVisible = true`, `quickBarSelection = { rects, page }`
3. QuickActionBar renders with position clamped to viewport
4. User clicks "H" → switches to Annotate + Highlight mode and creates annotation with the stored selection
5. Or user dismisses → `quickBarVisible = false`

**Positioning fix (G-03):**
```typescript
const top = Math.max(menuBarHeight + 8, selectionTop - barHeight - 8);
const left = Math.min(viewportWidth - barWidth - 8, Math.max(8, selectionCenter));
```

---

## 7. Implementation Phases

### Pre-Phase 1 Hotfix (do immediately — current build is shipping wrong information)

**Fix P1-33 first:** Change the first-run hint bar text from "Ctrl+K opens the command palette" to "Ctrl+Shift+P opens the command palette". One-line change in `Viewer.tsx`. Optionally also bind `Ctrl+K` as an alias in the keyboard handler at the same time. Commit and move on.

### Phase 1 — Annotation Pipeline (Critical, ~1–2 sessions)

All E-08 bugs. Nothing else matters until annotations work end-to-end.

**Order:**
1. Fix multi-layer save: change `annotations` → `[...bakedAnnotations, ...annotations]` in `autoSaveAnnotations()`. One line. Test by baking twice and verifying both sets persist.
2. Fix annotationMode: implement dynamic mode based on overlay presence. Test round-trip.
3. Fix stamp appearance: replace `add_freetext_annot` with `page.draw_rect()` + `page.insert_text()` for stamps. Test in external PDF viewer.
4. Fix P1-34 (author field): pass `author` through `toApiAnnotations()` and set `a.set_info(title=author)` in the backend engine.
5. Fix developer error message in backend-offline annotation path (Viewer.tsx:922).
6. Update smoke test to cover multi-session bake, round-trip display, and author field verification.

### Phase 2 — Functional Bug Batch (~2–3 sessions)

Tackle P1 bugs in surface-area groups:

**Group A — Annotation behaviour:**
P1-03 (tab close guard), P1-06 (pending note), P1-07 (undo atomicity), P1-08 (highlight popup), P1-09 (mode dialog suppression), P1-13 (multi-select delete), P1-14 (bulk status), P1-15 (colour label propagation), P1-16 (freetext tag input), P1-17 (ellipse preview)

**Group B — Download / save:**
P1-10 (Ctrl+S silent), P1-11 (uncommitted annotation modal), P1-12 (rename marks modified)

**Group C — Keyboard / shortcuts:**
P1-20 (? key — **verify first**, investigate only if verification fails), P1-21 (palette shortcut label), P1-22 (Ctrl+,), P1-23 (two gear icons), P1-25 (mirror shortcut), UX-31 (resolved by P1-33 hotfix)

**Group D — Navigation / display:**
P1-18 (search match indicator), P1-19 (outline collapse), P1-28 (QuickActionBar position), P1-29 (thumbnail toggle obscured — **this is a current regression from polish pass**), P1-32 (ThumbnailSidebar `overflow-hidden` toggle clip), P1-30 (page input spinner), P1-04 (focus trap in Settings)

**D-04 verification checkpoint:** Before closing Phase 2, manually verify D-04 (scroll-past-edge navigation — page advances when scrolling past bottom of current page). This was not covered in the user's test notes. If broken, fix before Phase 3.

**Group E — Split view:**
P1-24 (split close guard — covered by close guard architecture), P1-26 (mirror sync real-time), P1-35 (mirrorGroupId cleanup on secondary pane close)

**Group F — Reduced motion + OS detection:**
P1-27 (prefers-reduced-motion fix)

### Phase 3 — UX Improvements (~2–3 sessions)

After bug fixes, targeted improvements with no architectural changes:
UX-01 through UX-31 from the improvements list, prioritised:
1. UX-05 (QuickActionBar in View mode — larger change, do first)
2. UX-02 (zoom improvements), UX-03 (fit animation), UX-04 (UI scale zoom compensation)
3. UX-07 (atomic note undo), UX-08 (note re-editing), UX-09 (note pre-populate)
4. UX-10 (annotation scroll-to-centre), UX-11 (selected annotation highlight), UX-12 (status lozenges)
5. UX-13 (tab width), UX-14 (scrollbar theming)
6. UX-15 (merge duplicates), UX-16 (merge page count), UX-17 (rearrange open-in-viewer)
7. UX-18 (images: reorder + formats), UX-20 (compress toggle), UX-21 (watermark panel)
8. UX-22 (right rail default), UX-23 (split auto-collapse + zoom sync)
9. UX-24 (capability hint CTAs — Home page hints only, see spec for scope), UX-25 (privacy popup), UX-26 (palette completeness — run audit at phase start)
10. UX-28 (Settings in File menu), UX-30 (MiniMap reposition), UX-01 (page transitions)
11. UX-32 (sync scroll between split panes), UX-33 (document undo-stack-after-bake in cheat sheet + help content)
12. **Tailwind safelist check:** Verify `transition-[width]` is present in production CSS. Add to `safelist` in `tailwind.config.js` if absent (see Phase 5B note).

### Phase 4 — New Features (~4–6 sessions)

Each is independent; order by value:
1. **Recent files** (Section 5.1) — high user value, low complexity
2. **Annotation search** (Section 5.4) — low complexity, useful immediately
3. **Snippets** — storage schema already exists in `storage.ts` (`snippets: []`). Add Settings UI (add/remove/reorder list, same UX as colour labels) and CommandPalette display (new "Snippets" category reading `settings.snippets`). Low complexity — data layer is done.
4. **Custom stamp labels** (Section 5.5) — storage schema pattern established, UI is straightforward
5. **Watermark from Viewer** (Section 5.7) — backend ready, just UI
6. **Print** (Section 5.6) — small, useful. **Verify Ctrl+P Tauri behaviour before assigning shortcut** (Section 5.6)
7. **Right rail merge: Outline + Bookmarks** (Section 6.5) — medium complexity
8. **Password-protected PDFs** (Section 5.2) — medium complexity, high user value
9. **Help mode** (Section 6.4) — medium complexity, requires content writing. Incorporate UX-33 (undo-after-bake explanation) into the help content registry.
10. **PDF form filling** (Section 5.3) — highest complexity, separate mode, plan carefully before starting

### Phase 5 — Architecture (~4–8 sessions)

**5A — Unified Organise Tool** (Section 6.1)
Build new tab, verify all page operations work, deprecate old Split/Rearrange tabs, update home page CTA structure.

**5B — Light / Dark Mode** (Section 6.2)
Split into two sub-phases with explicit checkpoints:

- **5B-1 — App dark mode:** Token pass on all light-surface components (`Home.tsx`, `Merge.tsx`, `Rearrange.tsx`, `ImagesToPDF.tsx`, `Layout.tsx`, `ToolCard.tsx`, `FileDropZone.tsx`). Checkpoint: visual review of every page in app-dark mode before committing.
- **5B-2 — Viewer light mode:** Token pass on all dark viewer components. Checkpoint: visual review of the full viewer in viewer-light mode before committing.

**Tailwind safelist:** Verify that `transition-[width]` (added to `ThumbnailSidebar` in the polish pass) appears in the production CSS build. Tailwind purges arbitrary values it doesn't detect via static analysis. If absent, add to `tailwind.config.js`:
```javascript
safelist: ['transition-[width]']
```
Check during Phase 3 (before Phase 5B since this affects the current build).

**5C — MiniMap Wave-Scrub** (Section 6.3)
Build as isolated component first, test the magnification physics, then integrate. Complex interaction — plan to spend extra time on the feel.

---

## 8. Self-Review: Gaps and Unknowns

*Honest assessment of what this plan has not fully thought through.*

**8.1 PDF.js annotationMode and the active-session edge case**
The proposed fix (dynamic annotationMode based on overlay presence) has an edge case: after a user bakes annotations and then dismisses the view (annotations.length === 0, bakedAnnotations.length === 0 after tab switch), the mode flips to 2, then back to 0 when annotating again. Each flip triggers a re-render. Rapid annotation → Done → annotate again cycles could cause noticeable flicker. Need to test this in practice and potentially add a debounce or use a ref instead of reactive state for annotationMode.

**8.2 The `inert` attribute for focus trapping**
Not all Tauri WebView versions support `inert`. If the target WebView version is below the threshold, need to fall back to a JS focus trap. Check Tauri WebView baseline before committing to this approach.

**8.3 Annotation round-trip with redact + crop in the middle**
If the workflow is: annotate → Done → redact → crop → annotate again → Done, the `bakedAnnotations` in JS state still have the original positions (fractions of original page). Redact and crop change the page content but NOT the page dimensions (crop changes the mediabox but coordinates remain fractional). This should be fine. Redaction removes content under the annotation but the annotation overlay stays at the same position. Edge case: if the user crops out the area where an annotation was placed, the bakedAnnotation will still be sent to the backend at its original coordinates, but those coordinates now fall outside the cropbox. PyMuPDF would write the annotation outside the visible area. Not catastrophic, but worth noting — no fix needed now, just document the behaviour.

**8.4 `overflow-hidden` on ThumbnailSidebar clips the collapse toggle**
The polish pass added `overflow-hidden` to ThumbnailSidebar to fix `transition-[width]`. The toggle button uses `absolute -right-3 top-3` which is outside the sidebar's border box. With `overflow-hidden`, this button is now clipped. **Addressed as P1-32** — fix moves the toggle outside the clipped container.

**8.5 Tab width increase and right-side tab bar overflow**
Increasing max tab width from 180px to 270px with many tabs open may push the "+" button and settings gear off-screen. The TabBar should either: (a) give the tab list a `max-width` that reserves space for the right buttons, or (b) use horizontal scrolling on the tab list with `overflow-x: auto; scrollbar-width: none`. Option (b) is simpler. Verify it doesn't interact badly with the tab strip existing scroll behaviour.

**8.6 MiniMap thumbnail generation latency**
Generating a page thumbnail requires rendering a canvas via PDF.js. On a 480-page PDF, this can take 50–200ms per page. The settle delay (400ms) before showing a thumbnail covers this. But if the user hovers over different pages in quick succession, we might queue many render operations. Need to cancel in-flight thumbnail renders when the cursor moves to a new page. Use a `AbortController` or a generation token system.

**8.7 Lossless compression using pikepdf**
`pdf_engine.compress()` currently uses Pillow-based JPEG recompression. The "lossless" toggle should skip this entirely and only run `doc.tobytes(garbage=4, deflate=True, clean=True)`. Compression ratio will be much lower (typically 5–20% vs 40–70%). This is acceptable and should be clearly communicated in the UI ("Reduce file bloat, preserve quality").

**8.8 Form filling and annotation conflict**
When form mode is active (`canvasMode === "form"`), the user should be able to fill form fields but not create annotations. When annotation mode is active, form fields should not be interactive. PDF.js's form field rendering is separate from annotation rendering — `getAnnotations()` returns both. Need to filter the two categories and only activate the appropriate one per mode.

**8.9 Recent files and Tauri file system permissions**
Tauri's `readFile` capability requires explicit `allow-read` scopes in `tauri.conf.json`. Without this, trying to re-open a recent file by path will fail silently. For Phase 4, use the file picker approach (user re-selects, recent files serve as a visual reminder). Add direct-open capability configuration as a separate task in Phase 5 or later.

**8.10 Sync scroll**
Addressed as UX-32. Added to Phase 3 with loop-prevention design note.

**8.11 Snippets storage schema**
Addressed — moved from backlog to Phase 4 (item 3). Storage layer already done; only UI + palette display needed.

**8.12 `?` key and focus**
Addressed in P1-20 — mandatory verification step at Phase 2 start defined. Code logic is correct; investigate only if verification fails.

**8.13 Command palette completeness audit**
The promise "every feature accessible in the palette" has not been enumerated. Before implementing, generate the full list of menu items and toolbar actions and diff against current palette entries. This audit should happen at the start of Phase 3, not during — the gap list will define the work.

**8.14 Light/dark mode CSS token scope**
The Tailwind `dark:` variant strategy uses `class` mode. Our current plan uses `app-dark` as a custom class. If we use `darkMode: ['selector', '.app-dark']`, then `dark:bg-stone-900` would only activate when `.app-dark` is on the `<html>` element. But existing Tailwind `dark:` classes used anywhere in the codebase won't trigger unless we add `app-dark`. We have no existing `dark:` classes (we migrated to explicit stone tokens), so this is clean. Confirm before adding the mode.

**8.15 Split pane N-01b root cause + mirrorGroupId cleanup**
The `mirrorGroupId` not being cleared is addressed as P1-35. The deeper annotation-loss issue (P0-03) still requires tracing through TabShell's rendering to find where the primary pane's state is reset on secondary close — the mirrorGroupId fix may or may not resolve it. Investigate during Phase 2 Group E.

**8.16 Ink smoothing algorithm — performance**
Catmull-Rom spline fitting on ink points is done client-side, likely in `AnnotationLayer.tsx` during drawing. For very long strokes (hundreds of points), this runs on every `pointermove`. Should be profiled; if slow, consider throttling the fitting to every N points during drawing and doing a full fit on `pointerup`.

**8.17 Author field not written to PDF annotations**
Addressed as P1-34. Added to Phase 1 as step 4 — pass author through `toApiAnnotations()` and call `a.set_info(title=author)` in the backend engine. This is included in Phase 1 because fixing round-trip display without author information would make baked annotations incomplete.

**8.18 D-04 (scroll-past-edge navigation) not verified**
The user's test notes skip from D-03 to D-05 — D-04 was never tested. Addressed as a mandatory verification checkpoint in Phase 2 Group D. If broken, fix before Phase 3.

**8.19 Home page capability hints vs Viewer empty-state hints conflated**
Addressed in UX-24 — the two surfaces are now separately specified. Home page hints get the clickable CTA treatment; Viewer empty-state hints are kept as read-only key reference rows.

**8.20 Ctrl+K hint incorrect — regression in current build**
Addressed as P1-33 (hotfix, pre-Phase 1). The `Ctrl+K` hint in the first-run hint bar is wrong; the actual shortcut is `Ctrl+Shift+P`.

**8.21 UX-27 command palette `>` prefix — code must be verified first**
Addressed in UX-27 — added explicit instruction to verify the filtering code handles plain numbers before removing the hint.

**8.22 Undo stack cleared after baking — design decision**
Addressed as UX-33 — documented as intentional, added to cheat sheet and help content writing tasks.

**8.23 `transition-[width]` may be purged from production CSS**
Addressed in Phase 5B description and Phase 3 item 12 — verify during Phase 3 build, add to Tailwind safelist if absent.

**8.24 Tailwind `dark:` strategy starting clean**
Addressed in Section 6.2 — confirmed we have no existing `dark:` classes to conflict with the new `app-dark` selector strategy.

---

## 9. Deferred / Backlog

These were mentioned but explicitly deferred or rated low priority.

| Item | Reason deferred |
|---|---|
| Re-editable baked annotations (sidecar) | Phase 2 — requires embedding annotation JSON in PDF XMP metadata |
| Screen reader full audit | Beta stage — confirmed by user |
| Memory management for very long docs | Edge case — performance is strong without it |
| Sync scroll between split panes | **Moved to Phase 3** as UX-32 — implementation spec included |
| Snippets UI | **Moved to Phase 4** as item 3 — storage schema already exists, low complexity |
| Annotation JSON export | No — user confirmed markdown report is sufficient |
| Annotation collaboration | No — local-only by design |
| Page rotation in Viewer toolbar | No — goes into Organise tool |
| Cargo audit RUSTSEC-2024-0429 | Documented — GTK4/GTK3 incompatibility, Windows-only, non-critical |

---

## 10. Files Changed by Phase (Estimated)

### Pre-Phase 1 Hotfix
| File | Change |
|---|---|
| `src/pages/Viewer.tsx` | Fix first-run hint bar: "Ctrl+K" → "Ctrl+Shift+P". Optionally bind Ctrl+K as alias. |

### Phase 1
| File | Change |
|---|---|
| `src/pages/Viewer.tsx` | `autoSaveAnnotations`: pass `[...bakedAnnotations, ...annotations]`. Dynamic `annotationMode`. Fix error message at line 922. |
| `backend/services/pdf_engine.py` | Stamp: replace `add_freetext_annot` with `draw_rect` + `insert_text`. Add `author` param to all annotation types via `a.set_info(title=author)`. |
| `backend/smoke_test.py` | Add multi-bake, round-trip display, and author field test cases |

### Phase 2 (representative, not exhaustive)
| File | Change |
|---|---|
| `src/lib/tabs.ts` | Add `registerCloseGuard` / `unregisterCloseGuard` to context type |
| `src/components/TabShell.tsx` | Implement close guard check; add pending-close confirmation dialog; clear `mirrorGroupId` on secondary pane close (P1-35) |
| `src/pages/Viewer.tsx` | Register close guard on mount; Ctrl+, shortcut; fix unsaved-changes modal language (P1-11 scope review) |
| `src/components/ThumbnailSidebar.tsx` | Move toggle button outside clipped container (P1-32) |
| `src/components/AnnotationLayer.tsx` | Pending-note pattern; atomic note+text undo; ellipse preview; tag input focus |
| `src/components/SettingsDialog.tsx` | Focus trap implementation |
| `src/components/AnnotationsListPanel.tsx` | Colour label propagation; selected annotation highlight |
| `src/components/OutlinePanel.tsx` | Collapse-only-via-chevron fix |
| `src/lib/storage.ts` | Reduced motion: OS-preference-wins strategy |
| `src/components/QuickActionBar.tsx` | Viewport-clamped positioning |

### Phase 3
| File | Change |
|---|---|
| `src/pages/Viewer.tsx` | Enable TextLayer in View mode; QuickActionBar universal trigger; zoom improvements |
| `src/components/MiniMap.tsx` | Reposition to not overlap toolbar |
| `src/components/TabBar.tsx` | Tab width increase; overflow handling |
| `src/components/RightRail.tsx` | Merge Outline/Bookmarks into Document tab |
| `src/components/DocumentPanel.tsx` | New — combines OutlinePanel + BookmarksPanel |
| `src/components/SearchBar.tsx` | Active match indicator |
| `src/pages/Merge.tsx` | Duplicate detection; page count |
| `src/pages/ImagesToPDF.tsx` | Drag reorder; expanded format accept |
| `backend/services/pdf_engine.py` | Lossless compress option |

### Phase 4
| File | Change |
|---|---|
| `src/lib/storage.ts` | Add `recentFiles`, `customStampLabels`, `appTheme`, `viewerTheme`, `rightRailOpenDefault`, `helpModeEnabled`, `minimapVisible`, `snippets` (already in schema — just ensure it persists correctly) |
| `src/pages/Home.tsx` | Recent files section |
| `src/components/AnnotationsListPanel.tsx` | Annotation search input |
| `src/components/HelpTooltip.tsx` | New |
| `src/components/HelpPanel.tsx` | New |
| `src/lib/helpContent.ts` | New — descriptions registry (includes undo-after-bake explanation per UX-33) |
| `src/components/SettingsDialog.tsx` | Snippets UI section: add/remove/reorder list |
| `src/components/CommandPalette.tsx` | Snippets category display from `settings.snippets` |
| `backend/routers/annotate.py` | Accept `password` field |
| `backend/services/pdf_engine.py` | `annotate()` accepts password; new form-fill function |

### Phase 5
| File | Change |
|---|---|
| `src/pages/Organise.tsx` | New |
| `src/components/OrganiseGrid.tsx` | New |
| `src/components/SplitDivider.tsx` | New |
| `src/lib/tabs.ts` | Add `"organise"` tab type |
| `src/components/TabShell.tsx` | Render Organise tab |
| `src/components/MiniMap.tsx` | Full rewrite for wave-scrub |
| `tailwind.config.js` | Dark mode strategy: `['selector', '.app-dark']`. Add `safelist: ['transition-[width]']` if not already covered by static analysis. |
| `src/index.css` | CSS variable swap for dark/light surfaces |
| All light-surface components | `dark:` variant classes (5B-1 checkpoint before merge) |
| All dark viewer components | `viewer-light:` variant classes (5B-2 checkpoint before merge) |
| `src-tauri/src/lib.rs` | `restart_sidecar` command for backend restart |
