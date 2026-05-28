/**
 * SettingsDialog — unified preferences panel.
 *
 * Opened from the TabBar gear icon (accessible on every tab) or from the
 * Viewer's own gear button / command palette.
 *
 * Sections:
 *   Identity    — reviewer name
 *   Interface   — UI scale, reduce motion
 *   Documents   — default fit mode, thumbnail sidebar default
 *   Annotations — default highlight colour, default ink width, colour labels
 */
import { useState } from "react";
import { X, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { DEFAULT_COLOR_LABELS } from "../lib/storage";
import type { Settings, UiScale, FitMode } from "../lib/storage";

// ── Static config ────────────────────────────────────────────────────────────

const UI_SCALES: { value: UiScale; label: string }[] = [
  { value: 1,    label: "100%" },
  { value: 1.25, label: "125%" },
  { value: 1.5,  label: "150%" },
];

const FIT_MODES: { value: FitMode; label: string; desc: string }[] = [
  { value: "width",  label: "Fit Width", desc: "Scale to container width" },
  { value: "page",   label: "Fit Page",  desc: "Show entire page"         },
  { value: "actual", label: "Actual",    desc: "Open at 100%"             },
];

const INK_WIDTHS = [1, 2, 4, 6] as const;

// The four base highlight colours — order must match HIGHLIGHT_COLORS in Viewer.tsx.
const BASE_SWATCHES = [
  { bg: "rgba(255,255,0,0.6)",    border: "rgba(200,160,0,0.9)"   },
  { bg: "rgba(0,255,255,0.55)",   border: "rgba(0,160,200,0.9)"   },
  { bg: "rgba(0,255,128,0.55)",   border: "rgba(0,180,80,0.9)"    },
  { bg: "rgba(255,128,200,0.55)", border: "rgba(200,80,150,0.9)"  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-amber-500 border-amber-500 text-white"
              : "bg-stone-800 border-stone-600 text-stone-400 hover:border-stone-500 hover:text-stone-200",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left group"
    >
      <div>
        <p className="text-xs font-medium text-stone-300 group-hover:text-white transition-colors">{label}</p>
        {description && <p className="text-[11px] text-stone-600 leading-snug mt-0.5">{description}</p>}
      </div>
      <span
        className={cn(
          "shrink-0 inline-flex h-5 w-9 items-center rounded-full border-2 transition-colors",
          checked
            ? "bg-amber-500 border-amber-500"
            : "bg-stone-700 border-stone-600",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsDialog({ settings, onUpdate, onClose }: Props) {
  // Local draft state — committed on Save
  const [authorDraft, setAuthorDraft]     = useState(settings.author);
  const [uiScale, setUiScale]             = useState<UiScale>(settings.uiScale ?? 1.25);
  const [reduceMotion, setReduceMotion]   = useState(settings.reduceMotion ?? false);
  const [fitMode, setFitMode]             = useState<FitMode>(settings.defaultFitMode ?? "width");
  const [thumbsDefault, setThumbsDefault] = useState(settings.thumbnailsOpenDefault ?? false);
  const [hlDefault, setHlDefault]         = useState<0|1|2|3>(settings.defaultHighlightColor ?? 0);
  const [inkWidth, setInkWidth]           = useState(settings.defaultInkWidth ?? 2);
  const [labels, setLabels]               = useState<[string,string,string,string]>(
    [...settings.colorLabels] as [string,string,string,string],
  );

  function setLabel(i: number, v: string) {
    const next = [...labels] as [string,string,string,string];
    next[i] = v;
    setLabels(next);
  }

  function resetColors() {
    setLabels([...DEFAULT_COLOR_LABELS] as [string,string,string,string]);
  }

  function save() {
    onUpdate({
      author:                authorDraft.trim(),
      uiScale,
      reduceMotion,
      defaultFitMode:        fitMode,
      thumbnailsOpenDefault: thumbsDefault,
      defaultHighlightColor: hlDefault,
      defaultInkWidth:       inkWidth,
      colorLabels:           labels,
    });
    onClose();
  }

  const inputCls = cn(
    "w-full bg-stone-800 border border-stone-600 rounded-lg px-3 py-2",
    "text-sm text-white placeholder-stone-600 focus:outline-none",
    "focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition",
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preferences"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[440px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-700 shrink-0">
          <span className="text-sm font-semibold text-white tracking-tight">Preferences</span>
          <button
            onClick={onClose}
            aria-label="Close preferences"
            className="text-stone-400 hover:text-white transition rounded p-0.5 hover:bg-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-7">

          {/* ── Identity ─────────────────────────────────────────────────────── */}
          <section>
            <SectionLabel>Identity</SectionLabel>
            <label className="block text-xs font-medium text-stone-300 mb-1.5">
              Reviewer name
            </label>
            <input
              autoFocus
              value={authorDraft}
              onChange={e => setAuthorDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
              placeholder="Your name"
              className={inputCls}
            />
            <p className="mt-1.5 text-[11px] text-stone-600 leading-snug">
              Stamped on new annotations as the author.
            </p>
          </section>

          {/* ── Interface ────────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionLabel>Interface</SectionLabel>

            <div>
              <p className="text-xs font-medium text-stone-300 mb-1.5">UI scale</p>
              <SegmentedControl
                options={UI_SCALES}
                value={uiScale}
                onChange={setUiScale}
              />
              <p className="mt-1.5 text-[11px] text-stone-600 leading-snug">
                Scales the entire interface. Takes effect immediately on save.
              </p>
            </div>

            <Toggle
              checked={reduceMotion}
              onChange={setReduceMotion}
              label="Reduce motion"
              description="Disables transitions and animations app-wide."
            />
          </section>

          {/* ── Documents ────────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionLabel>Documents</SectionLabel>

            <div>
              <p className="text-xs font-medium text-stone-300 mb-1.5">Default fit when opening</p>
              <SegmentedControl
                options={FIT_MODES.map(m => ({ value: m.value, label: m.label }))}
                value={fitMode}
                onChange={setFitMode}
              />
              <p className="mt-1.5 text-[11px] text-stone-600 leading-snug">
                {FIT_MODES.find(m => m.value === fitMode)?.desc}
              </p>
            </div>

            <Toggle
              checked={thumbsDefault}
              onChange={setThumbsDefault}
              label="Open thumbnail sidebar by default"
              description="Show page thumbnails automatically when a PDF loads."
            />
          </section>

          {/* ── Annotations ──────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionLabel>Annotations</SectionLabel>

            {/* Default highlight colour */}
            <div>
              <p className="text-xs font-medium text-stone-300 mb-2">Default highlight colour</p>
              <div className="flex gap-2.5">
                {BASE_SWATCHES.map((swatch, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setHlDefault(i as 0|1|2|3)}
                    title={labels[i] || DEFAULT_COLOR_LABELS[i]}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg border transition-colors",
                      hlDefault === i
                        ? "border-amber-500 bg-stone-800"
                        : "border-stone-700 bg-stone-800/50 hover:border-stone-500",
                    )}
                  >
                    <span
                      className="w-5 h-5 rounded-full border-2 shrink-0"
                      style={{ background: swatch.bg, borderColor: swatch.border }}
                    />
                    <span className="text-[10px] text-stone-400 leading-none">
                      {labels[i] || DEFAULT_COLOR_LABELS[i]}
                    </span>
                    {hlDefault === i && (
                      <span className="text-[9px] text-amber-500 font-medium">default</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Default ink width */}
            <div>
              <p className="text-xs font-medium text-stone-300 mb-1.5">Default ink stroke width</p>
              <div className="flex gap-1.5">
                {INK_WIDTHS.map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setInkWidth(w)}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-colors",
                      inkWidth === w
                        ? "border-amber-500 bg-stone-800"
                        : "border-stone-700 bg-stone-800/50 hover:border-stone-500",
                    )}
                  >
                    {/* Stroke-width preview */}
                    <span
                      className="block w-8 rounded-full bg-stone-300 transition-all"
                      style={{ height: `${w}px` }}
                    />
                    <span className="text-[10px] text-stone-400">{w}px</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Colour labels */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-stone-300">Highlight colour labels</p>
                <button
                  type="button"
                  onClick={resetColors}
                  className="text-[11px] text-stone-600 hover:text-stone-400 transition"
                >
                  Reset to defaults
                </button>
              </div>
              <p className="text-[11px] text-stone-600 leading-snug mb-2">
                Rename to reflect your review workflow — e.g. Yellow → "Question".
              </p>
              <div className="space-y-1.5">
                {BASE_SWATCHES.map((swatch, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span
                      className="shrink-0 h-4 w-4 rounded-full border-2"
                      style={{ background: swatch.bg, borderColor: swatch.border }}
                    />
                    <input
                      value={labels[i]}
                      onChange={e => setLabel(i, e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
                      placeholder={DEFAULT_COLOR_LABELS[i]}
                      className={cn(
                        "flex-1 bg-stone-800 border border-stone-600 rounded-lg px-2.5 py-1.5",
                        "text-xs text-white placeholder-stone-600 focus:outline-none",
                        "focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition",
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-stone-700 shrink-0 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs text-stone-400 hover:text-white hover:bg-stone-700 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-xs font-semibold text-white transition shadow-sm"
          >
            <Check className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
