/**
 * AnnotationLayer — absolute overlay that sits on top of the PDF canvas.
 * Handles: create / select / drag-move / corner-resize / double-click-edit / delete.
 * All coordinates are fractional (0–1) relative to the canvas element.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type AnnotId = string;
let _seq = 0;
export const newId = (): AnnotId => `a${++_seq}_${Date.now()}`;

export interface NoteAnnot {
  id: AnnotId; type: "note"; page: number;
  x: number; y: number; text: string;
}
export interface HighlightAnnot {
  id: AnnotId; type: "highlight"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  colorIdx: number; color: [number, number, number];
}
export interface FreetextAnnot {
  id: AnnotId; type: "freetext"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  text: string;
}
export type LocalAnnot = NoteAnnot | HighlightAnnot | FreetextAnnot;

export interface HlColor {
  label: string; rgb: [number, number, number]; bg: string; border: string;
}

export type CreateMode = "note" | "highlight" | "freetext";

// Corner resize handles
const CORNERS = ["nw", "ne", "sw", "se"] as const;
type Corner = typeof CORNERS[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(v, hi)); }

function getFrac(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  return { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) };
}

function applyDrag(ann: LocalAnnot, dx: number, dy: number): LocalAnnot {
  if (ann.type === "note") {
    return { ...ann, x: clamp(ann.x + dx), y: clamp(ann.y + dy) };
  }
  const w = ann.x1 - ann.x0, h = ann.y1 - ann.y0;
  const x0 = clamp(ann.x0 + dx, 0, 1 - w);
  const y0 = clamp(ann.y0 + dy, 0, 1 - h);
  return { ...ann, x0, y0, x1: x0 + w, y1: y0 + h };
}

function applyResize(ann: HighlightAnnot | FreetextAnnot, corner: Corner, dx: number, dy: number): typeof ann {
  let { x0, y0, x1, y1 } = ann;
  const MIN = 0.02;
  if (corner.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN);
  if (corner.includes("s")) y1 = clamp(y1 + dy, y0 + MIN, 1);
  if (corner.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN);
  if (corner.includes("e")) x1 = clamp(x1 + dx, x0 + MIN, 1);
  return { ...ann, x0, y0, x1, y1 };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  annotations: LocalAnnot[];
  page: number;
  createMode: CreateMode;
  hlColorIdx: number;
  highlightColors: HlColor[];
  onAnnotationsChange: (a: LocalAnnot[]) => void;
  /** Notify parent of selected ID (for Delete key shortcut in parent) */
  onSelectedChange?: (id: AnnotId | null) => void;
}

export default function AnnotationLayer({
  annotations, page, createMode, hlColorIdx, highlightColors,
  onAnnotationsChange, onSelectedChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection / editing
  const [selectedId, setSelectedId]   = useState<AnnotId | null>(null);
  const [editingId, setEditingId]     = useState<AnnotId | null>(null);
  const [editText, setEditText]       = useState("");
  const [hlPicker, setHlPicker]       = useState<AnnotId | null>(null);

  // Drag / resize (tracked via refs so event handlers are stable)
  const dragRef = useRef<{
    kind: "create" | "move" | "resize";
    id?: AnnotId;
    startAnnot?: LocalAnnot;
    corner?: Corner;
    startMouse: { x: number; y: number };
    startFrac: { x: number; y: number };
    live: { x0: number; y0: number; x1: number; y1: number } | null;
  } | null>(null);

  // Sync selection to parent
  useEffect(() => { onSelectedChange?.(selectedId); }, [selectedId]);

  // Keyboard handling (delete selected / escape)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !editingId) {
        e.preventDefault();
        deleteAnnot(selectedId);
      }
      if (e.key === "Escape" && editingId) { e.stopPropagation(); cancelEdit(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, editingId, annotations]);

  // ── Annotation list helpers ─────────────────────────────────────────────
  const pageAnns = annotations.filter(a => a.page === page);

  function updateAnnot(updated: LocalAnnot) {
    onAnnotationsChange(annotations.map(a => a.id === updated.id ? updated : a));
  }

  function deleteAnnot(id: AnnotId) {
    onAnnotationsChange(annotations.filter(a => a.id !== id));
    if (selectedId === id) { setSelectedId(null); onSelectedChange?.(null); }
    if (editingId === id)  setEditingId(null);
  }

  function addAnnot(ann: LocalAnnot) {
    onAnnotationsChange([...annotations, ann]);
  }

  // ── Edit helpers ────────────────────────────────────────────────────────
  function startEdit(ann: NoteAnnot | FreetextAnnot) {
    setEditingId(ann.id);
    setEditText(ann.text);
    setSelectedId(ann.id);
  }

  function commitEdit(id: AnnotId) {
    const ann = annotations.find(a => a.id === id);
    if (!ann || (ann.type !== "note" && ann.type !== "freetext")) return;
    if (editText.trim()) updateAnnot({ ...ann, text: editText.trim() } as LocalAnnot);
    else deleteAnnot(id);
    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  // ── Mouse event helpers ─────────────────────────────────────────────────
  function getContainerFrac(e: { clientX: number; clientY: number }) {
    return containerRef.current ? getFrac(containerRef.current, e.clientX, e.clientY) : { x: 0, y: 0 };
  }

  function getContainerSize() {
    const r = containerRef.current?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height } : { w: 1, h: 1 };
  }

  // ── Background interaction — create new annotation ──────────────────────
  function onBgMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // Clicked on existing annotation?
    if ((e.target as HTMLElement).closest("[data-annot]")) return;

    setSelectedId(null); setHlPicker(null);
    onSelectedChange?.(null);

    if (createMode === "note") return; // note is handled in onClick

    e.preventDefault();
    const startFrac = getContainerFrac(e);
    dragRef.current = {
      kind: "create",
      startMouse: { x: e.clientX, y: e.clientY },
      startFrac,
      live: { x0: startFrac.x, y0: startFrac.y, x1: startFrac.x, y1: startFrac.y },
    };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current || dragRef.current.kind !== "create") return;
      const cur = getContainerFrac(me);
      const sf = dragRef.current.startFrac;
      dragRef.current.live = {
        x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
        x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
      };
      forceUpdate(n => n + 1);
    };

    const onUp = (_me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!dragRef.current || dragRef.current.kind !== "create") return;
      const { live } = dragRef.current;
      dragRef.current = null;
      if (!live || (live.x1 - live.x0 < 0.01 && live.y1 - live.y0 < 0.005)) {
        forceUpdate(n => n + 1); return;
      }
      const id = newId();
      if (createMode === "highlight") {
        const ann: HighlightAnnot = {
          id, type: "highlight", page,
          x0: live.x0, y0: live.y0, x1: live.x1, y1: live.y1,
          colorIdx: hlColorIdx, color: highlightColors[hlColorIdx].rgb,
        };
        addAnnot(ann); setSelectedId(id); onSelectedChange?.(id);
      } else if (createMode === "freetext") {
        const ann: FreetextAnnot = { id, type: "freetext", page, ...live, text: "" };
        addAnnot(ann); setEditingId(id); setEditText(""); setSelectedId(id); onSelectedChange?.(id);
      }
      forceUpdate(n => n + 1);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onBgClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("[data-annot]")) return;
    if (dragRef.current) return;
    if (createMode === "note") {
      const pt = getContainerFrac(e);
      const id = newId();
      const ann: NoteAnnot = { id, type: "note", page, x: pt.x, y: pt.y, text: "" };
      addAnnot(ann); setEditingId(id); setEditText(""); setSelectedId(id); onSelectedChange?.(id);
    }
  }

  // Force re-render during drag (refs don't trigger renders)
  const [, forceUpdate] = useState(0);

  // ── Annotation drag / resize start ──────────────────────────────────────
  function onAnnotMouseDown(e: React.MouseEvent, ann: LocalAnnot) {
    if (e.button !== 0) return;
    if (editingId === ann.id) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(ann.id); setHlPicker(null); onSelectedChange?.(ann.id);

    const startAnnot = { ...ann } as LocalAnnot;
    const startMouse = { x: e.clientX, y: e.clientY };
    dragRef.current = { kind: "move", id: ann.id, startAnnot, startMouse, startFrac: { x: 0, y: 0 }, live: null };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current || dragRef.current.kind !== "move") return;
      const size = getContainerSize();
      const dx = (me.clientX - startMouse.x) / size.w;
      const dy = (me.clientY - startMouse.y) / size.h;
      const updated = applyDrag(startAnnot, dx, dy);
      onAnnotationsChange(annotations.map(a => a.id === ann.id ? updated : a));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onAnnotDblClick(e: React.MouseEvent, ann: LocalAnnot) {
    e.stopPropagation();
    if (ann.type === "note" || ann.type === "freetext") startEdit(ann);
    else if (ann.type === "highlight") setHlPicker(ann.id);
  }

  // ── Corner resize handle ────────────────────────────────────────────────
  function onResizeMouseDown(e: React.MouseEvent, ann: HighlightAnnot | FreetextAnnot, corner: Corner) {
    e.preventDefault(); e.stopPropagation();
    const startAnnot = { ...ann };
    const startMouse = { x: e.clientX, y: e.clientY };

    const onMove = (me: MouseEvent) => {
      const size = getContainerSize();
      const dx = (me.clientX - startMouse.x) / size.w;
      const dy = (me.clientY - startMouse.y) / size.h;
      const updated = applyResize(startAnnot, corner, dx, dy);
      onAnnotationsChange(annotations.map(a => a.id === ann.id ? updated : a));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Drag preview rect ────────────────────────────────────────────────────
  const live = dragRef.current?.kind === "create" ? dragRef.current.live : null;
  const dragColor = createMode === "highlight" ? highlightColors[hlColorIdx].border : "#3b82f6";
  const dragBg    = createMode === "highlight" ? highlightColors[hlColorIdx].bg     : "rgba(59,130,246,0.1)";

  const cursorClass = createMode === "note" ? "cursor-cell"
    : selectedId ? "cursor-default"
    : "cursor-crosshair";

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${cursorClass}`}
      style={{ userSelect: "none" }}
      onMouseDown={onBgMouseDown}
      onClick={onBgClick}
    >
      {/* ── Existing annotations ────────────────────────────────────────── */}
      {pageAnns.map(ann => {
        const sel = ann.id === selectedId;
        const editing = ann.id === editingId;

        /* ── Note ── */
        if (ann.type === "note") return (
          <div key={ann.id} data-annot="true"
            className="absolute pointer-events-auto"
            style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%`, transform: "translate(-50%,-100%)", zIndex: sel ? 30 : 20 }}
            onMouseDown={e => onAnnotMouseDown(e, ann)}
            onDoubleClick={e => onAnnotDblClick(e, ann)}
          >
            <div className={cn("relative group select-none", sel ? "cursor-move drop-shadow-xl" : "cursor-pointer")}>
              <span className="text-xl leading-none">📌</span>
              {/* Delete badge */}
              {sel && !editing && (
                <button
                  className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); deleteAnnot(ann.id); }}
                >×</button>
              )}
              {/* Inline text editor */}
              {editing ? (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 pointer-events-auto"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl shadow-xl p-3 w-56 space-y-2">
                    <textarea autoFocus rows={3} value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit(ann.id); }
                        if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                      }}
                      onBlur={() => commitEdit(ann.id)}
                      placeholder="Type note… (Ctrl+Enter to save)"
                      className="w-full rounded-lg border border-yellow-300 bg-white px-2 py-1.5 text-xs text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => commitEdit(ann.id)} disabled={!editText.trim()}
                        className="flex-1 rounded bg-yellow-400 hover:bg-yellow-300 py-1 text-xs font-semibold text-gray-800 disabled:opacity-40 transition">
                        Save
                      </button>
                      <button onClick={cancelEdit}
                        className="px-2 rounded bg-gray-200 hover:bg-gray-300 text-xs text-gray-600 transition">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Tooltip on hover */
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-30 pointer-events-none
                  bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg px-2 py-1.5 text-xs text-gray-800 max-w-52 whitespace-pre-wrap">
                  {ann.text || <span className="italic text-gray-400">empty — double-click to edit</span>}
                </div>
              )}
            </div>
          </div>
        );

        /* ── Highlight ── */
        if (ann.type === "highlight") {
          const c = highlightColors[ann.colorIdx] ?? highlightColors[0];
          return (
            <div key={ann.id} data-annot="true"
              className="absolute pointer-events-auto"
              style={{
                left: `${ann.x0 * 100}%`, top: `${ann.y0 * 100}%`,
                width: `${(ann.x1 - ann.x0) * 100}%`, height: `${(ann.y1 - ann.y0) * 100}%`,
                backgroundColor: c.bg,
                border: sel ? `2px solid ${c.border}` : `1px solid ${c.border}40`,
                zIndex: sel ? 25 : 15,
                cursor: "move",
              }}
              onMouseDown={e => onAnnotMouseDown(e, ann)}
              onDoubleClick={e => onAnnotDblClick(e, ann)}
            >
              {sel && (
                <>
                  {/* Delete badge */}
                  <button
                    className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); deleteAnnot(ann.id); }}
                  >×</button>
                  {/* Corner resize handles */}
                  {CORNERS.map(corner => (
                    <div key={corner}
                      className="absolute w-3 h-3 bg-white border-2 rounded-sm z-10"
                      style={{
                        borderColor: c.border,
                        cursor: `${corner}-resize`,
                        top:    corner.startsWith("n") ? -4 : undefined,
                        bottom: corner.startsWith("s") ? -4 : undefined,
                        left:   corner.endsWith("w")   ? -4 : undefined,
                        right:  corner.endsWith("e")   ? -4 : undefined,
                      }}
                      onMouseDown={e => onResizeMouseDown(e, ann, corner)}
                    />
                  ))}
                  {/* Colour picker (double-click to open) */}
                  {hlPicker === ann.id && (
                    <div
                      className="absolute top-full left-0 mt-1 flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1.5 z-40 shadow-xl pointer-events-auto"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      {highlightColors.map((hc, i) => (
                        <button key={i} onClick={e => {
                          e.stopPropagation();
                          updateAnnot({ ...ann, colorIdx: i, color: hc.rgb });
                          setHlPicker(null);
                        }}
                          title={hc.label}
                          className={cn("h-5 w-5 rounded-full border-2 transition",
                            ann.colorIdx === i ? "border-white scale-125" : "border-transparent")}
                          style={{ background: hc.bg }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        }

        /* ── Freetext ── */
        if (ann.type === "freetext") return (
          <div key={ann.id} data-annot="true"
            className="absolute pointer-events-auto overflow-hidden"
            style={{
              left: `${ann.x0 * 100}%`, top: `${ann.y0 * 100}%`,
              width: `${(ann.x1 - ann.x0) * 100}%`, height: `${(ann.y1 - ann.y0) * 100}%`,
              minWidth: 60, minHeight: 28,
              backgroundColor: "rgba(255,253,210,0.92)",
              border: sel ? "2px solid #f59e0b" : "1px solid #fcd34d80",
              zIndex: sel ? 25 : 15,
              cursor: editing ? "text" : "move",
            }}
            onMouseDown={e => { if (!editing) onAnnotMouseDown(e, ann); else e.stopPropagation(); }}
            onDoubleClick={e => onAnnotDblClick(e, ann)}
          >
            {editing ? (
              <textarea autoFocus value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") commitEdit(ann.id); }}
                onBlur={() => commitEdit(ann.id)}
                className="w-full h-full bg-transparent border-none px-1.5 py-1 text-xs text-gray-800 resize-none focus:outline-none"
                style={{ lineHeight: 1.4 }}
              />
            ) : (
              <p className="p-1.5 text-xs text-gray-800 leading-snug whitespace-pre-wrap overflow-hidden h-full">
                {ann.text
                  ? ann.text
                  : <span className="italic text-gray-400">double-click to type…</span>}
              </p>
            )}
            {sel && !editing && (
              <>
                <button
                  className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); deleteAnnot(ann.id); }}
                >×</button>
                {CORNERS.map(corner => (
                  <div key={corner}
                    className="absolute w-3 h-3 bg-white border-2 border-amber-500 rounded-sm z-10"
                    style={{
                      cursor: `${corner}-resize`,
                      top:    corner.startsWith("n") ? -4 : undefined,
                      bottom: corner.startsWith("s") ? -4 : undefined,
                      left:   corner.endsWith("w")   ? -4 : undefined,
                      right:  corner.endsWith("e")   ? -4 : undefined,
                    }}
                    onMouseDown={e => onResizeMouseDown(e, ann, corner)}
                  />
                ))}
              </>
            )}
          </div>
        );

        return null;
      })}

      {/* ── In-progress drag preview ────────────────────────────────────── */}
      {live && (live.x1 - live.x0 > 0.002 || live.y1 - live.y0 > 0.002) && (
        <div className="absolute pointer-events-none rounded-sm" style={{
          left: `${live.x0 * 100}%`, top: `${live.y0 * 100}%`,
          width: `${(live.x1 - live.x0) * 100}%`, height: `${(live.y1 - live.y0) * 100}%`,
          border: `2px dashed ${dragColor}`,
          backgroundColor: dragBg,
        }} />
      )}
    </div>
  );
}
