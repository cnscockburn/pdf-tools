import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePdfThumbnails } from "./PageThumbnailGrid";
import { cn } from "../lib/utils";

interface Props {
  file: File;
  currentPage: number;
  onSelect: (page: number) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function ThumbnailSidebar({ file, currentPage, onSelect, collapsed, onToggle }: Props) {
  const { thumbnails, pageCount } = usePdfThumbnails(file, 0.2);

  return (
    <div
      className={cn(
        "relative flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-700 transition-all duration-200",
        collapsed ? "w-8" : "w-40"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        title={collapsed ? "Show thumbnails" : "Hide thumbnails"}
        className="absolute -right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 transition"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 pt-3">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => onSelect(p)}
              className={cn(
                "w-full flex flex-col items-center gap-0.5 rounded p-1 transition",
                p === currentPage
                  ? "ring-2 ring-blue-500 bg-gray-800"
                  : "hover:bg-gray-800"
              )}
            >
              {thumbnails[p - 1] ? (
                <img
                  src={thumbnails[p - 1]}
                  alt={`Page ${p}`}
                  className="w-full rounded shadow"
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-gray-700 rounded animate-pulse" />
              )}
              <span className="text-[9px] text-gray-400">{p}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
