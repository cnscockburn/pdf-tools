import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useDropzone } from "react-dropzone";
import {
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, UploadCloud,
  MessageSquare, EyeOff, Crop,
  Stamp, Loader2, Highlighter, Type, Pencil, Check, X, Download,
  Underline, Strikethrough, Search, HelpCircle, User,
  PenLine, Square, Command, Settings as SettingsIcon,
} from "lucide-react";
import { cn, downloadBlob } from "../lib/utils";
import ThumbnailSidebar from "../components/ThumbnailSidebar";
import RightPanel, { type PanelTool } from "../components/RightPanel";
import RightRail, { type RailTab } from "../components/RightRail";
import AnnotationLayer, {
  type LocalAnnot, type HlColor, type CreateMode, type AnnotId, type AnnotStatus,
  type FracRect, type ShapeSubType, newId, boundingBox, STAMP_LABELS,
} from "../components/AnnotationLayer";
import TextLayer from "../components/TextLayer";
import QuickActionBar from "../components/QuickActionBar";
import SearchBar, { type SearchResult } from "../components/SearchBar";
import KeyboardCheatSheet from "../components/KeyboardCheatSheet";
import CommandPalette, { type PaletteCommand } from "../components/CommandPalette";
import SettingsDialog from "../components/SettingsDialog";
import MiniMap from "../components/MiniMap";
import MenuBar, { type MenuDef } from "../components/MenuBar";
import { annotatePDF, redactPDF, cropPDF, checkHealth, type Annotation, type RedactRegion } from "../api/client";
import { useSettings, useBookmarks } from "../lib/storage";
import { downloadAnnotationReport } from "../lib/annotationReport";

type CanvasMode = "view" | "annotate" | "redact" | "crop";

const HIGHLIGHT_COLORS: HlColor[] = [
  { label: "Yellow", rgb: [1, 1, 0],     bg: "rgba(255,255,0,0.35)",   border: "rgba(200,160,0,0.8)" },
  { label: "Cyan",   rgb: [0, 1, 1],     bg: "rgba(0,255,255,0.35)",   border: "rgba(0,160,200,0.8)" },
  { label: "Green",  rgb: [0, 1, 0.5],   bg: "rgba(0,255,128,0.35)",   border: "rgba(0,180,80,0.8)" },
  { label: "Pink",   rgb: [1, 0.5, 0.8], bg: "rgba(255,128,200,0.35)", border: "rgba(200,80,150,0.8)" },
];

/** Convert AnnotationLayer's local types to the backend API shape. */
function toApiAnnotations(localAnns: LocalAnnot[]): Annotation[] {
  return localAnns.map((a) => {
    if (a.type === "note")
      return { type: "note", page: a.page, x: a.x, y: a.y, text: a.text };
    if (a.type === "highlight")
      return { type: "highlight", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               color: a.color, ...(a.rects ? { rects: a.rects } : {}) };
    if (a.type === "freetext")
      return { type: "freetext", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, text: a.text };
    if (a.type === "underline")
      return { type: "underline", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               ...(a.rects ? { rects: a.rects } : {}), ...(a.text ? { text: a.text } : {}) };
    if (a.type === "strikethrough")
      return { type: "strikethrough", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               ...(a.rects ? { rects: a.rects } : {}), ...(a.text ? { text: a.text } : {}) };
    if (a.type === "ink")
      return { type: "ink", page: a.page, strokes: a.strokes,
               ...(a.color ? { color: a.color } : {}),
               ...(a.strokeWidth ? { strokeWidth: a.strokeWidth } : {}) };
    if (a.type === "shape")
      return { type: "shape", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               shape: a.shape,
               ...(a.color ? { color: a.color } : {}),
               ...(a.strokeWidth ? { strokeWidth: a.strokeWidth } : {}),
               ...(a.text ? { text: a.text } : {}) };
    if (a.type === "stamp")
      return { type: "stamp", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1,
               label: a.label, color: a.color };
    // fallback
    return { type: "note", page: (a as LocalAnnot).page, x: 0, y: 0, text: "" };
  });
}

type RedactBox = { id: string; page: number; x0: number; y0: number; x1: number; y1: number };
let _rid = 0;
const newRid = () => `r${++_rid}`;

type CropSel = { x0: number; y0: number; x1: number; y1: number };

/** Build a per-page string index from PDF.js for in-document search. */
interface PageText {
  page: number;
  text: string;
  items: Array<{ str: string; start: number; end: number; transform: number[]; width: number; height: number }>;
  viewport: { width: number; height: number; convertToViewportPoint: (x: number, y: number) => [number, number] };
}

export default function Viewer() {
  // ── Settings + bookmarks ──────────────────────────────────────────────────
  const { settings, updateSettings, addSnippet, removeSnippet } = useSettings();
  const { bookmarks, addBookmark, removeBookmark, renameBookmark } = useBookmarks();
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput]     = useState("");

  // ── File & PDF ─────────────────────────────────────────────────────────────
  const [file, setFile]           = useState<File | null>(null);
  const [workingBlob, setWorkingBlob] = useState<Blob | null>(null);
  const [pdf, setPdf]             = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]         = useState(1.4);
  const [filename, setFilename]   = useState("");
  const [rendering, setRendering] = useState(false);
  const [pageInput, setPageInput] = useState("1");
  const [editingPage, setEditingPage] = useState(false);

  // ── Filename editing ───────────────────────────────────────────────────────
  const [editingFilename, setEditingFilename] = useState(false);
  const [filenameInput, setFilenameInput]     = useState("");

  // ── Layout ─────────────────────────────────────────────────────────────────
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelTool, setPanelTool] = useState<PanelTool>(null);
  const [railTab, setRailTab] = useState<RailTab>("annotations");

  // ── Canvas modes ───────────────────────────────────────────────────────────
  const [canvasMode, setCanvasMode]           = useState<CanvasMode>("view");
  const [annotateSubMode, setAnnotateSubMode] = useState<CreateMode>("note");
  const [hlColor, setHlColor]                 = useState(0);
  const [shapeSubType, setShapeSubType]       = useState<ShapeSubType>("rect");
  const [stampLabel, setStampLabel]           = useState(STAMP_LABELS[0]);
  const [inkStrokeWidth, setInkStrokeWidth]   = useState(2);

  // ── Command palette ────────────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Annotations visibility toggle (Shift+H / View menu) ───────────────────
  const [annotationsVisible, setAnnotationsVisible] = useState(true);

  // ── Pending tool: activated when a PDF loads (from Home page card clicks) ─
  const pendingToolRef = useRef<string | null>(null);

  // ── Router navigation ──────────────────────────────────────────────────────
  const navigate = useNavigate();

  // ── Annotations ────────────────────────────────────────────────────────────
  const [annotations, setAnnotations]         = useState<LocalAnnot[]>([]);
  /** Externally-requested annotation to select (from sidebar / popup nav arrows). */
  const [focusAnnotId, setFocusAnnotId]       = useState<AnnotId | null>(null);
  const [autoSaving, setAutoSaving]           = useState(false);
  const [annotateError, setAnnotateError]     = useState<string | null>(null);

  // ── Text selection / QuickActionBar ───────────────────────────────────────
  const [textSelectActive, setTextSelectActive] = useState(false);
  const [quickBar, setQuickBar] = useState<{
    rects: FracRect[]; text: string; barX: number; barY: number;
  } | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchIdx, setSearchIdx]       = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pageIndex, setPageIndex]       = useState<PageText[]>([]);

  // ── Keyboard cheat sheet ──────────────────────────────────────────────────
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  // ── Settings dialog ────────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Mini-map visibility ────────────────────────────────────────────────────
  const [miniMapVisible, setMiniMapVisible] = useState(true);

  // ── Backend health ─────────────────────────────────────────────────────────
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  // ── Redact ─────────────────────────────────────────────────────────────────
  const [redactBoxes, setRedactBoxes]     = useState<RedactBox[]>([]);
  const [selectedRedact, setSelectedRedact] = useState<string | null>(null);
  const [redactLoading, setRedactLoading] = useState(false);
  const [redactError, setRedactError]     = useState<string | null>(null);
  const [redactLive, setRedactLive]       = useState<CropSel | null>(null);
  const redactDragRef = useRef<{ startFrac: { x: number; y: number } } | null>(null);

  // ── Crop ───────────────────────────────────────────────────────────────────
  const [cropSelection, setCropSelection] = useState<CropSel | null>(null);
  const [cropLive, setCropLive]           = useState<CropSel | null>(null);
  const [applyToAll, setApplyToAll]       = useState(true);
  const [cropLoading, setCropLoading]     = useState(false);
  const [cropError, setCropError]         = useState<string | null>(null);
  const cropDragRef = useRef<{ startFrac: { x: number; y: number } } | null>(null);

  // ── Confirmation gates for destructive actions ─────────────────────────────
  const [confirmRedact, setConfirmRedact]       = useState(false);
  const [confirmCrop, setConfirmCrop]           = useState(false);
  const [confirmClearAnnot, setConfirmClearAnnot] = useState(false);

  // ── Unsaved-changes navigation guard ──────────────────────────────────────
  type PendingNav =
    | { type: "home" }
    | { type: "route"; path: string; routeState?: object };
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  // ── Multi-level undo / redo ────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<LocalAnnot[][]>([]);
  const [redoStack, setRedoStack] = useState<LocalAnnot[][]>([]);
  const annotationsRef   = useRef<LocalAnnot[]>([]);
  const undoAnnotationRef = useRef<() => void>(() => {});
  const redoAnnotationRef = useRef<() => void>(() => {});

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const location      = useLocation();

  // ── Stable ref for mode switch ─────────────────────────────────────────────
  const switchModeRef = useRef<(m: CanvasMode) => void>(() => {});

  // ── Keyboard shortcut state ref ────────────────────────────────────────────
  const kbRef = useRef({
    currentPage: 1,
    pdf:           null as PDFDocumentProxy | null,
    workingBlob:   null as Blob | null,
    filename:      "",
    selectedRedact: null as string | null,
  });
  kbRef.current = { currentPage, pdf, workingBlob, filename, selectedRedact };
  annotationsRef.current = annotations;

  // ── Effective highlight colors (user-labelled palette) ───────────────────
  const effectiveHlColors = useMemo<typeof HIGHLIGHT_COLORS>(
    () => HIGHLIGHT_COLORS.map((c, i) => ({
      ...c,
      label: settings.colorLabels[i] ?? c.label,
    })),
    [settings.colorLabels],
  );

  // ── Working file ──────────────────────────────────────────────────────────
  const workingFile = useMemo<File | null>(() => {
    if (!file) return null;
    if (!workingBlob) return file;
    return new File([workingBlob], filename, { type: "application/pdf" });
  }, [file, workingBlob, filename]);

  // ── Load from router state ────────────────────────────────────────────────
  useEffect(() => {
    const state = location.state as { file?: File; tool?: string } | null;
    if (state?.tool) pendingToolRef.current = state.tool;
    if (state?.file) loadFile(state.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PDF canvas render ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
      setRendering(true);
      try {
        const page = await pdf.getPage(currentPage);
        if (cancelled) return;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current!;
        canvas.width  = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({
          canvasContext: ctx,
          viewport: vp,
          annotationMode: canvasMode === "annotate" ? 0 : 1,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch { /* RenderingCancelledException is expected */ }
      finally { if (!cancelled) setRendering(false); }
    })();

    return () => { cancelled = true; renderTaskRef.current?.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, currentPage, scale, canvasMode]);

  // ── Build text search index when PDF loads ────────────────────────────────
  useEffect(() => {
    if (!pdf) { setPageIndex([]); return; }
    let cancelled = false;
    (async () => {
      const index: PageText[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        try {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          const tc = await page.getTextContent();
          let text = "";
          const items: PageText["items"] = [];
          for (const item of tc.items) {
            if (!("str" in item)) continue;
            const { str, transform, width, height } = item as {
              str: string; transform: number[]; width: number; height: number;
            };
            const start = text.length;
            text += str;
            items.push({ str, start, end: text.length, transform, width, height });
          }
          index.push({ page: i, text, items, viewport: vp as unknown as PageText["viewport"] });
        } catch { /* page unavailable */ }
      }
      if (!cancelled) setPageIndex(index);
    })();
    return () => { cancelled = true; };
  }, [pdf]);

  // ── Search: run when query changes ────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim() || pageIndex.length === 0) {
      setSearchResults([]); setSearchIdx(0); return;
    }
    setSearchLoading(true);
    const lower = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    for (const pt of pageIndex) {
      const lowerText = pt.text.toLowerCase();
      let idx = 0;
      while ((idx = lowerText.indexOf(lower, idx)) !== -1) {
        const end = idx + lower.length;
        // Find all overlapping text items
        const matchItems = pt.items.filter(it => it.end > idx && it.start < end);
        const rects: SearchResult["rects"] = [];
        for (const it of matchItems) {
          try {
            const [a,, , d, tx, ty] = it.transform;
            const fontH = Math.abs(d) || Math.abs(a) || 10;
            const bl = pt.viewport.convertToViewportPoint(tx, ty);
            const tr = pt.viewport.convertToViewportPoint(tx + it.width, ty + fontH);
            const vw = pt.viewport.width, vh = pt.viewport.height;
            rects.push({
              x0: Math.max(0, Math.min(bl[0], tr[0]) / vw),
              y0: Math.max(0, Math.min(bl[1], tr[1]) / vh),
              x1: Math.min(1, Math.max(bl[0], tr[0]) / vw),
              y1: Math.min(1, Math.max(bl[1], tr[1]) / vh),
            });
          } catch { /* skip */ }
        }
        if (rects.length > 0) results.push({ page: pt.page, rects });
        idx += lower.length;
      }
    }

    setSearchResults(results);
    setSearchIdx(0);
    setSearchLoading(false);
  }, [searchQuery, pageIndex]);

  // ── Navigate to search result page ────────────────────────────────────────
  useEffect(() => {
    if (searchResults.length > 0 && searchResults[searchIdx]) {
      const target = searchResults[searchIdx].page;
      if (target !== currentPage) { setCurrentPage(target); setPageInput(String(target)); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIdx, searchResults]);

  // ── Backend health check ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const ok = await checkHealth();
      if (!cancelled) setBackendOk(ok);
    }
    check();
    const id = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Text selection → QuickActionBar ──────────────────────────────────────
  useEffect(() => {
    if (canvasMode !== "annotate") return;

    function onMouseUp(_e: MouseEvent) {
      // Small delay so the selection settles
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setQuickBar(null);
          return;
        }
        // Only act on selections within our canvas wrapper
        if (!canvasWrapRef.current) return;
        const wrapEl = canvasWrapRef.current;
        const range = sel.getRangeAt(0);
        if (!wrapEl.contains(range.commonAncestorContainer)) {
          setQuickBar(null);
          return;
        }

        const wrapRect = wrapEl.getBoundingClientRect();
        const clientRects = Array.from(range.getClientRects());
        const rects: FracRect[] = clientRects
          .map(r => ({
            x0: Math.max(0, (r.left   - wrapRect.left) / wrapRect.width),
            y0: Math.max(0, (r.top    - wrapRect.top)  / wrapRect.height),
            x1: Math.min(1, (r.right  - wrapRect.left) / wrapRect.width),
            y1: Math.min(1, (r.bottom - wrapRect.top)  / wrapRect.height),
          }))
          .filter(r => r.x1 - r.x0 > 0.001 && r.y1 - r.y0 > 0.001);

        if (rects.length === 0) { setQuickBar(null); return; }

        const text = sel.toString();
        // Position bar above the topmost rect, centred on its midpoint
        const topRect = clientRects.reduce((t, r) => r.top < t.top ? r : t, clientRects[0]);
        setQuickBar({
          rects,
          text,
          barX: topRect.left + topRect.width / 2,
          barY: topRect.top,
        });
      }, 10);
    }

    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [canvasMode]);

  // Dismiss QuickActionBar when clicking elsewhere
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest("[data-quickbar]")) return;
      setQuickBar(null);
      // Don't clear browser selection here — user may still want to read it
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  // ── Auto-enable text layer for text-markup annotation modes ──────────────
  // Highlight / underline / strikethrough all work by selecting text, so the
  // text layer is automatically made interactive when those sub-modes are active.
  // All other modes (note, freetext, ink, shape, stamp) use drag/click so the
  // text layer stays transparent and doesn't interfere.
  useEffect(() => {
    const textModes: CreateMode[] = ["highlight", "underline", "strikethrough"];
    setTextSelectActive(canvasMode === "annotate" && textModes.includes(annotateSubMode));
  }, [annotateSubMode, canvasMode]);

  // ── Continuous scroll — advance page at scroll boundary ────────────────────
  // When the canvas area is scrolled to its top or bottom edge and the user
  // keeps scrolling, advance to the previous / next page.
  // passive:false is required so we can call preventDefault() at boundaries,
  // preventing parent-container scroll or Mac rubber-band while we accumulate.
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return;

    let accum = 0;
    const THRESHOLD = 80;            // px of delta needed to flip page
    let cooldown = false;

    function onWheel(e: WheelEvent) {
      const el = canvasAreaRef.current;
      if (!el) return;
      const { pdf, currentPage } = kbRef.current;
      if (!pdf) return;

      // hasOverflow: the rendered page is taller than the scroll container
      const hasOverflow = el.scrollHeight > el.clientHeight + 2;
      // at-boundary checks — 6px tolerance for sub-pixel rounding
      const atBottom = hasOverflow ? el.scrollTop + el.clientHeight >= el.scrollHeight - 6 : true;
      const atTop    = hasOverflow ? el.scrollTop <= 6 : true;

      if (e.deltaY > 0 && atBottom && currentPage < pdf.numPages) {
        // At bottom boundary, more pages → swallow the event, accumulate
        e.preventDefault();
        accum += e.deltaY;
        if (accum >= THRESHOLD && !cooldown) {
          accum = 0; cooldown = true;
          const next = currentPage + 1;
          setCurrentPage(next);
          setPageInput(String(next));
          requestAnimationFrame(() => { el.scrollTop = 0; });
          setTimeout(() => { cooldown = false; }, 400);
        }
      } else if (e.deltaY < 0 && atTop && currentPage > 1) {
        // At top boundary, prior pages → swallow, accumulate
        e.preventDefault();
        accum += e.deltaY; // negative
        if (accum <= -THRESHOLD && !cooldown) {
          accum = 0; cooldown = true;
          const prev = currentPage - 1;
          setCurrentPage(prev);
          setPageInput(String(prev));
          requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
          setTimeout(() => { cooldown = false; }, 400);
        }
      } else {
        // Mid-page scroll (or last/first page) — native scroll handles it
        accum = 0;
      }
    }

    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  // Re-attach whenever `pdf` changes: the canvasAreaRef div only exists after
  // a PDF is loaded (the empty-state early-return hides it at mount), so the
  // initial [] run would find canvasAreaRef.current === null and bail out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf]);

  // ── Keyboard shortcuts (stable handler via ref) ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Allow search input to capture everything
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const { currentPage, pdf, workingBlob, filename, selectedRedact } = kbRef.current;

      // ── Cheat sheet ────────────────────────────────────────────────────
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCheatSheetOpen(v => !v);
        return;
      }

      // ── Ctrl shortcuts ────────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          setSearchOpen(v => !v);
          return;
        }
        if ((e.key === "p" || e.key === "P") && e.shiftKey) {
          e.preventDefault();
          setPaletteOpen(v => !v);
          return;
        }
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          if (workingBlob) downloadBlob(workingBlob, filename);
          return;
        }
        if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
          e.preventDefault();
          undoAnnotationRef.current();
          return;
        }
        if (((e.key === "z" || e.key === "Z") && e.shiftKey) || e.key === "y" || e.key === "Y") {
          e.preventDefault();
          redoAnnotationRef.current();
          return;
        }
        if (e.key === "+" || e.key === "=") { e.preventDefault(); setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2))); return; }
        if (e.key === "-")                  { e.preventDefault(); setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2))); return; }
      }

      if (e.key === "Escape") {
        if (paletteOpen)    { setPaletteOpen(false); return; }
        if (cheatSheetOpen) { setCheatSheetOpen(false); return; }
        if (searchOpen)     { setSearchOpen(false); return; }
        switchModeRef.current("view");
        return;
      }

      if (tag === "INPUT" || tag === "TEXTAREA") return;

      // ── Shift+H: toggle annotation visibility ────────────────────────
      if ((e.key === "h" || e.key === "H") && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setAnnotationsVisible(v => !v);
        return;
      }

      // ── Mode shortcuts (no modifier) ──────────────────────────────────
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") { e.preventDefault(); switchModeRef.current("view"); return; }
        if (e.key === "a" || e.key === "A") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("note"); return; }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("highlight"); return; }
        if (e.key === "u" || e.key === "U") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("underline"); return; }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("strikethrough"); return; }
        if (e.key === "t" || e.key === "T") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("freetext"); return; }
        if (e.key === "i" || e.key === "I") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("ink"); return; }
        if (e.key === "g" || e.key === "G") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("shape"); return; }
        if (e.key === "p" || e.key === "P") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("stamp"); return; }
        if (e.key === "r" || e.key === "R") { e.preventDefault(); switchModeRef.current("redact"); return; }
        if (e.key === "c" || e.key === "C") { e.preventDefault(); switchModeRef.current("crop"); return; }
        if (e.key === "+" || e.key === "=") { setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2))); return; }
        if (e.key === "-")                  { setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2))); return; }
        // Highlight colour shortcuts (1-4) while in annotate/highlight mode
        if (e.key >= "1" && e.key <= "4")  { setHlColor(Number(e.key) - 1); return; }
      }

      // ── Navigation ────────────────────────────────────────────────────
      if (!pdf) return;
      const nav = (delta: number) => {
        const p = Math.max(1, Math.min(currentPage + delta, pdf.numPages));
        setCurrentPage(p); setPageInput(String(p));
      };
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); nav(+1); return; }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp"   || e.key === "PageUp")   { e.preventDefault(); nav(-1); return; }
      if (e.key === "Home") { e.preventDefault(); setCurrentPage(1);             setPageInput("1");                    return; }
      if (e.key === "End")  { e.preventDefault(); setCurrentPage(pdf.numPages); setPageInput(String(pdf.numPages)); return; }

      // ── Delete selected redact box ────────────────────────────────────
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRedact) {
        e.preventDefault();
        setRedactBoxes(prev => prev.filter(b => b.id !== selectedRedact));
        setSelectedRedact(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function loadFile(f: File) {
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    setPdf(null);
    setFile(f);
    setWorkingBlob(null);
    setFilename(f.name);
    setCurrentPage(1);
    setPageInput("1");
    setAnnotations([]);
    setUndoStack([]); setRedoStack([]);
    setRedactBoxes([]);
    setCropSelection(null);
    doSwitchMode("view");
    setPanelTool(null);
    setSearchQuery("");
    setSearchResults([]);
    setQuickBar(null);
    const buf = await f.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    setPdf(doc);
    // Activate any pending tool hint (from Home page card clicks)
    activatePendingTool();
  }

  async function applyBlob(blob: Blob) {
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    setPdf(null);
    setWorkingBlob(blob);
    const buf = await blob.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = Math.min(currentPage, doc.numPages);
    setCurrentPage(page);
    setPageInput(String(page));
    setPdf(doc);
  }

  function doSwitchMode(m: CanvasMode) {
    setCanvasMode(m);
    setCropSelection(null); setCropLive(null);
    setRedactLive(null); setSelectedRedact(null);
    setAnnotateError(null); setRedactError(null); setCropError(null);
    setTextSelectActive(false);
    setQuickBar(null);
  }

  function switchMode(m: CanvasMode) {
    if (autoSaving) return;
    if (canvasMode === "annotate" && m !== "annotate" && annotations.length > 0 && workingFile) {
      autoSaveAnnotations(m);
      return;
    }
    doSwitchMode(m);
  }
  switchModeRef.current = switchMode;

  // ── Annotation history (multi-level undo / redo) ───────────────────────────

  /** Record current annotations into the undo stack, clear redo, then apply next. */
  function changeAnnotations(next: LocalAnnot[]) {
    setUndoStack(prev => [...prev.slice(-60), annotationsRef.current]);
    setRedoStack([]);
    setAnnotations(next);
  }

  function undoAnnotation() {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack(r => [...r.slice(-60), annotationsRef.current]);
      setAnnotations(last);
      return prev.slice(0, -1);
    });
  }

  function redoAnnotation() {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack(u => [...u.slice(-60), annotationsRef.current]);
      setAnnotations(last);
      return prev.slice(0, -1);
    });
  }

  undoAnnotationRef.current = undoAnnotation;
  redoAnnotationRef.current = redoAnnotation;

  // ── Unsaved-changes navigation guard ──────────────────────────────────────

  function doNavigate(nav: PendingNav) {
    if (nav.type === "home") navigate("/");
    else navigate(nav.path, { state: nav.routeState });
  }

  /** Navigate, but show the guard modal when there is unsaved work. */
  function maybeNavigate(nav: PendingNav) {
    if (workingBlob || annotations.length > 0) { setPendingNav(nav); return; }
    doNavigate(nav);
  }

  // Consume the pending tool hint set by router state (Home page card clicks).
  // Maps tool id strings to the appropriate panel or canvas mode.
  function activatePendingTool() {
    const tool = pendingToolRef.current;
    if (!tool) return;
    pendingToolRef.current = null;

    const panelTools = ["compress", "watermark", "split", "extract", "rotate-delete", "security", "pdf-to-images", "snippets"] as const;
    for (const pt of panelTools) {
      if (tool === pt) { togglePanel(pt); return; }
    }
    if (tool === "redact")   { doSwitchMode("redact"); return; }
    if (tool === "annotate") { doSwitchMode("annotate"); return; }
    if (tool === "crop")     { doSwitchMode("crop"); return; }
  }

  function goTo(n: number) {
    if (!pdf) return;
    const p = Math.max(1, Math.min(n, pdf.numPages));
    setCurrentPage(p); setPageInput(String(p));
  }

  function commitPageInput() {
    const n = parseInt(pageInput);
    if (!isNaN(n)) goTo(n); else setPageInput(String(currentPage));
    setEditingPage(false);
  }

  function commitFilename() {
    const t = filenameInput.trim();
    if (t) setFilename(t.endsWith(".pdf") ? t : `${t}.pdf`);
    setEditingFilename(false);
  }

  function togglePanel(t: PanelTool) {
    setPanelTool(prev => (prev === t ? null : t));
  }

  // ── Operations ────────────────────────────────────────────────────────────

  async function autoSaveAnnotations(targetMode: CanvasMode) {
    if (!workingFile || annotations.length === 0) { doSwitchMode(targetMode); return; }
    if (backendOk === false) {
      setAnnotateError("Backend not running — start it: cd backend && uvicorn main:app --port 7342");
      return;
    }
    setAutoSaving(true); setAnnotateError(null);
    try {
      const blob = await annotatePDF(workingFile, toApiAnnotations(annotations));
      await applyBlob(blob);
      // Annotations are now burned into the PDF blob. Clear the overlay so the
      // in-memory list doesn't ghost-persist (causing undo to remove
      // visually-gone annotations from the sidebar while they remain in the blob).
      setAnnotations([]);
      setUndoStack([]);
      setRedoStack([]);
      doSwitchMode(targetMode);
    } catch (e) {
      setAnnotateError(e instanceof Error ? e.message : "Unknown error");
    } finally { setAutoSaving(false); }
  }

  async function applyRedactions() {
    if (!workingFile || redactBoxes.length === 0) return;
    setRedactLoading(true); setRedactError(null);
    try {
      const regions: RedactRegion[] = redactBoxes.map(b => ({ page: b.page, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }));
      const blob = await redactPDF(workingFile, regions);
      setRedactBoxes([]);
      await applyBlob(blob);
      switchMode("view");
    } catch (e) { setRedactError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setRedactLoading(false); }
  }

  async function applyCrop() {
    if (!workingFile || !cropSelection) return;
    setCropLoading(true); setCropError(null);
    try {
      const { x0, y0, x1, y1 } = cropSelection;
      const blob = await cropPDF(workingFile, x0, y0, x1, y1, applyToAll ? "all" : [currentPage]);
      setCropSelection(null);
      await applyBlob(blob);
      switchMode("view");
    } catch (e) { setCropError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setCropLoading(false); }
  }

  // ── QuickActionBar handlers ───────────────────────────────────────────────

  function createAnnotFromSelection(type: "highlight" | "underline" | "strikethrough") {
    if (!quickBar) return;
    const { rects } = quickBar;
    const bb = boundingBox(rects);
    const id = newId();
    const base = { id, page: currentPage, author: settings.author || undefined };
    if (type === "highlight") {
      setAnnotations(prev => [...prev, {
        ...base, type: "highlight",
        x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1,
        rects, colorIdx: hlColor, color: effectiveHlColors[hlColor].rgb,
      }]);
    } else {
      setAnnotations(prev => [...prev, {
        ...base, type,
        x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1,
        rects,
      }]);
    }
    window.getSelection()?.removeAllRanges();
    setQuickBar(null);
    // Make sure we're in annotate mode
    if (canvasMode !== "annotate") doSwitchMode("annotate");
  }

  function addNoteAtSelection() {
    if (!quickBar) return;
    const bb = boundingBox(quickBar.rects);
    const id = newId();
    setAnnotations(prev => [...prev, {
      id, page: currentPage, type: "note",
      x: bb.x0, y: bb.y0, text: quickBar.text.slice(0, 200),
      author: settings.author || undefined,
    }]);
    window.getSelection()?.removeAllRanges();
    setQuickBar(null);
    if (canvasMode !== "annotate") doSwitchMode("annotate");
  }

  // ── Annotation management ─────────────────────────────────────────────────

  /** Jump to an annotation's page AND select it in the overlay. */
  function focusAnnotation(id: AnnotId) {
    const ann = annotations.find(a => a.id === id);
    if (!ann) return;
    goTo(ann.page);
    setFocusAnnotId(id);
    // Enter annotate mode if not already there so the overlay is visible
    if (canvasMode !== "annotate") doSwitchMode("annotate");
    setTimeout(() => setFocusAnnotId(null), 150); // reset after AnnotationLayer picks it up
  }

  function deleteAnnot(id: AnnotId) {
    changeAnnotations(annotations.filter(a => a.id !== id));
  }

  function changeAnnotStatus(id: AnnotId, status: AnnotStatus) {
    changeAnnotations(annotations.map(a => a.id === id ? { ...a, status } : a));
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: ([f]) => f && loadFile(f),
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  // ── Overlay coordinate helper ─────────────────────────────────────────────
  function overlayFrac(el: HTMLElement, clientX: number, clientY: number) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min((clientX - r.left) / r.width, 1)),
      y: Math.max(0, Math.min((clientY - r.top) / r.height, 1)),
    };
  }

  // ── Redact drag ────────────────────────────────────────────────────────────
  function onRedactDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-rbox]")) return;
    setSelectedRedact(null);
    e.preventDefault();
    const el = e.currentTarget;
    const sf = overlayFrac(el, e.clientX, e.clientY);
    redactDragRef.current = { startFrac: sf };

    const onMove = (me: MouseEvent) => {
      if (!redactDragRef.current) return;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      setRedactLive({ x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!redactDragRef.current) return;
      redactDragRef.current = null;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      const box = { x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) };
      setRedactLive(null);
      if (box.x1 - box.x0 > 0.01 && box.y1 - box.y0 > 0.005)
        setRedactBoxes(prev => [...prev, { id: newRid(), page: currentPage, ...box }]);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Crop drag ──────────────────────────────────────────────────────────────
  function onCropDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const sf = overlayFrac(el, e.clientX, e.clientY);
    cropDragRef.current = { startFrac: sf };
    setCropSelection(null);

    const onMove = (me: MouseEvent) => {
      if (!cropDragRef.current) return;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      setCropLive({ x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!cropDragRef.current) return;
      cropDragRef.current = null;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      const sel = { x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) };
      setCropLive(null);
      if (sel.x1 - sel.x0 > 0.01 && sel.y1 - sel.y0 > 0.005) setCropSelection(sel);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Current-page search rects ──────────────────────────────────────────────
  const pageSearchRects = useMemo(() => {
    if (!searchQuery) return [];
    return searchResults
      .filter(r => r.page === currentPage)
      .flatMap(r => r.rects);
  }, [searchResults, currentPage, searchQuery]);

  const currentSearchResult = searchResults[searchIdx];
  const currentSearchIsOnPage = currentSearchResult?.page === currentPage;

  // ── Derived display values ─────────────────────────────────────────────────
  const pageRedactBoxes = redactBoxes.filter(b => b.page === currentPage);
  const displayCrop     = cropLive ?? cropSelection;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!pdf || !file) {
    return (
      <div className="min-h-screen bg-stone-800 flex flex-col">
        <div className="bg-stone-900 border-b border-stone-700 px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-xs text-stone-400 hover:text-white flex items-center gap-1 transition">
            <ChevronLeft className="h-4 w-4" /> All tools
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div {...getRootProps()} className={cn(
            "border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all max-w-sm w-full",
            isDragActive ? "border-brand-400 bg-stone-700" : "border-stone-500 hover:border-brand-400 hover:bg-stone-700"
          )}>
            <input {...getInputProps()} />
            <UploadCloud className="mx-auto mb-3 h-12 w-12 text-stone-400" />
            <p className="font-medium text-stone-300">{isDragActive ? "Drop PDF here" : "Open a PDF to get started"}</p>
            <p className="mt-1 text-sm text-stone-500">Click or drag and drop</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Toolbar button helpers ─────────────────────────────────────────────────
  const modeBtn = (m: CanvasMode, icon: React.ReactNode, label: string, key: string) => (
    <button key={m} onClick={() => switchMode(m)} title={`${label} (${key})`}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
        canvasMode === m ? "bg-brand-600 text-white shadow" : "text-stone-300 hover:bg-stone-700"
      )}>
      {icon} {label}
      <kbd className={cn(
        "ml-0.5 rounded border px-1 py-0 text-[9px] font-mono leading-4 transition",
        canvasMode === m
          ? "border-white/25 bg-white/10 text-white/70"
          : "border-stone-600 bg-stone-800 text-stone-500"
      )}>{key}</kbd>
    </button>
  );

  const sidebarFile = workingFile ?? file;

  // ── Menu bar definitions ──────────────────────────────────────────────────
  function buildViewerMenus(): MenuDef[] {
    const hasDoc = !!pdf;
    const hasBlob = !!workingBlob;

    return [
      {
        label: "File",
        items: [
          { label: "Open…",               shortcut: "Ctrl+O",       action: () => openFilePicker() },
          { label: "Save / Download",      shortcut: "Ctrl+S",       action: () => { if (workingBlob) downloadBlob(workingBlob, filename); }, disabled: !hasBlob },
          { type: "separator" },
          { label: "Export Review Report", action: () => downloadAnnotationReport(annotations, filename), disabled: annotations.length === 0 },
        ],
      },
      {
        label: "Document",
        items: [
          { label: "Annotate",         shortcut: "A", action: () => switchMode("annotate"),               disabled: !hasDoc },
          { label: "Redact",           shortcut: "R", action: () => switchMode("redact"),                 disabled: !hasDoc },
          { label: "Crop",             shortcut: "C", action: () => switchMode("crop"),                   disabled: !hasDoc },
          { type: "separator" },
          { label: "Compress PDF",           action: () => togglePanel("compress"),       disabled: !hasDoc },
          { label: "Add Watermark",          action: () => togglePanel("watermark"),      disabled: !hasDoc },
          { label: "Encrypt / Decrypt",      action: () => togglePanel("security"),       disabled: !hasDoc },
          { type: "separator" },
          { label: "Split PDF",              action: () => togglePanel("split"),          disabled: !hasDoc },
          { label: "Extract Pages",          action: () => togglePanel("extract"),        disabled: !hasDoc },
          { label: "Rotate / Delete Pages",  action: () => togglePanel("rotate-delete"), disabled: !hasDoc },
          { label: "Rearrange Pages",        action: () => maybeNavigate({ type: "route", path: "/rearrange", routeState: { file: workingFile ?? file } }), disabled: !hasDoc },
          { label: "Merge PDFs",             action: () => maybeNavigate({ type: "route", path: "/merge",     routeState: { file: workingFile ?? file } }) },
          { type: "separator" },
          { label: "Export to Images",       action: () => togglePanel("pdf-to-images"), disabled: !hasDoc },
        ],
      },
      {
        label: "View",
        items: [
          { label: "Zoom In",          shortcut: "+",        action: () => setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2))) },
          { label: "Zoom Out",         shortcut: "−",        action: () => setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2))) },
          { label: "Fit Width",                             action: () => {
              if (!canvasAreaRef.current || !canvasRef.current) return;
              const w = canvasAreaRef.current.clientWidth - 64;
              const pw = canvasRef.current.width / scale;
              setScale(parseFloat(Math.max(0.5, Math.min(w / pw, 4)).toFixed(2)));
            }
          },
          { type: "separator" },
          { label: annotationsVisible ? "Hide annotation overlay" : "Show annotation overlay", shortcut: "Shift+H", action: () => setAnnotationsVisible(v => !v), checked: annotationsVisible, disabled: canvasMode !== "annotate" },
          { label: "Show Thumbnails",    action: () => setSidebarCollapsed(v => !v), checked: !sidebarCollapsed },
          { label: "Mini-map",          action: () => setMiniMapVisible(v => !v),   checked: miniMapVisible },
          { type: "separator" },
          { label: "Annotations panel",  action: () => setRailTab("annotations"),  disabled: !hasDoc },
          { label: "Table of Contents",  action: () => setRailTab("outline"),       disabled: !hasDoc },
          { label: "Bookmarks",          action: () => setRailTab("bookmarks"),     disabled: !hasDoc },
        ],
      },
    ];
  }

  return (
    <div className="h-screen flex flex-col bg-stone-800 overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      {/* Hidden dropzone input — triggered via openFilePicker() from File menu */}
      <div {...getRootProps()} className="hidden"><input {...getInputProps()} /></div>

      <div className="bg-stone-900 border-b border-stone-700 px-3 py-1.5 flex items-center gap-2 shrink-0 min-w-0">
        {/* Logo + Home link */}
        <button
          onClick={() => maybeNavigate({ type: "home" })}
          title="Back to home"
          className="shrink-0 flex items-center gap-1.5 text-stone-400 hover:text-white transition"
        >
          <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="2" y="9" width="18" height="18" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round"/>
            <line x1="2"  y1="9"  x2="20" y2="27" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="9"  x2="2"  y2="27" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="9"  x2="30" y2="2"  stroke="#d97706" strokeWidth="1.5"/>
            <line x1="30" y1="2"  x2="30" y2="13" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="13" x2="30" y2="13" stroke="#d97706" strokeWidth="1.5"/>
            <line x1="20" y1="9"  x2="30" y2="13" stroke="#d97706" strokeWidth="1.5"/>
            <circle cx="11" cy="18" r="1.5" fill="#d97706"/>
          </svg>
        </button>

        <div className="w-px h-4 bg-stone-700 shrink-0" />

        {/* Editable filename */}
        {editingFilename ? (
          <div className="flex items-center gap-1.5 min-w-0 w-48">
            <input autoFocus value={filenameInput}
              onChange={e => setFilenameInput(e.target.value)}
              onBlur={commitFilename}
              onKeyDown={e => { if (e.key === "Enter") commitFilename(); if (e.key === "Escape") setEditingFilename(false); }}
              className="flex-1 min-w-0 bg-stone-800 border border-brand-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button onClick={commitFilename} className="shrink-0 text-green-400 hover:text-green-300 transition"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditingFilename(false)} className="shrink-0 text-stone-400 hover:text-white transition"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => { setFilenameInput(filename); setEditingFilename(true); }} title="Click to rename"
            className="flex items-center gap-1 group min-w-0 max-w-[200px]">
            <span className="text-xs text-stone-300 truncate group-hover:text-white transition">{filename || "No file"}</span>
            <Pencil className="h-2.5 w-2.5 text-stone-600 group-hover:text-stone-400 shrink-0 transition" />
          </button>
        )}

        <div className="w-px h-4 bg-stone-700 shrink-0" />

        {/* Menu bar: File / Document / View */}
        <MenuBar menus={buildViewerMenus()} />

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            title="Preferences"
            className="flex items-center gap-1 rounded-lg p-1.5 text-stone-500 hover:text-stone-300 hover:bg-stone-700 transition"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>

          {/* Author badge */}
          {editingAuthor ? (
            <input
              autoFocus
              value={authorInput}
              onChange={e => setAuthorInput(e.target.value)}
              onBlur={() => { updateSettings({ author: authorInput.trim() }); setEditingAuthor(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") { updateSettings({ author: authorInput.trim() }); setEditingAuthor(false); }
                if (e.key === "Escape") setEditingAuthor(false);
              }}
              placeholder="Your name"
              className="w-24 bg-stone-800 border border-brand-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          ) : (
            <button
              onClick={() => { setAuthorInput(settings.author); setEditingAuthor(true); }}
              title="Set your name for annotations"
              aria-label={settings.author ? `Author: ${settings.author}` : "Set author name"}
              className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-300 transition"
            >
              <User className="h-3 w-3" />
              <span className="hidden sm:inline">{settings.author || "Set name"}</span>
            </button>
          )}

          {/* Backend status dot */}
          <div
            role="status"
            aria-label={backendOk === null ? "Checking backend" : backendOk ? "Backend connected" : "Backend offline"}
            title={backendOk === null ? "Checking backend…" : backendOk ? "Backend connected" : "Backend offline — run: cd backend && .venv\\Scripts\\uvicorn main:app --port 7342"}
            className={cn("w-2 h-2 rounded-full shrink-0 transition-colors",
              backendOk === null ? "bg-stone-600" : backendOk ? "bg-green-500" : "bg-red-500 animate-pulse")}
          />
          {rendering && <span className="text-[10px] text-stone-500 animate-pulse">Rendering…</span>}

          {/* Download button */}
          {workingBlob && (
            <button
              onClick={() => downloadBlob(workingBlob, filename)}
              title="Download modified PDF (Ctrl+S)"
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white transition shadow-lg"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </button>
          )}
        </div>
      </div>

      {/* ── Middle: sidebar + canvas + right panel ─────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: thumbnail sidebar */}
        <ThumbnailSidebar
          file={sidebarFile}
          currentPage={currentPage}
          onSelect={goTo}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          annotations={annotations}
        />

        {/* Center: canvas + context bars + toolbar */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Canvas scroll area */}
          <div ref={canvasAreaRef} className="flex-1 overflow-auto flex flex-col items-center py-8 px-4">

            <div ref={canvasWrapRef} className="relative inline-block shadow-2xl rounded" style={{ lineHeight: 0 }}>
              <canvas ref={canvasRef} className="rounded block" />

              {/* ── Text layer (always in annotate mode) ────────────────────── */}
              {canvasMode === "annotate" && pdf && (
                <TextLayer
                  pdf={pdf}
                  pageNum={currentPage}
                  scale={scale}
                  active={textSelectActive}
                />
              )}

              {/* ── Annotate overlay ────────────────────────────────────────── */}
              {canvasMode === "annotate" && (
                <AnnotationLayer
                  annotations={annotations}
                  page={currentPage}
                  createMode={annotateSubMode}
                  hlColorIdx={hlColor}
                  highlightColors={effectiveHlColors}
                  onAnnotationsChange={changeAnnotations}
                  textSelectActive={textSelectActive}
                  author={settings.author}
                  shapeSubType={shapeSubType}
                  inkStrokeWidth={inkStrokeWidth}
                  stampLabel={stampLabel}
                  snippets={settings.snippets}
                  visible={annotationsVisible}
                  focusAnnotId={focusAnnotId}
                  onNavigateAnnot={focusAnnotation}
                />
              )}

              {/* ── Search result highlight overlays ───────────────────────── */}
              {pageSearchRects.length > 0 && (
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                  {pageSearchRects.map((r, i) => (
                    <div key={i} className="absolute" style={{
                      left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`,
                      width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`,
                      backgroundColor: currentSearchIsOnPage && i === 0
                        ? "rgba(255,120,0,0.45)"
                        : "rgba(255,200,0,0.35)",
                      borderRadius: 2,
                    }} />
                  ))}
                </div>
              )}

              {/* ── Redact overlay ─────────────────────────────────────────── */}
              {canvasMode === "redact" && (
                <div className="absolute inset-0 cursor-crosshair" style={{ userSelect: "none" }}
                  onMouseDown={onRedactDown}
                >
                  {pageRedactBoxes.map(box => (
                    <div key={box.id} data-rbox="true"
                      className={cn("absolute pointer-events-auto", selectedRedact === box.id && "ring-2 ring-offset-0 ring-brand-400")}
                      style={{
                        left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`,
                        width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%`,
                        background: "rgba(0,0,0,0.88)", cursor: "pointer",
                      }}
                      onClick={e => { e.stopPropagation(); setSelectedRedact(box.id === selectedRedact ? null : box.id); }}
                    >
                      {selectedRedact === box.id && (
                        <button
                          className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); setRedactBoxes(prev => prev.filter(b => b.id !== box.id)); setSelectedRedact(null); }}
                        >×</button>
                      )}
                    </div>
                  ))}
                  {redactLive && (
                    <div className="absolute pointer-events-none" style={{
                      left: `${redactLive.x0 * 100}%`, top: `${redactLive.y0 * 100}%`,
                      width: `${(redactLive.x1 - redactLive.x0) * 100}%`, height: `${(redactLive.y1 - redactLive.y0) * 100}%`,
                      background: "rgba(0,0,0,0.55)", border: "2px dashed rgba(255,255,255,0.4)",
                    }} />
                  )}
                </div>
              )}

              {/* ── Crop overlay ───────────────────────────────────────────── */}
              {canvasMode === "crop" && (
                <div className="absolute inset-0 cursor-crosshair" style={{ userSelect: "none" }}
                  onMouseDown={onCropDown}
                >
                  {displayCrop && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute bg-black/40" style={{ top: 0, left: 0, right: 0, height: `${displayCrop.y0 * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ bottom: 0, left: 0, right: 0, top: `${displayCrop.y1 * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ top: `${displayCrop.y0 * 100}%`, bottom: `${(1 - displayCrop.y1) * 100}%`, left: 0, width: `${displayCrop.x0 * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ top: `${displayCrop.y0 * 100}%`, bottom: `${(1 - displayCrop.y1) * 100}%`, right: 0, left: `${displayCrop.x1 * 100}%` }} />
                      <div className="absolute" style={{ left: `${displayCrop.x0 * 100}%`, top: `${displayCrop.y0 * 100}%`, width: `${(displayCrop.x1 - displayCrop.x0) * 100}%`, height: `${(displayCrop.y1 - displayCrop.y0) * 100}%`, border: "2px solid #d97706" }} />
                    </div>
                  )}
                  {!displayCrop && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="bg-black/50 text-white text-xs px-3 py-1.5 rounded-full">Drag to select crop area</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Context toolbars ────────────────────────────────────────────── */}

          {canvasMode === "annotate" && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <div className="flex flex-wrap items-center gap-2 bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                {/* Sub-mode */}
                <div className="flex gap-1 flex-wrap">
                  {([
                    { m: "note"          as CreateMode, icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Note",      key: "A" },
                    { m: "highlight"     as CreateMode, icon: <Highlighter   className="h-3.5 w-3.5" />, label: "Highlight", key: "H" },
                    { m: "underline"     as CreateMode, icon: <Underline     className="h-3.5 w-3.5" />, label: "Underline", key: "U" },
                    { m: "strikethrough" as CreateMode, icon: <Strikethrough className="h-3.5 w-3.5" />, label: "Strike",    key: "S" },
                    { m: "freetext"      as CreateMode, icon: <Type          className="h-3.5 w-3.5" />, label: "Text",      key: "T" },
                    { m: "ink"           as CreateMode, icon: <PenLine       className="h-3.5 w-3.5" />, label: "Draw",      key: "I" },
                    { m: "shape"         as CreateMode, icon: <Square        className="h-3.5 w-3.5" />, label: "Shape",     key: "G" },
                    { m: "stamp"         as CreateMode, icon: <Stamp         className="h-3.5 w-3.5" />, label: "Stamp",     key: "P" },
                  ]).map(({ m, icon, label, key }) => {
                    const active = annotateSubMode === m;
                    return (
                      <button key={m} onClick={() => setAnnotateSubMode(m)}
                        title={`${label}${key ? ` (${key})` : ""}`}
                        className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                          active ? "bg-brand-600 text-white" : "bg-stone-700 text-stone-300 hover:bg-stone-600")}>
                        {icon} {label}
                        {key && (
                          <kbd className={cn(
                            "ml-0.5 rounded border px-1 py-0 text-[9px] font-mono leading-4 transition",
                            active ? "border-white/25 bg-white/10 text-white/70" : "border-stone-600 bg-stone-800 text-stone-500"
                          )}>{key}</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Highlight colour swatches */}
                {annotateSubMode === "highlight" && (
                  <div className="flex items-center gap-1">
                    {effectiveHlColors.map((c, i) => (
                      <button key={i} onClick={() => setHlColor(i)} title={`${c.label} (${i + 1})`}
                        className={cn("h-5 w-5 rounded-full border-2 transition",
                          hlColor === i ? "border-white scale-125" : "border-transparent")}
                        style={{ background: c.bg }} />
                    ))}
                  </div>
                )}
                {/* Shape sub-type */}
                {annotateSubMode === "shape" && (
                  <div className="flex items-center gap-1">
                    {(["rect", "ellipse", "line", "arrow"] as ShapeSubType[]).map(s => (
                      <button key={s} onClick={() => setShapeSubType(s)}
                        className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition",
                          shapeSubType === s ? "bg-brand-600 text-white" : "bg-stone-700 text-stone-400 hover:bg-stone-600")}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {/* Ink stroke width */}
                {annotateSubMode === "ink" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-stone-500">Width</span>
                    {[1, 2, 4, 8].map(w => (
                      <button key={w} onClick={() => setInkStrokeWidth(w)}
                        className={cn("rounded border px-1.5 py-0.5 text-[10px] transition",
                          inkStrokeWidth === w ? "border-brand-500 text-brand-300" : "border-stone-600 text-stone-400 hover:border-stone-500")}>
                        {w}px
                      </button>
                    ))}
                  </div>
                )}
                {/* Stamp label */}
                {annotateSubMode === "stamp" && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {STAMP_LABELS.map(l => (
                      <button key={l} onClick={() => setStampLabel(l)}
                        className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wide transition",
                          stampLabel === l ? "bg-red-800 text-red-200" : "bg-stone-700 text-stone-400 hover:bg-stone-600")}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
                {/* Controls */}
                <div className="flex items-center gap-2 ml-auto">
                  {autoSaving ? (
                    <span className="flex items-center gap-1 text-xs text-brand-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                    </span>
                  ) : (
                    <span className="text-xs text-stone-500">
                      {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
                      {annotations.length > 0 && <span className="text-stone-600 ml-1">· saved on Done / Esc</span>}
                    </span>
                  )}
                  {annotateError && (
                    <span className="text-xs text-red-400 max-w-56 truncate cursor-help" title={annotateError}>⚠ {annotateError}</span>
                  )}
                  {annotations.length > 0 && !autoSaving && (
                    <>
                      <button
                        onClick={() => undoAnnotationRef.current()}
                        disabled={undoStack.length === 0}
                        title={undoStack.length > 0 ? `Undo (Ctrl+Z) — ${undoStack.length} step${undoStack.length !== 1 ? "s" : ""} available` : "Nothing to undo (Ctrl+Z)"}
                        className="text-xs text-stone-500 hover:text-stone-300 disabled:opacity-30 transition"
                      >Undo</button>
                      {redoStack.length > 0 && (
                        <button
                          onClick={() => redoAnnotationRef.current()}
                          title={`Redo (Ctrl+Shift+Z) — ${redoStack.length} step${redoStack.length !== 1 ? "s" : ""}`}
                          className="text-xs text-stone-500 hover:text-stone-300 transition"
                        >Redo</button>
                      )}
                      {confirmClearAnnot ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-stone-400">Remove all?</span>
                          <button onClick={() => { changeAnnotations([]); setConfirmClearAnnot(false); }}
                            className="text-xs text-red-400 hover:text-red-300 transition font-medium">Yes</button>
                          <button onClick={() => setConfirmClearAnnot(false)}
                            className="text-xs text-stone-500 hover:text-stone-300 transition">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmClearAnnot(true)}
                          className="text-xs text-stone-500 hover:text-stone-300 transition">Clear all</button>
                      )}
                    </>
                  )}
                  {annotateError && annotations.length > 0 && (
                    <button onClick={() => autoSaveAnnotations("view")} disabled={autoSaving}
                      className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                      <Check className="h-3 w-3" /> Retry Save
                    </button>
                  )}

                  {/* Done — visible save-and-exit button */}
                  <button
                    onClick={() => switchMode("view")}
                    disabled={autoSaving}
                    title="Save annotations and return to view mode (Esc)"
                    className="flex items-center gap-1.5 rounded-lg bg-stone-600 hover:bg-stone-500 border border-stone-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition ml-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {canvasMode === "redact" && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <div className="flex flex-wrap items-center gap-3 bg-red-950/60 border border-red-900/60 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                <EyeOff className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-xs text-red-300">Drag to draw redaction boxes · Click a box to select · Del to remove</span>
                <div className="flex items-center gap-3 ml-auto">
                  <span className="text-xs text-red-500">{redactBoxes.length} region{redactBoxes.length !== 1 ? "s" : ""}</span>
                  {redactError && <span className="text-xs text-red-300 max-w-40 truncate" title={redactError}>{redactError}</span>}
                  {redactBoxes.length > 0 && (
                    <>
                      <button onClick={() => setRedactBoxes([])} className="text-xs text-red-400 hover:text-red-300 transition">Clear all</button>
                      {confirmRedact ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-red-300">This is permanent.</span>
                          <button onClick={() => { setConfirmRedact(false); applyRedactions(); }} disabled={redactLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition">
                            {redactLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                            Confirm
                          </button>
                          <button onClick={() => setConfirmRedact(false)}
                            className="text-xs text-red-400 hover:text-red-300 transition">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmRedact(true)} disabled={redactLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition">
                          <EyeOff className="h-3.5 w-3.5" />
                          Apply Redactions
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {canvasMode === "crop" && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <div className="flex flex-wrap items-center gap-3 bg-brand-950/40 border border-brand-900/40 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                <Crop className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                <span className="text-xs text-brand-300">
                  {cropSelection ? "Selection drawn — apply or redraw." : "Drag to select the area to keep."}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-brand-300 cursor-pointer">
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="accent-brand-500" />
                  All pages
                </label>
                {cropError && <span className="text-xs text-red-400">{cropError}</span>}
                <div className="flex items-center gap-2 ml-auto">
                  {cropSelection && (
                    <>
                      <button onClick={() => setCropSelection(null)} className="text-xs text-brand-400 hover:text-brand-300 transition">Clear</button>
                      {confirmCrop ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] text-brand-300">Content outside the selection will be removed.</span>
                          <button onClick={() => { setConfirmCrop(false); applyCrop(); }} disabled={cropLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                            {cropLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />}
                            Confirm
                          </button>
                          <button onClick={() => setConfirmCrop(false)}
                            className="text-xs text-brand-400 hover:text-brand-300 transition">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmCrop(true)} disabled={cropLoading}
                          className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                          <Crop className="h-3.5 w-3.5" />
                          Apply Crop
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Search bar ──────────────────────────────────────────────────── */}
          {searchOpen && (
            <div className="shrink-0 px-4 pb-2 flex justify-center">
              <SearchBar
                query={searchQuery}
                onChange={q => { setSearchQuery(q); setSearchIdx(0); }}
                results={searchResults}
                focusIdx={searchIdx}
                loading={searchLoading}
                onNext={() => setSearchIdx(i => searchResults.length > 0 ? (i + 1) % searchResults.length : 0)}
                onPrev={() => setSearchIdx(i => searchResults.length > 0 ? (i - 1 + searchResults.length) % searchResults.length : 0)}
                onClose={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
              />
            </div>
          )}

          {/* ── Annotations hidden notice ───────────────────────────────────── */}
          {!annotationsVisible && canvasMode === "annotate" && (
            // The overlay is only active in annotate mode. In view mode the PDF
            // canvas renders the saved PDF content directly, which always shows
            // whatever was burned in on the last save — the hide toggle has no
            // effect there (nothing to hide).
            <div className="shrink-0 px-4 pb-1 flex justify-center">
              <div className="flex items-center gap-2 bg-stone-900/90 border border-stone-600/60 rounded-lg px-3 py-1.5 text-xs text-stone-400">
                <EyeOff className="h-3 w-3 shrink-0 text-amber-500" />
                <span>
                  Editing overlay hidden
                  {annotations.length > 0 && <> ({annotations.length} annotation{annotations.length !== 1 ? "s" : ""}) — <span className="text-stone-500">will save to PDF on Done / Esc</span></>}
                </span>
                <button
                  onClick={() => setAnnotationsVisible(true)}
                  className="ml-1 text-amber-400 hover:text-amber-200 font-medium transition"
                >Show</button>
              </div>
            </div>
          )}

          {/* ── Mini-map strip — sits between context bars and bottom toolbar ── */}
          {pdf && miniMapVisible && (
            <div className="shrink-0 px-4 pt-1">
              <MiniMap
                totalPages={pdf.numPages}
                currentPage={currentPage}
                annotations={annotations}
                onGoTo={goTo}
              />
            </div>
          )}

          {/* ── Bottom toolbar ──────────────────────────────────────────────── */}
          <div className="shrink-0 px-4 pb-4 flex justify-center">
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-2xl px-3 py-2 shadow-xl">

              {/* Annotate toggle */}
              {modeBtn("annotate", <MessageSquare className="h-3.5 w-3.5" />, "Annotate", "A")}

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Zoom */}
              <button onClick={() => setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2)))}
                title="Zoom out (−)" aria-label="Zoom out" className="p-1.5 rounded-lg hover:bg-stone-700 transition text-stone-300">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-stone-300 tabular-nums w-10 text-center" aria-live="polite">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2)))}
                title="Zoom in (+)" aria-label="Zoom in" className="p-1.5 rounded-lg hover:bg-stone-700 transition text-stone-300">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button onClick={() => {
                if (!canvasAreaRef.current || !canvasRef.current) return;
                const w = canvasAreaRef.current.clientWidth - 64;
                const pw = canvasRef.current.width / scale;
                setScale(parseFloat(Math.max(0.5, Math.min(w / pw, 4)).toFixed(2)));
              }} title="Fit width" className="px-2 py-1 rounded-lg text-[11px] text-stone-400 hover:text-white hover:bg-stone-700 transition">
                Fit W
              </button>

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Page navigation */}
              <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
                aria-label="Previous page" className="p-1.5 rounded-lg hover:bg-stone-700 transition disabled:opacity-30 text-stone-300">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {editingPage ? (
                <input type="number" value={pageInput} autoFocus min={1} max={pdf.numPages}
                  onChange={e => setPageInput(e.target.value)}
                  onBlur={commitPageInput}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitPageInput();
                    if (e.key === "Escape") { setEditingPage(false); setPageInput(String(currentPage)); }
                  }}
                  className="w-12 rounded bg-stone-700 border border-stone-600 text-center text-xs text-white py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              ) : (
                <button onClick={() => { setEditingPage(true); setPageInput(String(currentPage)); }}
                  title="Click to jump to page"
                  className="text-xs tabular-nums text-stone-300 hover:text-white transition px-1 rounded hover:bg-stone-700 min-w-[4.5rem] text-center">
                  {currentPage} / {pdf.numPages}
                </button>
              )}
              <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= pdf.numPages}
                aria-label="Next page" className="p-1.5 rounded-lg hover:bg-stone-700 transition disabled:opacity-30 text-stone-300">
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Search */}
              <button onClick={() => setSearchOpen(v => !v)} title="Search (Ctrl+F)"
                className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5 transition",
                  searchOpen ? "bg-brand-600 text-white" : "text-stone-400 hover:text-white hover:bg-stone-700")}>
                <Search className="h-3.5 w-3.5" />
                <kbd className={cn(
                  "rounded border px-1 py-0 text-[9px] font-mono leading-4 transition",
                  searchOpen ? "border-white/25 bg-white/10 text-white/70" : "border-stone-600 bg-stone-800 text-stone-500"
                )}>Ctrl+F</kbd>
              </button>

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Command palette */}
              <button onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+Shift+P)"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-700 transition text-stone-500 hover:text-stone-300">
                <Command className="h-3.5 w-3.5" />
                <kbd className="rounded border border-stone-600 bg-stone-800 px-1 py-0 text-[9px] font-mono leading-4 text-stone-500">⌘P</kbd>
              </button>

              {/* Keyboard cheat sheet */}
              <button onClick={() => setCheatSheetOpen(true)} title="Keyboard shortcuts (?)"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-700 transition text-stone-500 hover:text-stone-300">
                <HelpCircle className="h-3.5 w-3.5" />
                <kbd className="rounded border border-stone-600 bg-stone-800 px-1 py-0 text-[9px] font-mono leading-4 text-stone-500">?</kbd>
              </button>
            </div>
          </div>

        </div>

        {/* Right: utility panel (opened via palette) OR persistent navigation rail */}
        {panelTool ? (
          <RightPanel
            tool={panelTool}
            file={(workingFile ?? file)!}
            pageCount={pdf.numPages}
            onClose={() => setPanelTool(null)}
            onApplied={async (blob) => {
              await applyBlob(blob);
              if (panelTool !== "snippets") setPanelTool(null);
            }}
            snippets={settings.snippets}
            onAddSnippet={addSnippet}
            onRemoveSnippet={removeSnippet}
          />
        ) : (
          <RightRail
            annotations={annotations}
            currentPage={currentPage}
            onGoToPage={goTo}
            onFocusAnnot={focusAnnotation}
            onDeleteAnnot={deleteAnnot}
            onStatusChange={changeAnnotStatus}
            onExportReport={() => downloadAnnotationReport(annotations, filename)}
            pdf={pdf}
            bookmarks={bookmarks}
            onAddBookmark={() => addBookmark(currentPage)}
            onDeleteBookmark={removeBookmark}
            onRenameBookmark={renameBookmark}
            activeTab={railTab}
            onTabChange={setRailTab}
          />
        )}

      </div>

      {/* ── QuickActionBar ────────────────────────────────────────────────────── */}
      {quickBar && canvasMode === "annotate" && (
        <div data-quickbar="true">
          <QuickActionBar
            x={quickBar.barX}
            y={quickBar.barY}
            onHighlight={() => createAnnotFromSelection("highlight")}
            onUnderline={() => createAnnotFromSelection("underline")}
            onStrikethrough={() => createAnnotFromSelection("strikethrough")}
            onComment={addNoteAtSelection}
            onCopy={() => { navigator.clipboard.writeText(quickBar.text).catch(() => {}); setQuickBar(null); }}
          />
        </div>
      )}

      {/* ── Keyboard cheat sheet ──────────────────────────────────────────────── */}
      {cheatSheetOpen && (
        <KeyboardCheatSheet onClose={() => setCheatSheetOpen(false)} />
      )}

      {/* ── Command palette ───────────────────────────────────────────────────── */}
      {paletteOpen && pdf && (
        <CommandPalette
          commands={buildPaletteCommands()}
          snippets={settings.snippets}
          pageCount={pdf.numPages}
          onGoToPage={p => { goTo(p); setPaletteOpen(false); }}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {/* ── Settings dialog ──────────────────────────────────────────────────── */}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* ── Unsaved-changes guard modal ───────────────────────────────────────── */}
      {pendingNav && (workingBlob || annotations.length > 0) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved changes"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70"
          onClick={e => { if (e.target === e.currentTarget) setPendingNav(null); }}
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[380px] p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Modified PDF — download before leaving?</h2>
              <p className="mt-1.5 text-xs text-stone-400 leading-relaxed">
                {workingBlob
                  ? <>You have a modified version of <span className="text-stone-300 font-medium">{filename}</span> that hasn't been downloaded.</>
                  : <>You have <span className="text-stone-300 font-medium">{annotations.length} unsaved annotation{annotations.length !== 1 ? "s" : ""}</span> that haven't been burned into the PDF yet.</>
                }
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (workingBlob) downloadBlob(workingBlob, filename);
                  const nav = pendingNav;
                  setPendingNav(null);
                  setTimeout(() => doNavigate(nav), 80);
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition shadow-lg"
              >
                <Download className="h-3.5 w-3.5" /> Download, then leave
              </button>
              <button
                onClick={() => { const nav = pendingNav; setPendingNav(null); doNavigate(nav); }}
                className="rounded-xl bg-stone-700 hover:bg-stone-600 border border-stone-600 px-4 py-2.5 text-xs font-medium text-stone-300 transition"
              >
                Leave without downloading
              </button>
              <button
                onClick={() => setPendingNav(null)}
                className="rounded-xl px-4 py-2 text-xs text-stone-500 hover:text-stone-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Command palette command list ───────────────────────────────────────────
  function buildPaletteCommands(): PaletteCommand[] {
    const go = (m: CanvasMode, sub?: CreateMode) => () => {
      switchMode(m);
      if (sub) setAnnotateSubMode(sub);
      setPaletteOpen(false);
    };
    return [
      { id: "view",         label: "View mode",        description: "Read the document (V)",         category: "Modes",      action: go("view") },
      { id: "annotate",     label: "Annotate mode",    description: "Mark up the document (A)",       category: "Modes",      action: go("annotate") },
      { id: "redact",       label: "Redact mode",      description: "Black out content (R)",          category: "Modes",      action: go("redact") },
      { id: "crop",         label: "Crop mode",        description: "Crop page area (C)",             category: "Modes",      action: go("crop") },
      { id: "highlight",    label: "Highlight",        description: "Yellow text highlight (H)",      category: "Annotate",   action: go("annotate", "highlight") },
      { id: "note",         label: "Note",             description: "Place a comment pin (A)",        category: "Annotate",   action: go("annotate", "note") },
      { id: "underline",    label: "Underline",        description: "Underline text (U)",             category: "Annotate",   action: go("annotate", "underline") },
      { id: "strikethrough",label: "Strikethrough",    description: "Strike through text (S)",        category: "Annotate",   action: go("annotate", "strikethrough") },
      { id: "freetext",     label: "Text box",         description: "Drag to place a text box (T)",   category: "Annotate",   action: go("annotate", "freetext") },
      { id: "ink",          label: "Draw / Ink",       description: "Freehand drawing (I)",           category: "Annotate",   action: go("annotate", "ink") },
      { id: "shape",        label: "Shape",            description: "Draw rect / ellipse / arrow",    category: "Annotate",   action: go("annotate", "shape") },
      { id: "stamp",        label: "Stamp",            description: "Place a stamp label",            category: "Annotate",   action: go("annotate", "stamp") },
      { id: "search",       label: "Search text",       description: "Find text in document (Ctrl+F)", category: "Navigation", action: () => { setSearchOpen(true); setPaletteOpen(false); } },
      { id: "cheatsheet",   label: "Keyboard shortcuts",description: "Show all key bindings (?)",     category: "Help",       action: () => { setCheatSheetOpen(true); setPaletteOpen(false); } },
      { id: "annotations",  label: "Annotations panel", description: "View all annotations",          category: "Navigation", action: () => { setRailTab("annotations"); setPaletteOpen(false); } },
      { id: "outline",      label: "Table of contents", description: "PDF outline / bookmarks tree",  category: "Navigation", action: () => { setRailTab("outline"); setPaletteOpen(false); } },
      { id: "bookmarks",    label: "Bookmarks",         description: "Jump to user-created bookmarks",category: "Navigation", action: () => { setRailTab("bookmarks"); setPaletteOpen(false); } },
      { id: "bm-add",       label: "Bookmark this page",description: `Bookmark page ${currentPage}`,  category: "Bookmarks",  action: () => { addBookmark(currentPage); setPaletteOpen(false); } },
      { id: "snippets",     label: "Comment snippets",  description: "Manage reusable comment text",  category: "Tools",      action: () => { togglePanel("snippets"); setPaletteOpen(false); } },
      { id: "compress",     label: "Compress PDF",      description: "Reduce file size",              category: "Tools",      action: () => { togglePanel("compress"); setPaletteOpen(false); } },
      { id: "watermark",    label: "Add Watermark",     description: "Add text watermark to pages",   category: "Tools",      action: () => { togglePanel("watermark"); setPaletteOpen(false); } },
      { id: "split-pdf",    label: "Split PDF",         description: "Split into multiple files",     category: "Tools",      action: () => { togglePanel("split"); setPaletteOpen(false); } },
      { id: "extract-pages",label: "Extract Pages",     description: "Extract a page range to PDF",   category: "Tools",      action: () => { togglePanel("extract"); setPaletteOpen(false); } },
      { id: "rotate-del",   label: "Rotate / Delete",   description: "Rotate or delete pages",        category: "Tools",      action: () => { togglePanel("rotate-delete"); setPaletteOpen(false); } },
      { id: "security",     label: "Security / Encrypt",description: "Encrypt or decrypt the PDF",    category: "Tools",      action: () => { togglePanel("security"); setPaletteOpen(false); } },
      { id: "to-images",    label: "Export to Images",  description: "Convert pages to PNG / JPEG",   category: "Tools",      action: () => { togglePanel("pdf-to-images"); setPaletteOpen(false); } },
      { id: "minimap",      label: "Toggle mini-map",   description: "Show/hide the page-position strip", category: "Navigation", action: () => { setMiniMapVisible(v => !v); setPaletteOpen(false); } },
      { id: "settings",     label: "Preferences",       description: "Author name, colour labels",    category: "Tools",      action: () => { setSettingsOpen(true); setPaletteOpen(false); } },
      { id: "export",       label: "Export report",     description: "Download annotations as .md",   category: "Export",     action: () => { downloadAnnotationReport(annotations, filename); setPaletteOpen(false); } },
      ...(workingBlob ? [{
        id: "download", label: "Download PDF", description: "Save modified PDF (Ctrl+S)", category: "Export",
        action: () => { downloadBlob(workingBlob, filename); setPaletteOpen(false); },
      }] : []),
    ];
  }
}
