# Stria Branding & Style Guide

Welcome to the **Stria Brand and Design System Guidelines**. 

This document serves as the single source of truth for the Stria brand identity. It translates the design philosophy of **"Warm Precision"** and the creative direction of **"The Instrument"** into practical guidelines, assets, and rules. 

Use this guide to maintain absolute coherence across all UI/UX components, promotional materials, mockups, and future features.

---

## 1. Brand Identity & Strategy

### Creative North Star: "The Instrument"
Stria is built to be a high-performance utility used by researchers, prosumers, analysts, and developers. It is built to be used, not admired. 
*   **Beauty in utility:** Like a high-end physical caliper or a classic mechanical watch, Stria’s beauty comes from its flawless proportions, tight tolerances, and tactility. No decorative fluff is permitted.
*   **Privacy is character:** Running 100% locally is not a feature; it is our primary identity. The design should feel self-contained, offline-native, and profoundly secure—never cloud-adjacent.

### Brand Personality
Stria is defined by three primary traits:
1.  **Precise:** Fast, keyboard-native, pixel-aligned. Respects the user's time and intellect.
2.  **Warm:** Approaches the user as a peer. Humanist typography, warm paper-tinted neutrals, and natural ambient light replace standard sterile-blue tech interfaces.
3.  **Capable:** Reliable, fully functional offline, unhurried, and quiet.

---

## 2. Visual Assets & Logos

All vector assets are available in the [design-assets](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/) folder:

1.  **App Icons:**
    *   [app_icon_light.svg](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/app_icon_light.svg) — Rounded app icon for light environments (Surface Light #fafaf9 background, white page sheet, and soft resting drop shadow).
    *   [app_icon_dark.svg](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/app_icon_dark.svg) — Rounded app icon for dark environments (Canvas Dark #1c1917 background, dark slate page sheet #292524, and warm white border).
2.  **Isolated Icons:**
    *   [logo_icon_light.svg](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/logo_icon_light.svg) — Clean, transparent-background document and highlight mark for light backgrounds.
    *   [logo_icon_dark.svg](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/logo_icon_dark.svg) — Clean, transparent-background document and highlight mark for dark backgrounds.
3.  **Full Horizontal Logos:**
    *   [logo_full_light.svg](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/logo_full_light.svg) — Icon and "Stria PDF TOOLKIT" wordmark in deep stone gray (#1c1917) and muted stone (#78716c).
    *   [logo_full_dark.svg](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/logo_full_dark.svg) — Icon and "Stria PDF TOOLKIT" wordmark in warm white (#fafaf9) and muted stone (#a8a29e).
4.  **Premium Graphic Mockups:**
    *   `stria_brand_hero.png` — Minimalist high-end abstract marketing illustration representing layered paper sheets and precise warm-amber strokes.
    *   `stria_logo_mockup.png` — Beautiful 3D render showcasing the Stria brand symbol in gold-amber metal on a dark slate texture.

---

## 3. The Warm Stone Palette

Stria rejects standard blue-tinted cold gray scales (such as standard Tailwind slate/gray scales). Every neutral color is tinted warm (hue ~65-70 in OKLCH, chroma 0.003-0.012) to emulate the natural warmth of laid paper and reading rooms.

### Colors at a Glance
For full JSON tokens, see [brand_colors.json](file:///C:/Users/cnsco/Git/pdf-tools/design-assets/brand_colors.json).

| Token Name | Hex Code | OKLCH Space | Usage & Scope |
| :--- | :--- | :--- | :--- |
| **Warm Amber** | `#d97706` | oklch(72% 0.14 65) | Primary accent. Active states, focus rings, highlights. |
| **Amber Deep** | `#b45309` | oklch(62% 0.16 62) | Hover and pressed state for primary buttons only. |
| **Amber Tint** | `#fffbeb` | oklch(97% 0.025 68) | Drag-active zone fills, row selection highlights. |
| **Surface Light** | `#fafaf9` | oklch(98% 0.003 70) | Light mode outermost canvas background. |
| **Surface White** | `#ffffff` | oklch(100% 0 0) | Light mode cards, panels, and input backgrounds. |
| **Border Light** | `#e7e5e4` | oklch(91% 0.006 70) | Light mode dividers, input strokes, and lines. |
| **Text Strong** | `#1c1917` | oklch(18% 0.01 70) | Page titles, primary dark text (never pure black). |
| **Text Base** | `#44403c` | oklch(38% 0.010 70) | Paragraphs, descriptions, body copy. |
| **Text Muted** | `#78716c` | oklch(52% 0.008 70) | Sub-labels, metadata, timestamps. |
| **Canvas Dark** | `#1c1917` | oklch(14% 0.008 70) | Dark mode (viewer) outermost background. |
| **Surface Dark** | `#292524` | oklch(18% 0.01 70) | Dark mode sidebar and panel backgrounds. |
| **Surface Dark Raised**| `#3c3836` | oklch(22% 0.010 70) | Hover fills, active list items, search highlights. |
| **Border Dark** | `#57534e` | oklch(30% 0.012 70) | Dark mode panel dividers and input strokes. |
| **Text on Dark** | `#fafaf9` | oklch(96% 0.003 70) | Primary dark mode text. Same warm white as Surface Light. |

### Color Rules
*   **The Amber Reserve Rule:** The primary amber accent (`#d97706`) must cover **less than 10% of any screen surface**. It signals high interactivity or active focus. If it is used everywhere, it signals nothing.
*   **The Warm-Not-Blue Rule:** No pure grays (`#808080`) or blue-gray Tailwind defaults (`#111827`). Any new neutral color must pass a warmth check: tint toward amber/red, never blue.

---

## 4. Typography

Stria relies on the **humanist system font stack** to ensure instant loading times without web-request overhead.

```css
font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
```
*On macOS this resolves to SF Pro, and on Windows to Segoe UI. Both render with superb legibility at small sizes.*

### Hierarchy & Scale

1.  **Title:** semibold (600), `16px / 1.0rem`, line-height `1.25`, letter-spacing `-0.01em`
    *   *Usage:* Section headers, card titles, dialog headers.
2.  **Body:** regular (400), `14px / 0.875rem`, line-height `1.5`
    *   *Usage:* Annotation text, file lists, instructions, descriptive copy.
3.  **Label:** medium (500), `12px / 0.75rem`, line-height `1.33`, letter-spacing `+0.01em`
    *   *Usage:* Nav list rows, form labels, buttons, tab text.
4.  **Micro:** medium (500), `10px / 0.625rem`, line-height `1.2`, letter-spacing `+0.02em`
    *   *Usage:* Page numbers, counts, timestamps, status badges, shortcut indicators.

### Typographic Rules
*   **The Document Deference Rule:** UI text never exceeds `16px` (Title). Anything larger is reserved for the document content itself.
*   **The Label-Dominant Rule:** Ensure all UI decisions are optimized for `12px` legibility (contrast, tracking, and weight), as this is the dominant font size across panels.
*   **Tabular Numbers:** Always use `font-variant-numeric: tabular-nums` or `font-mono` on numbers that change dynamically (page counts, timestamps, zoom rates) to prevent layout shifts.

---

## 5. Elevation & Shadows

Depth is represented differently depending on the active theme mode:

### Light Mode (Shadows as Edges)
*   Surfaces are flat at rest. Shadows are reserved for elements that float above the canvas.
    *   **Resting Card Shadow:** `box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`. Used on ToolCards and file list items at rest to separate white elements from the Surface Light background.
    *   **Hover Lift Shadow:** `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)` + a physical `translateY(-2px)` transition.
    *   **Overlay Shadow:** `box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)`. Modals, palettes.

### Dark Mode (Tonal Layering, No Shadows)
*   Dark mode **does not use shadows** on flat surfaces. Deep shadows on dark backgrounds create muddy, low-contrast edges.
*   Layering is strictly **tonal**: a lighter background color indicates a physically higher layer.
    *   *Layer 0 (Outermost):* Canvas Dark (`#1c1917`)
    *   *Layer 1 (Panels):* Surface Dark (`#292524`)
    *   *Layer 2 (Hover/Active):* Surface Dark Raised (`#3c3836`)

---

## 6. Component Blueprint Checklist

### 1. Primary Buttons
*   **Shape:** 8px radius (`rounded-md`).
*   **Visuals:** Warm Amber (`#d97706`) background, Surface White (`#ffffff`) text.
*   **Hover:** Transitions to Amber Deep (`#b45309`) with `transition: background 150ms ease-out`.
*   **Focus Ring:** `ring-2 ring-amber-warm/50` (50% opacity halo).

### 2. Ghost Buttons (Viewer Toolbars)
*   **Shape:** 4px radius (`rounded-sm`).
*   **Visuals:** Transparent background, `text-on-dark-muted` (#a8a29e).
*   **Hover:** Transitions to `surface-dark-raised` background and `text-on-dark` (#fafaf9).

### 3. Tool Cards (Home Screen Grid)
*   **Shape:** 16px radius (`rounded-2xl`).
*   **Visuals:** Surface White (`#ffffff`) fill, 1px Border Light (`#e7e5e4`), resting shadow.
*   **Hover:** Lift transition (`translateY(-2px)`, hover shadow, title color turns to `amber-warm`).
*   **Icon:** 12px rounded badge (`rounded-xl`) carrying a tool-specific theme color, housing a white vector icon.

### 4. Right Rail Panels
*   **Visuals:** Surface Dark (`#292524`), no individual card borders.
*   **Items:** Full-width rows that transition to `surface-dark-raised` on hover.
*   **Selection:** The active/selected row uses a 2px left border in Warm Amber (`border-l-2 border-amber-warm`). This is the only permitted colored border stripe in the system.
