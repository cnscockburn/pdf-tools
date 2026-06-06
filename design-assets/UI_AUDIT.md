# UI/UX Expert Audit: Stria PDF Toolkit

This document provides a highly detailed, professional UI/UX audit of the current **Stria** interfaces (as captured in the home dashboard and document viewer screenshots) against the creative guidelines set out in [PRODUCT.md](file:///C:/Users/cnsco/Git/pdf-tools/PRODUCT.md) and [DESIGN.md](file:///C:/Users/cnsco/Git/pdf-tools/DESIGN.md).

---

## Executive Summary

The Stria codebase contains an outstanding foundation: a fully offline, high-speed, local PDF toolkit running entirely on Tauri and PyMuPDF. However, the current visual implementation does not yet live up to the **"Creative North Star: The Instrument"** or the brand personality of **"Warm Precision"**. 

Currently, the light homepage looks like a standard, somewhat flat web-scaffolded page, and the dark viewer suffers from distracting, heavy color accents and alignment irregularities. By shifting from default layouts to highly considered, custom-crafted details, we can elevate Stria to compete directly with premium, design-forward products like *Linear*, *Highlights*, and *Claude*.

---

## Screen 1: The Light Toolbox (Home Page)

### 1. Brand Identity & Header
*   **Observations:** The current header uses a very simple, rounded swirl logo in amber with standard text. It looks highly generic, resembling early 2010s SaaS logos.
*   **The Issue:** It lacks the professional, tactile, and precise character of "The Instrument". A generic logo immediately triggers a "scaffolded AI template" feeling.
*   **Actionable Recommendation:**
    *   Replace the temporary circular swirl with the newly designed geometric **Stria vector logo** (`logo_full_light.svg`).
    *   Use a humanist system font stack with a semibold weight (600) and `-0.02em` tracking for the "Stria" wordmark to make it feel deliberate and elegant.
    *   Place a thin `border-b border-light` (#e7e5e4) under the header bar to anchor it to the top of the viewport.

### 2. Layout Structure & Proportions
*   **Observations:** The page is split down the middle in a strict 50/50 vertical division. The left side contains a narrow, tall dashed drop-zone, and the right side is a list of document tools.
*   **The Issue:** A 50/50 split creates a hollow, empty center. The drop-zone is vertically elongated but horizontally squeezed, making drag-and-drop targets awkward. The blank space at the bottom right feels neglected.
*   **Actionable Recommendation:**
    *   Rebalance the page into a **70/30 or 60/40 asymmetrical grid**, or a centered hero container that expands outwards.
    *   Position the **File Drop Zone** as a prominent, wide centered container at the top or left (e.g., spanning 60% of the horizontal space). A wider drop zone is significantly easier to target when dragging files from Windows Explorer.
    *   Display the **Document Tools** in a beautiful **2x3 grid of ToolCards** on the right or below, rather than a single vertical list.

### 3. Tool Cards vs. Flat List
*   **Observations:** The right pane lists tools (Merge, Split, etc.) as plain list rows with circular badges and small descriptions.
*   **The Issue:** They are completely flat and lack tactile feedback. This violates the **Flat-at-Rest Rule** and the **ToolCard specification** in `DESIGN.md`.
*   **Actionable Recommendation:**
    *   Implement proper **ToolCards**: rectangular surfaces (`bg-white`, `rounded-2xl` / 16px radius, `px-5 py-5`, subtle resting card shadow `0 1px 2px 0 rgba(0,0,0,0.05)`).
    *   Add a subtle **hover lift transition**: on hover, transition the card with a `translateY(-2px)` and apply a `hover lift shadow` (`ease-out`, 150ms).
    *   Ensure the tool title (`text-strong` / #1c1917) shifts to `amber-warm` (#d97706) on hover. This visual feedback makes the interface feel alive and responsive.
    *   Replace the basic circular tool icons with custom, fine-lined vector badges inside `rounded-xl` (12px) containers. Each tool should have a dedicated warm color tint background, with the icon in white or deep tone.

### 4. Micro-copy & Trust Signals
*   **Observations:** The privacy statement ("Files never leave your machine...") is written in a tiny, faint, low-contrast font at the bottom left.
*   **The Issue:** Privacy is Stria's core selling point. Tucking it away like a standard terms-and-conditions footnote devalues this critical asset.
*   **Actionable Recommendation:**
    *   Move this statement directly inside or immediately below the **File Drop Zone**.
    *   Style it as a secure, premium badge (e.g., using a subtle shield or lock icon in `text-muted` #78716c) to reassure knowledge workers that their sensitive research is entirely private.

---

## Screen 2: The Dark Viewer (Document Review)

### 1. Overuse of Heavy Accents (Critical UX Distraction)
*   **Observations:** 
    *   There is a thick, solid orange horizontal stripe running under the PDF page view.
    *   An even thicker, solid orange block spans the bottom of the left thumbnail rail.
*   **The Issue:** These lines violate the **Amber Reserve Rule** ("amber covers less than 10% of any screen surface; its presence signals interactivity or active state") and the **Stripe Ban** ("no colored stripes as borders on panels, except a 2px left border on selected navigation").
    *   A massive, solid orange block at the bottom left serves no interactive purpose and draws the eye away from the document. The document must be the hero. Heavy chrome is a design error.
*   **Actionable Recommendation:**
    *   **Remove the thick orange bars entirely.** 
    *   Separate the panels using clean, 1px borders in `border-dark` (#57534e).
    *   Limit the amber accent to the thin outline of active controls (like selected tools or active page outlines) and interactive buttons.

### 2. Thumbnails Panel
*   **Observations:** Page 1 is selected in the left rail. It has a solid orange outline, but the thumbnail page itself has a dark, semi-transparent overlay covering it.
*   **The Issue:** The dark overlay makes the selected page look muddy and low-contrast. It contradicts the physical paper metaphor.
*   **Actionable Recommendation:**
    *   Keep the selected page border (a clean `ring-2 ring-amber-warm`).
    *   **Remove the dark overlay from active and inactive thumbnails.** Thumbnails should look like clear, readable miniature sheets of white paper. They should be crisp, not dimmed, so the user can easily scan document structure at a glance.
    *   Use a very subtle hover state (e.g., a slight background elevation of the thumbnail card `bg-surface-dark-raised`) instead of dimming overlays.

### 3. Header & Filename Collision
*   **Observations:** The top bar crams the long filename (`210311 DRAFT - Declaration of Trust...`), a pencil edit icon, and the dropdown menu items (`File`, `Document`, `View`) all on the left.
*   **The Issue:** The text is crowded. If a user opens a longer path or shrinks the window, the filename will collide with the dropdown menu, resulting in overlapping text and a broken layout.
*   **Actionable Recommendation:**
    *   **Separate the concerns:** Center the filename in the absolute middle of the top bar, styled in `text-on-dark` semibold. If it is too long, truncate it elegantly using CSS `text-overflow: ellipsis`.
    *   Keep the dropdown menus (`File | Document | View`) left-aligned, immediately to the right of the Stria home button/logo.
    *   This layout is identical to professional tools (Acrobat, Figma, Linear) and guarantees that menus are always discoverable and never crowded.

### 4. Right Rail: Annotations Panel Empty State
*   **Observations:** The right rail shows `Annotations` at the top, and a blank space below with the text: "No annotations yet. Switch to Annotate mode and mark up the document."
*   **The Issue:** The empty state is flat and uninviting. The chat icon is extremely tiny and placed next to a heading, rather than centered and styled.
*   **Actionable Recommendation:**
    *   Create a beautiful, vertically centered **Empty State block** in the right rail.
    *   Include a medium-sized icon (`annotation-note.svg` or custom vector, styled in `text-on-dark-muted` at 32px).
    *   Provide a clear, stacked text layout:
        *   **Heading:** "No annotations yet" (semibold, `label` size, `#fafaf9`).
        *   **Sub-heading:** "Switch to Annotate mode (A) or select text to highlight and add notes." (regular, `micro` size, `#a8a29e`, centered, max-width 180px).
    *   This provides a gentle, professional guidance loop for new users.

### 5. Bottom Control Bar & Typography
*   **Observations:** The page counter is written as `1/5`. The buttons are small.
*   **The Issue:** 
    *   When page numbers change (e.g., from `9/100` to `10/100`), standard variable-width fonts cause neighboring UI elements to shift slightly, creating jitter.
    *   The `[Annotate]` button uses a large, heavy dark background block that feels chunky.
*   **Actionable Recommendation:**
    *   Apply `font-variant-numeric: tabular-nums` (or `font-mono`) to the page counter `1/5` and zoom percentage `140%` to ensure perfectly stable numbers during navigation.
    *   Refine the `[Annotate]` button to match the **Ghost Button spec** inside the viewer: transparent background at rest, switching to `surface-dark-raised` on hover, and transitioning to a clean, active state using a subtle amber icon or indicator rather than a heavy gray capsule fill.
    *   Ensure all buttons in the bottom toolbar have a minimum height of 28px and an interactive hit area of 36px to prevent mis-clicks.

---

## Prioritized Implementation Roadmap

### 🔴 Phase 1: High Priority (Immediate Visual Clean-up)
1.  **Remove thick orange bars** from the bottom workspace and thumbnail rail. Replace with clean `1px border-dark` (#57534e) separations.
2.  **Remove dark overlays from page thumbnails** to keep pages crisp, clear, and paper-like.
3.  **Refactor the top bar layout**: Left-align dropdown menus (`File`, `Document`, `View`); absolute-center the truncated filename; right-align the author profile.
4.  **Implement the new vector branding** across the header and app icons using `logo_full_light.svg` and `logo_full_dark.svg`.

### 🟡 Phase 2: Medium Priority (Tactile & Component Polish)
1.  **Upgrade Home Page to grid layout**: Move away from the 50/50 split. Arrange tools in a 2x3 grid of custom `ToolCards` with resting shadows, hover lifts (`translateY(-2px)`), and transition eases.
2.  **Redesign Drop Zone**: Center the drop zone, widening it for a friendlier drag target, and embed the "Privacy is character" shield badge directly underneath.
3.  **Polish Right Rail Empty States**: Build a vertically centered, double-tier instruction block with an vector icon for empty panels (Notes, Outline, Bookmarks).

### 🟢 Phase 3: Low Priority (Micro-interactions & Micro-copy)
1.  **Tabular Numbers**: Force `font-variant-numeric: tabular-nums` on page counts, search results, and zoom numbers.
2.  **Keyboard Cheat Sheet Alignment**: Ensure the keyboard shortcut modal (`?`) and command palette (`Ctrl+Shift+P`) perfectly match the stone dark color layers: Canvas (`#1c1917`) -> Surface (`#292524`) -> Raised (`#3c3836`).
