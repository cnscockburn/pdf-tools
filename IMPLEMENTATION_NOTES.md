# Implementation Notes — Working Log

Tracks blocked items, decisions needed, and items requiring your manual testing as I work through `IMPLEMENTATION_PLAN.md`.

**Started:** 2026-06-06

---

## 🔴 Needs Your Decision

_(none yet)_

---

## 🟡 Needs Your Manual Testing (in a running Tauri build)

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

_(none yet)_

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

---
