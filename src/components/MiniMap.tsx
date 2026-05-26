/**
 * MiniMap — a narrow position indicator overlaid on the right edge of the
 * canvas area.  Shows one row per page; the current page is highlighted with
 * an amber bar.  Pages that have annotations get a small dot.  Clicking a row
 * jumps to that page.
 *
 * Design intent: purely functional, zero decoration.  Sits in the top-right
 * of the scroll area via absolute positioning.
 */
import { useMemo } from "react";
import { cn } from "../lib/utils";
import type { LocalAnnot } from "./AnnotationLayer";

interface Props {
  totalPages: number;
  currentPage: number;
  annotations: LocalAnnot[];
  onGoTo: (p: number) => void;
}

export default function MiniMap({ totalPages, currentPage, annotations, onGoTo }: Props) {
  if (totalPages <= 1) return null;

  // Count annotations per page for the dot indicator
  const annotCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of annotations) m.set(a.page, (m.get(a.page) ?? 0) + 1);
    return m;
  }, [annotations]);

  // Cap visible rows at 120 so the strip stays usable on very long documents
  // without individual rows becoming invisibly small.
  const MAX_ROWS = 120;
  const showAll  = totalPages <= MAX_ROWS;

  // Build a list of page numbers to render.  If the document exceeds MAX_ROWS
  // we sample evenly, always including the current page and its neighbours.
  const rows = useMemo<number[]>(() => {
    if (showAll) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    // Thin evenly across the document
    const step = totalPages / MAX_ROWS;
    const pages = new Set<number>();
    for (let i = 0; i < MAX_ROWS; i++) pages.add(Math.round(i * step) + 1);
    // Always include current and neighbours
    [currentPage - 1, currentPage, currentPage + 1].forEach(p => {
      if (p >= 1 && p <= totalPages) pages.add(p);
    });
    return Array.from(pages).sort((a, b) => a - b);
  }, [totalPages, showAll, currentPage]);

  // Row height in px: fixed 4px each, with a min-height cap for usability
  const rowH = Math.max(4, Math.min(10, Math.floor(360 / rows.length)));

  return (
    <div
      aria-label="Document mini-map"
      title="Mini-map — click to jump to a page"
      className="flex flex-col rounded overflow-hidden shadow-lg overflow-y-auto"
      style={{ width: 10, maxHeight: "100%" }}
    >
      {rows.map(p => {
        const isCurrent = p === currentPage;
        const hasAnnots = (annotCount.get(p) ?? 0) > 0;
        return (
          <button
            key={p}
            onClick={() => onGoTo(p)}
            title={`Page ${p}${hasAnnots ? ` — ${annotCount.get(p)} annotation${(annotCount.get(p) ?? 0) !== 1 ? "s" : ""}` : ""}`}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "w-full transition-colors",
              isCurrent
                ? "bg-amber-500"
                : hasAnnots
                  ? "bg-stone-500 hover:bg-stone-400"
                  : "bg-stone-700 hover:bg-stone-600",
            )}
            style={{ height: rowH }}
          />
        );
      })}
    </div>
  );
}
