/**
 * BookmarksPanel — user-created page bookmarks (separate from PDF outline).
 */
import { useState } from "react";
import { Trash2, Bookmark, Edit2, Check, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { UserBookmark } from "../lib/storage";

interface Props {
  bookmarks: UserBookmark[];
  currentPage: number;
  onGoTo: (page: number) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onAddBookmark: () => void;
}

export default function BookmarksPanel({ bookmarks, currentPage, onGoTo, onDelete, onRename, onAddBookmark }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  function startEdit(b: UserBookmark) {
    setEditingId(b.id);
    setEditLabel(b.label);
  }

  function commitEdit() {
    if (editingId && editLabel.trim()) onRename(editingId, editLabel.trim());
    setEditingId(null);
  }

  const isCurrentPageBookmarked = bookmarks.some(b => b.page === currentPage);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Add bookmark button */}
      <div className="px-3 py-2 border-b border-stone-700 shrink-0">
        <button
          onClick={onAddBookmark}
          disabled={isCurrentPageBookmarked}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
            isCurrentPageBookmarked
              ? "bg-brand-900/40 text-brand-400 cursor-default"
              : "bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white"
          )}
        >
          <Bookmark className="h-3.5 w-3.5" />
          {isCurrentPageBookmarked ? `Page ${currentPage} bookmarked` : `Bookmark page ${currentPage}`}
        </button>
      </div>

      {/* Bookmark list */}
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-6 text-center h-full">
            <Bookmark className="h-7 w-7 text-stone-600" />
            <p className="text-xs text-stone-500">No bookmarks yet.</p>
            <p className="text-xs text-stone-600">Click the button above to bookmark the current page.</p>
          </div>
        ) : (
          bookmarks.map(b => (
            <div
              key={b.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 border-b border-stone-800 hover:bg-stone-800/50 transition",
                b.page === currentPage && "bg-brand-950/30"
              )}
            >
              <button onClick={() => onGoTo(b.page)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                <span className="shrink-0 text-[10px] tabular-nums text-stone-500 w-6 text-right">{b.page}</span>
                {editingId === b.id ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 min-w-0 bg-stone-800 border border-brand-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-xs text-stone-300 truncate flex-1">{b.label}</span>
                )}
              </button>
              <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                {editingId === b.id ? (
                  <>
                    <button onClick={commitEdit} className="p-1 rounded hover:bg-stone-700 text-green-400 transition">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-stone-700 text-stone-500 transition">
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(b)} className="p-1 rounded hover:bg-stone-700 text-stone-500 hover:text-stone-300 transition">
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button onClick={() => onDelete(b.id)} className="p-1 rounded hover:bg-stone-700 text-red-500/60 hover:text-red-400 transition">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
