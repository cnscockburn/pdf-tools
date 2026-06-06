# Implementation Notes — Working Log

Tracks blocked items, decisions needed, and items requiring your manual testing as I work through `IMPLEMENTATION_PLAN.md`.

**Started:** 2026-06-06

---

## 📊 Overall status (2026-06-06)

- **Pre-Phase 1 hotfix:** done.
- **Phase 1 (annotation pipeline / E-08):** done.
- **Phase 2 (functional bugs, all groups A–F):** done.
- **Phase 3 (UX improvements):** core set done; deferred items listed below.
- **Phase 4 (new features):** **complete** — annotation search, custom stamp labels, print, Outline+Bookmarks rail merge, **Tauri-native file intake + recent files**, **password-protected PDFs**, **help mode**, **PDF form filling**. Watermark-from-viewer was already present.
- **Phase 5 (architecture):** **Organise tool DONE**; remaining — light/dark mode, MiniMap wave-scrub.

Everything committed; tsc clean; 119/119 frontend tests; backend smoke green; production build verified.

## ✅ Phase 4 large features — now DONE (decision was: rework intake)

- **Recent files (5.1):** reworked file intake to Tauri-native (`tauri-plugin-dialog` for the picker, native window drag-drop for drops) so every open captures the real OS path. Recent list on Home re-opens by path via `read_file_bytes`; browser dev keeps the react-dropzone/input fallback (no path → not recorded).
- **Password PDFs (5.2):** PasswordException → unlock dialog → decrypt-once via the existing backend → load decrypted copy.
- **Help mode (6.4):** toggle in the toolbar; contextual strip explaining the current tool. (Implemented as a contextual strip rather than per-element data-help-id tooltips — simpler, lower-risk, same onboarding value.)
- **PDF form filling (5.3):** backend list/fill + FormPanel (list fields → edit → apply). Panel-based rather than in-canvas widgets (in-canvas can be a later enhancement).

## 🏛️ Phase 5 (architecture)

- **Unified Organise tool (6.1): DONE (v1).** Rebuilt the Rearrange tab into an Organise grid — click-to-select (+Shift range), grip-drag reorder, rotate L/R, delete, extract; one backend `/organise` call on Save (or Save & open in viewer). Backend `organise(plan)` does reorder+rotate+delete in one pass (smoke-tested). **Follow-ups (optional, task #31):** visual split-divider builder (click between pages / split-every-N), fold the standalone Split tab in, merge-drop additional PDFs. The in-viewer Rotate/Delete/Extract/Split panels were left in place for quick single-doc edits.
- **Light/Dark mode (6.2): remaining.** Independent app/viewer theme toggles; biggest surface-area change (every component needs variant tokens). Decision: independently toggleable. Needs running-app design review per surface.
- **MiniMap wave-scrub (6.3): remaining.** Thin strip + dock-magnification hover + thumbnail-on-settle + drag-defers-nav. Complex interaction; needs the running app to tune feel.

### Organise tool — confirm in the running app
Open a multi-page PDF in Organise (Home → Organize, or Document → Organise Pages): click to select pages, Shift-click a range, drag the grip to reorder, rotate/delete/extract the selection, then Save (or Save & open in viewer). Confirm click-vs-drag feels right (5px activation distance) and rotated thumbnails preview correctly.

## 🔴 Needs Your Decision

### Tab-close guard scope (P1-03)
The close guard currently blocks only on **uncommitted annotations** (`annotations.length > 0`). It does **not** warn when you have a modified-but-not-downloaded working blob (after redact/crop/bake) on tab close. Reason: the working blob persists after download (no "downloaded" flag), so guarding on it would warn on every close even after you've saved. The navigation guard (`pendingNav`) already covers download-before-leaving for Home/Merge/etc. navigation.
**Decision needed:** is annotation-only close guarding enough, or do you want me to add a "modified since last download" flag so tab-close also warns about undownloaded redact/crop/compress results? (Small extra state; straightforward.)

---

## 🟡 Needs Your Manual Testing (in a running Tauri build)

### Phase 2 — items to confirm live
- **D-04 (scroll-past-edge navigation):** the wheel handler is present and well-formed (80px threshold + cooldown). Not covered in your test notes. Please scroll past the bottom/top of a page and confirm it advances/retreats.
- **P1-26 (mirror sync live):** open the same doc side-by-side (View → Side by Side — Same Document), annotate in one pane, confirm it now appears in the other pane immediately (no longer requires switching to annotate mode).
- **P1-03/P1-24 (close guards):** with uncommitted annotations, press Ctrl+W / click the tab ×, and close a split pane — confirm the "Close without saving / Keep editing" dialog appears.
- **P1-11 (download guard):** with uncommitted annotations, press Ctrl+S — confirm the "Commit, then download / Download without them / Cancel" modal appears.
- **P1-08 (highlight popup):** select a highlight (popup appears), switch tools — confirm the colour popup dismisses.
- **Settings focus trap (P1-04):** open Settings, Tab through to the end — confirm focus cycles back to the top of the dialog instead of escaping to the page behind.

### Phase 4 — confirm in the Tauri build (these depend on native APIs / a backend)
- **Native intake + recent files:** open a PDF via the Home drop zone (native dialog) and by dragging a file onto the window — both should open it; the file then appears under "Recent" on Home and re-opens by clicking. (Browser dev still uses the old input/HTML5 drop and won't populate recents — expected.)
- **Password PDFs:** open an encrypted PDF → unlock dialog → correct password opens it; wrong password shows an error. (Needs the backend running.)
- **Form filling:** open a PDF that has form fields → Document → Fill Form → fields list, edit, Apply. (Needs the backend.)
- **Print:** Document → Print… / Ctrl+P opens the OS print dialog with just the PDF.
- **Help mode:** toolbar "Help" toggle → contextual strip appears and updates as you switch tools.
- **Build note:** `cargo check` passed with the dialog plugin, but I could not run a full `tauri build`/desktop launch here — please do a `npm run tauri build` (or dev) once to confirm the plugin wiring loads.

### Phase 1 — Annotation round-trip (E-08)
The backend smoke tests confirm the fixes at the engine level, but the full round-trip needs verification in the live app, since it depends on PDF.js rendering embedded annotations (annotationMode) which can't be unit-tested headless:

1. **Multi-layer download** — annotate, click Done, annotate again, click Done, then download. Open the downloaded PDF in an external viewer (Acrobat/Edge). Confirm **all** annotations from both sessions are present (previously only the last layer survived).
2. **Stamp rendering** — add a stamp, bake, download, open externally. Confirm it shows as a white box with coloured bold label text (e.g. red "APPROVED"), **not** a solid red box.
3. **Ink + shapes in download** — add ink strokes and shapes, bake, download, open externally. Confirm they render (previously invisible).
4. **Re-open round-trip** — download a PDF with baked annotations, then open that downloaded file back in Stria. Confirm the annotations now appear (rendered by PDF.js via the new dynamic `annotationMode`). This was the CRITICAL bug.
5. **Author attribution** — set your name in Settings, annotate, bake, download, open externally. Confirm the annotation's author/title shows your name.

**Note on stamp border:** I kept the stamp as a real PDF annotation (white fill + coloured bold text + coloured border) rather than the plan's "draw_rect + insert_text as page content" approach. Reason: page-content drawing is NOT cleared by the replace-semantics loop, so it would **duplicate** on every re-save (incompatible with the multi-layer fix). The annotation approach renders reliably and clears correctly. If you want a more visually distinct stamp (e.g. filled colour background with white text), flag it and I'll explore the `rich_text=True` border path.

### Phase 2 — `?` key opens cheat sheet (P1-20)
Code path verified correct by inspection (window keydown listener, `?` handled at top of handler before mode keys, renders `<KeyboardCheatSheet>` when `cheatSheetOpen`). Could not find a bug. **Please confirm in the live app:** with a PDF open and focus NOT in a text field, press `?` (Shift+/) — the shortcuts panel should toggle. If it still does nothing, tell me what element had focus when you pressed it and I'll dig further. (Clicking the `?` button in the bottom toolbar is a known-good fallback.)

---

## ⛔ Blocked

_(none)_

## ⏭️ Deferred to later phases (with reasons)

- **UX-06 (arrowhead styles):** multi-layer cosmetic change (ShapeAnnot type + sub-toolbar UI + overlay render + toApiAnnotations + backend line-ends). Current single closed-arrow renders fine. Deferred — flag if you want the style picker prioritised.
- **UX-08 (note re-edit from right rail):** canvas double-click re-edit works now. Right-rail double-click-to-edit is deferred because baked annotations are read-only in Phase 1 (re-editable baked annots is the Phase 2 sidecar item).
- **UX-23 (split auto-collapse + zoom sync):** rail-collapse infrastructure done; secondary panes start collapsed. Full auto-collapse-of-both-panes-on-split and initial zoom/position sync deferred to the Phase 5 split-view polish.
- **UX-30 (MiniMap):** no overlap today (toolbar/minimap/bottom-bar are stacked in flow). The wave-scrub redesign is Phase 5C.
- **UX-32 (sync scroll between panes):** genuinely missing feature. Deferred to Phase 5 split-view work — needs a cross-pane page channel + View-menu toggle + loop guard.
- **FC-05 PDF form filling, FC-06 password PDFs, Help mode, Organise tool, Light/Dark mode:** large Phase 4/5 features, each its own focused build.

---

## ✅ Completed (with notes)

### Pre-Phase 1 Hotfix (P1-33) — Ctrl+K command palette
- Bound `Ctrl+K` as an alias for the command palette (alongside `Ctrl+Shift+P`), making the existing first-run hint correct. Ctrl+K is the modern standard (Linear/VS Code/Slack). Updated cheat sheet.

### Phase 1 — Annotation pipeline (E-08)
- **P0-01 / E-08c (multi-layer overwrite):** `autoSaveAnnotations()` now sends the full authoritative set `[...bakedAnnotations, ...annotations]`. The backend's replace-semantics clears all and rewrites, so previously-baked annotations no longer get wiped.
- **P0-02 / E-08d + P1-01 (round-trip + invisible ink/shapes):** Canvas render now uses dynamic `annotationMode` — `2` (ENABLE) when there are no JS overlays so PDF.js paints embedded annotations on re-open; `0` (DISABLE) while overlays are active to avoid double-render. Boolean threshold (`hasOverlayAnnots`) means one re-render on 0↔non-zero crossing, not per-annotation (resolves §8.1 flicker concern).
- **P1-02 / E-08b (stamp red box):** Removed the `xref_set_key(a.xref, "C", ...)` hack. For FreeText, "C" is the *background* colour — setting it to the same colour as the text produced an invisible-label coloured box. Now keeps white fill + coloured bold text + coloured border, kept as a real annotation (so replace-semantics still clears it).
- **P1-34 (author):** Added `author?` to API `Annotation` type and `InkAnnot` local type; `toApiAnnotations()` passes it through; backend writes it to each annotation's `/T` field via `set_info(title=...)`. Added length cap in router validation.
- **P1-31 (dev error copy):** Replaced "cd backend && uvicorn..." with "Annotation service unavailable — the background service isn't running."
- **Tests:** 3 new smoke tests (multi-layer bake, author round-trip, stamp-not-red-box) — all pass. Full smoke suite green, tsc clean, 119/119 frontend tests pass.

### Phase 2 — functional bug batch (all groups complete)
**Group A (annotation behaviour):** P1-06/07 pending-note pattern (no empty notes, atomic undo); P1-08 selection clears on tool switch (popup dismisses); P1-09 markup auto-applies when tool already selected; P1-13/14 shift-click seeds multi-select (first item included, bulk bar works); P1-15 colour labels in right rail; P1-16 freetext tag input no longer dismisses editor; P1-17 ellipse preview; UX-11 focused-row highlight. Also fixed QuickActionBar markup bypassing undo.
**Group B (download/save):** P1-10 toast on no-change Ctrl+S; P1-11 commit-or-download guard modal; P1-12 rename seeds workingBlob so it's downloadable.
**Group C (keyboard):** P1-21 ⌘P→Ctrl+K label; P1-22 Ctrl+, opens Settings; P1-23 removed duplicate gear, added File→Settings…; P1-25 fixed View-menu side-by-side shortcut labels.
**Group D (navigation/display):** P1-18 search active-match indicator; P1-19 outline navigate-vs-collapse; P1-28 QuickActionBar viewport clamping/flip; P1-29/32 thumbnail toggle no longer clipped; P1-30 number-input spinner suppressed; P1-04 focus trap (Settings + cheat sheet).
**Group E (split):** P1-03/24 close guards; P1-35 mirrorGroupId cleanup; P1-26 live mirror draft display.
**Group F:** P1-27 reduced-motion OS-preference-wins.
All committed across 6 commits. tsc clean; 119/119 tests; backend smoke green.

### Phase 3 — UX improvements (core set complete)
- UX-05 text selection + QuickActionBar in View mode; UX-09 note-from-selection pre-populates + editable.
- UX-02 zoom overhaul (snap-to-10%, Ctrl+0 reset, Ctrl+scroll); UX-04 UI-scale↔PDF-zoom compensation; UX-01 page fade-in.
- UX-10 scroll-to-centre on rail click; UX-11 focus highlight; UX-12 status lozenges.
- UX-13 wider tabs + pinned +/gear with scrolling strip; UX-14 themed scrollbars; number-input spinner suppressed.
- UX-15/16 merge duplicate flag + page counts; UX-17/29 rearrange open-in-viewer + keyboard hint; UX-18 images reorder + GIF/BMP/WebP.
- UX-20 lossless compress mode; UX-22/N-06 collapsible right rail + setting.
- UX-24 home capability CTAs; UX-25 privacy popup.
- UX-26 palette completeness (Open/Zoom/Toggle annotations); UX-27 plain-number page jump; L-02 "Draw"→"Ink"; UX-33 undo-after-bake note.
- UX-05 ink colour picker + 1-9 weighted width keys.
Committed across ~7 commits. tsc clean; 119/119 tests; backend smoke green; production build verified.
Deferred items listed above.

### Phase 4 — new features (partial)
- 5.4 Annotation search — search box in the right-rail Notes panel (content/author/type/tags).
- 5.5 Custom stamp labels — Settings → Annotations add/remove; appended to built-in stamps.
- 5.6 Print — File menu / palette / Ctrl+P via hidden iframe (prints only the PDF). **Verify the print dialog opens in the Tauri build.**
- 6.5 Outline+Bookmarks merged into one "Document" rail tab (new DocumentPanel; Outline section hidden when the PDF has none).
- 5.7 Watermark-from-viewer was already wired (Document menu + palette) — no work needed.
tsc clean; 119/119 tests; backend smoke green.

### Phase 4 — remaining large features (now complete)
- 5.1 Recent files — reworked file intake to Tauri-native dialog + native window drag-drop (new `tauri-plugin-dialog`; `cargo check` passes); path-keyed recent store; Home "Recent" section; Viewer Open routes through native picker.
- 5.2 Password PDFs — unlock dialog → decrypt-once → load; encrypt/decrypt smoke tests.
- 6.4 Help mode — toolbar toggle + contextual help strip per tool.
- 5.3 Form filling — backend list/fill engine + routes + smoke test; FormPanel (list → edit → apply); Document menu + palette entries.
Committed across 4 commits. tsc clean; 119/119 tests; backend smoke green; production build + cargo check green.

---
