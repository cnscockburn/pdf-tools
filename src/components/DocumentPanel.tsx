/**
 * DocumentPanel — combined Outline + Bookmarks view for the right rail (6.5).
 *
 * Shows the PDF's table of contents (only when it has one) above the user's
 * page bookmarks. Replaces the separate Outline and Bookmarks tabs.
 */
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import OutlinePanel from "./OutlinePanel";
import BookmarksPanel from "./BookmarksPanel";
import type { UserBookmark } from "../lib/storage";

interface Props {
  pdf: PDFDocumentProxy | null;
  currentPage: number;
  onGoTo: (page: number) => void;
  bookmarks: UserBookmark[];
  onAddBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onRenameBookmark: (id: string, label: string) => void;
}

export default function DocumentPanel({
  pdf, currentPage, onGoTo, bookmarks, onAddBookmark, onDeleteBookmark, onRenameBookmark,
}: Props) {
  const [hasOutline, setHasOutline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!pdf) { setHasOutline(false); return; }
    pdf.getOutline()
      .then(ol => { if (!cancelled) setHasOutline(Array.isArray(ol) && ol.length > 0); })
      .catch(() => { if (!cancelled) setHasOutline(false); });
    return () => { cancelled = true; };
  }, [pdf]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Outline section — only when the document actually has one */}
      {pdf && hasOutline && (
        <div className="shrink-0 max-h-[45%] overflow-y-auto scrollbar-dark border-b border-stone-700 viewer-light:border-stone-200">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-stone-500 viewer-light:text-stone-500 uppercase tracking-wider sticky top-0 bg-stone-800 viewer-light:bg-stone-50">
            Outline
          </p>
          <OutlinePanel pdf={pdf} currentPage={currentPage} onGoTo={onGoTo} embedded />
        </div>
      )}

      {/* Bookmarks section — takes the remaining height */}
      <div className="flex-1 min-h-0 flex flex-col">
        {hasOutline && (
          <p className="shrink-0 px-3 pt-2 pb-1 text-[10px] font-semibold text-stone-500 viewer-light:text-stone-500 uppercase tracking-wider">
            Bookmarks
          </p>
        )}
        <div className="flex-1 min-h-0">
          <BookmarksPanel
            bookmarks={bookmarks}
            currentPage={currentPage}
            onGoTo={onGoTo}
            onDelete={onDeleteBookmark}
            onRename={onRenameBookmark}
            onAddBookmark={onAddBookmark}
          />
        </div>
      </div>
    </div>
  );
}
