/**
 * SettingsDialog — user preferences panel (author name, colour labels).
 *
 * Opened via the gear icon in the Viewer top bar.
 * Stores changes immediately via useSettings() so every keystroke persists.
 */
import { useState } from "react";
import { X, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { DEFAULT_COLOR_LABELS } from "../lib/storage";
import type { Settings } from "../lib/storage";

// The four base highlight colours (order must match HIGHLIGHT_COLORS in Viewer.tsx).
const BASE_SWATCHES = [
  { bg: "rgba(255,255,0,0.6)",     border: "rgba(200,160,0,0.9)"   },
  { bg: "rgba(0,255,255,0.55)",    border: "rgba(0,160,200,0.9)"   },
  { bg: "rgba(0,255,128,0.55)",    border: "rgba(0,180,80,0.9)"    },
  { bg: "rgba(255,128,200,0.55)",  border: "rgba(200,80,150,0.9)"  },
];

interface Props {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsDialog({ settings, onUpdate, onClose }: Props) {
  const [authorDraft, setAuthorDraft] = useState(settings.author);
  const [labels, setLabels]           = useState<[string, string, string, string]>(
    [...settings.colorLabels] as [string, string, string, string],
  );

  function save() {
    onUpdate({ author: authorDraft.trim(), colorLabels: labels });
    onClose();
  }

  function setLabel(i: number, v: string) {
    const next = [...labels] as [string, string, string, string];
    next[i] = v;
    setLabels(next);
  }

  function resetColors() {
    setLabels([...DEFAULT_COLOR_LABELS] as [string, string, string, string]);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preferences"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[400px] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-700 shrink-0">
          <span className="text-sm font-semibold text-white tracking-tight">Preferences</span>
          <button onClick={onClose} className="text-stone-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-6">

          {/* Author */}
          <section className="space-y-2">
            <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
              Reviewer name
            </label>
            <input
              autoFocus
              value={authorDraft}
              onChange={e => setAuthorDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
              placeholder="Your name"
              className="w-full bg-stone-800 border border-stone-600 focus:border-brand-500 rounded-lg px-3 py-2 text-sm text-white placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-brand-500 transition"
            />
            <p className="text-[11px] text-stone-600 leading-snug">
              Stamped on new annotations as the author.
            </p>
          </section>

          {/* Highlight colour labels */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                Highlight colour labels
              </label>
              <button
                onClick={resetColors}
                className="text-[10px] text-stone-600 hover:text-stone-400 transition"
              >
                Reset to defaults
              </button>
            </div>
            <p className="text-[11px] text-stone-600 leading-snug">
              Rename colours to reflect their semantic meaning in your review workflow
              (e.g. Yellow → "Question", Green → "Approved").
            </p>
            <div className="space-y-2 mt-1">
              {BASE_SWATCHES.map((swatch, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span
                    className="shrink-0 h-5 w-5 rounded-full border-2"
                    style={{ background: swatch.bg, borderColor: swatch.border }}
                  />
                  <input
                    value={labels[i]}
                    onChange={e => setLabel(i, e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
                    placeholder={DEFAULT_COLOR_LABELS[i]}
                    className={cn(
                      "flex-1 bg-stone-800 border rounded-lg px-2.5 py-1.5 text-xs text-white",
                      "placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-brand-500 transition",
                      "border-stone-600 focus:border-brand-500",
                    )}
                  />
                  <span className="text-[10px] text-stone-600 w-10 text-right shrink-0">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-stone-700 shrink-0 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs text-stone-400 hover:text-white hover:bg-stone-700 transition"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-xs font-semibold text-white transition shadow"
          >
            <Check className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
