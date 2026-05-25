/**
 * CommandPalette — Ctrl+Shift+P fuzzy command launcher.
 *
 * Type any command name to filter. Type a number or ">N" to jump to page N.
 * Snippets from settings appear as insertable items (copies to clipboard).
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import type { Snippet } from "../lib/storage";

export interface PaletteCommand {
  id: string;
  label: string;
  description?: string;
  category: string;
  action: () => void;
}

interface Props {
  commands: PaletteCommand[];
  snippets: Snippet[];
  pageCount: number;
  onGoToPage: (page: number) => void;
  onClose: () => void;
}

type Item = {
  label: string;
  description?: string;
  category: string;
  action: () => void;
};

/** Simple substring-based relevance scorer. */
function score(label: string, desc: string, cat: string, query: string): number {
  const haystack = `${label} ${desc} ${cat}`.toLowerCase();
  const q = query.toLowerCase();
  if (label.toLowerCase() === q) return 100;
  if (label.toLowerCase().startsWith(q)) return 80;
  if (haystack.startsWith(q)) return 70;
  if (haystack.includes(q)) return 50;
  // All words present somewhere
  if (q.split(/\s+/).every(w => haystack.includes(w))) return 30;
  return 0;
}

export default function CommandPalette({
  commands, snippets, pageCount, onGoToPage, onClose,
}: Props) {
  const [query, setQuery]       = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Build full item list (commands + snippets)
  const allItems = useMemo<Item[]>(() => [
    ...commands.map(c => ({ label: c.label, description: c.description, category: c.category, action: c.action })),
    ...snippets.map(s => ({
      label: s.text.slice(0, 60) + (s.text.length > 60 ? "…" : ""),
      description: "Click to copy to clipboard",
      category: "Snippets",
      action: () => { navigator.clipboard.writeText(s.text).catch(() => {}); },
    })),
  ], [commands, snippets]);

  // Filter / score
  const filtered = useMemo<Item[]>(() => {
    const q = query.trim();

    // Page jump: bare number or ">N"
    const pageMatch = q.match(/^>?\s*(\d+)$/);
    if (pageMatch) {
      const n = parseInt(pageMatch[1]);
      if (n >= 1 && n <= pageCount) {
        return [{
          label: `Go to page ${n}`,
          description: `Jump to page ${n} of ${pageCount}`,
          category: "Navigation",
          action: () => { onGoToPage(n); onClose(); },
        }];
      }
    }

    if (!q) return allItems.slice(0, 12);

    return allItems
      .map(item => ({ item, s: score(item.label, item.description ?? "", item.category, q) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(({ item }) => item);
  }, [query, allItems, pageCount, onGoToPage, onClose]);

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0); }, [filtered]);

  function execute(idx: number) {
    const item = filtered[idx];
    if (!item) return;
    item.action();
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        execute(activeIdx);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-stone-900 border border-stone-600 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-700">
          <Search className="h-4 w-4 text-stone-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command, snippet, or page number…"
            className="flex-1 bg-transparent text-sm text-white placeholder-stone-500 focus:outline-none"
          />
          <kbd className="text-[10px] text-stone-600 bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-stone-500">
              No commands match <em>"{query}"</em>
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={i}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => execute(i)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left transition",
                  i === activeIdx ? "bg-brand-600/20" : "hover:bg-stone-800",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{item.label}</p>
                  {item.description && (
                    <p className="text-[11px] text-stone-500 truncate">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-stone-600">{item.category}</span>
                  {i === activeIdx && <ChevronRight className="h-3 w-3 text-stone-500" />}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-800 px-4 py-2 flex items-center gap-3 text-[10px] text-stone-600">
          <span><kbd className="bg-stone-800 border border-stone-700 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-stone-800 border border-stone-700 rounded px-1">↵</kbd> run</span>
          <span><kbd className="bg-stone-800 border border-stone-700 rounded px-1">Esc</kbd> close</span>
          <span className="ml-auto">
            Type <code className="bg-stone-800 rounded px-1">&gt;N</code> to jump to page
          </span>
        </div>
      </div>
    </div>
  );
}
