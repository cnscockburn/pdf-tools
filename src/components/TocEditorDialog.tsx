/**
 * TocEditorDialog — view and edit the PDF's table of contents (outline).
 *
 * Opens as a modal.  Fetches the current TOC from the backend, lets the user
 * add / remove / reorder / rename entries and adjust their nesting level and
 * target page, then saves the updated PDF back to the caller via onSave().
 *
 * B12 — Table of contents editor.
 */
import { useState, useEffect } from "react";
import {
  X, Plus, Trash2, ChevronRight, ArrowUp, ArrowDown, Loader2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { getToc, setToc } from "../api/client";
import type { TocEntry } from "../api/client";
import { useFocusTrap } from "../lib/useFocusTrap";

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId() {
  return `toc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

interface Entry extends TocEntry {
  id: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  file: File;
  pageCount: number;
  onSave:  (blob: Blob) => void;
  onClose: () => void;
}

export default function TocEditorDialog({ file, pageCount, onSave, onClose }: Props) {
  const dialogRef = useFocusTrap<HTMLDivElement>();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [dirty,   setDirty]   = useState(false);

  // ── Load current TOC ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const raw = await getToc(file);
        if (!cancelled) {
          setEntries(raw.map(e => ({ ...e, id: genId() })));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load TOC.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  // ── Mutation helpers ───────────────────────────────────────────────────────

  function updateEntry(id: string, patch: Partial<Entry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    setDirty(true);
  }

  function addEntry(afterId?: string) {
    const newEntry: Entry = { id: genId(), level: 1, title: "New entry", page: 1 };
    setEntries(prev => {
      if (!afterId) return [...prev, newEntry];
      const idx = prev.findIndex(e => e.id === afterId);
      const next = [...prev];
      next.splice(idx + 1, 0, newEntry);
      return next;
    });
    setDirty(true);
  }

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
    setDirty(true);
  }

  function moveEntry(id: string, dir: -1 | 1) {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === id);
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function changeLevel(id: string, delta: -1 | 1) {
    setEntries(prev => prev.map(e =>
      e.id === id ? { ...e, level: Math.max(1, Math.min(6, e.level + delta)) } : e,
    ));
    setDirty(true);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const payload = entries.map(({ level, title, page }) => ({ level, title, page }));
      const blob = await setToc(file, payload);
      onSave(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save TOC.");
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: "min(85vh, 700px)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Table of Contents"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Edit Table of Contents</h2>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {entries.length} entr{entries.length !== 1 ? "ies" : "y"} · Saving will replace the current outline
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-1">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading outline…</span>
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-stone-500">This PDF has no table of contents yet.</p>
              <button
                onClick={() => addEntry()}
                className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-brand-500 hover:text-brand-400 transition"
              >
                <Plus className="h-3.5 w-3.5" /> Add first entry
              </button>
            </div>
          )}

          {!loading && entries.map((entry, idx) => (
            <div
              key={entry.id}
              className="group flex items-center gap-2 rounded-lg py-1 hover:bg-stone-800/60 transition"
              // Left padding creates visual indentation; the amber guide line reinforces depth
              style={{ paddingLeft: `${8 + (entry.level - 1) * 18}px`, paddingRight: "8px" }}
            >
              {/* Depth guide line — amber, fades with depth */}
              {entry.level > 1 && (
                <span
                  className="shrink-0 self-stretch w-0.5 rounded-full mr-1"
                  style={{ background: `rgba(217,119,6,${Math.max(0.15, 0.7 - (entry.level - 2) * 0.15)})` }}
                  aria-hidden="true"
                />
              )}

              {/* Level pill — always visible, readable contrast */}
              <span
                className="shrink-0 text-[9px] font-semibold rounded px-1 py-px leading-none tabular-nums"
                style={{
                  background: entry.level === 1 ? "rgba(217,119,6,0.2)" : "rgba(87,83,78,0.5)",
                  color: entry.level === 1 ? "#fbbf24" : "#a8a29e",
                }}
              >
                L{entry.level}
              </span>

              {/* Title */}
              <input
                value={entry.title}
                onChange={e => updateEntry(entry.id, { title: e.target.value })}
                maxLength={500}
                className="flex-1 min-w-0 bg-transparent text-xs text-stone-200 focus:outline-none focus:ring-1 focus:ring-brand-500/60 rounded px-1 py-0.5"
                aria-label={`Title for entry ${idx + 1}`}
              />

              {/* Page */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-stone-500">p.</span>
                <input
                  type="number"
                  min={1}
                  max={pageCount || 9999}
                  value={entry.page}
                  onChange={e => updateEntry(entry.id, { page: Math.max(1, Math.min(pageCount || 9999, parseInt(e.target.value) || 1)) })}
                  className="w-14 bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5 text-xs text-stone-200 text-right focus:outline-none focus:ring-1 focus:ring-brand-500/60"
                  aria-label={`Page for entry ${idx + 1}`}
                />
              </div>

              {/* Controls — reorder always visible; indent/delete show on hover */}
              <div className="flex items-center gap-0.5 shrink-0">
                {/* Move up/down — always shown so keyboard users can navigate */}
                <button
                  onClick={() => moveEntry(entry.id, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  className="rounded p-1 text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => moveEntry(entry.id, 1)}
                  disabled={idx === entries.length - 1}
                  title="Move down"
                  className="rounded p-1 text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                {/* Indent/promote + insert + delete — appear on hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => changeLevel(entry.id, -1)}
                  disabled={entry.level <= 1}
                  title="Promote (decrease indent)"
                  className="rounded p-1 text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition"
                >
                  <ChevronRight className="h-3 w-3 rotate-180" />
                </button>
                <button
                  onClick={() => changeLevel(entry.id, 1)}
                  disabled={entry.level >= 6}
                  title="Demote (increase indent)"
                  className="rounded p-1 text-stone-500 hover:text-stone-200 hover:bg-stone-700 disabled:opacity-20 transition"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  onClick={() => addEntry(entry.id)}
                  title="Insert entry below"
                  className="rounded p-1 text-stone-500 hover:text-brand-400 hover:bg-stone-700 transition"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  onClick={() => removeEntry(entry.id)}
                  title="Delete entry"
                  className="rounded p-1 text-stone-500 hover:text-red-400 hover:bg-stone-700 transition"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                </div>
              </div>
            </div>
          ))}

          {!loading && entries.length > 0 && (
            <button
              onClick={() => addEntry()}
              className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition pl-2 pt-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add entry
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-stone-700">
          {error ? (
            <p className="text-xs text-red-400 flex-1 truncate">{error}</p>
          ) : (
            <p className="text-[11px] text-stone-500 flex-1">
              {dirty ? "Unsaved changes" : "No changes"}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition border border-stone-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading || !dirty}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition",
                saving || loading || !dirty
                  ? "bg-stone-700 text-stone-500 cursor-not-allowed"
                  : "bg-brand-500 text-white hover:bg-brand-600",
              )}
            >
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save TOC"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
