import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, Link } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useDropzone } from "react-dropzone";
import {
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, UploadCloud,
  Eye, MessageSquare, EyeOff, Crop, AlignLeft,
  Minimize2, Stamp, Scissors, FileOutput, RotateCw, Lock, FileImage,
  ExternalLink, Loader2, Highlighter, Type, Pencil, Check, X, Download,
  Underline, Strikethrough, Search, HelpCircle, List, User, FileText,
  PenLine, Square, BookOpen, Bookmark, Command, Quote,
} from "lucide-react";
import { cn, downloadBlob } from "../lib/utils";
import ThumbnailSidebar from "../components/ThumbnailSidebar";
import RightPanel, { type PanelTool } from "../components/RightPanel";
import AnnotationLayer, {
  type LocalAnnot, type HlColor, type CreateMode, type AnnotId, type AnnotStatus,
  type FracRect, type ShapeSubType, newId, boundingBox, STAMP_LABELS,
} from "../components/AnnotationLayer";
import TextLayer from "../components/TextLayer";
import QuickActionBar from "../components/QuickActionBar";
import SearchBar, { type SearchResult } from "../components/SearchBar";
import KeyboardCheatSheet from "../components/KeyboardCheatSheet";
import CommandPalette, { type PaletteCommand } from "../components/CommandPalette";
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

  // ── Canvas modes ───────────────────────────────────────────────────────────
  const [canvasMode, setCanvasMode]           = useState<CanvasMode>("view");
  const [annotateSubMode, setAnnotateSubMode] = useState<CreateMode>("note");
  const [hlColor, setHlColor]                 = useState(0);
  const [shapeSubType, setShapeSubType]       = useState<ShapeSubType>("rect");
  const [stampLabel, setStampLabel]           = useState(STAMP_LABELS[0]);
  const [inkStrokeWidth, setInkStrokeWidth]   = useState(2);

  // ── Command palette ────────────────────────────────────────────────────────
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── Annotations ────────────────────────────────────────────────────────────
  const [annotations, setAnnotations]         = useState<LocalAnnot[]>([]);
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

  // ── Working file ──────────────────────────────────────────────────────────
  const workingFile = useMemo<File | null>(() => {
    if (!file) return null;
    if (!workingBlob) return file;
    return new File([workingBlob], filename, { type: "application/pdf" });
  }, [file, workingBlob, filename]);

  // ── Load from router state ────────────────────────────────────────────────
  useEffect(() => {
    const stateFile = (location.state as { file?: File } | null)?.file;
    if (stateFile) loadFile(stateFile);
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
          setAnnotations(prev => prev.slice(0, -1));
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

      // ── Mode shortcuts (no modifier) ──────────────────────────────────
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") { e.preventDefault(); switchModeRef.current("view"); return; }
        if (e.key === "a" || e.key === "A") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("note"); return; }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("highlight"); return; }
        if (e.key === "u" || e.key === "U") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("underline"); return; }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("strikethrough"); return; }
        if (e.key === "t" || e.key === "T") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("freetext"); return; }
        if (e.key === "i" || e.key === "I") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("ink"); return; }
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
      setAnnotateError("Backend not running — start it: cd backend && uvicorn main:app --port 7341");
      return;
    }
    setAutoSaving(true); setAnnotateError(null);
    try {
      const blob = await annotatePDF(workingFile, toApiAnnotations(annotations));
      await applyBlob(blob);
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
        rects, colorIdx: hlColor, color: HIGHLIGHT_COLORS[hlColor].rgb,
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

  function deleteAnnot(id: AnnotId) {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }

  function changeAnnotStatus(id: AnnotId, status: AnnotStatus) {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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

  const panelBtn = (t: NonNullable<PanelTool>, icon: React.ReactNode, label: string) => (
    <button key={t} onClick={() => togglePanel(t)} title={label}
      className={cn(
        "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition",
        panelTool === t ? "bg-brand-600 text-white" : "text-stone-400 hover:text-white hover:bg-stone-700"
      )}>
      {icon}
      <span className="hidden sm:inline ml-1">{label}</span>
    </button>
  );

  const sidebarFile = workingFile ?? file;

  return (
    <div className="h-screen flex flex-col bg-stone-800 overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="bg-stone-900 border-b border-stone-700 px-4 py-2 flex items-center gap-3 shrink-0">
        <Link to="/" className="shrink-0 text-stone-400 hover:text-white transition flex items-center gap-1 text-xs">
          <ChevronLeft className="h-3.5 w-3.5" /> Home
        </Link>
        <div className="w-px h-4 bg-stone-700" />

        {/* Editable filename */}
        {editingFilename ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input autoFocus value={filenameInput}
              onChange={e => setFilenameInput(e.target.value)}
              onBlur={commitFilename}
              onKeyDown={e => { if (e.key === "Enter") commitFilename(); if (e.key === "Escape") setEditingFilename(false); }}
              className="flex-1 min-w-0 bg-stone-800 border border-brand-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button onClick={commitFilename} className="shrink-0 text-green-400 hover:text-green-300 transition"><Check className="h-4 w-4" /></button>
            <button onClick={() => setEditingFilename(false)} className="shrink-0 text-stone-400 hover:text-white transition"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button onClick={() => { setFilenameInput(filename); setEditingFilename(true); }} title="Click to rename"
            className="flex items-center gap-1.5 group min-w-0 flex-1 text-left">
            <span className="text-sm text-stone-200 truncate group-hover:text-white transition">{filename}</span>
            <Pencil className="h-3 w-3 text-stone-600 group-hover:text-stone-300 shrink-0 transition" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Author badge */}
          {editingAuthor ? (
            <div className="flex items-center gap-1">
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
                className="w-28 bg-stone-800 border border-brand-500 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ) : (
            <button
              onClick={() => { setAuthorInput(settings.author); setEditingAuthor(true); }}
              title="Set your name for annotations"
              className="flex items-center gap-1 text-[10px] text-stone-500 hover:text-stone-300 transition"
            >
              <User className="h-3 w-3" />
              <span className="hidden sm:inline">{settings.author || "Set name"}</span>
            </button>
          )}

          {/* Backend status dot */}
          <div
            title={
              backendOk === null  ? "Checking backend…" :
              backendOk           ? "Backend connected" :
              "Backend offline — run: cd backend && .venv\\Scripts\\uvicorn main:app --port 7341"
            }
            className={cn(
              "w-2 h-2 rounded-full shrink-0 transition-colors",
              backendOk === null  ? "bg-stone-600" :
              backendOk           ? "bg-green-500" :
              "bg-red-500 animate-pulse"
            )}
          />
          {rendering && <span className="text-[10px] text-stone-500 animate-pulse">Rendering…</span>}

          {/* Download button */}
          {workingBlob && (
            <button
              onClick={() => downloadBlob(workingBlob, filename)}
              title="Download modified PDF (Ctrl+S)"
              className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-500 px-3 py-1.5 text-xs font-semibold text-white transition shadow-lg"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </button>
          )}

          {/* Export report */}
          {annotations.length > 0 && (
            <button
              onClick={() => downloadAnnotationReport(annotations, filename)}
              title="Export review report as Markdown"
              className="flex items-center gap-1.5 rounded-lg bg-stone-700 hover:bg-stone-600 px-2.5 py-1.5 text-xs text-stone-300 hover:text-white transition"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Report</span>
            </button>
          )}

          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <button className="text-xs px-2.5 py-1.5 rounded bg-stone-700 hover:bg-stone-600 transition text-stone-300">Open…</button>
          </div>
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
                  highlightColors={HIGHLIGHT_COLORS}
                  onAnnotationsChange={setAnnotations}
                  textSelectActive={textSelectActive}
                  author={settings.author}
                  shapeSubType={shapeSubType}
                  inkStrokeWidth={inkStrokeWidth}
                  stampLabel={stampLabel}
                  snippets={settings.snippets}
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
                      <div className="absolute" style={{ left: `${displayCrop.x0 * 100}%`, top: `${displayCrop.y0 * 100}%`, width: `${(displayCrop.x1 - displayCrop.x0) * 100}%`, height: `${(displayCrop.y1 - displayCrop.y0) * 100}%`, border: "2px solid #3b82f6" }} />
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
                    { m: "shape"         as CreateMode, icon: <Square        className="h-3.5 w-3.5" />, label: "Shape",     key: "" },
                    { m: "stamp"         as CreateMode, icon: <Stamp         className="h-3.5 w-3.5" />, label: "Stamp",     key: "" },
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
                    {HIGHLIGHT_COLORS.map((c, i) => (
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
                      {annotations.length > 0 && <span className="text-stone-600 ml-1">· auto-saves on exit</span>}
                    </span>
                  )}
                  {annotateError && (
                    <span className="text-xs text-red-400 max-w-56 truncate cursor-help" title={annotateError}>⚠ {annotateError}</span>
                  )}
                  {annotations.length > 0 && !autoSaving && (
                    <>
                      <button onClick={() => setAnnotations(prev => prev.slice(0, -1))} title="Undo last (Ctrl+Z)"
                        className="text-xs text-stone-500 hover:text-stone-300 transition">Undo</button>
                      <button onClick={() => setAnnotations([])}
                        className="text-xs text-stone-500 hover:text-stone-300 transition">Clear all</button>
                    </>
                  )}
                  {annotateError && annotations.length > 0 && (
                    <button onClick={() => autoSaveAnnotations("view")} disabled={autoSaving}
                      className="flex items-center gap-1 rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                      <Check className="h-3 w-3" /> Retry Save
                    </button>
                  )}
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
                      <button onClick={applyRedactions} disabled={redactLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition">
                        {redactLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                        Apply Redactions
                      </button>
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
                      <button onClick={applyCrop} disabled={cropLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 transition">
                        {cropLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />}
                        Apply Crop
                      </button>
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

          {/* ── Bottom toolbar ──────────────────────────────────────────────── */}
          <div className="shrink-0 px-4 pb-4 flex justify-center">
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-2xl px-3 py-2 shadow-xl flex-wrap">

              {modeBtn("view",     <Eye className="h-3.5 w-3.5" />,          "View",     "V")}
              {modeBtn("annotate", <MessageSquare className="h-3.5 w-3.5" />, "Annotate", "A")}
              {modeBtn("redact",   <EyeOff className="h-3.5 w-3.5" />,       "Redact",   "R")}
              {modeBtn("crop",     <Crop className="h-3.5 w-3.5" />,          "Crop",     "C")}

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Zoom */}
              <button onClick={() => setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2)))}
                title="Zoom out (−)" className="p-1.5 rounded-lg hover:bg-stone-700 transition text-stone-300">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-stone-300 tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2)))}
                title="Zoom in (+)" className="p-1.5 rounded-lg hover:bg-stone-700 transition text-stone-300">
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
                className="p-1.5 rounded-lg hover:bg-stone-700 transition disabled:opacity-30 text-stone-300">
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
                className="p-1.5 rounded-lg hover:bg-stone-700 transition disabled:opacity-30 text-stone-300">
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
                )}>^F</kbd>
              </button>

              {/* Navigation panels */}
              {panelBtn("annotations", <List     className="h-3.5 w-3.5" />, "Annotations")}
              {panelBtn("outline",     <BookOpen className="h-3.5 w-3.5" />, "Outline")}
              {panelBtn("bookmarks",   <Bookmark className="h-3.5 w-3.5" />, "Bookmarks")}
              {panelBtn("snippets",    <Quote    className="h-3.5 w-3.5" />, "Snippets")}

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* Panel tool buttons */}
              {panelBtn("compress",      <Minimize2 className="h-3.5 w-3.5" />,  "Compress")}
              {panelBtn("watermark",     <Stamp className="h-3.5 w-3.5" />,      "Watermark")}
              {panelBtn("split",         <Scissors className="h-3.5 w-3.5" />,   "Split")}
              {panelBtn("extract",       <FileOutput className="h-3.5 w-3.5" />, "Extract")}
              {panelBtn("rotate-delete", <RotateCw className="h-3.5 w-3.5" />,   "Rotate/Del")}
              {panelBtn("security",      <Lock className="h-3.5 w-3.5" />,       "Security")}
              {panelBtn("pdf-to-images", <FileImage className="h-3.5 w-3.5" />,  "→ Images")}

              <div className="w-px h-5 bg-stone-700 mx-0.5" />

              {/* External links */}
              <Link to="/rearrange" state={{ file: workingFile ?? file }}
                title="Rearrange pages"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:text-white hover:bg-stone-700 transition">
                <AlignLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Rearrange</span>
                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </Link>
              <Link to="/merge" state={{ file: workingFile ?? file }}
                title="Merge with other PDFs"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:text-white hover:bg-stone-700 transition">
                <span className="hidden sm:inline">Merge</span>
                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </Link>

              {/* Command palette */}
              <button onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+Shift+P)"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-stone-700 transition text-stone-500 hover:text-stone-300">
                <Command className="h-3.5 w-3.5" />
                <kbd className="rounded border border-stone-600 bg-stone-800 px-1 py-0 text-[9px] font-mono leading-4 text-stone-500">^⇧P</kbd>
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

        {/* Right: tool panel */}
        {panelTool && (
          <RightPanel
            tool={panelTool}
            file={workingFile ?? file}
            pageCount={pdf.numPages}
            onClose={() => setPanelTool(null)}
            onApplied={async (blob) => {
              await applyBlob(blob);
              if (panelTool !== "annotations" && panelTool !== "outline" && panelTool !== "bookmarks" && panelTool !== "snippets")
                setPanelTool(null);
            }}
            // Annotations panel props
            annotations={annotations}
            currentPage={currentPage}
            onGoToPage={goTo}
            onDeleteAnnot={deleteAnnot}
            onStatusChange={changeAnnotStatus}
            onExportReport={() => downloadAnnotationReport(annotations, filename)}
            // Outline panel
            pdf={pdf}
            // Bookmarks panel
            bookmarks={bookmarks}
            onAddBookmark={() => addBookmark(currentPage)}
            onDeleteBookmark={removeBookmark}
            onRenameBookmark={renameBookmark}
            // Snippets panel
            snippets={settings.snippets}
            onAddSnippet={addSnippet}
            onRemoveSnippet={removeSnippet}
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
      { id: "search",       label: "Search text",      description: "Find text in document (Ctrl+F)", category: "Navigation", action: () => { setSearchOpen(true); setPaletteOpen(false); } },
      { id: "cheatsheet",   label: "Keyboard shortcuts",description: "Show all key bindings (?)",     category: "Help",       action: () => { setCheatSheetOpen(true); setPaletteOpen(false); } },
      { id: "outline",      label: "Table of contents",description: "Open the PDF outline panel",     category: "Navigation", action: () => { togglePanel("outline"); setPaletteOpen(false); } },
      { id: "bookmarks",    label: "Bookmarks",        description: "Open the bookmarks panel",       category: "Navigation", action: () => { togglePanel("bookmarks"); setPaletteOpen(false); } },
      { id: "annotations",  label: "Annotations panel",description: "Open the annotations sidebar",   category: "Navigation", action: () => { togglePanel("annotations"); setPaletteOpen(false); } },
      { id: "bm-add",       label: "Bookmark this page",description: `Bookmark page ${currentPage}`,  category: "Bookmarks",  action: () => { addBookmark(currentPage); setPaletteOpen(false); } },
      { id: "snippets",     label: "Comment snippets", description: "Manage reusable comment text",  category: "Navigation", action: () => { togglePanel("snippets"); setPaletteOpen(false); } },
      { id: "export",       label: "Export report",    description: "Download annotations as .md",    category: "Export",     action: () => { downloadAnnotationReport(annotations, filename); setPaletteOpen(false); } },
      ...(workingBlob ? [{
        id: "download", label: "Download PDF", description: "Save modified PDF (Ctrl+S)", category: "Export",
        action: () => { downloadBlob(workingBlob, filename); setPaletteOpen(false); },
      }] : []),
    ];
  }
}
