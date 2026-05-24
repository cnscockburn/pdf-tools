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
    <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-600 rounded-xl px-2 py-1.5 shadow-xl w-full max-w-sm">
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
        className="flex-1 min-w-0 bg-transparent border-none text-xs text-white placeholder-gray-500 focus:outline-none"
        spellCheck={false}
      />

      {/* Match count */}
      <span className="shrink-0 text-[10px] tabular-nums text-gray-500 min-w-[3.5rem] text-right">
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
          className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 hover:text-white transition"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onNext}
          disabled={total === 0}
          title="Next match (Enter)"
          className="p-1 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400 hover:text-white transition"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          title="Close search (Esc)"
          className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-white transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
