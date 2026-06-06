# Stria PDF Toolkit — Test Protocol

**Version:** 2026-05-28  
**Covers:** Full feature surface including viewer, annotations, tools, settings, tabs, and split view.  
**Purpose:** Automated pre-flight results + manual verification checklist for every user-facing feature.

---

## Part 1 — Automated Test Results

All automated checks were run on the current codebase before this protocol was produced. No action needed from you on these items unless a check regresses.

| Check | Tool | Result | Notes |
|---|---|---|---|
| TypeScript types | `tsc --noEmit` | **PASS** — 0 errors | |
| Unit tests | Vitest (119 tests) | **PASS** — 119/119 | TabBar, client, storage, AnnotationLayer, utils, MathText, … |
| Frontend build | Vite production | **PASS** | 1 informational warning: index.js 1131 kB (expected — PDF.js is large) |
| Python smoke tests | `backend/smoke_test.py` | **PASS** | Note, highlight, underline, strikethrough, freetext, ink, shape, stamp; redact, split, page-ops, compress, watermark, crop, pdf-to-images |
| npm audit | `npm audit` | **PASS** — 0 vulnerabilities | |
| Cargo audit | `cargo audit` | **PASS** | RUSTSEC-2024-0429 (glib) documented in `src-tauri/audit.toml` — GTK4/GTK3 incompatibility, Windows-only build |
| Python bandit | `bandit -r backend/` | **PASS** | B310 nosec on http_test.py test URLs (non-production) |
| Semgrep | `semgrep --config auto` | **PASS** | `current_exe` and `args` nosemgrep'd with rationale; `dangerouslySetInnerHTML` DOMPurify'd |

---

## Part 2 — Manual Test Protocol

**Before you start:**

1. Build and launch the app: `npm run tauri dev` (or the installed binary).
2. Have two or three test PDFs ready — use a multi-page one (10+ pages) for full coverage.
3. Work through each section in order. Mark each item **Pass**, **Fail**, or **Skip** (with a reason if skipping).
4. When you encounter a failure, note the steps to reproduce and any console errors.

> **Legend:** `[ ]` = step to perform. `→` = expected result. `?` = question to consider and answer.

---

### A. App Startup

**A-01** First launch  
`[ ]` Launch the app cold.  
→ Home page opens. Stria logo, tagline "Local PDF toolkit" visible. -> web icon doesn't have stria logo
→ Window title is "Stria".  -> yes
→ No console errors. -> yes

**A-02** Persistent state  
`[ ]` Open a PDF, note the tab title. Close the app and relaunch.  
→ App starts on the Home tab (tabs are ephemeral — they do not persist across restarts). This is intentional.  -> yes
→ Settings you changed in the previous session (author name, UI scale, etc.) are still applied. -> yes

---

### B. Home Page

**B-01** Drop zone  
`[ ]` Drag and drop a PDF onto the large drop zone.  
→ Drop zone border turns amber and scales slightly while hovering.  -> Yes
→ File opens in a new Viewer tab; tab title matches the filename. ->Yes

**B-02** Browse button  
`[ ]` Click the drop zone without dragging.  
→ System file picker opens, filtered to `.pdf` files.  -> yes
→ Selected file opens in a new Viewer tab.->yes

**B-03** Tool cards — tools that need a file (Split, Compress, Redact)  
`[ ]` Click "Split" on the home page.  
→ File picker opens. Select a PDF.  ->yes
→ Viewer opens with the Split tool panel pre-selected. ->yes

**B-04** Tool cards — tools that open a standalone tab (Merge, Organize, Images to PDF)  
`[ ]` Click "Merge".  
→ Merge tool tab opens immediately (no file picker).   ->yes
`[ ]` Click "Organize".  
→ Rearrange tab opens.   ->yes
`[ ]` Click "Images to PDF".  
→ Images-to-PDF tab opens. ->yes

**B-05** Capability hints  
`[ ]` Read the three capability hints below the drop zone.  
→ They mention: annotation types + undo/redo, keyboard-first with ?, side-by-side comparison.  
? Are these the three most compelling selling points? What would you change or add? -> These aren't very useful - I think they should just show the shortcut for the three of them. And when you click them open the file selector dialog, load the pdf, then load into the tool/screen. 

**B-06** Privacy footer  
`[ ]` Read the footer.  
→ States files are never uploaded and do not persist after closing.  
? Does this statement inspire confidence, or does it feel like fine print? Should it be more prominent? -> it's probably worth having a popup with a few more details. 

---

### C. Tab System

**C-01** New tab  
`[ ]` Press `Ctrl+T`.  
→ A new Home tab opens and becomes active. -> works fine on live build

**C-02** Close tab  
`[ ]` While a Viewer tab is active and has no unsaved changes, press `Ctrl+W`.  
→ Tab closes. Previous tab becomes active. -> works fine on live build

**C-03** Close last tab  
`[ ]` Close tabs until only one remains. Close it with `Ctrl+W`.  
→ A fresh Home tab is auto-created — the app never shows zero tabs. -> works fine on live build

**C-04** Switch tabs with keyboard  
`[ ]` Open 3+ tabs. Press `Ctrl+Tab` repeatedly.  
→ Focus cycles forward through tabs.   -> works fine on live build
`[ ]` Press `Ctrl+Shift+Tab`.  
→ Focus cycles backward.  -> works fine on live build
`[ ]` Press `Ctrl+1`, `Ctrl+2`, `Ctrl+3`.  
→ Jumps directly to the tab at that position. -> works fine on live build

**C-05** Switch tabs with mouse  
`[ ]` Click a non-active tab.  
→ That tab becomes active. The previously-active tab's state is completely preserved (scroll position, annotations, tool panel open/closed, etc.). -> works fine on live build

**C-06** Close button  
`[ ]` Hover over any tab in the tab bar.  
→ A small × button appears.   -> works fine on live build
`[ ]` Click it.  
→ Tab closes. -> works fine on live build

**C-07** Settings button in tab bar  
`[ ]` Click the gear icon at the right end of the tab bar.  
→ Settings dialog opens.  -> works fine on live build

-> improvement - viewer page shouldn't have settings menu on as this has moved to the menu bar

**C-08** Multiple Viewer tabs — state isolation  
`[ ]` Open two different PDFs in two Viewer tabs.  
`[ ]` In Tab 1: navigate to page 5, zoom in, create a highlight annotation.  
`[ ]` Switch to Tab 2. Interact with it freely.  
`[ ]` Switch back to Tab 1.  
→ Page 5 still shown, zoom preserved, annotation visible. The switch to Tab 2 did not reset Tab 1's state. -> works fine on live build

? When you have 6+ tabs open, does the tab bar handle overflow gracefully? Can you still read all tab titles?
-> yes, this worked fine. There is some performance problems (slightly lagging) when 8x large (180+ pdfs). Is there any performance optimisation we can think about?
---

### D. PDF Loading & Navigation

**D-01** File metadata  
`[ ]` Open any multi-page PDF.  
→ Filename appears in the Viewer top bar and the tab title.  -> works fine on live build
→ Page indicator shows "1 / N" where N is the correct page count. -> works fine on live build
-> improvement: default zoom should be to 1 full page visible - at the moment it loads weirdly. 

**D-02** Page navigation — buttons  
`[ ]` Click the next-page chevron (→).  
→ Advances one page.  -> works fine on live build
`[ ]` Click the previous-page chevron (←).  
→ Goes back one page.  -> works fine on live build
`[ ]` Click and directly edit the page number input field. Type "5" and press Enter.  
→ Jumps to page 5. -> works fine on live build
-> improvement - can we smooth and animate between page jumps, to remove any sudden jumps
-> when you click to directly edit the page number input field, the up down arrows aren't themed to match the UI of the program. Can we adjust it to be visually consistent?

**D-03** Page navigation — keyboard  
`[ ]` Press `→` (or `↓`).  
→ Next page.   -> works fine on live build
`[ ]` Press `←` (or `↑`).  
→ Previous page.   -> works fine on live build
`[ ]` Press `Home`.   
→ First page.  -> works fine on live build
`[ ]` Press `End`.  
→ Last page. -> works fine on live build

**D-04** Page navigation — scroll  
`[ ]` Scroll down past the bottom of the current page.  
→ Advances to the next page automatically.  
`[ ]` Scroll up past the top.  
→ Goes back one page.

-> improvement - can we smooth and animate between page jumps, to remove any sudden jumps

**D-05** Zoom  
`[ ]` Click the + button in the toolbar.  
→ Zooms in. Canvas enlarges.  
`[ ]` Click the – button.  
→ Zooms out.  
`[ ]` Press `+` or `=` key.  
→ Zooms in.  
`[ ]` Press `-` key.  
→ Zooms out.

-> improvement - can we change the way it jumps - first time you click it, it jumps to the nearest 10 (above or below, depending on operation)
-> can we find a keymap for resetting zoom to 100%? Ctrl+0?
-> pressing ctrl+ mouse scroll should zoom the pdf inside the viewer


**D-06** Default fit mode (from Settings)  
`[ ]` Open Settings (gear icon). Set "Default fit" to "Fit page".  
`[ ]` Open a fresh PDF.  
→ The PDF opens scaled so the entire page is visible vertically.  -> works fine

-> can we smooth the animation as this happens post load
`[ ]` Change "Default fit" to "Actual size (100%)".  
`[ ]` Open a fresh PDF.  
→ PDF opens at exactly 100% scale (scale indicator or canvas matches physical page size).  -> works fine
`[ ]` Change "Default fit" back to "Fit width" for normal use.

**D-07** Filename editing  
`[ ]` Click the filename in the Viewer top bar.  
→ An editable input appears.  -> works fine
`[ ]` Change the filename to "renamed-test.pdf" and press Enter.  
→ The filename updates in the top bar and in the tab title.  -> works fine
`[ ]` Press `Ctrl+S` to download.  
→ Downloaded file is called "renamed-test.pdf".-> this doesn't count as a "modificiation, so it wouldn't let you download a new version. 

---

### E. Annotations — All 8 Types

> For each annotation type: activate the mode, create the annotation, verify it appears correctly, then undo and verify it disappears.

**E-01** Note (sticky)  
`[ ]` Press `A` to enter Annotate mode. The toolbar below the canvas shows annotate sub-modes.  
`[ ]` Confirm "Note" is selected. Click anywhere on the page.  
→ A sticky-note icon/dot appears at that location.  -> works fine
`[ ]` Double-click the note.  
→ An editable text input appears. Type a comment and press Enter or click away.  -> works fine
→ The comment text is saved and associated with that note.-> works fine

-> If I click accidentally, then click away without typing a comment, the comment persists as empty. It should disappear. 
-> IMprovement - when I double click an existing note, it should reopen to edit it. 
-> IMprovement - when I double click a note in the annotations bar, I should be able to edit the text, and it should just to the comment being selected and expanded on the pdf. 

**E-02** Highlight  
`[ ]` Press `H` to switch to Highlight mode.  
`[ ]` Click and drag across a line of text.  
→ A semi-transparent highlight appears in the currently selected colour (default Yellow).  
`[ ]` Press keys `1`, `2`, `3`, `4` to cycle through the four highlight colours.  
→ Subsequent highlights use the newly selected colour.

-> I had selected a highlighted section, and this popped up with the colour change option. When I pressed H to select another area, this popup remained. 
-> When I select text, it opens the text annotation dialog (highlight-strikethrough-underline) even though I've already got the highlight tool selected. This should only appear when I select text without the highlight/strikethrough/underline option selected. 
-> Improvement: improve the selection of text algorithm - sometimes it doesn't allow you to select the first character in the row.

**E-03** Underline  
`[ ]` Press `U` to enter Underline mode.  
`[ ]` Click and drag across a word or phrase.  
→ A single underline appears below the selected text.
-> works, but similar comments to highlight

**E-04** Strikethrough  
`[ ]` Press `S` to enter Strikethrough mode.  
`[ ]` Click and drag across text.  
→ A line appears through the centre of the selected text.
-> works, but similar comments to highlight


**E-05** Text box (freetext)  
`[ ]` Press `T` to enter Text box mode.  
`[ ]` Click and drag to draw a rectangle on the page.  
→ A text box appears. Type some text inside it.  -> works
`[ ]` Click elsewhere to deselect.  
→ The text box shows your text as a black-bordered box overlay. ->works

-> can't add a tag - when you try and click on it, it disappears

**E-06** Ink / Freehand draw  
`[ ]` Press `I` to enter Ink mode.  
`[ ]` Click and drag to draw a freehand stroke on the page.  
→ A smooth curve appears in the current ink colour following your pointer.  -> works fine
`[ ]` Draw multiple strokes.  
→ Each stroke is an independent annotation.  ->works fine
`[ ]` Check the ink width controls in the sub-toolbar — try changing the width.  
→ New strokes reflect the new width.->works fine

-> improvement: better smoothing algorithm for text
-> improvement: add primary colour selection options for text

**E-07** Shape (rectangle / ellipse / arrow)  
`[ ]` Press `G` to enter Shape mode.  
`[ ]` The sub-toolbar should show rect/ellipse/arrow options. Select "Rectangle".  
`[ ]` Click and drag to draw a rectangle.  
→ A bordered rectangle overlay appears.  -> works
`[ ]` Switch to "Ellipse" and draw.  
→ An ellipse/oval appears.  -> works
`[ ]` Switch to "Arrow" and drag from one point to another.  
→ An arrow appears pointing from start to end.-> works

-> improvement - ellipse renders in preview as a rectangle, should preview as an ellipse
-> arrow head of arrow is still very weird - it would be good to have a couple of arrowhead types

**E-08** Stamp  
`[ ]` Press `P` to enter Stamp mode.  
`[ ]` The sub-toolbar shows stamp label options (e.g. "Approved", "Rejected", "Draft", …). Select one.  
`[ ]` Click on the page.  
→ A stamp badge appears at the click point with the chosen label and a colour appropriate to the label.


-> when I download this, shapes and drawing do not render.
-> when I download this, stamps are rendered as red boxes
-> when I add extra layers, only the last layer is rendered in the download

-> reloading a document with downloaded annotations do not then appear in the viewer with the annotations on - this is a CRITICAL BUG
---

### F. Annotation Management

**F-01** Undo / Redo  
`[ ]` Create three annotations in sequence.  
`[ ]` Press `Ctrl+Z` three times.  
→ Each undo removes the most recent annotation. After three presses, all three are gone.  

-> all annotations were remnoved on one press of ctrl z, except for the note which removed the text contents
`[ ]` Press `Ctrl+Shift+Z` three times.  
→ Each redo re-adds the annotation. All three are back.

-> all were restored on one shortcut press

**F-02** Delete a single annotation  
`[ ]` Click on any annotation to select it (a selection handle/border should appear).  -> the (x) in red shape is blocked by the resize handles of things
`[ ]` Press `Delete` or `Backspace`.  
→ Annotation is removed. -> this works

**F-03** Multi-select  
`[ ]` Hold `Shift` and click multiple annotations one by one.  
→ All clicked annotations show selection state.  -> worked
`[ ]` With multiple selected, press `Delete`.  -> the first thing selected didn't delete
→ All selected annotations are deleted in one action.  
`[ ]` Undo.  
→ All deleted annotations return together (one undo step, not N). -> worked 

**F-04** Bulk status change  
`[ ]` With multiple annotations selected, look for a bulk-action toolbar or context menu.  
→ Options to change annotation status (Open / Resolved / Wontfix) should be present.   -> nothing appeared
`[ ]` Change status to "Resolved".  
→ All selected annotations update to show Resolved status. -> as above

**F-05** Bake / commit annotations to PDF  
`[ ]` Create several annotations. Click "Done" (or equivalent commit button) in the annotate toolbar.  
→ The app sends annotations to the backend. A brief loading indicator appears.  
→ On success, annotations move to "baked" state — they are now embedded in the PDF blob.  -> yes
→ Baked annotations remain visible as overlays.  -> yes works
`[ ]` Download the PDF (`Ctrl+S`). Open it in another PDF viewer.  
→ The annotations appear in the external viewer as real PDF annotations. -> so some of them still appear - have give comments about baked annotations above

-> improvement - need ability to edit baked annotations by reopening the pane
-> improvement - appearance of baked annotations are different from previous ones which decreases user confidence

**F-06** Annotation error handling  
`[ ]` If the Python backend is not running, attempt to commit annotations ("Done").  
→ An error message appears explaining the backend is unavailable. App does not crash. -> works

**F-07** Author stamping  
`[ ]` Set your name in Settings → Identity → Author name.  
`[ ]` Create a note annotation.  
→ When you view the annotation in the right rail panel, the author field should show your name. -> works

**F-08** Annotation visibility toggle  
`[ ]` With several annotations on the page, press `Shift+H`.  
→ All annotation overlays disappear.  -> works well
`[ ]` Press `Shift+H` again.  
→ All annotations reappear. -> works well

**F-09** Colour label customisation  
`[ ]` Open Settings → Annotations → "Highlight colour labels".  
`[ ]` Rename "Yellow" to "Key term" and "Cyan" to "Follow up".  
`[ ]` Return to the Viewer. Enter Highlight mode.  
→ The colour picker in the sub-toolbar shows "Key term" and "Follow up" instead of Yellow and Cyan.  -> this works
→ The right rail annotation list also uses the custom labels. -> this doesn't

---

### G. Text Selection & QuickActionBar

**G-01** Text selection appearance  
`[ ]` In View mode (press `V`), click and drag over text in the document.  
→ Text highlights in amber (the custom selection colour defined in `index.css`). -> this doesn't work, you can't highlight anything 

**G-02** QuickAction bar  
`[ ]` Select a phrase of text while in Highlight, Underline, or Strikethrough mode.  
→ A floating action bar appears near the selection with "H", "U", "S" buttons.  -> this works - but it's the only way that it works, you can't highlight directly. 
`[ ]` Click "H" (highlight).  
→ The selected text becomes a highlight annotation. The action bar dismisses.  -> works
`[ ]` Select more text. Click "U".  
→ Underline created. -> works

-> clicking note from this menu creates an uneditable note with the text - this isn't very useful
-> improvement: should be able to create notes with selected text

**G-03** QuickAction bar positioning  
`[ ]` Select text near the very top of the page.  
→ The QuickAction bar should appear below the selection (not off-screen above).  
? Does the bar position itself intelligently regardless of where on the page the selection is?
-> no, not entirely. It overlaps with the selection on quite a lot of instances, and appears over the top of the menu bar. 

---

### H. Search

**H-01** Open and close  
`[ ]` Press `Ctrl+F`.  
→ Search bar slides in (typically at the top of the canvas area).  -> comes at the very bottom, but appears
`[ ]` Press `Esc`.  
→ Search bar dismisses. Canvas returns to normal. -> works well

**H-02** Basic text search  
`[ ]` Open a PDF with known text. Press `Ctrl+F`.  
`[ ]` Type a word you know exists.  
→ Matching occurrences on the current page are highlighted in yellow.  -> yes
→ A result counter shows "1 of N matches" (or similar). -> yes

**H-03** Navigate results  
`[ ]` With results shown, press `Enter` or click the next-result button.  
→ Focus moves to the next match. If on a different page, the document navigates there.  -> no difference in selection inside the page - it will jump pages, but doesn't change selection or visually indicate within the page
`[ ]` Press `Shift+Enter` or the previous-result button.  
→ Focus moves to the previous match. -> as above

**H-04** No results  
`[ ]` Search for a string that does not exist in the document.  
→ "No results" feedback shown. No crash. -> works well

**H-05** Search across pages  
`[ ]` Search for a term that appears on multiple pages throughout a long document.  
→ Navigation cycles through all pages containing matches, not just the current page. -> works well

---

### I. Thumbnail Sidebar

**I-01** Open and close  
`[ ]` Click the thumbnail sidebar toggle button (typically on the left edge of the viewer).  
→ A sidebar slides in showing small previews of each page.  -> the toggle button is partially obscured by the canvas. , but it does work. 
`[ ]` Click the toggle again.  
→ Sidebar collapses. -> works

**I-02** Thumbnails-open-by-default setting  
`[ ]` Open Settings → Documents → "Open thumbnails automatically".  
`[ ]` Toggle it on.  
`[ ]` Open a new PDF.  
→ The thumbnail sidebar is already open when the PDF loads. -> works well

**I-03** Navigate via thumbnail  
`[ ]` With sidebar open, click any thumbnail that isn't the current page.  
→ The main canvas navigates to that page. Clicked thumbnail appears highlighted/selected. -> work well

**I-04** Thumbnail scroll  
`[ ]` Open a PDF with 20+ pages.  
→ The thumbnail sidebar is scrollable. Scrolling the thumbnails does not affect the main canvas. -> works well. can scrollbar be themed to match the rest of the UI?

---

### J. Right Rail

The right rail is the vertical panel on the right side of the Viewer with three tabs.

**J-01** Annotations panel  
`[ ]` Create several annotations across multiple pages.  
`[ ]` Open the right rail and navigate to the "Annotations" tab.  
→ All annotations are listed, grouped by type or page.  -> yes
→ Each annotation shows type, page number, and text content (where applicable).  ->yes
`[ ]` Click an annotation in the list.  
→ The main canvas navigates to that annotation's page and the annotation is highlighted/focused. -> navigates to the page, but doesn't always get the positioning right - should scroll it so the annotation is in the middle of the screen.

**J-02** Annotation status in right rail  
`[ ]` Click an annotation in the right rail to select it.  
→ Status controls (Open / Resolved / Won't fix) should be visible.  -> Can we add a visual highlight when you've selected it - so it's obvious. 
-> can you make the status control into a lozenge rather than the icon, as it isn't very clear. 
`[ ]` Change the status.  
→ The annotation status updates and is reflected in the list. -> works. 

**J-03** Annotation report download  
`[ ]` Look for a "Download report" or export button in the Annotations panel.  
`[ ]` Click it.  
→ A summary report file downloads (markdown or similar format) containing all annotations with their text, page, and status. ->works well

**J-04** Document Outline (TOC)  
`[ ]` Open a PDF that has a table of contents / bookmarks structure.  
`[ ]` Switch to the "Outline" tab in the right rail.  
→ Outline entries are displayed as a tree.  -> works well
`[ ]` Click an outline entry.  
→ The main canvas jumps to that section. -> works. However, when you click an entry that has subentries, it collapses it (As well as skipping to it). It shouldn't collapse the first time you click, only if you click the drop-down icon. 

**J-05** Bookmarks  
`[ ]` Navigate to any page. In the right rail "Bookmarks" tab, click "Add bookmark" (or equivalent).  
→ A bookmark is added for the current page.  -> works well
`[ ]` Navigate away. Click the bookmark in the list.  
→ The viewer jumps back to the bookmarked page.  -> works well
`[ ]` Rename the bookmark by clicking its label.  
→ The label updates.  -> works well
`[ ]` Delete the bookmark.  
→ It is removed from the list.  -> works well
`[ ]` Close the app and reopen. Navigate to the Bookmarks panel.  
→ Your bookmarks are still present (they persist in localStorage).

---

### K. Tool Panels (inside Viewer)

**K-01** Split PDF (in-viewer)  
`[ ]` Open a multi-page PDF. In the Viewer, open the right panel and select the Split tool (or open from the View/Tools menu).  
`[ ]` "Split every page" mode: click Split.  
→ A ZIP file downloads containing one PDF per page.  -> this mode does not exist. 
`[ ]` "Custom ranges" mode: enter "1-3, 5" and click Split.  
→ A ZIP downloads with two PDFs: pages 1-3 and page 5. -> when you give multiple ranges, it just says "Keep pages X" and then when you click it removes the other pages. 

-> can we make this a visual viewer where you can select different pages, click inbetween groups of pages to split, or split by rule (e.g. every 8 pages)

**K-02** Compress  
`[ ]` Open the Compress tool panel.  
`[ ]` Click Compress.  
→ A loading indicator appears. After processing, a compressed PDF downloads.  -> works
→ The file size of the downloaded PDF is smaller than (or at most equal to) the original. -> works - it does flatten the pdf though so the text is no longer editable - can we changes this?

**K-03** Redact — draw boxes  
`[ ]` Press `R` to enter Redact mode.  
→ A "Redact" toolbar appears above the canvas. The cursor changes.  -> works
`[ ]` Click and drag to draw a redaction box over sensitive content.  
→ A red-outlined overlay rectangle appears over the selected region.  -> works
`[ ]` Draw 2-3 more boxes on different pages.

**K-04** Redact — apply  
`[ ]` Click the "Redact" / "Apply" button in the toolbar.  
→ A confirmation dialog appears ("This permanently removes content — are you sure?").  -> works
`[ ]` Confirm.  
→ The backend processes the PDF. A new PDF downloads with the selected regions permanently blacked out.  -> works
→ Open the downloaded file in another PDF viewer and verify the content under the boxes is completely removed (no text extraction possible). -> works

**K-05** Redact — cancel / clear  
`[ ]` Enter Redact mode. Draw a box.  
`[ ]` Click the delete icon or press `Delete` with the box selected.  
→ The selected box is removed.  -> works
`[ ]` Press `Esc`.  
→ Returns to View mode. Any remaining unconfirmed boxes remain (or are cleared — note observed behaviour).-> works

**K-06** Crop — draw region  
`[ ]` Press `C` to enter Crop mode.  
→ A "Crop" toolbar appears.  -> works
`[ ]` Click and drag to define the crop region.  
→ A highlighted overlay shows the crop selection.-> works

**K-07** Crop — apply single page  
`[ ]` With a crop selection drawn, uncheck "Apply to all pages".  
`[ ]` Click Crop.  
→ The current page is cropped to the selection. The PDF updates. -> works

**K-08** Crop — apply to all pages  
`[ ]` Draw a crop region. Ensure "Apply to all pages" is checked.  
`[ ]` Click Crop.  
→ All pages in the PDF are cropped to the same region proportionally.-> works

---

### L. Keyboard Shortcuts

**L-01** Cheat sheet  
`[ ]` Press `?`.  
→ A keyboard shortcut reference sheet overlays the screen with all shortcuts grouped by category.  -> does nothing
`[ ]` Press `Esc` (or `?` again).  
→ The sheet dismisses. -> does nothing

**L-02** All mode shortcuts  
`[ ]` With a PDF open, press each mode key and verify the canvas mode changes:  
- `V` → View mode  -> works, but can there be an visual indication if you're already in view mode? e.g. the floating bar at the bottom gently pulses for a second
- `A` → Annotate, Note sub-mode  ->works
- `H` → Annotate, Highlight sub-mode  ->works
- `U` → Annotate, Underline sub-mode  ->works
- `S` → Annotate, Strikethrough sub-mode  ->works
- `T` → Annotate, Text box sub-mode  ->worksg
- `I` → Annotate, Ink sub-mode -> (can you rename the mode to Ink not draw, and can you make it so that keys 1 -9 select a text width on a sliding scale)
- `G` → Annotate, Shape sub-mode  ->works
- `P` → Annotate, Stamp sub-mode  ->works
- `R` → Redact mode  ->works
- `C` → Crop mode  ->works
- `Esc` → Return to View mode  ->works

**L-03** Global shortcuts  
`[ ]` `Ctrl+F` → Search opens  ->works
`[ ]` `Ctrl+S` → PDF downloads  ->works
`[ ]` `Ctrl+\` → Side-by-side toggle  ->works
`[ ]` `Shift+H` → Annotations visibility toggle  ->works
`[ ]` `Ctrl+Shift+P` → Command palette opens  ->works - can you change the label on the bar at the bottom to this shortcut instead of the mac equivalent. 
`[ ]` `Ctrl+Z` and `Ctrl+Shift+Z` → Undo and Redo work  

? Are all shortcuts logical given their keys? Any conflicts with your OS or browser shortcuts?  -> yeah happy, bearing in mind the comments above
? The shortcut for Shape is `G` and Stamp is `P`. Are these discoverable without the cheat sheet? -> yeah, the labels are fine

---

### M. Command Palette

**M-01** Open and close  
`[ ]` Press `Ctrl+Shift+P`.  
→ A fuzzy-search palette opens, showing the most common commands.  ->works
`[ ]` Press `Esc`.  
→ Palette closes.->works

**M-02** Fuzzy search  
`[ ]` Type "red".  
→ Commands related to redact should appear.  ->works
`[ ]` Type "ann".  
→ Annotation-related commands filter in.->works

**M-03** Page jump  
`[ ]` In the command palette, type "15".  
→ A "Go to page 15" item appears.  ->works
`[ ]` Press Enter.  
→ Document navigates to page 15. Palette closes.  ->works
`[ ]` Type ">8".  
→ "Go to page 8" item appears.  ->works

**M-04** Snippet insertion  
`[ ]` Add a snippet in Settings → Identity/Snippets. Enter e.g. "See attached reference document."  
`[ ]` Open the command palette.  
→ The snippet appears in the "Snippets" category.  -> this doesn't exist? 
`[ ]` Select it.  
→ The snippet text is copied to the clipboard. -> see above

**M-05** Keyboard navigation  
`[ ]` With the palette open and results showing, press `↓` / `↑` to move through items.  
→ Selected item highlights and scrolls into view.  ->works
`[ ]` Press Enter.  
→ The selected command executes.->works

---

### N. Side-by-Side View

**N-01** Toggle  
`[ ]` With a PDF open in a Viewer tab, press `Ctrl+\`.  
→ The viewer splits into two panes side by side. The current PDF appears in the left pane; the right pane shows an empty drop zone.   -> works. The UI is a bit crowded unless you're at 100% here. Can we auto-collapse the thumnails bar  and the notes bar on both sides, leaving a toggle to independently add either back in? Also auto load so that the zoom and positioning is the same both sides. 
`[ ]` Press `Ctrl+\` again.  
→ The split closes. Reverts to single-pane view. -> works. does this have a guard on it, if there are unsaved changes? I don't think there is a guard for this. When I close one tab, it also loses the annotations on the remaining tab that stays visible - this shouldn't happen. 

**N-02** Load second PDF  
`[ ]` Enter split mode. Drag a (different) PDF onto the right pane's drop zone.  
→ The second PDF loads in the right pane.  -> works
→ Both panes are independently navigable: clicking a pane activates it.  -> works
→ Left pane: navigate, annotate, zoom independently of right pane.  -> works
→ Right pane: same.-> works

**N-03** Side-by-side tab indicator  
`[ ]` While in side-by-side mode, look at the tab bar.  
→ The active Viewer tab shows a cyan accent to indicate split view is active. -> works

**N-04** Sync scroll  
`[ ]` With the same (or similar) PDF in both panes, find the sync scroll toggle (View menu → "Sync scroll" or similar).  -> can't find this, doesn't seem to exist
`[ ]` Enable sync scroll.  
`[ ]` Navigate to page 4 in the left pane.  
→ Right pane also jumps to page 4.  -> N/A
`[ ]` Disable sync scroll.  
→ Panes navigate independently again. -> N/A

**N-05** Mirror annotation sync (same document)  
`[ ]` Open the same PDF in both panes using the "Mirror" mode (if available — check View menu for "Mirror document").  -> the only issue is the keyboard shortcut listed in the view menu doesn't do this. 
`[ ]` Create a highlight in the left pane.  
→ The highlight appears in the right pane in real time.  -> yes
`[ ]` Create an annotation in the right pane.  
→ The annotation appears in the left pane. -> only when I then select the annotation mode and the canvas refreshes.

**N-06** Right rail in split mode  
`[ ]` In split mode, click the left pane to make it active.  
→ The right rail (annotations, outline, bookmarks) shows the left pane's document.  -> doesn't appear to do anything. Rather than trying to make this work, I think you just make it optional to have the right rail in place, and add a toggle to easily expand/contract it. 
`[ ]` Click the right pane to make it active.  
→ The right rail updates to show the right pane's document. -> as above

? Does the split view feel like a natural way to compare documents? Is the pane activation (click to focus) obvious?  -> can't see any visible indication of when the panes are selected
? Is there a visible indicator showing which pane is currently active? -> no

---

### O. Settings

`[ ]` Open Settings (gear icon in tab bar or `Ctrl+,` if implemented).  
→ Dialog opens with four sections: Identity, Interface, Documents, Annotations. -> Ctrl+, doesn't work at all. There's now two settings Icon's - in the viewer page, and in the tab bar which is still visible. Remove the gear icon from the viewer page menu bar.

**O-01** Author name  
`[ ]` Set author name to "Test User".  
→ Name persists after closing and reopening Settings.  
`[ ]` Create an annotation.  
→ The annotation's author field shows "Test User". -> where does this persist in the saved documents. 
**O-02** UI scale  
`[ ]` Change UI scale from 125% to 150%.  
→ The entire app interface (tab bar, viewer chrome, home page, tool pages) scales up. PDF content itself is unaffected.   -> works. but PDF should change zoom to stay the same real size, even if the UI is changing
`[ ]` Change to 100%.  
→ Interface returns to default size.  -> works
? At 150%, does the UI feel cramped or does it remain usable? Are there any overflow issues? -> i think it's fine tbf, depends on the size of the screen but on my 4K monitor it works well. 

**O-03** Reduce motion  
`[ ]` Toggle "Reduce motion" on.  
→ Transitions and animations (sidebar slide, dialog fade) should be effectively instant.  -> works
`[ ]` Toggle off.  
→ Transitions return to normal speed.  -> works
? If your OS prefers reduced motion, does the setting auto-detect and enable on first run? -> no 

**O-04** Default fit mode (Documents section)  
`[ ]` Test all three options as described in D-06 above. -> all work, except for actual - surely this should be a default 100% zoom?

**O-05** Thumbnails open by default  
`[ ]` Test as described in I-02 above. -> works - but there should be the same option for the right rail

**O-06** Default highlight colour  
`[ ]` Change default highlight colour to "Green" (or whichever index).  
`[ ]` Open a fresh PDF (or reload).  
→ Highlight mode starts with Green pre-selected. -> works

**O-07** Default ink width  
`[ ]` Change default ink width to 6px.  
`[ ]` Open a fresh Viewer. Enter Ink mode.  
→ The ink stroke width control starts at 6.  
→ Ink strokes are noticeably thicker than default. -> works well. this will need to be updated visually when you make the change to sliding scale for ink widths

**O-08** Colour label editing (4 labels)  
`[ ]` Test as described in F-09 above. -> doesn't seem to do anything, more comments above.

**O-09** Comment snippets  
`[ ]` Click "Add snippet" in Settings. Enter "Action required: please review and confirm."   -> these don't appear to exist at all.
→ Snippet appears in the list.  
`[ ]` Add a second snippet.  
`[ ]` Drag or use the remove button to delete one snippet.  
→ Deleted snippet is gone.  
`[ ]` Verify snippets appear in the Command Palette as described in M-04.

**O-10** Settings persistence  
`[ ]` Change several settings. Close the dialog. Close the app. Reopen.  
→ All changed settings are still applied. No reset to defaults. -> this works

---

### P. Merge Tool

**P-01** Add files  
`[ ]` Open the Merge tab. Drop two PDFs onto the file zone.  
→ Both files appear in a sorted list with their filename and size. -> works

**P-02** Reorder  
`[ ]` Drag the first item to the second position using the grip handle.  
→ Order updates in the list. The sequence of pages in the merged output should match this order. -> works

**P-03** Remove a file  
`[ ]` Click the remove button on one file.  
→ It is removed from the list. -> works

**P-04** Merge  
`[ ]` With 2+ files in the list, click "Merge".  
→ A brief loading state. A `merged.pdf` downloads.   -> works
`[ ]` Open the downloaded file.  
→ Pages from all input PDFs appear in the correct order. -> works

**P-05** Error handling  
`[ ]` Try to merge with only one file.  
→ Either the Merge button is disabled, or an appropriate error message appears. -> works

? Can you add the same file twice (duplicate detection)?  -> you can. It's worth adding a highlight. 
? Is there page count information shown per file to help plan the merge? -> no that would be good

---

### Q. Rearrange / Organize Tool

**Q-01** Load  
`[ ]` Open the Rearrange tab. Drop in a multi-page PDF.  
→ Thumbnail grid appears with one thumbnail per page, in order. -> works

**Q-02** Drag to reorder  
`[ ]` Drag one thumbnail to a new position.  
→ The grid reorders in real time during the drag. Drag ghost is visible.  -> works
`[ ]` Drop it.  
→ Page order is updated. -> works

**Q-03** Apply  
`[ ]` Click "Apply" / "Reorder" / "Save".  
→ A reordered PDF downloads.   -> works
`[ ]` Open the downloaded file.  
→ Pages are in the new order you set. -> works. can we add a feature to download then open in viewer or something like that?

**Q-04** Keyboard reordering  
`[ ]` Tab to a thumbnail. Use keyboard controls (if supported) to reorder it.  
→ Keyboard-based drag should work (via `@dnd-kit/core`'s keyboard sensor). -> what is this meant to be? if there's keyboard shortcuts there needs to be instructions. 

? Are page numbers shown on the thumbnails? It would help to know which page is page 1 vs page 7 when reordering.  -> yes this works. 
? Can you delete individual pages from this view? (Currently the Rearrange tool only reorders — deletion requires the Split tool or a future feature.) -> no, you can't delete it would be good to get the merge, split, organise,n extract, rotate, delete, etc etc features combined, so that you can do any from this view. This will also support some of my other feedback requests for split tool improvements by having the previews already rendered. I'm imaginging something where you can draw boxes around groups of tabs, or double click in between thumbnails to create a split. 

---

### R. Split Tool
 -> already fed back on split above. The split tile only loads in a sidebar of the viewer - I think it would be better bundled with the organise tool. 
**R-01** Split every page  
`[ ]` Open the Split tab. Drop in a multi-page PDF.  
→ Page count is detected and displayed.  
`[ ]` Select "Split every page". Click Split.  
→ A `split.zip` downloads containing one PDF per page. -> already fed back on split above. The split tile only loads in a sidebar of the viewer - I think it would be better bundled with the organise tool. 

**R-02** Custom ranges  
`[ ]` Select "Custom ranges". Enter "1-3, 5, 7-10".  
→ The input is parsed.  
`[ ]` Click Split.  
→ A `split.zip` downloads with three PDFs: pages 1-3, page 5, pages 7-10.

**R-03** Invalid range  
`[ ]` Enter a range where the page number exceeds the document's page count (e.g., "1-999").  
→ Error message or graceful handling. The backend should reject or clip the range.

---

### S. Images to PDF

**S-01** Add images  
`[ ]` Open the Images to PDF tab. Drop multiple JPEG/PNG files.  
→ Each image appears as a preview with its filename.  -> works well
→ A note indicates "each image becomes one page". -> works well

**S-02** Order  
`[ ]` Read the ordering note: "Top to bottom = page order".  
→ The first image in the list will become page 1. -> works, need reordering features

**S-03** Remove an image  
`[ ]` Click the remove button on one image.  
→ It is removed. Remaining images stay in order. -> works well

**S-04** Convert  
`[ ]` With 2+ images, click "Convert".  
→ Brief loading. An `images.pdf` downloads.  -> works well
`[ ]` Open the downloaded PDF.  
→ Each image is a page, in the correct order.-> works well

**S-05** Unsupported format  
`[ ]` Try dropping a `.gif` or `.bmp` file.  
→ The dropzone rejects it (only JPEG, PNG, TIFF accepted). A clear message appears. -> why is this? can we support any other image files?

---

### T. Download & Export

**T-01** Basic download  
`[ ]` Open a PDF with no changes. Press `Ctrl+S`.  
→ The file downloads with the current (possibly renamed) filename.  -> Ctrl+S doesn't work with no changes - there should be a warning pop-up for this.
→ Downloaded file is a valid PDF.

**T-02** Download with baked annotations  
`[ ]` Create annotations and commit them ("Done"). Download.  
→ The downloaded PDF contains the annotations as real PDF annotation objects. -> works well

**T-03** Download with uncommitted annotations  
`[ ]` Create annotations but do NOT commit them. Download.  
→ Clarify expected behaviour: should uncommitted overlays be included or not?  -> currently it doesn't download uncommitted annotations, it shouldn't let you download like this, it should pop up a modal saying commit before download, or revert to edit mode?
→ At minimum, the PDF should download without error.

---

### U. Unsaved Changes Guard

**U-01** Close tab with uncommitted annotations  
`[ ]` Open a PDF. Create several annotations (do not commit).  
`[ ]` Press `Ctrl+W` or click the tab close ×.  
→ A confirmation dialog appears: "You have unsaved changes — close anyway?" (or similar).  -> this doesn't pop up if you close the tab. it should also pop up if you try and close the tab, navigate away etc, without downloading a file that has new changes to it. 
`[ ]` Click Cancel.  
→ Tab remains open. Annotations are preserved.  
`[ ]` Click Close / Confirm.  
→ Tab closes.

**U-02** Navigate away with uncommitted annotations  
`[ ]` With uncommitted annotations, try to open a new file in the same tab (if the UI offers this).  
→ A guard dialog should appear before the current file is replaced. -> doesn't appear to do anything. This isn't required, as anything happens in a new tab. 

---

### V. Backend Health

**V-01** Health indicator  
`[ ]` With the Python backend running, open a PDF in the Viewer.  
→ There should be a backend status indicator visible (may be subtle — look near the toolbar or top bar).  
→ Status should show "connected" / green. -> this works

**V-02** Backend offline  
`[ ]` Stop the Python backend (kill the sidecar process).  
`[ ]` Attempt to annotate and commit, redact, compress, or crop.  
→ Each backend-requiring action shows a clear error message (not a silent hang or JS crash).  -> this is meaningless to the user though. it needs to have a way to try and restart it from within the application - this is a user facing service, they don't have a command line. Either restart or refresh (make sure you have the unsaved changes guard around if you refresh).
→ The app remains usable for basic reading and local annotation.

---

### W. Accessibility

**W-01** Keyboard-only workflow  
`[ ]` Attempt to perform a complete annotation workflow (open file, add note, commit, download) using only the keyboard — no mouse.  
→ All interactive elements should be Tab-focusable with visible focus rings. 

**W-02** Tab order  
`[ ]` With a PDF open, Tab through the main Viewer toolbar.  
→ Focus moves logically: toolbar buttons → canvas area → sub-toolbar, etc.  -> works fine
→ No focus traps outside of modal dialogs. -> works fine

**W-03** Modal dialogs (Settings, confirmation dialogs)  
`[ ]` Open Settings. Tab through all controls.  
→ Every control is reachable by keyboard.  -> once it's done one cycle, it goes back to cycling through the main screen, rather than looping around the settings modal. 
`[ ]` Press `Esc`.  
→ Dialog closes.  
→ Focus returns to the element that triggered the dialog. -> works fine

**W-04** ARIA roles  
`[ ]` Spot-check key elements using browser DevTools:  -> I'm happy that most of this has been done, conduct your own spot check if useful.
- Tab bar items: `role="tab"` with `aria-selected`.  
- Close buttons: `aria-label="Close [tab name]"`.  
- Canvas: meaningful `aria-label` or `aria-describedby`.  
- Search bar: `role="search"` or meaningful label.

**W-05** Reduced motion  
`[ ]` Enable "Reduce motion" in Settings (or use OS setting).  
→ All CSS transitions complete in ≤0.01ms (effectively instant).  -> works
`[ ]` Open/close thumbnail sidebar, settings dialog, search bar.  
→ All appear/disappear instantly.-> works fine

? What is the current reading experience for screen reader users? (This likely needs significant work for full a11y.) -> unable to full test at this time. Put this on the backlog to things to verify later at beta test stage.

---

### X. Performance & Memory

**X-01** Large PDF  
`[ ]` Load a PDF with 100+ pages and a large file size (e.g., 50 MB).  
→ The app loads the PDF and renders the first page within a reasonable time.  -> true, less than 1 second for 480 page textbook pdf
→ Navigating pages does not cause long hangs.  -> almost instant
→ Thumbnail sidebar generates thumbnails progressively (should not block the UI). -> able to scroll through entire thumbnail sidebar fine

**X-02** Multiple large Viewer tabs  
`[ ]` Open 3 Viewer tabs with large PDFs simultaneously.  
→ App remains usable. Note any slowdown or memory warnings.  -> no noticeable slowdown with 4x copies of said 480 page, 108mb pdf file
→ Check Windows Task Manager: memory consumption should be proportional to the number of open PDFs.

**X-03** Annotation-heavy document  
`[ ]` Create 30+ annotations across multiple pages, then commit them.  
→ The right rail annotation list handles the volume without lag.  -> performance is fine, given bugs discussed above. 
→ Undo stack operates correctly.

? Is there a perceivable lag when switching between tabs with large PDFs?  -> 
? Are there scenarios where you'd want pages unloaded from memory for very long documents? -> probably not, given it's able to handle quite extreme demands so far. I think this is an edge case, can add to backlog but nothing needed right now. 

---

## Part 3 — UI/UX Questions

These are deliberate, pointed questions. Please answer each with a concrete opinion — "looks fine" is not actionable.

**UX-01: Colour palette (stone + amber)**  
The app uses warm stone neutrals and amber as its single accent colour.  
→ Does this palette feel premium and consistent?  -> like the pallet. 
→ Are there moments where the amber accent is overused (feels aggressive) or underused (important things don't stand out)?  -> like the balance seems about right. It's slightly odd that the main page is very light and the viewer is very dark - can we add light-mode/dark-mode toggles?
→ The four highlight colours (Yellow, Cyan, Green, Pink) are bright against the stone background — do they feel like they belong, or do they feel jarring?-> haven't noticed this tbf, pressume its fine. 

**UX-02: Tab bar legibility**  
→ With 5+ tabs open, how easy is it to tell tabs apart? Are the tab titles long enough to be readable, or do they get truncated too aggressively?  -> it'd be good to make the tabs 50% longer. There's plenty of brower space as it is. 
→ The active tab underline is amber. Is it obvious enough, or could you imagine not noticing which tab is active?  -> this is super clear
→ The cyan underline for the side-by-side tab indicator — is it visible and distinct from the amber active indicator? -> likewise, super clear

**UX-03: Annotation mode switching**  
→ The annotate sub-mode toolbar appears below the canvas when in Annotate mode. Is its location intuitive, or would you expect it at the top?  I like it where it is, but the only thing that's a bit confusing is the floating bar but with the minimap pulling along it. 

![alt text](image.png)
→ Do the icons (pencil for note, highlighter for highlight, underline icon, etc.) match your mental model for what each tool does?  
-> yes
→ Is it clear that pressing Esc will always return you to View mode?
-> that's a generally accepted shortcut, so yes

**UX-04: Settings discoverability**  
→ New users: would they find the gear icon in the tab bar? Should there be a secondary entry point (e.g., in a menu bar, or in the Home page header)?  
-> I think this is pretty clear, but also worth addding a link under File as well
→ The four sections (Identity / Interface / Documents / Annotations) — does this grouping make intuitive sense?  -> yes
→ Is there anything in Settings that surprised you (you didn't expect it to be there) or anything you expected to find but couldn't? -> just making sure that all of the optionality bundles into one. 

**UX-05: Home page tool grid**  
→ The tool descriptions ("Combine multiple PDFs into one", "Divide by page range", etc.) — are they clear enough for a first-time user? -> yes but they'll need updating with some of my plans 
→ The grid currently has 6 tools in a 3×2 layout. As more tools are added, how should this scale?  
-> 3x3 etc. should be limeid
→ The drop zone is the primary call to action. Should the tool grid be more or less prominent relative to it?
-> it's about right tbf, the lower ones are secondary actions. When we add the combined organise/split/rotate/etc feature above, this probably warrants a 3 stage C2A, with a primary, secondary, and the grid being the tertiary. 

**UX-06: Right rail density**  
→ The right rail has three tabs: Annotations, Outline, Bookmarks. Is this grouping logical?  
-> yeah, this makes sense
→ In the Annotations tab, with 20+ annotations, does the list feel navigable? Is there enough context per item to identify annotations without going back to the page?  
-> this is fine
→ Should the Outline and Bookmarks tabs be merged (you usually only care about one or the other)?
-> yeah, do this. 

**UX-07: MiniMap**  
→ There is a floating MiniMap overlay in the Viewer. Do you use it? Does it earn the screen real estate it occupies?  
-> There's a improvement I want on the minimap anyway - make it narrower for now, but allow you to scrub through it, and the pages pop up in proxmity to the mouse, like a wave. You can drag your mouse along, it allows you to move quickly when you're moving your mouse quickly, and then slows the sensitivity when you start to move slower, so you can pick an exact page. It pops the number up above it where it makes sense in the UI. Then when you settle on one, it pops a thumbnail preview above it. This will be a complex feature to ensure the UI is intuitive, so plan it carefully. 
→ Should the minimap be off by default and togglable, rather than on by default?
-> make it toggleable, but on by default. 

**UX-08: First-run hint**  
→ A first-run hint appears once for new users. Does it appear at the right time? Is the content helpful?  
→ Once dismissed, it never appears again. Is there a way to re-surface it (e.g., from the ? help menu)?
-> yeah, from the help menu we could have a toggleable "help" mode, which adds more explanation to the UI

**UX-09: Command palette categories**  
→ Look through the command palette categories. Are the commands grouped logically?  -> It doesn't have the full list here, which is a bit odd. 
→ Is there anything you'd want in the command palette that currently isn't there?  -> every feature should be accessible in some way through this. 
→ The `>N` page-jump syntax — is it intuitive? Would a plain number also work (answer: yes, it does)? -> yeah, I wouldn't bother with the > bit because the search works fine

**UX-10: Unsaved changes language**  
→ When closing a tab with uncommitted annotations, what does the confirmation dialog say? Is the language clear about what "unsaved" means in this context (annotations not yet sent to the backend and embedded in the PDF)? -> unclear, couldn't get this to trigger well. 

---

## Part 4 — Feature Consideration Questions

For each of these, your answer helps prioritise the roadmap. Rate as: **Yes, high priority** / **Nice to have, low priority** / **No** — and add a sentence of reasoning.

**FC-01: Dark mode**  
The app is currently light-only (warm stone background). Would dark mode be valuable for extended review sessions in low-light environments? -> it's quite darkmode in the viewer screen, but light mode elsewhere. need to recognsile these together, and introduce a toggleable option. 

**FC-02: Recent files list**  
The Home page currently has no "recent files" list (files are never uploaded or cached). Should recent file paths (metadata only — not file content) be stored locally so you can quickly re-open a document you worked on yesterday? -> yeah, do this. 

**FC-03: Page rotation in the Viewer**  
Currently you can rotate pages in the Rearrange tool, but not in the Viewer itself. Should there be a rotate-current-page button in the Viewer toolbar? -> no, keep this in the new proposed organise tool, which incorporates all the stuff done at the page level. 

**FC-04: Annotation JSON export**  
Should there be an option to export all annotations as a structured JSON file (separate from the embedded PDF annotations), for programmatic downstream processing? -> no, the .md download is fine for now. 

**FC-05: PDF form filling**  
Should the Viewer support filling in PDF form fields (text inputs, checkboxes, dropdowns)? This is a significantly different code path from annotations. -> yes

**FC-06: Password-protected PDFs**  
Currently, opening a password-protected PDF likely fails silently or with a generic error. Should password entry be supported for reading protected documents? -> yes

**FC-07: Annotation search**  
With many annotations across a long document, finding a specific annotation requires scrolling through the right rail. Should there be a dedicated search within annotations? -> yes

**FC-08: Batch page operations**  
The Rearrange tool allows drag-to-reorder but currently doesn't support deleting pages or rotating pages. Should these operations be available in the same grid view? -> yes, as per discussion to a generalised "organise" toolbox that has all of the document/page level manipulations on. 

**FC-09: Custom stamps**  
Stamps currently use a fixed set of labels (Approved, Rejected, Draft, etc.). Should users be able to define their own custom stamp labels (similar to colour label customisation)? -> yes

**FC-10: Printing**  
Is direct-to-printer printing (rather than download → print externally) needed? Should there be a Print button? -> yes

**FC-11: Watermarking from the Viewer**  
The backend supports watermarking (as a compress/pdf-ops feature). Should there be a "Add watermark" tool directly accessible from the Viewer toolbar? -> yes

**FC-12: Annotation sharing / collaboration**  
Currently annotations are local only. Would real-time or async annotation sharing with another person be valuable? (Note: this would require a server component, which conflicts with the "local only" privacy model.) -> no, I want to keep it local only.

---

1. Undo granularity (F-01)
You reported Ctrl+Z removing all annotations at once. To confirm: was this all annotations created in the session, or all annotations on the page? The undo stack should step one annotation at a time — is that definitely what wasn't happening, or could it be that you created several in quick succession and they were treated as one action? -> it now appears to work a bit better, however it treats e.g. the note and the contents of it as separate thing to undo. 

2. Annotation round-trip (E-08 critical)
When you download a PDF with annotations baked in and re-open it in Stria, what do you expect to see? Two options: (a) the annotations are displayed as read-only embedded PDF content (no re-editing), which is correct PDF standard behaviour; or (b) Stria should also store a sidecar annotation file that makes them re-editable in Stria even after baking. This is the difference between a small fix and a significant architectural addition. -> i'd like the re-editing if possible, but the first is a good starting point. 

3. Empty note (E-01)
Three options for accidental click: (a) auto-delete the note when the user clicks away without typing; (b) require text before the note is committed (click creates a pending note, clicking away with no text cancels it); (c) keep the empty note but make it visually obvious it's empty. Which feels most natural? -> b is the best

4. QuickActionBar and View mode (G-01/G-02)
Currently text selection only works meaningfully in Annotate sub-modes. Would you prefer: (a) text selection always shows the QuickActionBar in both View and Annotate mode; or (b) keep it mode-gated but fix the positioning/persistence issues? ->a)

5. Ink width key scale (L-02)
You want keys 1-9 to set ink width on a sliding scale. What values should 1-9 map to — linear (1px through 9px) or weighted toward the finer end (something like 1, 1.5, 2, 3, 4, 6, 8, 12, 20)? -> weighted like you suggest

6. Compress and text (K-02)
The current compression rasterizes pages, which is fast and achieves good size reduction. A non-rasterizing approach would preserve text and editability but give much less compression. Should we offer both options (a toggle — "compress only" vs. "flatten and compress"), or always avoid rasterizing? -> offer both options

7. Snippets (M-04/O-09)
The snippets feature is referenced in two test cases but doesn't exist. Is this something you want to build now (before other items), or should we remove those test cases for the moment and treat it as a future roadmap item? -> I don't understand what it is tbf, add it to the backlog for future scoping

8. UI scale compensating for PDF zoom (O-02)
When UI scale changes from 125% to 150%, the PDF canvas gets physically larger. Should we automatically decrease the PDF zoom to compensate so the page appears the same physical size? Or would you rather zoom be sticky (stays where you set it), and just accept that scale changes shift the apparent size? -> reduce zoom to keep pdf same size.

9. Download with uncommitted annotations (T-03)
When Ctrl+S is pressed with uncommitted annotations, three options: (a) show a modal "You have unsaved annotations — commit them first, or download without them"; (b) auto-commit then download; (c) download without annotations but warn the user what's missing. Which do you want? -> a)

10. Right rail active-pane indicator in split view (N)
No visual cue currently shows which pane is active in split mode. Options: (a) a coloured border (amber) around the active pane; (b) the inactive pane dims slightly (30-40% overlay); (c) a text label in each pane header showing "Active" / "Inactive". Which do you prefer, or a different approach?
-> status label in header of pane. 


---

*End of test protocol.*
