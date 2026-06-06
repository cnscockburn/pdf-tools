/**
 * Help mode (6.4) — a toggleable "explain the UI" layer.
 *
 * When on, the viewer shows a contextual help strip describing the current mode
 * / tool and its key actions. State lives in localStorage so it persists and is
 * shared across panes; subscribe via the "help-mode-changed" window event.
 */
import { useEffect, useState } from "react";

const KEY = "pdf-tools-help-mode";

export function getHelpMode(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setHelpMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
    window.dispatchEvent(new Event("help-mode-changed"));
  } catch { /* ignore */ }
}

/** React hook: current help-mode flag + a toggle. */
export function useHelpMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(getHelpMode);
  useEffect(() => {
    const sync = () => setOn(getHelpMode());
    window.addEventListener("help-mode-changed", sync);
    return () => window.removeEventListener("help-mode-changed", sync);
  }, []);
  return [on, setHelpMode];
}

// ── Contextual help content ──────────────────────────────────────────────────

export interface HelpEntry {
  title: string;
  body: string;
}

/** Help text for the annotate sub-modes (keyed by CreateMode). */
const ANNOTATE_HELP: Record<string, HelpEntry> = {
  note:          { title: "Note", body: "Click anywhere to drop a comment pin. Type your note, then click away or press Esc (empty notes are discarded). Double-click a pin to edit it." },
  highlight:     { title: "Highlight", body: "Select text to highlight it in the current colour. Pick a colour with the swatches or keys 1–4." },
  underline:     { title: "Underline", body: "Select text to underline it." },
  strikethrough: { title: "Strikethrough", body: "Select text to strike it through." },
  freetext:      { title: "Text box", body: "Drag to draw a box, then type. Click away to finish; double-click later to edit. Add tags inside the box." },
  ink:           { title: "Ink", body: "Drag to draw freehand. Pick a colour and width above, or set width with keys 1–9." },
  shape:         { title: "Shape", body: "Choose rectangle, ellipse, line or arrow, then drag to draw it." },
  stamp:         { title: "Stamp", body: "Pick a label and click to place a stamp. Add your own labels in Settings → Annotations." },
};

/**
 * Resolve the help entry for the current viewer state.
 * mode: "view" | "annotate" | "redact" | "crop"; sub: annotate sub-mode.
 */
export function helpForMode(mode: string, sub: string): HelpEntry {
  switch (mode) {
    case "annotate":
      return ANNOTATE_HELP[sub] ?? { title: "Annotate", body: "Pick a tool above to mark up the document." };
    case "redact":
      return { title: "Redact", body: "Drag to draw boxes over sensitive content, then Apply to permanently remove it. This cannot be undone after applying." };
    case "crop":
      return { title: "Crop", body: "Drag to select the area to keep. Apply to one page or all pages." };
    default:
      return { title: "View", body: "Read and navigate. Select text to highlight it, scroll past a page edge to turn the page, or press A to annotate. Ctrl/Cmd+scroll zooms." };
  }
}
