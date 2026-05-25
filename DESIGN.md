---
name: PDF Tools
description: Local, private PDF toolkit — review, annotate, and transform documents without a cloud in sight.
colors:
  amber-warm: "#d97706"
  amber-deep: "#b45309"
  amber-tint: "#fffbeb"
  surface-light: "#fafaf9"
  surface-white: "#ffffff"
  border-light: "#e7e5e4"
  text-strong: "#1c1917"
  text-base: "#44403c"
  text-muted: "#78716c"
  text-faint: "#a8a29e"
  canvas-dark: "#1c1917"
  surface-dark: "#292524"
  surface-dark-raised: "#3c3836"
  border-dark: "#57534e"
  text-on-dark: "#fafaf9"
  text-on-dark-muted: "#a8a29e"
  state-focus: "#d97706"
  state-success: "#22c55e"
  state-error: "#ef4444"
  state-warning: "#fbbf24"
typography:
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.01em"
  micro:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.amber-warm}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.amber-deep}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost-dark:
    backgroundColor: "transparent"
    textColor: "{colors.text-on-dark-muted}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  button-ghost-dark-hover:
    backgroundColor: "{colors.surface-dark-raised}"
    textColor: "{colors.text-on-dark}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  tool-card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-strong}"
    rounded: "16px"
    padding: "20px"
  input-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-on-dark}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: PDF Tools

## 1. Overview

**Creative North Star: "The Instrument"**

This system is precision-built to be used, not admired. Every surface serves a function. When the user is working, the UI should be invisible; when they look closely, there is quiet craft. The instrument analogy is literal: a well-made tool has beauty in its proportions and tactility, but none of it is decorative. Form follows function to a point where they become inseparable.

The design operates in two intentional modes: **light toolbox** (home screen, tool pages, utilities) and **dark viewer** (document review, annotation, search). The shift between them is not inconsistency, it is mode-signaling. Light means: choose a tool, organize, prepare. Dark means: you are inside the document now. This contrast is earned. It mirrors how physical environments work: a bright workshop for setup, a focused reading lamp for deep work.

The warm stone palette (canonical oklch: dark surfaces at oklch(14%-22%, chroma ~0.010, hue 70); light surfaces at oklch(97%-99%, chroma ~0.003, hue 70)) replaces the legacy blue-tinted Tailwind gray scale. The shift is subtle but perceptible: warmer dark surfaces feel more like a reading environment than a terminal, and warmer light surfaces feel like paper rather than a browser. The amber accent (oklch(72%, 0.14, 65)) echoes annotation ink, highlighter yellow, and the warmth of physical document work.

**Key Characteristics:**
- Two-mode contrast: light toolbox + dark deep-work viewer
- Dense, information-first type scale centered on 12-14px
- Warm stone palette, amber accent, no blue-tinted neutrals
- Restrained shadows — flat at rest, depth only on state
- Tight, purposeful spacing; no padding for its own sake
- WCAG 2.1 AA across both modes

## 2. Colors: The Warm Stone Palette

A warm amber accent on a stone neutral base. The palette is restrained: amber appears on less than 10% of any screen. Its rarity is the point.

### Primary

- **Warm Amber** (`#d97706`, oklch(72% 0.14 65)): The sole accent. Used for primary buttons, focus rings, active navigation states, drag handles, and hover-state color shifts on titles. Echoes annotation ink and physical highlighting. Forbidden as a background except for the amber-tint (`#fffbeb`) variant used in drag-active states and subtle row highlights.
- **Amber Deep** (`#b45309`, oklch(62% 0.16 62)): Hover/active state of Warm Amber only. Never appears at rest as a primary surface. Used for pressed button states and darker icon fills.

### Secondary

- **Amber Tint** (`#fffbeb`, oklch(97% 0.025 68)): The only warm-amber background. Used exclusively for drag-active drop zones and subtle selection rows. Covers less than 5% of any screen.

### Neutral — Light Surfaces

- **Surface Light** (`#fafaf9`, oklch(98% 0.003 70)): Main page background in tool pages. Warm white; never pure white. Think: laid paper, not screen.
- **Surface White** (`#ffffff`): Card and panel backgrounds within the light surface. Used for ToolCards, file list items, dialog content areas.
- **Border Light** (`#e7e5e4`, oklch(91% 0.006 70)): Dividers, card borders, input strokes in light mode. Warm gray, not blue-gray.
- **Text Strong** (`#1c1917`, oklch(18% 0.01 70)): Page titles, card headings, primary labels. The darkest text value; not pure black.
- **Text Base** (`#44403c`, oklch(38% 0.010 70)): Body copy and secondary headings.
- **Text Muted** (`#78716c`, oklch(52% 0.008 70)): Descriptions, metadata, subdued labels.
- **Text Faint** (`#a8a29e`, oklch(65% 0.006 70)): Placeholders, disabled states, timestamps.

### Neutral — Dark Surfaces (Viewer)

- **Canvas Dark** (`#1c1917`, oklch(14% 0.008 70)): The viewer's outermost background. Very dark warm near-black.
- **Surface Dark** (`#292524`, oklch(18% 0.01 70)): Panel and sidebar backgrounds within the viewer. Slightly lighter than the canvas.
- **Surface Dark Raised** (`#3c3836`, oklch(22% 0.010 70)): Hover backgrounds, active rows, focus areas on dark surfaces. Tonal layering without shadows.
- **Border Dark** (`#57534e`, oklch(30% 0.012 70)): Panel dividers, input strokes, list separators in dark mode.
- **Text on Dark** (`#fafaf9`, oklch(96% 0.003 70)): Primary text in dark mode. Same warm white as Surface Light.
- **Text on Dark Muted** (`#a8a29e`, oklch(65% 0.006 70)): Secondary text, icon labels, metadata in dark mode.

### State Colors

- **Focus** (`#d97706`): Same as Warm Amber. Focus rings use `ring-1` with amber at 50% opacity. Never a thick outline.
- **Success** (`#22c55e`): Resolved annotations, completed operations. Restrained: icons and text only, never as a surface fill.
- **Error** (`#ef4444`): Validation failures, destructive confirmations. Text and icon tint only in light mode; muted variant in dark mode.
- **Warning** (`#fbbf24`): Non-blocking alerts, soft warnings. Used sparingly; amber-adjacent so it doesn't create visual noise next to the primary.

### Named Rules

**The Amber Reserve Rule.** The amber accent covers less than 10% of any screen surface. Its presence signals interactivity or the currently active state. If it appears everywhere, it signals nothing. When in doubt, use a ghost/neutral treatment and reserve amber for the thing that matters most.

**The Warm-Not-Blue Rule.** Every neutral value is tinted warm (hue ~65-70 in OKLCH, chroma 0.003-0.012). No pure grays, no blue-gray Tailwind defaults (`gray-900` is `#111827` — blue-hue, forbidden). Any new neutral value must pass a warmth check: tint toward amber, not blue.

## 3. Typography

**UI Font:** System UI stack — `system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`

No custom font is currently loaded; the system stack is deliberately calibrated to render well at small sizes. On macOS this resolves to SF Pro. On Windows, Segoe UI. Both are humanist sans-serif faces that hold legibility at 10-12px, which this system requires.

**Character:** Dense, legible, unobtrusive. The type scale is compressed toward the small end because the document is the content, not the UI. Every label earns its presence.

**Future direction:** If a custom font is added, the target is a warm humanist sans in the weight class of Inter, Instrument Sans, or DM Sans. A serif display for headings could reinforce the "reading tool" positioning, but is optional.

### Hierarchy

- **Title** (semibold, 16px/1rem, line-height 1.25, letter-spacing -0.01em): Section headings, panel titles, dialog headers. Tracks tight to feel grounded, not floaty.
- **Body** (regular, 14px/0.875rem, line-height 1.5): Page descriptions, annotation text, file names. The workhorse size.
- **Label** (medium, 12px/0.75rem, line-height 1.33, letter-spacing +0.01em): Buttons, nav items, form field labels, sidebar row text. The dominant size across the app — 100+ occurrences. Set at +0.01em tracking to maintain legibility at this size.
- **Micro** (medium, 10px/0.625rem, line-height 1.2, letter-spacing +0.02em): Match counts, badges, timestamps, page numbers, annotation status chips. Tracking increased to compensate for size.

### Named Rules

**The Document Deference Rule.** The UI type scale stops at 16px (title). Anything larger is reserved for the document itself. The UI must never visually compete with the content it serves.

**The Label-Dominant Rule.** 12px is the primary working size. Design decisions that work at 12px (contrast, weight, spacing) drive the system. Never design for 16px and scale down; design for 12px and scale up if needed.

## 4. Elevation

This system uses **tonal layering in dark mode** and **restrained shadows in light mode**. Shadows are not decorative. They are reserved for elements that physically float above the page: modals, tooltips, command palettes, popovers.

In dark mode, depth is communicated by lightness steps: `canvas-dark` (14% L) < `surface-dark` (18% L) < `surface-dark-raised` (22% L). No shadows on dark surfaces except when a dark panel or dialog must float over the dark canvas (e.g. the command palette uses `shadow-2xl`).

### Shadow Vocabulary

- **Resting card** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): ToolCards and file list items at rest. Barely perceptible. Its purpose is edge separation from a near-white background, not drama.
- **Hover lift** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): ToolCards on hover. The card rises 2px. No spring, no bounce; `ease-out` at 150ms.
- **Floating panel** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): Inline popovers, annotation popups, dropdowns.
- **Overlay** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)`): Command palette, modals, dialogs. These are significant interruptions; the shadow weight communicates that.

### Named Rules

**The Flat-at-Rest Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, float, focus). A shadow on a static element is a design error.

**The No-Dark-Shadow Rule.** Dark surfaces do not use shadows for depth. Layering is tonal: lighter `L%` value = higher layer. Shadow-on-dark obscures content and creates a muddy, opaque feel.

## 5. Components

### Buttons

Buttons are compact and confident. Padding is generous enough to hit targets, tight enough to fit in dense toolbars.

- **Shape:** Gently curved (8px radius, `rounded-md`). Not pill-shaped (too casual), not sharp-cornered (too cold).
- **Primary** (amber background, white text, `px-4 py-2`, semibold label size): Used for the single main action per surface — "Process", "Download", "Apply". One primary button per context. Amber background only on primary.
- **Hover / Focus:** Background shifts to `amber-deep (#b45309)` at 150ms ease-out. Focus ring: `ring-2 ring-amber-warm/50` — amber at half opacity, not a full-strength halo.
- **Disabled:** `opacity-50`. No color change. The button shape remains; only weight signals the state.
- **Ghost (dark surfaces):** Transparent background, `text-on-dark-muted`, `rounded-sm (4px)`. Hover fills with `surface-dark-raised`. Used for toolbar icon buttons and secondary panel actions. The dominant button type inside the viewer.
- **Destructive:** Red-tinted ghost (`text-error hover:bg-red-500/10`). Never a solid red background — too alarming for routine delete operations.

### ToolCards

The home screen's tool grid entries. Character: elevated but flat — prominent in a quiet room.

- **Corner Style:** Generous (16px radius, `rounded-2xl`)
- **Background:** Surface White (`#ffffff`), set against Surface Light (`#fafaf9`) background. The contrast is intentional: cards feel like objects placed on a surface.
- **Shadow Strategy:** Resting card shadow at rest. Hover lift shadow on hover, with a 2px translateY. The card physically rises.
- **Border:** 1px `border-light (#e7e5e4)` at rest. `border-light` stays — the lift shadow provides the differentiation on hover.
- **Internal Padding:** 20px on all sides.
- **Icon Badge:** `rounded-xl (12px)`, solid colored background (amber or semantic color per tool), white icon at 24px. The badge carries the color; everything else is neutral.
- **Title:** Semibold body size (14px). Shifts to `amber-warm` on hover. No underline, no arrow.
- **Description:** Micro size (10-12px), `text-muted`.

### File Drop Zone

- **Style:** Dashed 2px border, `border-light (#e7e5e4)` at rest, `rounded-xl (12px)`
- **Drag active:** Border shifts to `amber-warm`, background fills with `amber-tint (#fffbeb)`
- **Hover:** Border shifts to a mid-tone between `border-light` and `amber-warm` (~`#d4c5a0`). Background goes to `surface-light`.
- **Internal layout:** Centered upload icon (`text-faint`), label (`text-base`, medium), sub-label (`text-faint`, micro). Generous vertical padding (40px top/bottom) — the zone must feel inviting.

### Inputs and Search Fields

Two contexts: light-mode settings/tool inputs, and dark-mode search/palette inputs.

**Light inputs:**
- `bg-surface-white`, `border-1 border-light`, `rounded-md (8px)`
- Focus: border shifts to `amber-warm`, ring `ring-1 ring-amber-warm/30`
- Placeholder: `text-faint`

**Dark search bar (viewer):**
- `bg-canvas-dark`, `border-1 border-dark`, `rounded-xl (12px)`
- Text: `text-on-dark`, placeholder `text-on-dark-muted`
- Focus: same `ring-1 ring-amber-warm/30` — the focus treatment is consistent across modes
- Match count shown in `micro` size, `text-on-dark-muted`, monospaced tabular-nums

### Panels (Dark Right Rail)

The viewer's right-side annotation, outline, and bookmark panels.

- **Background:** `surface-dark (#292524)`
- **Headers:** `border-b border-dark`, `label` size, semibold, `text-on-dark`
- **Rows:** Full-width, `py-2 px-3`, `rounded-md` on hover → `surface-dark-raised`
- **No card borders inside panels.** Rows are not cards. Rows use hover-bg only; no borders, no radius at rest.
- **Active / selected row:** `surface-dark-raised` background, amber-warm left edge via `border-l-2` ONLY in this one case (navigation-indicator, not decoration). This is an exception to the side-stripe ban: a 2px left edge on a selected navigation item is a recognized affordance. This is the only permitted side stripe in the system.

### Command Palette

- **Overlay:** Centered modal, `max-w-lg`, `rounded-2xl`, `bg-canvas-dark/95 backdrop-blur-sm`, `shadow-overlay`
- **Input:** Full-width inside palette, no separate border — the palette border IS the input container
- **Results list:** `label` size items, category headers in `micro` uppercase `text-on-dark-muted`, `rounded-md` hover fill
- **Selected item:** `surface-dark-raised` background, amber category label

### Annotation Layer (Viewer Signature Component)

The annotation layer renders on top of the PDF canvas as an SVG overlay for ink/shapes and div overlays for text-based annotations.

- **Highlights:** Semi-transparent amber/yellow fills (`rgba(253, 224, 71, 0.35)` for yellow, adjustable). Border: none. The highlight IS the annotation; no chrome.
- **Notes/Comments:** Small icon badge anchored to a fractional position. `amber-warm` fill for open, `surface-dark-raised` for resolved. Popover on click: `surface-dark`, `rounded-xl`, `shadow-floating`.
- **Selection handles:** 5px corner squares, `amber-warm` fill, `border-white` 1px.
- **Ink strokes / shapes:** SVG paths with `vector-effect: non-scaling-stroke`. Stroke color user-configurable; default `#d97706`.
- **Stamps:** Div overlay with bold uppercase label text, colored border + tinted background matching stamp color. `rounded-sm (4px)`.

## 6. Do's and Don'ts

### Do:

- **Do** use `amber-warm (#d97706)` as the sole accent. One accent, used sparingly. Its rarity signals interactivity.
- **Do** use warm stone neutrals (`text-strong #1c1917`, `canvas-dark #1c1917`) for all dark values. The warmth is the system's character; cold blue-gray (`#111827`) destroys it.
- **Do** keep the two-mode contrast: light toolbox, dark viewer. The shift signals mode change. It is intentional.
- **Do** use `shadow-sm` (resting card shadow) only on cards that sit on a light background. Cards on `surface-light` need edge separation; panels inside the dark viewer do not.
- **Do** size interactive hit areas to a minimum of 28px (height). Labels can be 12px; the button containing them must not be.
- **Do** keep type at 12-14px for UI labels. The document is the content. The chrome is the frame.
- **Do** honor `prefers-reduced-motion: reduce` by setting all transitions to `duration-0`.
- **Do** test focus states at `ring-2 ring-amber-warm/50`. Every interactive element must have a visible amber focus ring that meets 3:1 contrast against both light and dark backgrounds.

### Don't:

- **Don't** use `gray-900 (#111827)` or any blue-tinted Tailwind gray as a dark surface. It will betray the warm system immediately. Replace every instance with the warm stone scale.
- **Don't** make the interface look like a SmallPDF or iLovePDF page — no rounded pill buttons, no large colorful hero sections, no "Try it free" marketing language anywhere in the chrome.
- **Don't** produce an AI-generated-looking interface: no identical card grids with icon + heading + text repeated across an 8-column grid, no gradient text, no glassmorphism-as-default. If a new feature looks like it emerged from Shadcn's defaults plus a blue accent, it is wrong. Revisit.
- **Don't** use `border-left` or `border-right` as colored accent stripes on cards, list rows, alerts, or callouts — with the one exception documented in Panels: a 2px left edge on the currently selected navigation row. No other side stripes.
- **Don't** add a shadow to a dark surface element that isn't floating. Tonal layering handles depth in dark mode.
- **Don't** add `font-bold` to running UI text. Bold is reserved for display contexts. `font-semibold` is the maximum weight for labels and buttons.
- **Don't** add padding "for breathing room" without a specific reason. Every spacing decision should have a purpose: alignment, grouping, hierarchy.
- **Don't** reach for a modal as a first thought. The annotation popover, the command palette, the search bar — these are all inline or overlay elements that appear near their trigger. Full-screen modal overlays are for destructive confirmations and settings only.
