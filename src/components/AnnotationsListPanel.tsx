/**
 * AnnotationsListPanel — right-rail sidebar listing all annotations.
 *
 * Features:
 *  • Grouped by page
 *  • Filterable by type and status
 *  • Click row → jump to page (+ flash)
 *  • Status toggle (open / resolved / wontfix)
 *  • Delete per-row
 *  • Export report button
 */
import { useState, useMemo } from "react";
import {
  MessageSquare, Highlighter, Type, Underline, Strikethrough,
  Trash2, CheckCircle, XCircle, Clock, FileText, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { LocalAnnot, AnnotId, AnnotStatus } from "./AnnotationLayer";

// ── Helpers ──────────────────────────────────────────────────────────────────

function typeIcon(type: string) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (type) {
    case "note":           return <MessageSquare className={cn(cls, "text-yellow-400")} />;
    case "highlight":      return <Highlighter   className={cn(cls, "text-yellow-300")} />;
    case "freetext":       return <Type          className={cn(cls, "text-amber-400")} />;
    case "underline":      return <Underline     className={cn(cls, "text-blue-400")} />;
    case "strikethrough":  return <Strikethrough className={cn(cls, "text-red-400")} />;
    default:               return <MessageSquare className={cn(cls, "text-gray-400")} />;
  }
}

function typeLabel(type: string): string {
  const MAP: Record<string, string> = {
    note: "Note", highlight: "Highlight", freetext: "Text Box",
    underline: "Underline", strikethrough: "Strikethrough",
  };
  return MAP[type] ?? type;
}

function statusIcon(status?: AnnotStatus) {
  const cls = "h-3 w-3 shrink-0";
  if (!status || status === "open")   return <Clock       className={cn(cls, "text-blue-400")} />;
  if (status === "resolved")         return <CheckCircle  className={cn(cls, "text-green-400")} />;
  return                                    <XCircle      className={cn(cls, "text-gray-500")} />;
}

function annotText(ann: LocalAnnot): string {
  if ("text" in ann && ann.text) return ann.text;
  return "";
}

type FilterStatus = "all" | AnnotStatus;
type FilterType   = "all" | LocalAnnot["type"];

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  annotations: LocalAnnot[];
  currentPage: number;
  onGoTo:         (page: number) => void;
  onDelete:       (id: AnnotId) => void;
  onStatusChange: (id: AnnotId, status: AnnotStatus) => void;
  onExportReport: () => void;
}

export default function AnnotationsListPanel({
  annotations, currentPage, onGoTo, onDelete, onStatusChange, onExportReport,
}: Props) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType,   setFilterType]   = useState<FilterType>("all");
  const [collapsed,    setCollapsed]     = useState<Set<number>>(new Set());

  // Filter
  const visible = useMemo(() => annotations.filter(a => {
    if (filterStatus !== "all") {
      const s = a.status ?? "open";
      if (s !== filterStatus) return false;
    }
    if (filterType !== "all" && a.type !== filterType) return false;
    return true;
  }), [annotations, filterStatus, filterType]);

  // Group by page
  const byPage = useMemo(() => {
    const m = new Map<number, LocalAnnot[]>();
    for (const a of visible) {
      const list = m.get(a.page) ?? [];
      list.push(a);
      m.set(a.page, list);
    }
    return new Map([...m.entries()].sort((a, b) => a[0] - b[0]));
  }, [visible]);

  function togglePage(p: number) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  function cycleStatus(ann: LocalAnnot) {
    const cycle: AnnotStatus[] = ["open", "resolved", "wontfix"];
    const cur = (ann.status ?? "open") as AnnotStatus;
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    onStatusChange(ann.id, next);
  }

  // Present types for the filter
  const presentTypes = useMemo(() => {
    const s = new Set(annotations.map(a => a.type));
    return Array.from(s) as LocalAnnot["type"][];
  }, [annotations]);

  if (annotations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageSquare className="h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-500">No annotations yet.</p>
        <p className="text-xs text-gray-600">Switch to Annotate mode and mark up the document.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-1.5 border-b border-gray-700 shrink-0 space-y-1.5">
        {/* Status filter */}
        <div className="flex gap-1 flex-wrap">
          {(["all", "open", "resolved", "wontfix"] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition",
                filterStatus === s ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
              {s === "all" ? "All" : s === "open" ? "Open" : s === "resolved" ? "Resolved" : "Won't Fix"}
            </button>
          ))}
        </div>
        {/* Type filter */}
        {presentTypes.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setFilterType("all")}
              className={cn("px-2 py-0.5 rounded text-[10px] transition",
                filterType === "all" ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700")}>
              All types
            </button>
            {presentTypes.map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={cn("px-2 py-0.5 rounded text-[10px] transition flex items-center gap-1",
                  filterType === t ? "bg-gray-600 text-white" : "bg-gray-800 text-gray-500 hover:bg-gray-700")}>
                {typeIcon(t)} {typeLabel(t)}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600">{visible.length} of {annotations.length} shown</p>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(byPage.entries()).map(([page, anns]) => {
          const isCollapsed = collapsed.has(page);
          const isCurrent = page === currentPage;
          return (
            <div key={page}>
              {/* Page header */}
              <button
                onClick={() => { togglePage(page); onGoTo(page); }}
                className={cn(
                  "w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold transition sticky top-0 z-10",
                  isCurrent ? "bg-blue-950/60 text-blue-300" : "bg-gray-900 text-gray-400 hover:bg-gray-800"
                )}
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 shrink-0" />
                  : <ChevronDown  className="h-3 w-3 shrink-0" />}
                <span>Page {page}</span>
                <span className="ml-auto text-[10px] text-gray-600">{anns.length}</span>
              </button>

              {/* Annotation rows */}
              {!isCollapsed && anns.map(ann => (
                <div key={ann.id}
                  className="group flex items-start gap-2 px-3 py-2 border-b border-gray-800 hover:bg-gray-800/50 transition cursor-pointer"
                  onClick={() => onGoTo(page)}
                >
                  {/* Type icon */}
                  <div className="mt-0.5 shrink-0">{typeIcon(ann.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-gray-300">{typeLabel(ann.type)}</span>
                      {ann.author && (
                        <span className="text-[9px] text-gray-600">· {ann.author}</span>
                      )}
                    </div>
                    {annotText(ann) && (
                      <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{annotText(ann)}</p>
                    )}
                  </div>

                  {/* Status + delete */}
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); cycleStatus(ann); }}
                      title={`Status: ${ann.status ?? "open"} — click to cycle`}
                      className="opacity-60 hover:opacity-100 transition"
                    >
                      {statusIcon(ann.status)}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(ann.id); }}
                      title="Delete annotation"
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition"
                    >
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Footer — export ──────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-t border-gray-700 shrink-0">
        <button
          onClick={onExportReport}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:text-white transition"
        >
          <FileText className="h-3.5 w-3.5" />
          Export report (.md)
        </button>
      </div>
    </div>
  );
}
