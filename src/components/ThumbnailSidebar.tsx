import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePdfThumbnails } from "./PageThumbnailGrid";
import { cn } from "../lib/utils";
import type { LocalAnnot } from "./AnnotationLayer";

interface Props {
  file: File;
  currentPage: number;
  onSelect: (page: number) => void;
  collapsed: boolean;
  onToggle: () => void;
  /** Optional — when provided, show annotation count badges on thumbnails */
  annotations?: LocalAnnot[];
  /** Accent color scheme: "amber" (default/primary) or "cyan" (secondary pane) */
  accent?: "amber" | "cyan";
}

export default function ThumbnailSidebar({ file, currentPage, onSelect, collapsed, onToggle, annotations = [], accent = "amber" }: Props) {
  const { thumbnails, pageCount } = usePdfThumbnails(file, 0.2);

  // Build per-page annotation counts
  const countsByPage = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of annotations) m.set(a.page, (m.get(a.page) ?? 0) + 1);
    return m;
  }, [annotations]);

  return (
    <div
      className={cn(
        // z-20 keeps the floating collapse toggle (which sits -right-3, outside
        // the box) above the canvas sibling. No overflow-hidden here, or the
        // toggle gets clipped — the inner scroll area handles its own overflow.
        "relative z-20 flex-shrink-0 flex flex-col bg-stone-900 viewer-light:bg-stone-50 border-r border-stone-700 viewer-light:border-stone-300 transition-[width] duration-200",
        collapsed ? "w-8" : "w-40"
      )}
    >
      {/* Collapse toggle — sits just outside the right edge; must not be clipped */}
      <button
        onClick={onToggle}
        title={collapsed ? "Show thumbnails" : "Hide thumbnails"}
        className="absolute -right-3 top-3 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-stone-700 viewer-light:bg-stone-200 border border-stone-600 viewer-light:border-stone-300 text-stone-300 viewer-light:text-stone-600 hover:bg-stone-600 viewer-light:hover:bg-stone-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-dark p-2 space-y-1.5 pt-3">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
            const count = countsByPage.get(p) ?? 0;
            return (
              <button
                key={p}
                onClick={() => onSelect(p)}
                className={cn(
                  "w-full flex flex-col items-center gap-0.5 rounded p-1 transition relative",
                  p === currentPage
                    ? cn("ring-2 bg-stone-800 viewer-light:bg-stone-200", accent === "cyan" ? "ring-cyan-500" : "ring-brand-500")
                    : "hover:bg-stone-800 viewer-light:hover:bg-stone-200"
                )}
              >
                <div className="relative w-full">
                  {thumbnails[p - 1] ? (
                    <img
                      src={thumbnails[p - 1]}
                      alt={`Page ${p}`}
                      className="w-full rounded shadow"
                    />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-stone-700 viewer-light:bg-stone-300 rounded animate-pulse" />
                  )}
                  {/* Annotation count badge */}
                  {count > 0 && (
                    <div
                      title={`${count} annotation${count !== 1 ? "s" : ""} on this page`}
                      className={cn(
                        "absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow leading-none",
                        accent === "cyan" ? "bg-cyan-500" : "bg-brand-500",
                      )}
                    >
                      {count > 9 ? "9+" : count}
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-stone-400 viewer-light:text-stone-600">{p}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
