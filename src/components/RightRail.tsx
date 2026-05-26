/**
 * RightRail — persistent right navigation sidebar for the Viewer.
 *
 * Contains tabbed access to: Annotations list | PDF Outline | User Bookmarks.
 *
 * Styled per Stria design system:
 *   surface  #292524  (--surface-dark)
 *   border   #57534e  (--border-dark)
 *   raised   #3c3836  (--surface-dark-raised)
 *   amber    #d97706  (--amber-warm)   — active tab underline + active row accent
 *
 * Row rules (§3):
 *   Rest:   full-width, py-2 px-3, no rounded corners, no border.
 *   Hover:  background #3c3836.
 *   Active: background #3c3836 + 2px left border #d97706.
 */
import { useState } from "react";
import { List, BookOpen, Bookmark } from "lucide-react";
import { cn } from "../lib/utils";
import AnnotationsListPanel from "./AnnotationsListPanel";
import OutlinePanel from "./OutlinePanel";
import BookmarksPanel from "./BookmarksPanel";
import type { LocalAnnot, AnnotId, AnnotStatus } from "./AnnotationLayer";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { UserBookmark } from "../lib/storage";

export type RailTab = "annotations" | "outline" | "bookmarks";

interface Props {
  // Annotations
  annotations: LocalAnnot[];
  currentPage: number;
  onGoToPage: (p: number) => void;
  onFocusAnnot?: (id: AnnotId) => void;
  onDeleteAnnot: (id: AnnotId) => void;
  onStatusChange: (id: AnnotId, status: AnnotStatus) => void;
  onExportReport: () => void;
  // Outline
  pdf: PDFDocumentProxy | null;
  // Bookmarks
  bookmarks: UserBookmark[];
  onAddBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onRenameBookmark: (id: string, label: string) => void;
  // Controlled tab (optional — falls back to internal state)
  activeTab?: RailTab;
  onTabChange?: (t: RailTab) => void;
}

const TABS: { id: RailTab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "annotations", label: "Notes",     Icon: List     },
  { id: "outline",     label: "Outline",   Icon: BookOpen },
  { id: "bookmarks",   label: "Marks",     Icon: Bookmark },
];

export default function RightRail({
  annotations, currentPage, onGoToPage, onFocusAnnot, onDeleteAnnot, onStatusChange, onExportReport,
  pdf, bookmarks, onAddBookmark, onDeleteBookmark, onRenameBookmark,
  activeTab: controlledTab, onTabChange,
}: Props) {
  const [localTab, setLocalTab] = useState<RailTab>("annotations");
  const activeTab = controlledTab ?? localTab;

  function setTab(t: RailTab) {
    setLocalTab(t);
    onTabChange?.(t);
  }

  return (
    <div
      className="w-64 flex-shrink-0 flex flex-col overflow-hidden bg-stone-800 border-l border-stone-600"
    >
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 border-b border-stone-600"
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 px-2 py-2.5 transition-colors",
                active
                  ? "text-brand-500 border-b-2 border-brand-500 -mb-px"
                  : "text-stone-500 hover:text-stone-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[9px] font-semibold uppercase tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Panel header ────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-3 py-2 border-b border-stone-600"
      >
        <span className="text-[12px] font-semibold text-stone-300 tracking-tight">
          {activeTab === "annotations" && (
            <>Annotations {annotations.length > 0 && <span className="text-stone-600 font-normal">· {annotations.length}</span>}</>
          )}
          {activeTab === "outline"     && "Table of Contents"}
          {activeTab === "bookmarks"   && "Bookmarks"}
        </span>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "annotations" && (
          <AnnotationsListPanel
            annotations={annotations}
            currentPage={currentPage}
            onGoTo={onGoToPage}
            onFocusAnnot={onFocusAnnot}
            onDelete={onDeleteAnnot}
            onStatusChange={onStatusChange}
            onExportReport={onExportReport}
          />
        )}

        {activeTab === "outline" && (
          pdf
            ? <OutlinePanel pdf={pdf} currentPage={currentPage} onGoTo={onGoToPage} />
            : <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-xs text-stone-600 text-center">No PDF loaded.</p>
              </div>
        )}

        {activeTab === "bookmarks" && (
          <BookmarksPanel
            bookmarks={bookmarks}
            currentPage={currentPage}
            onGoTo={onGoToPage}
            onDelete={onDeleteBookmark}
            onRename={onRenameBookmark}
            onAddBookmark={onAddBookmark}
          />
        )}
      </div>
    </div>
  );
}
