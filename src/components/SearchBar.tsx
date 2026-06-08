/**
 * SearchBar — Ctrl+F in-document text search.
 *
 * The parent (Viewer) passes in search state so the bar is purely presentational
 * except for emitting onChange / navigation events.
 */
import { useEffect, useRef } from "react";
import { X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

export interface SearchResult {
  page: number;
  /** Fractional rects of matching spans (0–1 relative to page dimensions) */
  rects: Array<{ x0: number; y0: number; x1: number; y1: number }>;
}

interface Props {
  query: string;
  onChange: (q: string) => void;
  results: SearchResult[];
  focusIdx: number;               // index into results[]
  loading: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export default function SearchBar({ query, onChange, results, focusIdx, loading, onNext, onPrev, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  const total = results.length;
  const current = total > 0 ? focusIdx + 1 : 0;

  return (
    <div role="search" aria-label="Search in document" className="flex items-center gap-1.5 bg-stone-900 viewer-light:bg-white border border-stone-600 viewer-light:border-stone-300 rounded-xl px-2 py-1.5 shadow-xl viewer-light:shadow-md w-full max-w-sm">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.shiftKey ? onPrev() : onNext(); }
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
        }}
        placeholder="Search in document…"
        className="flex-1 min-w-0 bg-transparent border-none text-xs text-white viewer-light:text-stone-800 placeholder-stone-500 viewer-light:placeholder-stone-400 focus:outline-none"
        spellCheck={false}
      />

      {/* Match count */}
      <span className="shrink-0 text-[10px] tabular-nums text-stone-500 viewer-light:text-stone-500 min-w-[3.5rem] text-right" aria-live="polite">
        {loading
          ? <Loader2 className="h-3 w-3 animate-spin inline" />
          : query
            ? total > 0
              ? `${current} / ${total}`
              : "No matches"
            : ""
        }
      </span>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onPrev}
          disabled={total === 0}
          title="Previous match (Shift+Enter)"
          aria-label="Previous match"
          className="p-1 rounded hover:bg-stone-700 viewer-light:hover:bg-stone-100 disabled:opacity-30 text-stone-400 viewer-light:text-stone-500 hover:text-white viewer-light:hover:text-stone-800 transition"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onNext}
          disabled={total === 0}
          title="Next match (Enter)"
          aria-label="Next match"
          className="p-1 rounded hover:bg-stone-700 viewer-light:hover:bg-stone-100 disabled:opacity-30 text-stone-400 viewer-light:text-stone-500 hover:text-white viewer-light:hover:text-stone-800 transition"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          title="Close search (Esc)"
          aria-label="Close search"
          className="p-1 rounded hover:bg-stone-700 viewer-light:hover:bg-stone-100 text-stone-500 hover:text-white viewer-light:hover:text-stone-800 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
