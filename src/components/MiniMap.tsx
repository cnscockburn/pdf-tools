/**
 * MiniMap — horizontal document-overview strip rendered below the canvas,
 * above the main toolbar.  One block per page; current page is amber;
 * pages with annotations show a coloured pip.
 *
 * For very long documents (>60 pages) the blocks compress to fill available
 * width.  Hovering a block shows a tooltip with page number + annotation count.
 * Clicking jumps to that page.
 *
 * Positioning is handled by the parent (Viewer.tsx places it between the
 * canvas scroll area and the context toolbars).
 */
import { useMemo, useRef, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import type { LocalAnnot } from "./AnnotationLayer";

interface Props {
  totalPages: number;
  currentPage: number;
  annotations: LocalAnnot[];
  onGoTo: (p: number) => void;
}

// Minimum visible block width in px — below this we stop drawing separators
const MIN_BLOCK_PX = 4;

export default function MiniMap({ totalPages, currentPage, annotations, onGoTo }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  // Measure available width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
    ro.observe(el);
    setContainerW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Count annotations per page
  const annotCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of annotations) m.set(a.page, (m.get(a.page) ?? 0) + 1);
    return m;
  }, [annotations]);

  if (totalPages <= 1) return null;

  // Compute block width: fill container, min MIN_BLOCK_PX
  const gap = 1; // px gap between blocks
  const blockW = containerW > 0
    ? Math.max(MIN_BLOCK_PX, Math.floor((containerW - gap * (totalPages - 1)) / totalPages))
    : MIN_BLOCK_PX;

  const showSeps = blockW >= 6;
  const showNums = blockW >= 18;

  return (
    <div
      ref={containerRef}
      aria-label="Document overview"
      className="w-full h-7 flex items-stretch overflow-hidden select-none shrink-0"
      style={{ gap: showSeps ? gap : 0 }}
    >
      {Array.from({ length: totalPages }, (_, i) => {
        const p = i + 1;
        const isCurrent = p === currentPage;
        const count = annotCount.get(p) ?? 0;

        return (
          <button
            key={p}
            onClick={() => onGoTo(p)}
            title={`Page ${p}${count > 0 ? ` · ${count} annotation${count !== 1 ? "s" : ""}` : ""}`}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "relative flex-1 flex items-center justify-center transition-colors",
              "min-w-[4px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400",
              isCurrent
                ? "bg-amber-500/80 hover:bg-amber-400/90"
                : "bg-stone-700 hover:bg-stone-600",
            )}
            style={{ maxWidth: blockW + gap }}
          >
            {/* Annotation pip — bottom edge */}
            {count > 0 && !isCurrent && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400"
              />
            )}

            {/* Page number label (only if block is wide enough) */}
            {showNums && (
              <span className={cn(
                "text-[9px] font-mono leading-none select-none",
                isCurrent ? "text-white font-bold" : "text-stone-500",
              )}>
                {p}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
