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
}

export default function ThumbnailSidebar({ file, currentPage, onSelect, collapsed, onToggle, annotations = [] }: Props) {
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
        "relative flex-shrink-0 flex flex-col bg-stone-900 border-r border-stone-700 transition-all duration-200",
        collapsed ? "w-8" : "w-40"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        title={collapsed ? "Show thumbnails" : "Hide thumbnails"}
        className="absolute -right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-stone-700 border border-stone-600 text-stone-300 hover:bg-stone-600 transition"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 pt-3">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
            const count = countsByPage.get(p) ?? 0;
            return (
              <button
                key={p}
                onClick={() => onSelect(p)}
                className={cn(
                  "w-full flex flex-col items-center gap-0.5 rounded p-1 transition relative",
                  p === currentPage
                    ? "ring-2 ring-brand-500 bg-stone-800"
                    : "hover:bg-stone-800"
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
                    <div className="w-full aspect-[3/4] bg-stone-700 rounded animate-pulse" />
                  )}
                  {/* Annotation count badge */}
                  {count > 0 && (
                    <div
                      title={`${count} annotation${count !== 1 ? "s" : ""} on this page`}
                      className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-brand-500 text-white text-[8px] font-bold flex items-center justify-center shadow leading-none"
                    >
                      {count > 9 ? "9+" : count}
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-stone-400">{p}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
