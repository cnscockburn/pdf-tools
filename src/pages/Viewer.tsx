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
} from "lucide-react";
import { cn, downloadBlob } from "../lib/utils";
import ThumbnailSidebar from "../components/ThumbnailSidebar";
import RightPanel, { type PanelTool } from "../components/RightPanel";
import AnnotationLayer, {
  type LocalAnnot, type HlColor, type CreateMode,
} from "../components/AnnotationLayer";
import { annotatePDF, redactPDF, cropPDF, checkHealth, type Annotation, type RedactRegion } from "../api/client";

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
    if (a.type === "note")      return { type: "note",      page: a.page, x: a.x, y: a.y, text: a.text };
    if (a.type === "highlight") return { type: "highlight", page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, color: a.color };
    return                             { type: "freetext",  page: a.page, x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, text: a.text };
  });
}

type RedactBox = { id: string; page: number; x0: number; y0: number; x1: number; y1: number };
let _rid = 0;
const newRid = () => `r${++_rid}`;

type CropSel = { x0: number; y0: number; x1: number; y1: number };

export default function Viewer() {
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

  // ── Annotations ────────────────────────────────────────────────────────────
  const [annotations, setAnnotations]         = useState<LocalAnnot[]>([]);
  const [autoSaving, setAutoSaving]           = useState(false);
  const [annotateError, setAnnotateError]     = useState<string | null>(null);

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

  // ── Ref to latest switchMode (so keyboard handler is always current) ────────
  const switchModeRef = useRef<(m: CanvasMode) => void>(() => {});

  // ── Keyboard shortcut state ref (avoids stale closures in stable handler) ──
  const kbRef = useRef({
    currentPage: 1,
    pdf:           null as PDFDocumentProxy | null,
    workingBlob:   null as Blob | null,
    filename:      "",
    selectedRedact: null as string | null,
  });
  kbRef.current = { currentPage, pdf, workingBlob, filename, selectedRedact };

  // ── Working file (original file or blob-wrapped replacement) ───────────────
  const workingFile = useMemo<File | null>(() => {
    if (!file) return null;
    if (!workingBlob) return file;
    return new File([workingBlob], filename, { type: "application/pdf" });
  }, [file, workingBlob, filename]);

  // ── Load from router state ─────────────────────────────────────────────────
  useEffect(() => {
    const stateFile = (location.state as { file?: File } | null)?.file;
    if (stateFile) loadFile(stateFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PDF canvas render ──────────────────────────────────────────────────────
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
        // Disable PDF.js annotation rendering while the interactive AnnotationLayer
        // overlay is active — prevents double-drawing baked-in annotations.
        // In view mode let PDF.js render them normally so they're always visible.
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
  // canvasMode added: switching modes must re-render with/without annotation appearances.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, currentPage, scale, canvasMode]);

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

  // ── Keyboard shortcuts (stable handler via ref) ────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const { currentPage, pdf, workingBlob, filename, selectedRedact } = kbRef.current;

      // ── Mode shortcuts (no modifier) ────────────────────────────────────
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") { e.preventDefault(); switchModeRef.current("view"); return; }
        if (e.key === "a" || e.key === "A") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("note"); return; }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("highlight"); return; }
        if (e.key === "t" || e.key === "T") { e.preventDefault(); switchModeRef.current("annotate"); setAnnotateSubMode("freetext"); return; }
        if (e.key === "r" || e.key === "R") { e.preventDefault(); switchModeRef.current("redact"); return; }
        if (e.key === "c" || e.key === "C") { e.preventDefault(); switchModeRef.current("crop"); return; }
        if (e.key === "+" || e.key === "=") { setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2))); return; }
        if (e.key === "-")                  { setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2))); return; }
      }
      if (e.key === "Escape") { switchModeRef.current("view"); return; }

      // ── Ctrl/Cmd shortcuts ───────────────────────────────────────────────
      if (e.ctrlKey || e.metaKey) {
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

      // ── Navigation ──────────────────────────────────────────────────────
      if (!pdf) return;
      const nav = (delta: number) => {
        const p = Math.max(1, Math.min(currentPage + delta, pdf.numPages));
        setCurrentPage(p); setPageInput(String(p));
      };
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); nav(+1); return; }
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp"   || e.key === "PageUp")   { e.preventDefault(); nav(-1); return; }
      if (e.key === "Home") { e.preventDefault(); setCurrentPage(1);             setPageInput("1");                    return; }
      if (e.key === "End")  { e.preventDefault(); setCurrentPage(pdf.numPages); setPageInput(String(pdf.numPages)); return; }

      // ── Delete selected redact box ───────────────────────────────────────
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRedact) {
        e.preventDefault();
        setRedactBoxes(prev => prev.filter(b => b.id !== selectedRedact));
        setSelectedRedact(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally empty deps — state values accessed via kbRef; setters are stable.

  // ── Helpers ────────────────────────────────────────────────────────────────
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
    const buf = await f.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    setPdf(doc);
  }

  /** Replace the working document with a new blob, reloading the PDF viewer. */
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

  /** Raw synchronous mode switch — no auto-save logic. */
  function doSwitchMode(m: CanvasMode) {
    setCanvasMode(m);
    setCropSelection(null);
    setCropLive(null);
    setRedactLive(null);
    setSelectedRedact(null);
    setAnnotateError(null);
    setRedactError(null);
    setCropError(null);
  }

  /**
   * Smart mode switch — if leaving annotate mode with pending annotations,
   * auto-saves them first, then switches. Blocks concurrent saves.
   */
  function switchMode(m: CanvasMode) {
    if (autoSaving) return;
    if (canvasMode === "annotate" && m !== "annotate" && annotations.length > 0 && workingFile) {
      autoSaveAnnotations(m);
      return;
    }
    doSwitchMode(m);
  }
  // Keep ref in sync so keyboard handler always calls current version
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

  // ── Apply operations (each updates the working blob) ──────────────────────

  /** Auto-save annotations to the working blob, then switch to targetMode. */
  async function autoSaveAnnotations(targetMode: CanvasMode) {
    if (!workingFile || annotations.length === 0) { doSwitchMode(targetMode); return; }
    if (backendOk === false) {
      setAnnotateError("Backend not running — start it: cd backend && uvicorn main:app --port 7341");
      return;
    }
    setAutoSaving(true); setAnnotateError(null);
    try {
      const blob = await annotatePDF(workingFile, toApiAnnotations(annotations));
      // Do NOT clear annotations — they remain editable. The backend uses replace
      // semantics (clears existing PDF annotations then writes the current set),
      // so re-saving the same list is always safe and idempotent.
      await applyBlob(blob);
      doSwitchMode(targetMode);
    } catch (e) {
      setAnnotateError(e instanceof Error ? e.message : "Unknown error");
      // Stay in annotate mode so the user can see the error and retry
    } finally { setAutoSaving(false); }
  }

  async function applyRedactions() {
    if (!workingFile || redactBoxes.length === 0) return;
    setRedactLoading(true); setRedactError(null);
    try {
      const regions: RedactRegion[] = redactBoxes.map(b => ({
        page: b.page, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
      }));
      const blob = await redactPDF(workingFile, regions);
      setRedactBoxes([]);
      await applyBlob(blob);
      switchMode("view");
    } catch (e) {
      setRedactError(e instanceof Error ? e.message : "Unknown error");
    } finally { setRedactLoading(false); }
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
    } catch (e) {
      setCropError(e instanceof Error ? e.message : "Unknown error");
    } finally { setCropLoading(false); }
  }

  // ── Drop zone ──────────────────────────────────────────────────────────────
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: ([f]) => f && loadFile(f),
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  // ── Overlay coordinate helper ──────────────────────────────────────────────
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
      setRedactLive({
        x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
        x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
      });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!redactDragRef.current) return;
      redactDragRef.current = null;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      const box = {
        x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
        x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
      };
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
      setCropLive({
        x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
        x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
      });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!cropDragRef.current) return;
      cropDragRef.current = null;
      const cur = overlayFrac(el, me.clientX, me.clientY);
      const sel = {
        x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
        x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
      };
      setCropLive(null);
      if (sel.x1 - sel.x0 > 0.01 && sel.y1 - sel.y0 > 0.005) setCropSelection(sel);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const pageRedactBoxes = redactBoxes.filter(b => b.page === currentPage);
  const displayCrop     = cropLive ?? cropSelection;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!pdf || !file) {
    return (
      <div className="min-h-screen bg-gray-800 flex flex-col">
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition">
            <ChevronLeft className="h-4 w-4" /> All tools
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div {...getRootProps()} className={cn(
            "border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all max-w-sm w-full",
            isDragActive ? "border-blue-400 bg-gray-700" : "border-gray-500 hover:border-blue-400 hover:bg-gray-700"
          )}>
            <input {...getInputProps()} />
            <UploadCloud className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <p className="font-medium text-gray-300">{isDragActive ? "Drop PDF here" : "Open a PDF to get started"}</p>
            <p className="mt-1 text-sm text-gray-500">Click or drag and drop</p>
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
        canvasMode === m ? "bg-blue-600 text-white shadow" : "text-gray-300 hover:bg-gray-700"
      )}>
      {icon} {label}
    </button>
  );

  const panelBtn = (t: NonNullable<PanelTool>, icon: React.ReactNode, label: string) => (
    <button key={t} onClick={() => togglePanel(t)} title={label}
      className={cn(
        "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition",
        panelTool === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
      )}>
      {icon}
      <span className="hidden sm:inline ml-1">{label}</span>
    </button>
  );

  const sidebarFile = workingFile ?? file;

  return (
    <div className="h-screen flex flex-col bg-gray-800 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center gap-3 shrink-0">
        <Link to="/" className="shrink-0 text-gray-400 hover:text-white transition flex items-center gap-1 text-xs">
          <ChevronLeft className="h-3.5 w-3.5" /> Home
        </Link>
        <div className="w-px h-4 bg-gray-700" />

        {/* Editable filename */}
        {editingFilename ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input autoFocus value={filenameInput}
              onChange={e => setFilenameInput(e.target.value)}
              onBlur={commitFilename}
              onKeyDown={e => { if (e.key === "Enter") commitFilename(); if (e.key === "Escape") setEditingFilename(false); }}
              className="flex-1 min-w-0 bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={commitFilename} className="shrink-0 text-green-400 hover:text-green-300 transition"><Check className="h-4 w-4" /></button>
            <button onClick={() => setEditingFilename(false)} className="shrink-0 text-gray-400 hover:text-white transition"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button onClick={() => { setFilenameInput(filename); setEditingFilename(true); }} title="Click to rename"
            className="flex items-center gap-1.5 group min-w-0 flex-1 text-left">
            <span className="text-sm text-gray-200 truncate group-hover:text-white transition">{filename}</span>
            <Pencil className="h-3 w-3 text-gray-600 group-hover:text-gray-300 shrink-0 transition" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Backend status dot */}
          <div
            title={
              backendOk === null  ? "Checking backend…" :
              backendOk           ? "Backend connected" :
              "Backend offline — run: cd backend && .venv\\Scripts\\uvicorn main:app --port 7341"
            }
            className={cn(
              "w-2 h-2 rounded-full shrink-0 transition-colors",
              backendOk === null  ? "bg-gray-600" :
              backendOk           ? "bg-green-500" :
              "bg-red-500 animate-pulse"
            )}
          />
          {rendering && <span className="text-[10px] text-gray-500 animate-pulse">Rendering…</span>}

          {/* Download button — shown when there are unsaved changes */}
          {workingBlob && (
            <button
              onClick={() => downloadBlob(workingBlob, filename)}
              title="Download modified PDF (Ctrl+S)"
              className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-500 px-3 py-1.5 text-xs font-semibold text-white transition shadow-lg"
            >
              <Download className="h-3.5 w-3.5" /> Download PDF
            </button>
          )}

          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <button className="text-xs px-2.5 py-1.5 rounded bg-gray-700 hover:bg-gray-600 transition text-gray-300">Open…</button>
          </div>
        </div>
      </div>

      {/* ── Middle: sidebar + canvas + right panel ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: thumbnail sidebar — shows working document */}
        <ThumbnailSidebar
          file={sidebarFile}
          currentPage={currentPage}
          onSelect={goTo}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
        />

        {/* Center: canvas + context bars + bottom toolbar */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Canvas scroll area */}
          <div ref={canvasAreaRef} className="flex-1 overflow-auto flex flex-col items-center py-8 px-4">
            {/* Unified canvas wrapper — overlays sit on top */}
            <div ref={canvasWrapRef} className="relative inline-block shadow-2xl rounded" style={{ lineHeight: 0 }}>
              <canvas ref={canvasRef} className="rounded block" />

              {/* ── Annotate overlay ───────────────────────────────────────── */}
              {canvasMode === "annotate" && (
                <AnnotationLayer
                  annotations={annotations}
                  page={currentPage}
                  createMode={annotateSubMode}
                  hlColorIdx={hlColor}
                  highlightColors={HIGHLIGHT_COLORS}
                  onAnnotationsChange={setAnnotations}
                />
              )}

              {/* ── Redact overlay ─────────────────────────────────────────── */}
              {canvasMode === "redact" && (
                <div className="absolute inset-0 cursor-crosshair" style={{ userSelect: "none" }}
                  onMouseDown={onRedactDown}
                >
                  {pageRedactBoxes.map(box => (
                    <div key={box.id} data-rbox="true"
                      className={cn(
                        "absolute pointer-events-auto",
                        selectedRedact === box.id && "ring-2 ring-offset-0 ring-blue-400"
                      )}
                      style={{
                        left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`,
                        width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%`,
                        background: "rgba(0,0,0,0.88)",
                        cursor: "pointer",
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
                  {/* In-progress drag preview */}
                  {redactLive && (
                    <div className="absolute pointer-events-none" style={{
                      left: `${redactLive.x0 * 100}%`, top: `${redactLive.y0 * 100}%`,
                      width: `${(redactLive.x1 - redactLive.x0) * 100}%`, height: `${(redactLive.y1 - redactLive.y0) * 100}%`,
                      background: "rgba(0,0,0,0.55)",
                      border: "2px dashed rgba(255,255,255,0.4)",
                    }} />
                  )}
                </div>
              )}

              {/* ── Crop overlay ───────────────────────────────────────────── */}
              {canvasMode === "crop" && (
                <div className="absolute inset-0 cursor-crosshair" style={{ userSelect: "none" }}
                  onMouseDown={onCropDown}
                >
                  {/* Dim mask — cut out the selection rect */}
                  {displayCrop && (
                    <div className="absolute inset-0 pointer-events-none" style={{ userSelect: "none" }}>
                      {/* Top strip */}
                      <div className="absolute bg-black/40" style={{ top: 0, left: 0, right: 0, height: `${displayCrop.y0 * 100}%` }} />
                      {/* Bottom strip */}
                      <div className="absolute bg-black/40" style={{ bottom: 0, left: 0, right: 0, top: `${displayCrop.y1 * 100}%` }} />
                      {/* Left strip */}
                      <div className="absolute bg-black/40" style={{
                        top: `${displayCrop.y0 * 100}%`, bottom: `${(1 - displayCrop.y1) * 100}%`,
                        left: 0, width: `${displayCrop.x0 * 100}%`,
                      }} />
                      {/* Right strip */}
                      <div className="absolute bg-black/40" style={{
                        top: `${displayCrop.y0 * 100}%`, bottom: `${(1 - displayCrop.y1) * 100}%`,
                        right: 0, left: `${displayCrop.x1 * 100}%`,
                      }} />
                      {/* Selection border */}
                      <div className="absolute" style={{
                        left: `${displayCrop.x0 * 100}%`, top: `${displayCrop.y0 * 100}%`,
                        width: `${(displayCrop.x1 - displayCrop.x0) * 100}%`,
                        height: `${(displayCrop.y1 - displayCrop.y0) * 100}%`,
                        border: "2px solid #3b82f6",
                      }} />
                    </div>
                  )}
                  {/* No-selection hint */}
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
              <div className="flex flex-wrap items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                {/* Sub-mode */}
                <div className="flex gap-1">
                  {([
                    { m: "note"      as CreateMode, icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Note",      key: "A" },
                    { m: "highlight" as CreateMode, icon: <Highlighter    className="h-3.5 w-3.5" />, label: "Highlight", key: "H" },
                    { m: "freetext"  as CreateMode, icon: <Type           className="h-3.5 w-3.5" />, label: "Text",      key: "T" },
                  ]).map(({ m, icon, label, key }) => (
                    <button key={m} onClick={() => setAnnotateSubMode(m)} title={`${label} (${key})`}
                      className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                        annotateSubMode === m ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600")}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
                {/* Highlight colour swatches */}
                {annotateSubMode === "highlight" && (
                  <div className="flex items-center gap-1">
                    {HIGHLIGHT_COLORS.map((c, i) => (
                      <button key={i} onClick={() => setHlColor(i)} title={c.label}
                        className={cn("h-5 w-5 rounded-full border-2 transition",
                          hlColor === i ? "border-white scale-125" : "border-transparent")}
                        style={{ background: c.bg }} />
                    ))}
                  </div>
                )}
                {/* Controls */}
                <div className="flex items-center gap-2 ml-auto">
                  {/* Auto-save status */}
                  {autoSaving ? (
                    <span className="flex items-center gap-1 text-xs text-blue-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
                      {annotations.length > 0 && <span className="text-gray-600 ml-1">· auto-saves on exit</span>}
                    </span>
                  )}
                  {annotateError && (
                    <span className="text-xs text-red-400 max-w-56 truncate cursor-help" title={annotateError}>
                      ⚠ {annotateError}
                    </span>
                  )}
                  {annotations.length > 0 && !autoSaving && (
                    <>
                      <button onClick={() => setAnnotations(prev => prev.slice(0, -1))} title="Undo last (Ctrl+Z)"
                        className="text-xs text-gray-500 hover:text-gray-300 transition">Undo</button>
                      <button onClick={() => setAnnotations([])}
                        className="text-xs text-gray-500 hover:text-gray-300 transition">Clear all</button>
                    </>
                  )}
                  {annotateError && annotations.length > 0 && (
                    /* Retry button when auto-save failed */
                    <button onClick={() => autoSaveAnnotations("view")} disabled={autoSaving}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition">
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
                      <button onClick={() => setRedactBoxes([])}
                        className="text-xs text-red-400 hover:text-red-300 transition">Clear all</button>
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
              <div className="flex flex-wrap items-center gap-3 bg-blue-950/40 border border-blue-900/40 rounded-xl px-3 py-2 shadow-lg w-full max-w-3xl">
                <Crop className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-xs text-blue-300">
                  {cropSelection ? "Selection drawn — apply or redraw." : "Drag to select the area to keep."}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-blue-300 cursor-pointer">
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} className="accent-blue-500" />
                  All pages
                </label>
                {cropError && <span className="text-xs text-red-400">{cropError}</span>}
                <div className="flex items-center gap-2 ml-auto">
                  {cropSelection && (
                    <>
                      <button onClick={() => setCropSelection(null)}
                        className="text-xs text-blue-400 hover:text-blue-300 transition">Clear</button>
                      <button onClick={applyCrop} disabled={cropLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition">
                        {cropLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />}
                        Apply Crop
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Bottom toolbar — floating pill ──────────────────────────────── */}
          <div className="shrink-0 px-4 pb-4 flex justify-center">
            <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-2xl px-3 py-2 shadow-xl flex-wrap">

              {modeBtn("view",     <Eye className="h-3.5 w-3.5" />,          "View",     "V")}
              {modeBtn("annotate", <MessageSquare className="h-3.5 w-3.5" />, "Annotate", "A")}
              {modeBtn("redact",   <EyeOff className="h-3.5 w-3.5" />,       "Redact",   "R")}
              {modeBtn("crop",     <Crop className="h-3.5 w-3.5" />,          "Crop",     "C")}

              <div className="w-px h-5 bg-gray-700 mx-0.5" />

              {/* Zoom */}
              <button onClick={() => setScale(s => parseFloat(Math.max(s - 0.2, 0.5).toFixed(2)))}
                title="Zoom out (−)" className="p-1.5 rounded-lg hover:bg-gray-700 transition text-gray-300">
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-300 tabular-nums w-10 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => parseFloat(Math.min(s + 0.2, 4).toFixed(2)))}
                title="Zoom in (+)" className="p-1.5 rounded-lg hover:bg-gray-700 transition text-gray-300">
                <ZoomIn className="h-4 w-4" />
              </button>
              <button onClick={() => {
                if (!canvasAreaRef.current || !canvasRef.current) return;
                const w = canvasAreaRef.current.clientWidth - 64;
                const pw = canvasRef.current.width / scale;
                setScale(parseFloat(Math.max(0.5, Math.min(w / pw, 4)).toFixed(2)));
              }} title="Fit width" className="px-2 py-1 rounded-lg text-[11px] text-gray-400 hover:text-white hover:bg-gray-700 transition">
                Fit W
              </button>

              <div className="w-px h-5 bg-gray-700 mx-0.5" />

              {/* Page navigation */}
              <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-700 transition disabled:opacity-30 text-gray-300">
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
                  className="w-12 rounded bg-gray-700 border border-gray-600 text-center text-xs text-white py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <button onClick={() => { setEditingPage(true); setPageInput(String(currentPage)); }}
                  title="Click to jump to page"
                  className="text-xs tabular-nums text-gray-300 hover:text-white transition px-1 rounded hover:bg-gray-700 min-w-[4.5rem] text-center">
                  {currentPage} / {pdf.numPages}
                </button>
              )}
              <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= pdf.numPages}
                className="p-1.5 rounded-lg hover:bg-gray-700 transition disabled:opacity-30 text-gray-300">
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="w-px h-5 bg-gray-700 mx-0.5" />

              {/* Panel tool buttons */}
              {panelBtn("compress",      <Minimize2 className="h-3.5 w-3.5" />,  "Compress")}
              {panelBtn("watermark",     <Stamp className="h-3.5 w-3.5" />,      "Watermark")}
              {panelBtn("split",         <Scissors className="h-3.5 w-3.5" />,   "Split")}
              {panelBtn("extract",       <FileOutput className="h-3.5 w-3.5" />, "Extract")}
              {panelBtn("rotate-delete", <RotateCw className="h-3.5 w-3.5" />,   "Rotate/Del")}
              {panelBtn("security",      <Lock className="h-3.5 w-3.5" />,       "Security")}
              {panelBtn("pdf-to-images", <FileImage className="h-3.5 w-3.5" />,  "→ Images")}

              <div className="w-px h-5 bg-gray-700 mx-0.5" />

              {/* External links */}
              <Link to="/rearrange" state={{ file: workingFile ?? file }}
                title="Rearrange pages (separate view)"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition">
                <AlignLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Rearrange</span>
                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </Link>
              <Link to="/merge" state={{ file: workingFile ?? file }}
                title="Merge with other PDFs"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition">
                <span className="hidden sm:inline">Merge</span>
                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </Link>
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
              setPanelTool(null);
            }}
          />
        )}

      </div>
    </div>
  );
}
