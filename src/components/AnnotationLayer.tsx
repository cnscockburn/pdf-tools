/**
 * AnnotationLayer — absolute overlay that sits on top of the PDF canvas.
 *
 * Handles: create / select / drag-move / corner-resize / double-click-edit / delete.
 * All coordinates are fractional (0–1) relative to the canvas element.
 *
 * Annotation types: note, highlight (multi-rect), freetext, underline, strikethrough,
 *                   ink, shape (rect/ellipse/line/arrow), stamp.
 * Every annotation carries optional status, author, tags metadata.
 * Notes and freetext support session-only reply threads.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import type { Snippet } from "../lib/storage";
import MathText from "./MathText";

// ── Types ────────────────────────────────────────────────────────────────────

export type AnnotId     = string;
export type AnnotStatus = "open" | "resolved" | "wontfix";

let _seq = 0;
export const newId = (): AnnotId => `a${++_seq}_${Date.now()}`;

/** A fractional rectangle (0–1 relative to the page). */
export interface FracRect { x0: number; y0: number; x1: number; y1: number; }
/** A fractional point (0–1 relative to the page). */
export interface FracPoint { x: number; y: number; }

/** A reply in an annotation thread (session-only, not persisted to PDF). */
export interface Reply { id: string; author: string; text: string; ts: number; }

export interface NoteAnnot {
  id: AnnotId; type: "note"; page: number;
  x: number; y: number; text: string;
  author?: string; status?: AnnotStatus;
  tags?: string[];
  replies?: Reply[];
}
export interface HighlightAnnot {
  id: AnnotId; type: "highlight"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  rects?: FracRect[];
  colorIdx: number; color: [number, number, number];
  text?: string;
  author?: string; status?: AnnotStatus;
  tags?: string[];
  replies?: Reply[];
}
export interface FreetextAnnot {
  id: AnnotId; type: "freetext"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  text: string;
  author?: string; status?: AnnotStatus;
  tags?: string[];
  replies?: Reply[];
}
export interface UnderlineAnnot {
  id: AnnotId; type: "underline"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  rects?: FracRect[];
  color?: [number, number, number];
  text?: string;
  author?: string; status?: AnnotStatus;
  tags?: string[];
}
export interface StrikethroughAnnot {
  id: AnnotId; type: "strikethrough"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  rects?: FracRect[];
  color?: [number, number, number];
  text?: string;
  author?: string; status?: AnnotStatus;
  tags?: string[];
}
export interface InkAnnot {
  id: AnnotId; type: "ink"; page: number;
  /** Bounding box for hit-testing / drag */
  x0: number; y0: number; x1: number; y1: number;
  strokes: FracPoint[][];
  color?: [number, number, number];
  strokeWidth?: number;
  tags?: string[];
}
export type ShapeSubType = "rect" | "ellipse" | "line" | "arrow";
export interface ShapeAnnot {
  id: AnnotId; type: "shape"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  shape: ShapeSubType;
  color?: [number, number, number];
  strokeWidth?: number;
  text?: string;
  author?: string; status?: AnnotStatus;
  tags?: string[];
}
export interface StampAnnot {
  id: AnnotId; type: "stamp"; page: number;
  x0: number; y0: number; x1: number; y1: number;
  label: string;
  color: [number, number, number];
  author?: string; status?: AnnotStatus;
  tags?: string[];
}

export type LocalAnnot =
  | NoteAnnot | HighlightAnnot | FreetextAnnot
  | UnderlineAnnot | StrikethroughAnnot
  | InkAnnot | ShapeAnnot | StampAnnot;

export interface HlColor {
  label: string; rgb: [number, number, number]; bg: string; border: string;
}

export type CreateMode =
  | "note" | "highlight" | "freetext"
  | "underline" | "strikethrough"
  | "ink" | "shape" | "stamp";

const STAMP_LABELS = ["APPROVED", "DRAFT", "CONFIDENTIAL", "REVIEWED", "REVISE", "FYI"];
export { STAMP_LABELS };

// Corner resize handles
const CORNERS = ["nw", "ne", "sw", "se"] as const;
type Corner = typeof CORNERS[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(v, hi)); }

function getFrac(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  return { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) };
}

function colorToCSS(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`;
}

function applyDrag(ann: LocalAnnot, dx: number, dy: number): LocalAnnot {
  if (ann.type === "note") {
    return { ...ann, x: clamp(ann.x + dx), y: clamp(ann.y + dy) };
  }
  if (ann.type === "ink") {
    // Clamp the *translation* so the bbox stays in bounds, then apply uniformly
    // to every point. Per-point clamping would deform the stroke.
    const w = ann.x1 - ann.x0, h = ann.y1 - ann.y0;
    const cdx = clamp(ann.x0 + dx, 0, Math.max(0, 1 - w)) - ann.x0;
    const cdy = clamp(ann.y0 + dy, 0, Math.max(0, 1 - h)) - ann.y0;
    return {
      ...ann,
      x0: ann.x0 + cdx, y0: ann.y0 + cdy,
      x1: ann.x1 + cdx, y1: ann.y1 + cdy,
      strokes: ann.strokes.map(s => s.map(p => ({ x: p.x + cdx, y: p.y + cdy }))),
    };
  }
  const w = ann.x1 - ann.x0, h = ann.y1 - ann.y0;
  const x0 = clamp(ann.x0 + dx, 0, Math.max(0, 1 - w));
  const y0 = clamp(ann.y0 + dy, 0, Math.max(0, 1 - h));
  const cdx = x0 - ann.x0;
  const cdy = y0 - ann.y0;
  const rects = (ann as HighlightAnnot).rects?.map(r => ({
    x0: r.x0 + cdx, y0: r.y0 + cdy, x1: r.x1 + cdx, y1: r.y1 + cdy,
  }));
  return { ...ann, x0, y0, x1: x0 + w, y1: y0 + h, ...(rects ? { rects } : {}) };
}

function applyResize(
  ann: HighlightAnnot | FreetextAnnot | UnderlineAnnot | StrikethroughAnnot | ShapeAnnot | StampAnnot,
  corner: Corner, dx: number, dy: number,
): typeof ann {
  let { x0, y0, x1, y1 } = ann;
  const MIN = 0.02;
  if (corner.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN);
  if (corner.includes("s")) y1 = clamp(y1 + dy, y0 + MIN, 1);
  if (corner.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN);
  if (corner.includes("e")) x1 = clamp(x1 + dx, x0 + MIN, 1);
  return { ...ann, x0, y0, x1, y1 };
}

/** Expand line rects to a tight bounding box */
function boundingBox(rects: FracRect[]): FracRect {
  return rects.reduce((acc, r) => ({
    x0: Math.min(acc.x0, r.x0), y0: Math.min(acc.y0, r.y0),
    x1: Math.max(acc.x1, r.x1), y1: Math.max(acc.y1, r.y1),
  }), { x0: 1, y0: 1, x1: 0, y1: 0 });
}

// ── StampDiv: handles dynamic font sizing relative to its own box ────────────

interface StampDivProps {
  ann: StampAnnot;
  sel: boolean;
  onMouseDown: (e: React.MouseEvent, ann: LocalAnnot) => void;
  deleteBtn: (id: AnnotId) => React.ReactNode;
  renderResizeHandles: (
    ann: HighlightAnnot | FreetextAnnot | UnderlineAnnot | StrikethroughAnnot | ShapeAnnot | StampAnnot,
    color: string,
  ) => React.ReactNode;
}

function StampDiv({ ann, sel, onMouseDown, deleteBtn, renderResizeHandles }: StampDivProps) {
  const textColor = colorToCSS(ann.color);

  // Font size is 55% of the box height, computed via CSS container queries.
  // This is zoom-independent: the box grows with page zoom, and the text
  // tracks proportionally — no ResizeObserver or JS pixel arithmetic needed.
  return (
    <div
      data-annot="true"
      className="absolute pointer-events-auto"
      style={{
        left: `${ann.x0 * 100}%`, top: `${ann.y0 * 100}%`,
        width: `${(ann.x1 - ann.x0) * 100}%`, height: `${(ann.y1 - ann.y0) * 100}%`,
        border: `2px solid ${textColor}`,
        backgroundColor: "rgba(255,255,255,0.92)",
        zIndex: sel ? 25 : 16,
        cursor: "move",
        borderRadius: 3,
        containerType: "size",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onMouseDown={e => onMouseDown(e, ann)}
    >
      <span
        className="font-bold text-center select-none whitespace-nowrap overflow-hidden"
        style={{ color: textColor, fontSize: "55cqh", lineHeight: 1, letterSpacing: 0 }}
      >
        {ann.label}
      </span>
      {sel && (
        <>
          {deleteBtn(ann.id)}
          {renderResizeHandles(ann, textColor)}
        </>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  annotations: LocalAnnot[];
  page: number;
  createMode: CreateMode;
  hlColorIdx: number;
  highlightColors: HlColor[];
  onAnnotationsChange: (a: LocalAnnot[]) => void;
  /** When true, background is pointer-events:none so text selection works through it */
  textSelectActive?: boolean;
  /** Default author stamped on new annotations */
  author?: string;
  /** Notify parent of selected ID */
  onSelectedChange?: (id: AnnotId | null) => void;
  /** For shape creation */
  shapeSubType?: ShapeSubType;
  /** Ink stroke color */
  inkColor?: [number, number, number];
  /** Ink stroke width (px) */
  inkStrokeWidth?: number;
  /** Stamp label */
  stampLabel?: string;
  /** Stamp color */
  stampColor?: [number, number, number];
  /** Available snippets for comment editors */
  snippets?: Snippet[];
  /** When false, annotations are rendered invisible (Shift+H toggle) */
  visible?: boolean;
  /** When set, selects this annotation (from external navigation e.g. sidebar) */
  focusAnnotId?: AnnotId | null;
  /** Called when the note popup's prev/next arrows are clicked — parent should navigate */
  onNavigateAnnot?: (id: AnnotId) => void;
}

// Only note and freetext are "comments" with status / resolution workflow.
const COMMENT_TYPES: LocalAnnot["type"][] = ["note", "freetext"];
function isCommentType(type: LocalAnnot["type"]): boolean {
  return COMMENT_TYPES.includes(type);
}

// Status cycle helper used inside the component render loop
function nextStatus(current?: AnnotStatus): AnnotStatus {
  const cycle: AnnotStatus[] = ["open", "resolved", "wontfix"];
  return cycle[(cycle.indexOf(current ?? "open") + 1) % cycle.length];
}

const STATUS_LABEL: Record<AnnotStatus, string> = {
  open: "Open", resolved: "Resolved", wontfix: "Won't fix",
};
const STATUS_CLASS: Record<AnnotStatus, string> = {
  open:     "bg-sky-900/50 text-sky-300 border-sky-700/50",
  resolved: "bg-green-900/50 text-green-300 border-green-700/50",
  wontfix:  "bg-stone-700/60 text-stone-400 border-stone-600/50",
};

export default function AnnotationLayer({
  annotations, page, createMode, hlColorIdx, highlightColors,
  onAnnotationsChange, textSelectActive, author, onSelectedChange,
  shapeSubType = "rect", inkColor = [0, 0, 0], inkStrokeWidth = 2,
  stampLabel = "DRAFT", stampColor = [0.6, 0, 0],
  snippets = [], visible = true, focusAnnotId, onNavigateAnnot,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedId,  setSelectedId]  = useState<AnnotId | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<AnnotId>>(new Set());
  const [editingId,   setEditingId]   = useState<AnnotId | null>(null);
  const [editText,    setEditText]    = useState("");
  const [editTagsStr, setEditTagsStr] = useState(""); // comma-separated tags during edit
  const [replyingId,  setReplyingId]  = useState<AnnotId | null>(null);
  const [replyText,   setReplyText]   = useState("");
  const [showReplies, setShowReplies] = useState<AnnotId | null>(null);
  const [, forceUpdate] = useState(0);

  // Live ink stroke (current drawing, not yet committed)
  const inkStrokeRef = useRef<FracPoint[]>([]);

  const dragRef = useRef<{
    kind: "create" | "move" | "resize";
    id?: AnnotId;
    startAnnot?: LocalAnnot;
    corner?: Corner;
    startMouse: { x: number; y: number };
    startFrac: { x: number; y: number };
    live: FracRect | null;
  } | null>(null);

  // When parent requests focus (sidebar click / popup nav arrows)
  useEffect(() => {
    if (focusAnnotId) {
      setSelectedId(focusAnnotId);
      onSelectedChange?.(focusAnnotId);
    }
  }, [focusAnnotId]); // eslint-disable-line

  // Sync selection to parent
  useEffect(() => { onSelectedChange?.(selectedId); }, [selectedId]); // eslint-disable-line

  // Keyboard: delete / escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && !editingId) {
        if (selectedIds.size > 1) {
          e.preventDefault();
          const ids = new Set(selectedIds);
          onAnnotationsChange(annotations.filter(a => !ids.has(a.id)));
          setSelectedIds(new Set());
          setSelectedId(null);
          return;
        }
        if (selectedId) {
          e.preventDefault();
          deleteAnnot(selectedId);
        }
      }
      if (e.key === "Escape" && editingId) { e.stopPropagation(); cancelEdit(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedIds, editingId, annotations]); // eslint-disable-line

  // ── Annotation helpers ────────────────────────────────────────────────────
  const pageAnns = annotations.filter(a => a.page === page);

  /** All annotations sorted by page then vertical position — used for prev/next navigation. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const navSortedAnnots = useMemo(() =>
    [...annotations].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      const ay = a.type === "note" ? a.y : a.y0;
      const by = b.type === "note" ? b.y : b.y0;
      return ay - by;
    }),
    [annotations],
  );

  function updateAnnot(updated: LocalAnnot) {
    onAnnotationsChange(annotations.map(a => a.id === updated.id ? updated : a));
  }

  function deleteAnnot(id: AnnotId) {
    onAnnotationsChange(annotations.filter(a => a.id !== id));
    if (selectedId === id) { setSelectedId(null); onSelectedChange?.(null); }
    if (editingId  === id) setEditingId(null);
  }

  function addAnnot(ann: LocalAnnot) {
    onAnnotationsChange([...annotations, ann]);
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────
  function startEdit(ann: NoteAnnot | FreetextAnnot) {
    setEditingId(ann.id); setEditText(ann.text);
    setEditTagsStr((ann.tags ?? []).join(", "));
    setSelectedId(ann.id); setShowReplies(null);
  }

  function commitEdit(id: AnnotId) {
    const ann = annotations.find(a => a.id === id);
    if (!ann || (ann.type !== "note" && ann.type !== "freetext")) return;
    const tags = editTagsStr.split(",").map(t => t.trim()).filter(Boolean);
    if (editText.trim()) updateAnnot({ ...ann, text: editText.trim(), tags: tags.length ? tags : undefined } as LocalAnnot);
    else deleteAnnot(id);
    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  // ── Reply helpers ─────────────────────────────────────────────────────────
  function addReply(ann: NoteAnnot | FreetextAnnot | HighlightAnnot) {
    if (!replyText.trim()) return;
    const reply: Reply = { id: `r${Date.now()}`, author: author || "Anonymous", text: replyText.trim(), ts: Date.now() };
    updateAnnot({ ...ann, replies: [...(ann.replies ?? []), reply] } as LocalAnnot);
    setReplyText(""); setReplyingId(null);
  }

  // ── Snippet helpers ───────────────────────────────────────────────────────
  function SnippetDropdown({ onInsert }: { onInsert: (text: string) => void }) {
    const [open, setOpen] = useState(false);
    if (snippets.length === 0) return null;
    return (
      <div className="relative">
        <button type="button" onClick={() => setOpen(v => !v)}
          className="px-1.5 py-0.5 text-[10px] rounded bg-stone-700 text-stone-400 hover:bg-stone-600 hover:text-white transition">
          Snippets ▾
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-0.5 z-50 bg-stone-800 border border-stone-600 rounded-lg shadow-xl min-w-36 max-h-36 overflow-y-auto">
            {snippets.map(s => (
              <button key={s.id} onClick={() => { onInsert(s.text); setOpen(false); }}
                className="w-full text-left px-2.5 py-1.5 text-[11px] text-stone-300 hover:bg-stone-700 truncate transition">
                {s.text}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Mouse helpers ─────────────────────────────────────────────────────────
  function getContainerFrac(e: { clientX: number; clientY: number }) {
    return containerRef.current ? getFrac(containerRef.current, e.clientX, e.clientY) : { x: 0, y: 0 };
  }
  function getContainerSize() {
    const r = containerRef.current?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height } : { w: 1, h: 1 };
  }

  // ── Background: create new annotation ────────────────────────────────────
  function onBgMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-annot]")) return;

    // Auto-commit any open note/freetext editor.
    // commitEdit() already deletes the annotation when the text is empty —
    // this is the "click away from an empty note → discard" behavior.
    if (editingId) commitEdit(editingId);

    setSelectedId(null);
    setSelectedIds(new Set());
    onSelectedChange?.(null);

    if (createMode === "note" || createMode === "stamp") return; // handled in onClick

    // ── Ink mode: capture continuous stroke ──────────────────────────────
    if (createMode === "ink") {
      e.preventDefault();
      const startFrac = getContainerFrac(e);
      inkStrokeRef.current = [startFrac];
      dragRef.current = { kind: "create", startMouse: { x: e.clientX, y: e.clientY }, startFrac, live: null };

      const onMove = (me: MouseEvent) => {
        const cur = getContainerFrac(me);
        inkStrokeRef.current = [...inkStrokeRef.current, cur];
        forceUpdate(n => n + 1);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        dragRef.current = null;
        const stroke = inkStrokeRef.current;
        inkStrokeRef.current = [];
        if (stroke.length < 2) { forceUpdate(n => n + 1); return; }
        const id = newId();
        const bb = boundingBox(stroke.map(p => ({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })));
        addAnnot({ id, type: "ink", page, strokes: [stroke], color: inkColor, strokeWidth: inkStrokeWidth, ...bb });
        setSelectedId(id); onSelectedChange?.(id);
        forceUpdate(n => n + 1);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return;
    }

    // ── Drag-to-create modes ─────────────────────────────────────────────
    e.preventDefault();
    const startFrac = getContainerFrac(e);
    dragRef.current = {
      kind: "create",
      startMouse: { x: e.clientX, y: e.clientY },
      startFrac,
      live: { x0: startFrac.x, y0: startFrac.y, x1: startFrac.x, y1: startFrac.y },
    };

    const isLineShape = createMode === "shape" && (shapeSubType === "line" || shapeSubType === "arrow");

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current || dragRef.current.kind !== "create") return;
      const cur = getContainerFrac(me);
      const sf = dragRef.current.startFrac;
      if (isLineShape) {
        // Lines/arrows: keep directional start→end (don't normalize)
        dragRef.current.live = { x0: sf.x, y0: sf.y, x1: cur.x, y1: cur.y };
      } else {
        dragRef.current.live = {
          x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
          x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
        };
      }
      forceUpdate(n => n + 1);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!dragRef.current || dragRef.current.kind !== "create") return;
      const { live } = dragRef.current;
      dragRef.current = null;
      if (!live) { forceUpdate(n => n + 1); return; }

      if (isLineShape) {
        // For lines/arrows, check distance instead of width×height
        const dx = live.x1 - live.x0, dy = live.y1 - live.y0;
        if (Math.sqrt(dx * dx + dy * dy) < 0.015) { forceUpdate(n => n + 1); return; }
      } else if (live.x1 - live.x0 < 0.01 && live.y1 - live.y0 < 0.004) {
        forceUpdate(n => n + 1); return;
      }

      const id = newId();
      const base = { id, page, author: author || undefined };
      if (createMode === "highlight") {
        addAnnot({ ...base, type: "highlight", ...live, colorIdx: hlColorIdx, color: highlightColors[hlColorIdx].rgb });
      } else if (createMode === "freetext") {
        addAnnot({ ...base, type: "freetext", ...live, text: "" });
        setEditingId(id); setEditText(""); setSelectedId(id); onSelectedChange?.(id);
      } else if (createMode === "underline") {
        addAnnot({ ...base, type: "underline", ...live });
      } else if (createMode === "strikethrough") {
        addAnnot({ ...base, type: "strikethrough", ...live });
      } else if (createMode === "shape") {
        addAnnot({ ...base, type: "shape", ...live, shape: shapeSubType, color: [0.1, 0.1, 0.8], strokeWidth: 2 });
      }
      setSelectedId(id); onSelectedChange?.(id);
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
      addAnnot({ id, type: "note", page, x: pt.x, y: pt.y, text: "", author: author || undefined });
      setEditingId(id); setEditText(""); setSelectedId(id); onSelectedChange?.(id);
    }
    if (createMode === "stamp") {
      const pt = getContainerFrac(e);
      const id = newId();
      // Auto-size the bounding box to fit the label at the default font size.
      // h = 6% of page height; w = per-char estimate + padding (min 14%).
      // At 55cqh font-size and bold tracking-widest, each char ≈ 2.8% page width.
      const h = 0.06;
      const w = Math.max(0.14, stampLabel.length * 0.028 + 0.04);
      addAnnot({
        id, type: "stamp", page,
        x0: clamp(pt.x - w / 2), y0: clamp(pt.y - h / 2),
        x1: clamp(pt.x + w / 2), y1: clamp(pt.y + h / 2),
        label: stampLabel, color: stampColor,
        author: author || undefined,
      });
      setSelectedId(id); onSelectedChange?.(id);
    }
  }

  // ── Annotation drag / resize ──────────────────────────────────────────────
  function onAnnotMouseDown(e: React.MouseEvent, ann: LocalAnnot) {
    if (e.button !== 0) return;
    if (editingId === ann.id) return;
    e.preventDefault(); e.stopPropagation();

    // Shift+click: multi-select toggle
    if (e.shiftKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(ann.id) ? next.delete(ann.id) : next.add(ann.id);
        return next;
      });
      return;
    }

    setSelectedId(ann.id); onSelectedChange?.(ann.id);
    setSelectedIds(new Set());

    const startAnnot = { ...ann } as LocalAnnot;
    const startMouse = { x: e.clientX, y: e.clientY };
    dragRef.current = { kind: "move", id: ann.id, startAnnot, startMouse, startFrac: { x: 0, y: 0 }, live: null };

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current || dragRef.current.kind !== "move") return;
      const size = getContainerSize();
      const dx = (me.clientX - startMouse.x) / size.w;
      const dy = (me.clientY - startMouse.y) / size.h;
      onAnnotationsChange(annotations.map(a => a.id === ann.id ? applyDrag(startAnnot, dx, dy) : a));
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
    else if (ann.type === "highlight") {
      setShowReplies(v => v === ann.id ? null : ann.id);
    }
    else if (ann.type === "underline" || ann.type === "strikethrough") {
      setEditingId(ann.id); setEditText(ann.text ?? ""); setSelectedId(ann.id);
    }
    else if (ann.type === "shape") {
      setEditingId(ann.id); setEditText(ann.text ?? ""); setSelectedId(ann.id);
    }
  }

  function onResizeMouseDown(
    e: React.MouseEvent,
    ann: HighlightAnnot | FreetextAnnot | UnderlineAnnot | StrikethroughAnnot | ShapeAnnot | StampAnnot,
    corner: Corner,
  ) {
    e.preventDefault(); e.stopPropagation();
    const startAnnot = { ...ann };
    const startMouse = { x: e.clientX, y: e.clientY };
    const onMove = (me: MouseEvent) => {
      const size = getContainerSize();
      const dx = (me.clientX - startMouse.x) / size.w;
      const dy = (me.clientY - startMouse.y) / size.h;
      onAnnotationsChange(annotations.map(a => a.id === ann.id ? applyResize(startAnnot, corner, dx, dy) : a));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Drag preview ──────────────────────────────────────────────────────────
  const live = dragRef.current?.kind === "create" ? dragRef.current.live : null;
  const dragColor = createMode === "highlight" ? highlightColors[hlColorIdx].border
    : createMode === "underline"    ? "#3b82f6"
    : createMode === "strikethrough" ? "#ef4444"
    : "#3b82f6";
  const dragBg = createMode === "highlight" ? highlightColors[hlColorIdx].bg
    : "rgba(59,130,246,0.08)";

  const cursorClass = (createMode === "note" || createMode === "stamp") ? "cursor-cell"
    : createMode === "ink" ? "cursor-crosshair"
    : selectedId ? "cursor-default"
    : "cursor-crosshair";

  // ── Inline comment editor (underline / strikethrough / shape) ─────────────
  function renderLineCommentEditor(ann: UnderlineAnnot | StrikethroughAnnot | ShapeAnnot) {
    if (editingId !== ann.id) return null;
    return (
      <div
        className="absolute top-full left-0 mt-1 z-40 pointer-events-auto"
        style={{ minWidth: 180 }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl shadow-xl p-2 w-52 space-y-1.5">
          <textarea
            autoFocus rows={2} value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                updateAnnot({ ...ann, text: editText.trim() } as LocalAnnot);
                setEditingId(null);
              }
              if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
            }}
            onBlur={() => { updateAnnot({ ...ann, text: editText.trim() } as LocalAnnot); setEditingId(null); }}
            placeholder="Add comment…"
            className="w-full rounded border border-yellow-300 bg-white px-2 py-1 text-xs text-stone-800 resize-none focus:outline-none focus:ring-1 focus:ring-yellow-500"
          />
          <div className="flex gap-1">
            <button onClick={() => { updateAnnot({ ...ann, text: editText.trim() } as LocalAnnot); setEditingId(null); }}
              className="flex-1 rounded bg-yellow-400 hover:bg-yellow-300 py-0.5 text-xs font-semibold text-stone-800 transition">Save</button>
            <button onClick={() => setEditingId(null)}
              className="px-2 rounded bg-stone-200 hover:bg-stone-300 text-xs text-stone-600 transition">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Reply thread renderer ─────────────────────────────────────────────────
  function renderReplies(ann: NoteAnnot | FreetextAnnot | HighlightAnnot) {
    const replies = ann.replies ?? [];
    if (replies.length === 0 && replyingId !== ann.id) return null;
    return (
      <div className="mt-1.5 border-t border-yellow-200 pt-1.5 space-y-1" onMouseDown={e => e.stopPropagation()}>
        {replies.map(r => (
          <div key={r.id} className="text-[10px] text-stone-700">
            <span className="font-semibold text-stone-600">{r.author}</span>
            {": "}
            {r.text}
          </div>
        ))}
        {replyingId === ann.id ? (
          <div className="space-y-1">
            <textarea autoFocus rows={2} value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addReply(ann); }
                if (e.key === "Escape") { setReplyingId(null); setReplyText(""); }
              }}
              placeholder="Reply… (Enter to send)"
              className="w-full rounded border border-yellow-300 bg-white px-1.5 py-1 text-[10px] text-stone-800 resize-none focus:outline-none"
            />
            <div className="flex gap-1">
              <button onClick={() => addReply(ann)}
                className="flex-1 rounded bg-yellow-300 hover:bg-yellow-200 py-0.5 text-[10px] font-semibold text-stone-800 transition">Send</button>
              <button onClick={() => { setReplyingId(null); setReplyText(""); }}
                className="px-2 rounded bg-stone-100 text-[10px] text-stone-600 transition">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setReplyingId(ann.id)}
            className="text-[10px] text-brand-500 hover:underline">Reply…</button>
        )}
      </div>
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderResizeHandles(
    ann: HighlightAnnot | FreetextAnnot | UnderlineAnnot | StrikethroughAnnot | ShapeAnnot | StampAnnot,
    borderColor: string,
  ) {
    return CORNERS.map(corner => (
      <div key={corner}
        className="absolute w-3 h-3 bg-white border-2 rounded-sm z-10"
        style={{
          borderColor, cursor: `${corner}-resize`,
          top:    corner.startsWith("n") ? -4 : undefined,
          bottom: corner.startsWith("s") ? -4 : undefined,
          left:   corner.endsWith("w")   ? -4 : undefined,
          right:  corner.endsWith("e")   ? -4 : undefined,
        }}
        onMouseDown={e => onResizeMouseDown(e, ann, corner)}
      />
    ));
  }

  function deleteBtn(id: AnnotId) {
    return (
      <button
        className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); deleteAnnot(id); }}
      >×</button>
    );
  }

  function tagsDisplay(tags?: string[]) {
    if (!tags || tags.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-0.5 mt-0.5">
        {tags.map(t => (
          <span key={t} className="bg-brand-900/40 text-brand-300 text-[9px] rounded px-1 py-0">{t}</span>
        ))}
      </div>
    );
  }

  // ── SVG colour helper ─────────────────────────────────────────────────────
  function svgColor(c?: [number, number, number]): string {
    return c ? colorToCSS(c) : "rgb(26,26,204)";
  }

  // ── Arrowhead polygon points (fractional coords) ──────────────────────────
  // Size is proportional to strokeWidth in screen pixels, converted to the
  // SVG's fractional coordinate space via a fixed page-width assumption.
  // This keeps the head the same visual size regardless of line length.
  function arrowheadPoints(
    x0: number, y0: number, x1: number, y1: number,
    strokeWidth: number = 2,
  ): string {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.005) return "";
    const ux = dx / len, uy = dy / len;
    // headLen ≈ 4× stroke width, expressed as fraction of page width.
    // 800px is a reasonable page-width baseline; adjust keeps it visually stable.
    const baseLen = (strokeWidth * 4) / 800;
    const headLen = Math.max(baseLen, Math.min(0.025, len * 0.25));
    const headW   = headLen * 0.55;
    const perpX = -uy, perpY = ux;
    const bx = x1 - ux * headLen, by = y1 - uy * headLen;
    return [
      `${x1},${y1}`,
      `${bx + perpX * headW},${by + perpY * headW}`,
      `${bx - perpX * headW},${by - perpY * headW}`,
    ].join(" ");
  }

  // ── Multi-select bulk bar ─────────────────────────────────────────────────
  const multiselectActive = selectedIds.size > 1;

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${cursorClass}`}
      style={{
        userSelect: "none",
        // When invisible (Shift+H), block pointer events so the canvas is clickable.
        // In text-select mode the layer is always transparent to pointer events.
        pointerEvents: (!visible || textSelectActive) ? "none" : "auto",
        opacity: visible ? 1 : 0,
      } as React.CSSProperties}
      onMouseDown={textSelectActive ? undefined : onBgMouseDown}
      onClick={textSelectActive ? undefined : onBgClick}
    >

      {/* ── SVG overlay for ink + shape ────────────────────────────────────── */}
      <svg
        className="absolute inset-0 pointer-events-none"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ zIndex: 12, width: "100%", height: "100%" }}
      >
        {pageAnns.map(ann => {
          if (ann.type === "ink") {
            const sel = ann.id === selectedId || selectedIds.has(ann.id);
            return (
              <g key={ann.id}>
                {ann.strokes.map((stroke, si) => (
                  <polyline
                    key={si}
                    points={stroke.map(p => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={svgColor(ann.color)}
                    strokeWidth={ann.strokeWidth ?? 2}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={sel ? 1 : 0.85}
                  />
                ))}
                {sel && (
                  <rect
                    x={ann.x0} y={ann.y0}
                    width={ann.x1 - ann.x0} height={ann.y1 - ann.y0}
                    fill="none" stroke="#3b82f6"
                    strokeWidth={1} strokeDasharray="0.01,0.01"
                    vectorEffect="non-scaling-stroke" opacity={0.5}
                  />
                )}
              </g>
            );
          }
          if (ann.type === "shape") {
            const sel = ann.id === selectedId || selectedIds.has(ann.id);
            const stroke = svgColor(ann.color);
            const sw = ann.strokeWidth ?? 2;
            const selProps = sel ? { strokeDasharray: "0.005,0.005" } : {};
            const { x0, y0, x1, y1 } = ann;
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
            switch (ann.shape) {
              case "rect":
                return <rect key={ann.id} x={Math.min(x0,x1)} y={Math.min(y0,y1)}
                  width={Math.abs(x1-x0)} height={Math.abs(y1-y0)}
                  fill="none" stroke={stroke} strokeWidth={sw}
                  vectorEffect="non-scaling-stroke" {...selProps} />;
              case "ellipse":
                return <ellipse key={ann.id} cx={cx} cy={cy} rx={rx} ry={ry}
                  fill="none" stroke={stroke} strokeWidth={sw}
                  vectorEffect="non-scaling-stroke" {...selProps} />;
              case "line":
                return <line key={ann.id} x1={x0} y1={y0} x2={x1} y2={y1}
                  stroke={stroke} strokeWidth={sw}
                  vectorEffect="non-scaling-stroke" strokeLinecap="round" {...selProps} />;
              case "arrow": {
                const pts = arrowheadPoints(x0, y0, x1, y1, sw);
                return (
                  <g key={ann.id}>
                    <line x1={x0} y1={y0} x2={x1} y2={y1}
                      stroke={stroke} strokeWidth={sw}
                      vectorEffect="non-scaling-stroke" strokeLinecap="round" {...selProps} />
                    {pts && (
                      <polygon points={pts} fill={stroke} vectorEffect="non-scaling-stroke" />
                    )}
                  </g>
                );
              }
              default: return null;
            }
          }
          return null;
        })}

        {/* Live ink stroke during drawing */}
        {createMode === "ink" && inkStrokeRef.current.length > 1 && (
          <polyline
            points={inkStrokeRef.current.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={svgColor(inkColor)}
            strokeWidth={inkStrokeWidth}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {/* ── Ink + Shape hit-targets (transparent divs for selection/drag) ───── */}
      {pageAnns.map(ann => {
        if (ann.type !== "ink" && ann.type !== "shape") return null;
        const sel = ann.id === selectedId || selectedIds.has(ann.id);
        const isLine = ann.type === "shape" && (ann.shape === "line" || ann.shape === "arrow");
        // For lines: compute bounding box from directional endpoints + padding
        const pad = isLine ? 0.01 : 0;
        const bx0 = Math.min(ann.x0, ann.x1) - pad;
        const by0 = Math.min(ann.y0, ann.y1) - pad;
        const bx1 = Math.max(ann.x0, ann.x1) + pad;
        const by1 = Math.max(ann.y0, ann.y1) + pad;
        return (
          <div key={ann.id} data-annot="true"
            className="absolute pointer-events-auto"
            style={{
              left: `${bx0 * 100}%`, top: `${by0 * 100}%`,
              width: `${(bx1 - bx0) * 100}%`, height: `${(by1 - by0) * 100}%`,
              zIndex: sel ? 25 : 13,
              cursor: "move",
            }}
            onMouseDown={e => onAnnotMouseDown(e, ann)}
            onDoubleClick={e => onAnnotDblClick(e, ann)}
          >
            {sel && ann.type !== "ink" && (
              <>
                {deleteBtn(ann.id)}
                {ann.type === "shape" && !isLine && renderResizeHandles(ann, svgColor(ann.color))}
                {ann.type === "shape" && renderLineCommentEditor(ann)}
              </>
            )}
            {sel && ann.type === "ink" && deleteBtn(ann.id)}
          </div>
        );
      })}

      {/* ── Existing annotations (div-based) ──────────────────────────────── */}
      {pageAnns.map(ann => {
        const sel     = ann.id === selectedId || selectedIds.has(ann.id);
        const editing = ann.id === editingId;

        /* ── Note ── */
        if (ann.type === "note") {
          const navIdx  = navSortedAnnots.findIndex(a => a.id === ann.id);
          const prevAnn = navIdx > 0 ? navSortedAnnots[navIdx - 1] : null;
          const nextAnn = navIdx >= 0 && navIdx < navSortedAnnots.length - 1 ? navSortedAnnots[navIdx + 1] : null;

          return (
            <div key={ann.id} data-annot="true"
              className="absolute pointer-events-auto"
              style={{ left: `${ann.x * 100}%`, top: `${ann.y * 100}%`, transform: "translate(-50%,-100%)", zIndex: sel ? 30 : 20 }}
              onMouseDown={e => onAnnotMouseDown(e, ann)}
              onDoubleClick={e => onAnnotDblClick(e, ann)}
            >
              <div className={cn("relative group select-none", sel ? "cursor-move drop-shadow-xl" : "cursor-pointer")}>
                <span className="text-xl leading-none">📌</span>
                {sel && !editing && deleteBtn(ann.id)}

                {editing ? (
                  /* ── Editor popup ── */
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
                        placeholder="Type note… (Ctrl+Enter to save)"
                        className="w-full rounded-lg border border-yellow-300 bg-white px-2 py-1.5 text-xs text-stone-800 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                      <input
                        value={editTagsStr}
                        onChange={e => setEditTagsStr(e.target.value)}
                        onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); cancelEdit(); } }}
                        placeholder="Tags: citation, question…"
                        className="w-full rounded border border-yellow-200 bg-white px-2 py-1 text-[10px] text-stone-600 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                      />
                      <div className="flex gap-1.5 items-center">
                        <SnippetDropdown onInsert={text => setEditText(prev => prev + text)} />
                        <button onClick={() => commitEdit(ann.id)} disabled={!editText.trim()}
                          className="flex-1 rounded bg-yellow-400 hover:bg-yellow-300 py-1 text-xs font-semibold text-stone-800 disabled:opacity-40 transition">Save</button>
                        <button onClick={cancelEdit}
                          className="px-2 rounded bg-stone-200 hover:bg-stone-300 text-xs text-stone-600 transition">Cancel</button>
                      </div>
                    </div>
                  </div>

                ) : sel ? (
                  /* ── Selected — persistent preview popup ── */
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 pointer-events-auto
                      bg-stone-900 border border-stone-600 rounded-xl shadow-2xl"
                    style={{ width: 228 }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    {/* Header: author · status badge · prev/next */}
                    <div className="flex items-center gap-2 px-2.5 py-2 border-b border-stone-700/70">
                      {ann.author && (
                        <span className="text-[10px] text-stone-500 flex-1 min-w-0 truncate">{ann.author}</span>
                      )}
                      {/* Status badge — prominent, clearly clickable */}
                      <button
                        onClick={e => { e.stopPropagation(); updateAnnot({ ...ann, status: nextStatus(ann.status) }); }}
                        title="Click to cycle status: Open → Resolved → Won't fix"
                        className={cn(
                          "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border-2 transition-all hover:opacity-80 active:scale-95",
                          STATUS_CLASS[ann.status ?? "open"],
                        )}
                      >
                        {STATUS_LABEL[ann.status ?? "open"]}
                      </button>
                      {/* Prev/next navigation */}
                      <div className="flex gap-0.5 shrink-0 ml-auto">
                        <button
                          onClick={e => { e.stopPropagation(); if (prevAnn) onNavigateAnnot?.(prevAnn.id); }}
                          disabled={!prevAnn}
                          title={prevAnn ? `Previous (pg ${prevAnn.page})` : "No previous"}
                          className="p-1 rounded bg-stone-700 text-stone-200 hover:bg-stone-600 disabled:opacity-30 disabled:bg-transparent disabled:text-stone-600 transition"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); if (nextAnn) onNavigateAnnot?.(nextAnn.id); }}
                          disabled={!nextAnn}
                          title={nextAnn ? `Next (pg ${nextAnn.page})` : "No next"}
                          className="p-1 rounded bg-stone-700 text-stone-200 hover:bg-stone-600 disabled:opacity-30 disabled:bg-transparent disabled:text-stone-600 transition"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Body: text content */}
                    <div className="px-2.5 py-2 text-xs leading-snug max-h-28 overflow-y-auto">
                      {ann.text
                        ? <span className="text-stone-200 whitespace-pre-wrap"><MathText text={ann.text} /></span>
                        : <span className="italic text-stone-600">Empty — double-click to edit</span>
                      }
                    </div>

                    {/* Tags */}
                    {ann.tags && ann.tags.length > 0 && (
                      <div className="px-2.5 pb-1.5">{tagsDisplay(ann.tags)}</div>
                    )}

                    {/* Reply thread */}
                    {((ann.replies?.length ?? 0) > 0 || replyingId === ann.id) && (
                      <div className="px-2.5 pb-1.5 border-t border-stone-700/50 pt-1.5">
                        {renderReplies(ann)}
                      </div>
                    )}

                    {/* Footer: edit + reply */}
                    <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-stone-700/70">
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(ann); }}
                        className="text-[10px] text-stone-500 hover:text-stone-200 transition"
                      >Edit</button>
                      {(ann.replies?.length ?? 0) === 0 && replyingId !== ann.id && (
                        <button
                          onClick={e => { e.stopPropagation(); setReplyingId(ann.id); }}
                          className="text-[10px] text-brand-500 hover:text-brand-400 transition ml-auto"
                        >Reply…</button>
                      )}
                    </div>
                  </div>

                ) : (
                  /* ── Unselected — hover-only preview ── */
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-30 pointer-events-none
                    bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg px-2 py-1.5 text-xs text-stone-800 max-w-52 whitespace-pre-wrap"
                  >
                    {ann.author && <div className="text-[9px] text-stone-500 mb-0.5 font-medium">{ann.author}</div>}
                    {ann.text ? <MathText text={ann.text} /> : <span className="italic text-stone-400">double-click to edit</span>}
                    {tagsDisplay(ann.tags)}
                    {(ann.replies?.length ?? 0) > 0 && (
                      <div className="text-[9px] text-brand-500 mt-0.5">{ann.replies!.length} repl{ann.replies!.length > 1 ? "ies" : "y"}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }

        /* ── Highlight ── */
        if (ann.type === "highlight") {
          const c = highlightColors[ann.colorIdx] ?? highlightColors[0];
          const rects = ann.rects ?? [{ x0: ann.x0, y0: ann.y0, x1: ann.x1, y1: ann.y1 }];
          return (
            <div key={ann.id} data-annot="true" className="absolute inset-0 pointer-events-none" style={{ zIndex: sel ? 25 : 15 }}>
              <div
                className="absolute pointer-events-auto"
                style={{
                  left: `${ann.x0 * 100}%`, top: `${ann.y0 * 100}%`,
                  width: `${(ann.x1 - ann.x0) * 100}%`, height: `${(ann.y1 - ann.y0) * 100}%`,
                  cursor: "move",
                }}
                onMouseDown={e => onAnnotMouseDown(e, ann)}
                onDoubleClick={e => onAnnotDblClick(e, ann)}
              >
                {sel && (
                  <>
                    {deleteBtn(ann.id)}
                    {renderResizeHandles(ann, c.border)}
                    {/* Action row: colour picker toggle + reply toggle */}
                    <div className="absolute top-full left-0 mt-1 z-40 pointer-events-auto flex flex-col gap-1"
                      onMouseDown={e => e.stopPropagation()}
                    >
                      <div className="flex gap-1 items-center bg-stone-900 border border-stone-700 rounded-lg p-1.5 shadow-xl">
                        {highlightColors.map((hc, i) => (
                          <button key={i} onClick={e => {
                            e.stopPropagation();
                            updateAnnot({ ...ann, colorIdx: i, color: hc.rgb });
                          }}
                            title={hc.label}
                            className={cn("h-4 w-4 rounded-full border-2 transition",
                              ann.colorIdx === i ? "border-white scale-110" : "border-transparent")}
                            style={{ background: hc.bg }}
                          />
                        ))}
                        <div className="w-px h-4 bg-stone-700" />
                        <button
                          onClick={e => { e.stopPropagation(); setShowReplies(v => v === ann.id ? null : ann.id); }}
                          title="Replies"
                          className={cn("text-[10px] px-1.5 py-0.5 rounded transition",
                            showReplies === ann.id ? "bg-brand-600 text-white" : "text-stone-400 hover:text-white")}
                        >
                          💬 {(ann.replies?.length ?? 0) || ""}
                        </button>
                      </div>
                      {showReplies === ann.id && (
                        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-lg px-2 py-1.5 w-52">
                          {ann.text && <p className="text-[10px] text-stone-700 mb-1">{ann.text}</p>}
                          {renderReplies(ann)}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {rects.map((r, i) => (
                <div key={i} className="absolute pointer-events-none" style={{
                  left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`,
                  width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`,
                  backgroundColor: c.bg,
                  border: sel ? `1.5px solid ${c.border}` : `1px solid ${c.border}40`,
                }} />
              ))}
            </div>
          );
        }

        /* ── Freetext ── */
        if (ann.type === "freetext") return (
          <div key={ann.id} data-annot="true"
            className="absolute pointer-events-auto overflow-visible"
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
              <div className="w-full h-full flex flex-col" onMouseDown={e => e.stopPropagation()}>
                <textarea autoFocus value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === "Escape") commitEdit(ann.id); }}
                  onBlur={() => commitEdit(ann.id)}
                  className="flex-1 bg-transparent border-none px-1.5 py-1 text-xs text-stone-800 resize-none focus:outline-none"
                  style={{ lineHeight: 1.4 }}
                />
                <div className="px-1 pb-0.5 space-y-0.5">
                  <SnippetDropdown onInsert={text => setEditText(prev => prev + text)} />
                  <input
                    value={editTagsStr}
                    onChange={e => setEditTagsStr(e.target.value)}
                    onKeyDown={e => { e.stopPropagation(); }}
                    placeholder="tags: citation, question…"
                    className="w-full rounded border border-yellow-200 bg-white/70 px-1.5 py-0.5 text-[9px] text-stone-600 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div>
                <p className="p-1.5 text-xs text-stone-800 leading-snug whitespace-pre-wrap overflow-hidden"
                  style={{ maxHeight: `${(ann.y1 - ann.y0) * 100}%` }}>
                  {ann.text || <span className="italic text-stone-400">double-click to type…</span>}
                </p>
                {tagsDisplay(ann.tags)}
              </div>
            )}
            {sel && !editing && (
              <>
                {deleteBtn(ann.id)}
                {renderResizeHandles(ann, "#f59e0b")}
              </>
            )}
          </div>
        );

        /* ── Underline ── */
        if (ann.type === "underline") {
          const rects = ann.rects ?? [{ x0: ann.x0, y0: ann.y0, x1: ann.x1, y1: ann.y1 }];
          return (
            <div key={ann.id} data-annot="true" className="absolute inset-0 pointer-events-none" style={{ zIndex: sel ? 25 : 15 }}>
              {rects.map((r, i) => (
                <div key={i} className="absolute pointer-events-none" style={{
                  left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`,
                  width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`,
                  borderBottom: `2px solid ${sel ? "#3b82f6" : "rgba(59,130,246,0.7)"}`,
                  backgroundColor: sel ? "rgba(59,130,246,0.05)" : "transparent",
                }} />
              ))}
              <div className="absolute pointer-events-auto"
                style={{
                  left: `${ann.x0 * 100}%`, top: `${ann.y0 * 100}%`,
                  width: `${(ann.x1 - ann.x0) * 100}%`, height: `${(ann.y1 - ann.y0) * 100}%`,
                  cursor: "move",
                }}
                onMouseDown={e => onAnnotMouseDown(e, ann)}
                onDoubleClick={e => onAnnotDblClick(e, ann)}
              >
                {sel && (
                  <>
                    {deleteBtn(ann.id)}
                    {renderResizeHandles(ann, "#3b82f6")}
                    {renderLineCommentEditor(ann)}
                  </>
                )}
              </div>
            </div>
          );
        }

        /* ── Strikethrough ── */
        if (ann.type === "strikethrough") {
          const rects = ann.rects ?? [{ x0: ann.x0, y0: ann.y0, x1: ann.x1, y1: ann.y1 }];
          return (
            <div key={ann.id} data-annot="true" className="absolute inset-0 pointer-events-none" style={{ zIndex: sel ? 25 : 15 }}>
              {rects.map((r, i) => {
                const midY = (r.y0 + r.y1) / 2;
                const lineH = Math.max((r.y1 - r.y0) * 0.12, 0.003);
                return (
                  <div key={i} className="absolute pointer-events-none" style={{
                    left: `${r.x0 * 100}%`, top: `${(midY - lineH / 2) * 100}%`,
                    width: `${(r.x1 - r.x0) * 100}%`, height: `${lineH * 100}%`,
                    backgroundColor: sel ? "#ef4444" : "rgba(239,68,68,0.7)",
                  }} />
                );
              })}
              <div className="absolute pointer-events-auto"
                style={{
                  left: `${ann.x0 * 100}%`, top: `${ann.y0 * 100}%`,
                  width: `${(ann.x1 - ann.x0) * 100}%`, height: `${(ann.y1 - ann.y0) * 100}%`,
                  cursor: "move",
                }}
                onMouseDown={e => onAnnotMouseDown(e, ann)}
                onDoubleClick={e => onAnnotDblClick(e, ann)}
              >
                {sel && (
                  <>
                    {deleteBtn(ann.id)}
                    {renderResizeHandles(ann, "#ef4444")}
                    {renderLineCommentEditor(ann)}
                  </>
                )}
              </div>
            </div>
          );
        }

        /* ── Stamp ── */
        if (ann.type === "stamp") return (
          <StampDiv
            key={ann.id} ann={ann} sel={sel}
            onMouseDown={onAnnotMouseDown}
            deleteBtn={deleteBtn}
            renderResizeHandles={renderResizeHandles}
          />
        );

        return null;
      })}

      {/* ── In-progress drag preview ────────────────────────────────────────── */}
      {live && createMode !== "ink" && (() => {
        const isLineDrag = createMode === "shape" && (shapeSubType === "line" || shapeSubType === "arrow");
        if (isLineDrag) {
          // Render a line preview in the SVG, not a rectangle
          const dx = live.x1 - live.x0, dy = live.y1 - live.y0;
          if (Math.sqrt(dx * dx + dy * dy) < 0.005) return null;
          return (
            <svg className="absolute inset-0 pointer-events-none"
              viewBox="0 0 1 1" preserveAspectRatio="none"
              style={{ zIndex: 20, width: "100%", height: "100%" }}>
              <line x1={live.x0} y1={live.y0} x2={live.x1} y2={live.y1}
                stroke={dragColor} strokeWidth={2} strokeDasharray="6,4"
                vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              {shapeSubType === "arrow" && (() => {
                const pts = arrowheadPoints(live.x0, live.y0, live.x1, live.y1, inkStrokeWidth);
                return pts ? <polygon points={pts} fill={dragColor} vectorEffect="non-scaling-stroke" opacity={0.6} /> : null;
              })()}
            </svg>
          );
        }
        if (live.x1 - live.x0 > 0.002 || live.y1 - live.y0 > 0.002) {
          return (
            <div className="absolute pointer-events-none rounded-sm" style={{
              left: `${live.x0 * 100}%`, top: `${live.y0 * 100}%`,
              width: `${(live.x1 - live.x0) * 100}%`, height: `${(live.y1 - live.y0) * 100}%`,
              border: `2px dashed ${dragColor}`,
              backgroundColor: dragBg,
              zIndex: 20,
            }} />
          );
        }
        return null;
      })()}

      {/* ── Multi-select bulk action bar ────────────────────────────────────── */}
      {multiselectActive && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-stone-900 border border-stone-600 rounded-xl px-3 py-2 shadow-2xl pointer-events-auto whitespace-nowrap"
          onMouseDown={e => e.stopPropagation()}
        >
          <span className="text-xs text-stone-400 mr-1">{selectedIds.size} selected</span>

          {/* Status bulk-change — only when all selected are comment types (note / freetext) */}
          {Array.from(selectedIds).every(id => {
            const a = annotations.find(x => x.id === id);
            return a && isCommentType(a.type);
          }) && (
            <>
              <span className="text-[10px] text-stone-600 uppercase tracking-wide">Status</span>
              {(["open", "resolved", "wontfix"] as AnnotStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => {
                    const ids = new Set(selectedIds);
                    onAnnotationsChange(annotations.map(a =>
                      ids.has(a.id) ? { ...a, status: s } as LocalAnnot : a
                    ));
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition",
                    s === "resolved"
                      ? "bg-green-900/60 text-green-300 hover:bg-green-800/60"
                      : s === "wontfix"
                        ? "bg-stone-700 text-stone-400 hover:bg-stone-600"
                        : "bg-amber-900/50 text-amber-300 hover:bg-amber-800/50",
                  )}
                >
                  {s === "wontfix" ? "Won't fix" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              <div className="w-px h-4 bg-stone-700 mx-0.5" />
            </>
          )}

          {/* Delete */}
          <button
            onClick={() => {
              const ids = new Set(selectedIds);
              onAnnotationsChange(annotations.filter(a => !ids.has(a.id)));
              setSelectedIds(new Set()); setSelectedId(null); onSelectedChange?.(null);
            }}
            className="flex items-center gap-1 rounded-lg bg-red-800/70 hover:bg-red-700/70 px-2.5 py-1 text-xs text-red-300 transition"
          >
            Delete
          </button>

          {/* Deselect */}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-stone-500 hover:text-stone-300 transition text-xs leading-none"
            title="Deselect"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── Export helpers ────────────────────────────────────────────────────────────
export { boundingBox };
export { STAMP_LABELS as STAMPS };
