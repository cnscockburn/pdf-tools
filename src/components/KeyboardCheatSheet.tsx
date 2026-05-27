import { X } from "lucide-react";

type Entry = { key: string; desc: string } | { section: string };

const SHORTCUTS: Entry[] = [
  { section: "Modes" },
  { key: "V",         desc: "View mode" },
  { key: "A",         desc: "Annotate — Note" },
  { key: "H",         desc: "Annotate — Highlight" },
  { key: "U",         desc: "Annotate — Underline" },
  { key: "S",         desc: "Annotate — Strikethrough" },
  { key: "T",         desc: "Annotate — Text box" },
  { key: "I",         desc: "Annotate — Ink / Freehand draw" },
  { key: "G",         desc: "Annotate — Shape (rect / ellipse / arrow)" },
  { key: "P",         desc: "Annotate — Stamp" },
  { key: "R",         desc: "Redact mode" },
  { key: "C",         desc: "Crop mode" },
  { key: "Esc",       desc: "Return to View / dismiss overlay" },

  { section: "While annotating" },
  { key: "1 – 4",          desc: "Switch highlight colour" },
  { key: "Del / Backspace", desc: "Delete selected annotation" },
  { key: "Shift+click",    desc: "Multi-select (then bulk status/colour/delete)" },
  { key: "Dbl-click",      desc: "Edit note or add comment to markup" },
  { key: "Ctrl+Z",         desc: "Undo" },
  { key: "Ctrl+Shift+Z",   desc: "Redo" },

  { section: "Text selection (Highlight / Underline / Strike mode)" },
  { key: "Drag",           desc: "Select text — QuickAction bar appears" },
  { key: "H",              desc: "Highlight selected text" },
  { key: "U",              desc: "Underline selected text" },
  { key: "S",              desc: "Strikethrough selected text" },

  { section: "Navigation" },
  { key: "→ / ↓",         desc: "Next page" },
  { key: "← / ↑",         desc: "Previous page" },
  { key: "Scroll",         desc: "Page advance at scroll boundary" },
  { key: "Home",           desc: "First page" },
  { key: "End",            desc: "Last page" },

  { section: "Zoom" },
  { key: "+ / =",          desc: "Zoom in" },
  { key: "−",              desc: "Zoom out" },

  { section: "Tabs" },
  { key: "Ctrl+T",         desc: "New tab" },
  { key: "Ctrl+W",         desc: "Close tab" },
  { key: "Ctrl+Tab",       desc: "Next tab" },
  { key: "Ctrl+Shift+Tab", desc: "Previous tab" },
  { key: "Ctrl+1 – 9",     desc: "Jump to tab by position" },

  { section: "Panels & Global" },
  { key: "Shift+H",        desc: "Show / hide all annotations" },
  { key: "Ctrl+\\",        desc: "Toggle side by side" },
  { key: "Ctrl+F",         desc: "Search in document" },
  { key: "Ctrl+S",         desc: "Download PDF" },
  { key: "Ctrl+Shift+P",   desc: "Command palette" },
  { key: "?",              desc: "Show / hide this panel" },
];

interface Props { onClose: () => void }

export default function KeyboardCheatSheet({ onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[460px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-700 shrink-0">
          <span className="text-sm font-semibold text-white tracking-tight">Keyboard shortcuts</span>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-4 space-y-1">
          {SHORTCUTS.map((s, i) => {
            if ("section" in s) return (
              <p key={i} className="pt-3 pb-0.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider first:pt-0">
                {s.section}
              </p>
            );
            return (
              <div key={i} className="flex items-center justify-between gap-6 py-0.5">
                <span className="text-xs text-stone-400">{s.desc}</span>
                <kbd className="shrink-0 inline-flex items-center rounded border border-stone-600 bg-stone-800 px-1.5 py-0.5 text-[10px] font-mono text-stone-300">
                  {s.key}
                </kbd>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-2.5 border-t border-stone-700 shrink-0">
          <p className="text-[10px] text-stone-600">Press <kbd className="inline px-1 py-0.5 rounded border border-stone-700 bg-stone-800 font-mono">?</kbd> or <kbd className="inline px-1 py-0.5 rounded border border-stone-700 bg-stone-800 font-mono">Esc</kbd> to dismiss</p>
        </div>
      </div>
    </div>
  );
}
