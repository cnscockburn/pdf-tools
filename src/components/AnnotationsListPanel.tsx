/**
 * AnnotationsListPanel — right-rail sidebar listing all annotations.
 *
 * Split into two logical sections:
 *   Comments  — note + freetext — has status filter, status badge, resolve controls.
 *   Markup    — highlight, underline, strikethrough, ink, shape, stamp — collapsible,
 *               no status workflow.
 *
 * Each row has per-row ↑/↓ navigation buttons (visible on hover) that call
 * onFocusAnnot to jump between annotations across all pages.
 */
import { useState, useMemo } from "react";
import {
  MessageSquare, Highlighter, Type, Underline, Strikethrough,
  Trash2, FileText, ChevronDown, ChevronRight,
  ChevronUp, PenLine, Square, Stamp, Search as SearchIcon, X,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { LocalAnnot, AnnotId, AnnotStatus } from "./AnnotationLayer";
import MathText from "./MathText";

// ── Constants ────────────────────────────────────────────────────────────────

const COMMENT_TYPES = new Set<string>(["note", "freetext"]);
const isComment = (type: string) => COMMENT_TYPES.has(type);

// ── Helpers ──────────────────────────────────────────────────────────────────

function getY(ann: LocalAnnot): number {
  return ann.type === "note" ? ann.y : ann.y0;
}

function typeIcon(type: string) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (type) {
    case "note":           return <MessageSquare className={cn(cls, "text-yellow-400")} />;
    case "highlight":      return <Highlighter   className={cn(cls, "text-yellow-300")} />;
    case "freetext":       return <Type          className={cn(cls, "text-amber-400")} />;
    case "underline":      return <Underline     className={cn(cls, "text-sky-400")} />;
    case "strikethrough":  return <Strikethrough className={cn(cls, "text-red-400")} />;
    case "ink":            return <PenLine       className={cn(cls, "text-green-400")} />;
    case "shape":          return <Square        className={cn(cls, "text-indigo-400")} />;
    case "stamp":          return <Stamp         className={cn(cls, "text-orange-400")} />;
    default:               return <MessageSquare className={cn(cls, "text-stone-400")} />;
  }
}

function typeLabel(type: string): string {
  const MAP: Record<string, string> = {
    note: "Note", highlight: "Highlight", freetext: "Text Box",
    underline: "Underline", strikethrough: "Strikethrough",
    ink: "Drawing", shape: "Shape", stamp: "Stamp",
  };
  return MAP[type] ?? type;
}

/** Text lozenge for annotation status — clearer than an icon (UX-12). */
function statusLozenge(status?: AnnotStatus) {
  const s = status ?? "open";
  const label = s === "wontfix" ? "Won't fix" : s.charAt(0).toUpperCase() + s.slice(1);
  const tone =
    s === "resolved" ? "bg-green-900/50 text-green-300"
    : s === "wontfix" ? "bg-stone-700 text-stone-400"
    : "bg-sky-900/50 text-sky-300";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-medium leading-none whitespace-nowrap", tone)}>
      {label}
    </span>
  );
}

function annotText(ann: LocalAnnot): string {
  if ("text" in ann && ann.text) return ann.text;
  if (ann.type === "stamp") return ann.label;
  return "";
}

function annotTags(ann: LocalAnnot): string[] {
  return (ann as { tags?: string[] }).tags ?? [];
}

function replyCount(ann: LocalAnnot): number {
  return (ann as { replies?: unknown[] }).replies?.length ?? 0;
}

type FilterStatus = "all" | AnnotStatus;

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  annotations: LocalAnnot[];
  currentPage: number;
  onGoTo:           (page: number) => void;
  onDelete:         (id: AnnotId) => void;
  onStatusChange:   (id: AnnotId, status: AnnotStatus) => void;
  onExportReport:      () => void;
  onExportReportPdf?:  () => void;
  onExportCsv?:        () => void;
  onExportJson?:       () => void;
  onFocusAnnot?:    (id: AnnotId) => void;
  onEditAnnot?:     (id: AnnotId) => void;
  /** Active annotation id — highlighted in the list (P1-11 / UX-11) */
  focusAnnotId?:    AnnotId | null;
  /** User-customised highlight colour labels, indexed by colorIdx (P1-15) */
  colorLabels?:     string[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AnnotationsListPanel({
  annotations, currentPage, onGoTo, onFocusAnnot, onEditAnnot, onDelete, onStatusChange,
  onExportReport, onExportReportPdf, onExportCsv, onExportJson,
  focusAnnotId, colorLabels,
}: Props) {
  const [filterStatus,  setFilterStatus]  = useState<FilterStatus>("all");
  const [filterTag,     setFilterTag]     = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [markupOpen,    setMarkupOpen]    = useState(true);
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());
  const [statsOpen,     setStatsOpen]     = useState(false);

  // Free-text match across content, author, type label and tags (5.4).
  const q = search.trim().toLowerCase();
  function matchesSearch(a: LocalAnnot): boolean {
    if (!q) return true;
    const hay = [
      annotText(a),
      (a as { author?: string }).author ?? "",
      typeLabel(a.type),
      ...annotTags(a),
    ].join(" ").toLowerCase();
    return hay.includes(q);
  }

  // ── Annotation statistics (B7) ──────────────────────────────────────────────

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = { open: 0, resolved: 0, wontfix: 0 };
    const byAuthor: Record<string, number> = {};
    for (const ann of annotations) {
      byType[ann.type] = (byType[ann.type] ?? 0) + 1;
      const status = (ann as { status?: string }).status ?? "open";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const author = (ann as { author?: string }).author;
      if (author) byAuthor[author] = (byAuthor[author] ?? 0) + 1;
    }
    return { byType, byStatus, byAuthor };
  }, [annotations]);

  // All unique tags in use across all annotations
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const ann of annotations) for (const t of annotTags(ann)) s.add(t);
    return Array.from(s).sort();
  }, [annotations]);

  // ── Two sorted master lists ───────────────────────────────────────────────

  /** All comment annotations sorted by page → y for navigation */
  const allComments = useMemo(() =>
    annotations
      .filter(a => isComment(a.type))
      .sort((a, b) => a.page - b.page || getY(a) - getY(b)),
    [annotations],
  );

  /** All markup annotations sorted by page → y for navigation */
  const allMarkup = useMemo(() =>
    annotations
      .filter(a => !isComment(a.type))
      .sort((a, b) => a.page - b.page || getY(a) - getY(b)),
    [annotations],
  );

  // ── Filtered visible lists ────────────────────────────────────────────────

  const visibleComments = useMemo(() => allComments.filter(a => {
    if (filterStatus !== "all") {
      const s = (a as { status?: AnnotStatus }).status ?? "open";
      if (s !== filterStatus) return false;
    }
    if (filterTag !== null && !annotTags(a).includes(filterTag)) return false;
    if (!matchesSearch(a)) return false;
    return true;
  }), [allComments, filterStatus, filterTag, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleMarkup = useMemo(() => allMarkup.filter(a => {
    if (filterTag !== null && !annotTags(a).includes(filterTag)) return false;
    if (!matchesSearch(a)) return false;
    return true;
  }), [allMarkup, filterTag, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Group helpers ─────────────────────────────────────────────────────────

  function groupByPage(list: LocalAnnot[]): Map<number, LocalAnnot[]> {
    const m = new Map<number, LocalAnnot[]>();
    for (const a of list) {
      const arr = m.get(a.page) ?? [];
      arr.push(a);
      m.set(a.page, arr);
    }
    return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
  }

  const commentsByPage = useMemo(() => groupByPage(visibleComments), [visibleComments]);
  const markupByPage   = useMemo(() => groupByPage(visibleMarkup),   [visibleMarkup]);

  function togglePage(key: string) {
    setCollapsedPages(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function cycleStatus(ann: LocalAnnot) {
    const cycle: AnnotStatus[] = ["open", "resolved", "wontfix"];
    const cur = ((ann as { status?: AnnotStatus }).status ?? "open") as AnnotStatus;
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    onStatusChange(ann.id, next);
  }

  // ── Row renderer ──────────────────────────────────────────────────────────

  function renderRow(
    ann: LocalAnnot,
    sortedSection: LocalAnnot[],
    showStatus: boolean,
  ) {
    const text     = annotText(ann);
    const tags     = annotTags(ann);
    const nReply   = replyCount(ann);
    const idx      = sortedSection.findIndex(a => a.id === ann.id);
    const prevAnn  = idx > 0 ? sortedSection[idx - 1] : null;
    const nextAnn  = idx >= 0 && idx < sortedSection.length - 1 ? sortedSection[idx + 1] : null;
    const status   = (ann as { status?: AnnotStatus }).status ?? "open";

    function handleRowClick() {
      onGoTo(ann.page);
      onFocusAnnot?.(ann.id);
    }

    function handleRowDblClick() {
      onGoTo(ann.page);
      onFocusAnnot?.(ann.id);
      onEditAnnot?.(ann.id);
    }

    const isFocused = focusAnnotId != null && ann.id === focusAnnotId;
    // Highlights show their (possibly user-renamed) colour label instead of the
    // generic "Highlight" (P1-15).
    const label = ann.type === "highlight" && colorLabels?.[(ann as { colorIdx: number }).colorIdx]
      ? colorLabels[(ann as { colorIdx: number }).colorIdx]
      : typeLabel(ann.type);

    return (
      <div
        key={ann.id}
        className={cn(
          "group flex items-start gap-2 px-3 py-2 transition cursor-pointer",
          isFocused ? "bg-brand-500/15 ring-1 ring-inset ring-brand-500/40" : "hover:bg-stone-800",
        )}
        onClick={handleRowClick}
        onDoubleClick={handleRowDblClick}
        title={onEditAnnot ? "Click to jump · Double-click to edit" : undefined}
      >
        {/* Type icon */}
        <div className="mt-0.5 shrink-0">{typeIcon(ann.type)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium text-stone-300">{label}</span>
            {(ann as { author?: string }).author && (
              <span className="text-[9px] text-stone-600">
                · {(ann as { author?: string }).author}
              </span>
            )}
            {nReply > 0 && (
              <span className="text-[9px] text-brand-500">{nReply} reply</span>
            )}
          </div>
          {text && (
            <div className="text-[11px] text-stone-400 leading-snug line-clamp-2">
              <MathText text={text} />
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {tags.map(t => (
                <button key={t}
                  onClick={e => { e.stopPropagation(); setFilterTag(t); }}
                  className="bg-brand-900/40 text-brand-400 text-[9px] rounded px-1 hover:bg-brand-800/50 transition">
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right-side controls: nav + status + delete */}
        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
          {/* Prev / next navigation */}
          <button
            onClick={e => { e.stopPropagation(); if (prevAnn) { onGoTo(prevAnn.page); onFocusAnnot?.(prevAnn.id); } }}
            disabled={!prevAnn}
            title={prevAnn ? `Previous (pg ${prevAnn.page})` : "No previous"}
            className="p-0.5 rounded text-stone-500 hover:text-white disabled:opacity-25 transition"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); if (nextAnn) { onGoTo(nextAnn.page); onFocusAnnot?.(nextAnn.id); } }}
            disabled={!nextAnn}
            title={nextAnn ? `Next (pg ${nextAnn.page})` : "No next"}
            className="p-0.5 rounded text-stone-500 hover:text-white disabled:opacity-25 transition"
          >
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Status toggle (comments only) — text lozenge, click to cycle */}
          {showStatus && (
            <button
              onClick={e => { e.stopPropagation(); cycleStatus(ann); }}
              title={`Status: ${status} — click to cycle`}
              className="hover:opacity-90 transition"
            >
              {statusLozenge((ann as { status?: AnnotStatus }).status)}
            </button>
          )}

          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); onDelete(ann.id); }}
            title="Delete annotation"
            className="hover:opacity-100 transition"
          >
            <Trash2 className="h-3 w-3 text-red-400" />
          </button>
        </div>
      </div>
    );
  }

  // ── Section renderer ──────────────────────────────────────────────────────

  function renderSection(
    sectionKey: "comments" | "markup",
    byPage: Map<number, LocalAnnot[]>,
    sortedAll: LocalAnnot[],
    showStatus: boolean,
  ) {
    return Array.from(byPage.entries()).map(([page, anns]) => {
      const pageKey    = `${sectionKey}-${page}`;
      const isCollapsed = collapsedPages.has(pageKey);
      const isCurrent  = page === currentPage;
      return (
        <div key={pageKey}>
          <button
            onClick={() => { togglePage(pageKey); onGoTo(page); }}
            className={cn(
              "w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold transition sticky top-0 z-10",
              isCurrent ? "text-brand-500" : "text-stone-400 hover:bg-stone-800",
            )}
            style={isCurrent
              ? { backgroundColor: "#3c3836", borderLeft: "2px solid #d97706" }
              : { backgroundColor: "#292524", borderLeft: "2px solid transparent" }}
          >
            {isCollapsed
              ? <ChevronRight className="h-3 w-3 shrink-0" />
              : <ChevronDown  className="h-3 w-3 shrink-0" />}
            <span>Page {page}</span>
            <span className="ml-auto text-[10px] text-stone-600">{anns.length}</span>
          </button>
          {!isCollapsed && anns.map(ann => renderRow(ann, sortedAll, showStatus))}
        </div>
      );
    });
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (annotations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageSquare className="h-8 w-8 text-stone-600 viewer-light:text-stone-400" />
        <p className="text-sm text-stone-500 viewer-light:text-stone-600">No annotations yet.</p>
        <p className="text-xs text-stone-600 viewer-light:text-stone-500">Switch to Annotate mode and mark up the document.</p>
      </div>
    );
  }

  // ── Full render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Statistics summary (B7) ─────────────────────────────────────── */}
      {annotations.length > 0 && (
        <div className="border-b border-stone-700 shrink-0">
          <button
            onClick={() => setStatsOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-stone-500 hover:text-stone-300 hover:bg-stone-800/50 transition"
          >
            <span className="font-medium text-stone-400">{annotations.length} annotation{annotations.length !== 1 ? "s" : ""}</span>
            <span className="text-stone-600">—</span>
            <span>{stats.byStatus.open ?? 0} open</span>
            {(stats.byStatus.resolved ?? 0) > 0 && <span className="text-green-600">{stats.byStatus.resolved} resolved</span>}
            <ChevronDown className={cn("h-3 w-3 ml-auto transition-transform", statsOpen && "rotate-180")} />
          </button>
          {statsOpen && (
            <div className="px-3 pb-2 space-y-2 text-[10px] text-stone-400">
              {/* By type */}
              <div>
                <p className="text-stone-600 uppercase tracking-wider mb-1 font-medium">By type</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stats.byType).sort((a,b)=>b[1]-a[1]).map(([t,n]) => (
                    <span key={t} className="flex items-center gap-1 bg-stone-800 rounded px-1.5 py-0.5">
                      {typeIcon(t)}<span className="text-stone-300">{typeLabel(t)}</span><span className="text-stone-500">{n}</span>
                    </span>
                  ))}
                </div>
              </div>
              {/* By author */}
              {Object.keys(stats.byAuthor).length > 0 && (
                <div>
                  <p className="text-stone-600 uppercase tracking-wider mb-1 font-medium">By author</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(stats.byAuthor).sort((a,b)=>b[1]-a[1]).map(([auth,n]) => (
                      <span key={auth} className="bg-stone-800 rounded px-1.5 py-0.5 text-stone-300">
                        {auth} <span className="text-stone-500">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Search within annotations (5.4) ──────────────────────────────── */}
      <div className="px-3 pt-2 pb-2 border-b border-stone-700 shrink-0">
        <div className="flex items-center gap-1.5 rounded-lg bg-stone-900 border border-stone-600 px-2 py-1">
          <SearchIcon className="h-3 w-3 text-stone-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search annotations…"
            className="flex-1 min-w-0 bg-transparent text-xs text-stone-200 placeholder-stone-600 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Clear search" className="text-stone-500 hover:text-stone-300 transition">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Global tag filter ────────────────────────────────────────────── */}
      {allTags.length > 0 && (
        <div className="px-3 pt-2 pb-1 border-b border-stone-700 shrink-0 flex gap-1 flex-wrap">
          {filterTag !== null && (
            <button onClick={() => setFilterTag(null)}
              className="px-2 py-0.5 rounded text-[10px] bg-brand-700 text-white hover:bg-brand-600 transition">
              ✕ #{filterTag}
            </button>
          )}
          {allTags.filter(t => t !== filterTag).map(t => (
            <button key={t} onClick={() => setFilterTag(t)}
              className="px-2 py-0.5 rounded text-[10px] bg-stone-800 text-brand-400 hover:bg-stone-700 transition">
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* ── Scrollable list ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Comments section ─────────────────────────────────────────── */}
        {allComments.length > 0 && (
          <>
            {/* Section header with status filter */}
            <div className="sticky top-0 z-20 bg-stone-800 border-b border-stone-700 px-3 pt-2 pb-1.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3 text-stone-500 shrink-0" />
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                  Comments
                </span>
                <span className="text-[10px] text-stone-600 ml-auto">{allComments.length}</span>
              </div>
              {/* Status filter — comments only */}
              <div className="flex gap-1 flex-wrap">
                {(["all", "open", "resolved", "wontfix"] as const).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition",
                      filterStatus === s
                        ? "bg-brand-600 text-white"
                        : "bg-stone-900 text-stone-500 hover:bg-stone-700 hover:text-stone-300")}>
                    {s === "all" ? "All" : s === "open" ? "Open" : s === "resolved" ? "Resolved" : "Won't fix"}
                  </button>
                ))}
              </div>
              {filterStatus !== "all" && (
                <p className="text-[10px] text-stone-600">
                  {visibleComments.length} of {allComments.length} shown
                </p>
              )}
            </div>

            {visibleComments.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-stone-600 italic">No comments match this filter.</p>
            ) : (
              renderSection("comments", commentsByPage, allComments, true)
            )}
          </>
        )}

        {/* ── Markup section ───────────────────────────────────────────── */}
        {allMarkup.length > 0 && (
          <>
            {/* Collapsible section header */}
            <button
              onClick={() => setMarkupOpen(v => !v)}
              className="w-full sticky top-0 z-20 flex items-center gap-1.5 px-3 py-2 bg-stone-800 border-b border-t border-stone-700 hover:bg-stone-700/50 transition"
            >
              {markupOpen
                ? <ChevronDown  className="h-3 w-3 text-stone-500 shrink-0" />
                : <ChevronRight className="h-3 w-3 text-stone-500 shrink-0" />}
              <Highlighter className="h-3 w-3 text-stone-500 shrink-0" />
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                Markup
              </span>
              <span className="text-[10px] text-stone-600 ml-auto">{allMarkup.length}</span>
            </button>

            {markupOpen && renderSection("markup", markupByPage, allMarkup, false)}
          </>
        )}

      </div>

      {/* ── Footer — export buttons ──────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-t border-stone-700 shrink-0 flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <button
            onClick={onExportReport}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 px-2 py-1.5 text-xs text-stone-300 hover:text-white transition"
            title="Export as Markdown document"
          >
            <FileText className="h-3.5 w-3.5" />
            Report (.md)
          </button>
          {onExportReportPdf && (
            <button
              onClick={onExportReportPdf}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 px-2 py-1.5 text-xs text-stone-300 hover:text-white transition"
              title="Export as formatted PDF with thumbnails"
            >
              <FileText className="h-3.5 w-3.5" />
              Report (.pdf)
            </button>
          )}
        </div>
        {(onExportCsv || onExportJson) && (
          <div className="flex gap-1.5">
            {onExportCsv && (
              <button
                onClick={onExportCsv}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-stone-800 hover:bg-stone-700 px-2 py-1.5 text-[11px] text-stone-400 hover:text-white transition"
                title="Export as CSV spreadsheet"
              >
                .csv
              </button>
            )}
            {onExportJson && (
              <button
                onClick={onExportJson}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-stone-800 hover:bg-stone-700 px-2 py-1.5 text-[11px] text-stone-400 hover:text-white transition"
                title="Export as JSON"
              >
                .json
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
