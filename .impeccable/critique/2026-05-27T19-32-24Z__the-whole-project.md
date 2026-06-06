---
timestamp: 2026-05-27T19-32-24Z
slug: the-whole-project
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good loading states, backend health indicator, annotation count — but no progress feedback when rendering large PDFs or building the text index |
| 2 | Match System / Real World | 3 | Clean language throughout — "Merge," "Split," "Redact" are correct verbs. Minor: "Compress" and "Organize" labels are slightly generic |
| 3 | User Control and Freedom | 4 | Undo/redo stack, confirmation gates on redact/crop/clear, Escape exits modes, unsaved-changes guard, tabs are closeable with fallback — excellent |
| 4 | Consistency and Standards | 3 | Warm stone palette, amber accent, consistent ProcessButton and FileDropZone patterns across tool pages. Minor: Home page uses custom drop zone while tool pages use the shared FileDropZone component — slight visual inconsistency |
| 5 | Error Prevention | 3 | Destructive actions (redact, crop, clear annotations) use confirmation steps. File picker constrains to PDF. Backend validates file types. Minor gap: no file-size warning before uploading very large PDFs |
| 6 | Recognition Rather Than Recall | 3 | Mode buttons are labelled with keyboard shortcuts shown inline. Command palette provides fuzzy-search discovery. Tool cards on Home show clear descriptions. Minor: some Viewer toolbar actions are only in the menu bar with no visible button |
| 7 | Flexibility and Efficiency | 4 | Extensive keyboard shortcuts for every action, command palette, mouse + keyboard for annotations, tab management shortcuts (Ctrl+T/W/Tab/1-9), continuous scroll, editable filenames — power-user paradise |
| 8 | Aesthetic and Minimalist Design | 3 | Clean dark chrome in Viewer, warm stone Home page, purposeful amber accent. Annotation sub-mode toolbar gets dense with 10 modes + color swatches + controls. Home page split-panel layout is clean but the tool list is a plain vertical stack |
| 9 | Error Recovery | 3 | Error messages in Merge/Rearrange/ImagesToPDF are displayed inline near the action. Viewer shows annotate/redact/crop errors in the toolbar. "Retry Save" button on annotation failure. Minor: generic "Unknown error" fallback |
| 10 | Help and Documentation | 3 | Keyboard cheat sheet (`?`), command palette, tooltips on every button. No in-app onboarding, tutorial, or contextual first-use hints |
| **Total** | | **32/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

**LLM assessment**: This does not look AI-generated. The Home page avoids the identical-card-grid pattern — tools are listed as compact rows with subtle hover states rather than flashy icon boxes. The Viewer chrome is opinionated: dark stone with amber accents, compact toolbars, and a density that feels like a purpose-built tool rather than a template. Typography is restrained with tight scales (11px labels, 13px titles) that feel hand-tuned. The annotation toolbar in particular shows domain-specific thinking (text-aware selection with fallback to free-rect for scanned PDFs) that no template would produce.

Potential tells: The Home page split-panel layout (file intake left, tool list right) is clean but conventional. The tool list rows are all structurally identical (icon + title + description) with no variation in visual weight or priority signaling. The FileDropZone and ProcessButton components are well-made reusable primitives but produce sameness across the Merge/Rearrange/ImagesToPDF pages — they look like siblings of the same template.

**Deterministic scan**: Unavailable (bundled detector not found). Cannot provide automated rule counts or file-level findings.

## Overall Impression

Stria is a genuinely well-crafted tool. The Viewer is the centrepiece and it delivers: dense, keyboard-first, feature-rich without being overwhelming. The tab system and side-by-side view are technically sound. The weakest surfaces are the secondary tool pages (Merge, Rearrange, Images to PDF) which feel like utility screens rather than part of the same product. The Home page does its job but doesn't communicate the ambition of what's behind it.

The single biggest opportunity: the Home page undersells the product. When a user lands, they see a file drop zone and a plain list of six tools. There's no sense of Stria's depth — the annotation system, the side-by-side view, the keyboard-first workflow. The "Open a file" → "Document tools" split reads more like a settings panel than the front door of a capable PDF workstation.

## What's Working

1. **Viewer keyboard architecture**: Every mode, every annotation type, every navigation action has a binding. The cheat sheet, command palette, and inline kbd tags create three discovery layers. This is genuinely expert-grade UX that respects power users without locking out novices.

2. **Annotation system depth**: Eight annotation types with text-aware selection, multi-level undo/redo, status tracking, export to Markdown, and the mirror-sync for side-by-side review. The confirmation gates on destructive actions (redact, crop, clear) show careful thinking about irreversible operations.

3. **Tab state preservation**: The `display:none` mounting strategy is the right call. Switching between a Viewer tab mid-annotation and a Merge tab preserves everything — page position, mode, annotations, scroll. This is table-stakes for a document workstation and it's implemented correctly.

## Priority Issues

### [P2] Home page does not communicate product identity or guide user intent

**Why it matters**: First impression sets expectations. A user arriving at Stria sees a generic drop zone and a flat tool list. There's no hierarchy distinguishing the primary workflow (open a PDF → review/annotate) from secondary utilities (merge, convert). A first-time user has no signal about what Stria does well or where to start.

**Fix**: Differentiate the primary action (opening a PDF for review) from the tool utilities. The drop zone should feel like the main event, not half of a 50/50 split. Consider giving the viewer workflow more visual weight — a larger intake area with a hint of what's inside (annotation preview, or a single-sentence value prop). Push the tool list into a secondary position or a collapsible drawer.

**Suggested command**: `/impeccable craft Home.tsx`

### [P2] Tool pages (Merge, Rearrange, Images to PDF) are interchangeable and lack personality

**Why it matters**: Every tool page follows the exact same template: Layout wrapper → FileDropZone → file list → ProcessButton. The structure is correct but the pages are visually interchangeable. A user switching between them gets no spatial memory — "which page am I on?" requires reading the title.

**Fix**: Give each tool page a subtle visual differentiator. This doesn't need to be dramatic — a different empty-state illustration, a page-specific accent, or a progress indicator that shows the user where they are in the workflow (e.g., Merge: "Step 1: Add files → Step 2: Arrange order → Step 3: Download"). The Layout component's back-arrow header is functional but generic; it could carry more context.

**Suggested command**: `/impeccable craft Merge.tsx`

### [P2] Annotation toolbar density at 10+ sub-modes

**Why it matters**: When in annotate mode, the bottom toolbar shows up to 10 mode buttons (Note, Highlight, Underline, Strikethrough, Freetext, Ink, Shape, Stamp) plus contextual controls (color swatches, shape sub-types, ink width, stamp labels) plus controls (annotation count, Undo, Redo, Clear all, Done). On narrow viewports this wraps and becomes hard to parse. Each button is 2.5px padding with a 3.5px icon — very small touch targets.

**Fix**: Group the annotation modes into semantic clusters (text markup: highlight/underline/strike; drawing: ink/shape; metadata: note/freetext/stamp) with subtle separators. Consider a "more" overflow for less-used modes. The contextual controls (color, shape type, width) could move into a popover attached to the active mode button rather than stretching the toolbar.

**Suggested command**: `/impeccable layout Viewer.tsx` or `/impeccable distill Viewer.tsx`

### [P3] No first-run orientation or empty-state personality

**Why it matters**: A new user opening Stria for the first time gets the Home page with no guidance. The Viewer empty state shows a drop zone with generic copy. There's no hint about keyboard shortcuts, annotation capabilities, or the side-by-side feature. Discovery depends entirely on the user clicking around or pressing `?`.

**Fix**: Add a lightweight first-run hint (not a modal — inline, dismissible) that surfaces 2–3 key capabilities: "Press `?` for keyboard shortcuts", "Try side-by-side view with Ctrl+\", "8 annotation types available". The Viewer empty state could show a brief capabilities overview instead of just a drop zone.

**Suggested command**: `/impeccable onboard Viewer.tsx`

### [P3] Merge file list has no drag-to-reorder

**Why it matters**: The Rearrange page has full drag-and-drop via @dnd-kit, but the Merge page — where file order directly determines output page order — only supports remove-and-re-add. This is a friction point for the most common multi-file operation.

**Fix**: Add sortable drag handles to the Merge file list, reusing the @dnd-kit pattern from Rearrange. The infrastructure is already in the project.

**Suggested command**: `/impeccable craft Merge.tsx`

## Persona Red Flags

**Jordan (First-Timer)**: Lands on Home page. Sees "Open a file" and "Document tools" — no explanation of what Stria is or what it does differently. Drops a PDF. Viewer opens with a dark chrome UI and no guidance. Doesn't know about annotation modes, keyboard shortcuts, or side-by-side. The tool bar at the bottom says "View" and three other modes — what do they do? No tooltips appear on hover for the mode bar (there are tooltips, but the text is terse: "Annotate (A)"). Likely uses Stria as a basic PDF viewer and never discovers 80% of its features. **Risk: high underutilization.**

**Alex (Power User)**: Opens multiple PDFs in tabs. Uses keyboard shortcuts fluently — the Ctrl+Tab cycling, Ctrl+1-9 jump, Ctrl+\ for side-by-side are all correct. Tries to reorder files in Merge by dragging — can't. Notices that the secondary pane in side-by-side mode has no download button (correctly hidden), but wonders how to save the document from that pane. Wants to drag-resize the split panes — the divider is a static 1px line with no resize handle. **Risk: minor friction, mostly satisfied.**

**Sam (Accessibility User)**: Tab bar uses `role="tab"` with `aria-selected` — correct. Close buttons have `aria-label`. FileDropZone has `aria-label`. Focus-visible rings are present on all interactive elements. The Viewer canvas area requires a click to receive keyboard focus — no skip-nav or focus-management on tab switch. MiniMap blocks are tiny (4px minimum) with no keyboard navigation. The annotation toolbar's small buttons (2.5px padding) may be difficult for motor-impaired users. **Risk: moderate — ARIA structure is good, but canvas-centric interaction has inherent accessibility limits.**

## Minor Observations

- The Viewer `_rid` counter (line 78) uses a module-level `let` — safe in a single-session SPA but would collide if the module were hot-reloaded in an unusual way. Consider using a UUID or crypto.randomUUID().
- `ImagesToPDF` creates object URLs on every `files` change via `useMemo` and revokes them on cleanup — correct pattern, but the revocation runs on the *new* URL array, not the old one. This means the previous URLs leak until the component unmounts. Use a `useEffect` with a cleanup that captures the previous URLs.
- The Merge file list uses array index as the React key (`key={i}`). Since items can be removed mid-list, this causes React to remount the wrong DOM nodes. Use `file.name + file.lastModified + i` or a stable ID.
- Backend health check runs every 15 seconds in every Viewer tab. With 5 tabs open, that's 5 health checks every 15s. Consider moving the check to TabShell and passing the result down via context.
- The `kbRef.current` pattern (line 275–284) is a manual equivalent of `useLatest` — works correctly but is a common source of stale-closure bugs if any function reads from `kbRef` after component unmount.

## Questions to Consider

- What if the Home page showed a recent-files list? The privacy-first architecture means files aren't uploaded, but `File` objects are ephemeral. Could you store just filenames (no content) in localStorage as a "recently opened" list for spatial memory?
- The Viewer is 2000+ lines. When side-by-side mode evolves to support independent documents per pane, a ViewPane extraction becomes mandatory. Is now the right time, or is the current single-component approach still manageable?
- Should the tool pages (Merge, Rearrange, Images to PDF) open inside the Viewer as panel tools rather than as separate tab types? The Viewer already hosts Split, Extract, Rotate/Delete, Compress, and Watermark as right-panel tools. Consistency suggests Merge and Rearrange could live there too — but they have fundamentally different input models (multiple files vs. single file).
