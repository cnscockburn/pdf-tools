/**
 * ContinuousCanvas — renders all pages of a PDF in a scrollable vertical column.
 *
 * Virtualizes rendering: only pages within ±RENDER_BUFFER of the currently
 * visible viewport get actual canvas elements. All other pages render as
 * correctly-sized placeholder divs, so the total scroll height is always
 * accurate without holding every page in memory simultaneously.
 *
 * B1 — Continuous scroll view mode.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import TextLayer from "./TextLayer";
import AnnotationLayer from "./AnnotationLayer";
import type {
  LocalAnnot, HlColor, CreateMode, AnnotId, ShapeSubType,
} from "./AnnotationLayer";
import type { SearchResult } from "./SearchBar";
import type { CanvasMode, RedactBox, CropSel, DiffRegion } from "../lib/viewerTypes";
import type { Snippet } from "../lib/storage";
import { cn } from "../lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────
/** Pages above/below the current viewport that are kept rendered (cached). */
const RENDER_BUFFER = 2;
/** Gap between consecutive page canvases (px). */
const PAGE_GAP = 16;
/** Padding at the top and bottom of the scroll container (px). */
const SCROLL_PADDING = 32;

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ContinuousCanvasProps {
  pdf: PDFDocumentProxy;
  scale: number;

  /** The externally-controlled page cursor (thumbnail clicks, search results, etc.). */
  currentPage: number;
  /** Called when scroll moves to a different page. */
  onPageChange: (page: number) => void;

  // ── Shared mutable refs Viewer needs updated to match the active page ──────
  /** Written with the active page's wrap div so Viewer's QuickActionBar logic works. */
  canvasWrapRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Written with this component's scroll container so Viewer's focusAnnotation + fit logic works. */
  canvasAreaRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Free-rect drag start ref, updated by per-page mouseDown handlers. */
  freeRectDragRef: React.MutableRefObject<{ x: number; y: number } | null>;

  // ── Annotation overlay ─────────────────────────────────────────────────────
  annotations: LocalAnnot[];
  bakedAnnotations: LocalAnnot[];
  onAnnotationsChange: (a: LocalAnnot[]) => void;
  canvasMode: CanvasMode;
  annotateSubMode: CreateMode;
  hlColorIdx: number;
  highlightColors: HlColor[];
  textSelectActive: boolean;
  author: string;
  shapeSubType: ShapeSubType;
  inkStrokeWidth: number;
  inkColor: [number, number, number];
  stampLabel: string;
  snippets: Snippet[];
  annotationsVisible: boolean;
  focusAnnotId: AnnotId | null;
  forceEditAnnotId: AnnotId | null;
  onForceEditConsumed: () => void;
  onNavigateAnnot: (id: AnnotId) => void;
  hasOverlayAnnots: boolean;
  reduceMotion: boolean;

  // ── Search ─────────────────────────────────────────────────────────────────
  searchResults: SearchResult[];
  searchIdx: number;
  searchQuery: string;

  // ── Redact ─────────────────────────────────────────────────────────────────
  redactBoxes: RedactBox[];
  selectedRedact: string | null;
  onRedactBoxesChange: (boxes: RedactBox[]) => void;
  onSelectRedact: (id: string | null) => void;

  // ── Crop ───────────────────────────────────────────────────────────────────
  cropSelection: CropSel | null;
  cropLive: CropSel | null;
  onCropSelChange: (sel: CropSel | null) => void;
  onCropLiveChange: (sel: CropSel | null) => void;

  // ── Diff highlights (B6) ──────────────────────────────────────────────────
  diffHighlights?: Map<number, DiffRegion[]>;

  // ── Misc ───────────────────────────────────────────────────────────────────
  accent?: "amber" | "cyan";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ContinuousCanvas({
  pdf, scale, currentPage, onPageChange,
  canvasWrapRef, canvasAreaRef, freeRectDragRef,
  annotations, bakedAnnotations, onAnnotationsChange,
  canvasMode, annotateSubMode, hlColorIdx, highlightColors,
  textSelectActive, author, shapeSubType, inkStrokeWidth, inkColor,
  stampLabel, snippets, annotationsVisible, focusAnnotId, forceEditAnnotId,
  onForceEditConsumed, onNavigateAnnot, hasOverlayAnnots, reduceMotion,
  searchResults, searchIdx, searchQuery,
  redactBoxes, selectedRedact, onRedactBoxesChange, onSelectRedact,
  cropSelection, cropLive, onCropSelChange, onCropLiveChange,
  diffHighlights,
}: ContinuousCanvasProps) {
  const numPages = pdf.numPages;

  // ── Page height cache ──────────────────────────────────────────────────────
  // Populated by loading all page viewports once. Used for Y-offset calculations
  // and placeholder heights. Array is 0-indexed (page 1 → index 0).
  const [pageHeights, setPageHeights] = useState<number[]>([]);
  const [pageWidths, setPageWidths]   = useState<number[]>([]);
  const estimatedHRef = useRef(900); // fallback height before cache loads

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hs: number[] = [];
      const ws: number[] = [];
      for (let p = 1; p <= numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale });
        hs.push(vp.height);
        ws.push(vp.width);
        if (p === 1) estimatedHRef.current = vp.height;
      }
      if (!cancelled) { setPageHeights(hs); setPageWidths(ws); }
    })();
    return () => { cancelled = true; };
  }, [pdf, scale, numPages]);

  const getH = useCallback((p: number) =>
    pageHeights[p - 1] ?? estimatedHRef.current, [pageHeights]);
  const getW = useCallback((p: number) =>
    pageWidths[p - 1] ?? 0, [pageWidths]);

  // Y-offset from container top to the START of a page's slot.
  const pageYOffset = useCallback((p: number) => {
    let y = SCROLL_PADDING;
    for (let i = 1; i < p; i++) y += getH(i) + PAGE_GAP;
    return y;
  }, [getH]);

  // ── Visible range ──────────────────────────────────────────────────────────
  const [visibleRange, setVisibleRange] = useState({ min: 1, max: Math.min(RENDER_BUFFER + 1, numPages) });

  // ── Scroll container ref ───────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep Viewer's canvasAreaRef pointing to our container div.
  useEffect(() => {
    if (containerRef.current) canvasAreaRef.current = containerRef.current;
  });

  // ── Per-page refs ──────────────────────────────────────────────────────────
  const pageWrapRefs   = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement | null>>(new Map());
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map());

  // Keep Viewer's canvasWrapRef pointing to the current page's wrap div.
  useEffect(() => {
    const el = pageWrapRefs.current.get(currentPage);
    if (el) canvasWrapRef.current = el;
  });

  // ── Canvas rendering ───────────────────────────────────────────────────────
  useEffect(() => {
    if (pageHeights.length === 0) return; // wait for heights to load

    // Cancel tasks for pages that left the render range.
    for (const [p, task] of renderTasksRef.current) {
      if (p < visibleRange.min || p > visibleRange.max) {
        task.cancel();
        renderTasksRef.current.delete(p);
      }
    }

    let cancelled = false;

    async function renderPage(p: number) {
      const canvas = pageCanvasRefs.current.get(p);
      if (!canvas) return;

      const pdfPage = await pdf.getPage(p);
      if (cancelled) return;

      const vp = pdfPage.getViewport({ scale });
      canvas.width  = vp.width;
      canvas.height = vp.height;

      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const task = pdfPage.render({
        canvasContext: ctx,
        viewport: vp,
        annotationMode: hasOverlayAnnots ? 0 : 2,
      });
      renderTasksRef.current.set(p, task);
      try { await task.promise; } catch { /* RenderingCancelledException */ }
      renderTasksRef.current.delete(p);
    }

    for (let p = visibleRange.min; p <= visibleRange.max; p++) {
      renderPage(p);
    }

    return () => {
      cancelled = true;
      for (const task of renderTasksRef.current.values()) task.cancel();
      renderTasksRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, scale, visibleRange, hasOverlayAnnots, pageHeights]);

  // ── Scroll tracking ────────────────────────────────────────────────────────
  const programmaticScrollRef = useRef(false);
  const visiblePageRef        = useRef(currentPage);

  // When currentPage changes from outside (thumbnail click, search, keyboard nav):
  // scroll to that page if we're not already showing it.
  useEffect(() => {
    if (currentPage === visiblePageRef.current) return;
    programmaticScrollRef.current = true;
    visiblePageRef.current = currentPage;
    const y = pageYOffset(currentPage);
    containerRef.current?.scrollTo({ top: y, behavior: "instant" });
    setTimeout(() => { programmaticScrollRef.current = false; }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (programmaticScrollRef.current) return;

      const { scrollTop, clientHeight } = container;
      // Find the page whose top edge is at 30% of the viewport height.
      const target = scrollTop + clientHeight * 0.3;
      let y = SCROLL_PADDING;
      let page = 1;
      for (let p = 1; p <= numPages; p++) {
        const h = getH(p);
        if (y + h > target) { page = p; break; }
        y += h + PAGE_GAP;
        page = p;
      }

      if (page !== visiblePageRef.current) {
        visiblePageRef.current = page;
        onPageChange(page);
      }

      // Update visible render range.
      const newMin = Math.max(1, page - RENDER_BUFFER);
      const newMax = Math.min(numPages, page + RENDER_BUFFER);
      setVisibleRange(prev =>
        prev.min !== newMin || prev.max !== newMax ? { min: newMin, max: newMax } : prev,
      );
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, getH, onPageChange]);

  // ── Redact drag (per-page) ─────────────────────────────────────────────────
  const redactDragRef = useRef<{ startFrac: { x: number; y: number }; page: number } | null>(null);

  function handleRedactDown(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-rbox]")) return;
    onSelectRedact(null);
    e.preventDefault();
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const sf = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    redactDragRef.current = { startFrac: sf, page: pageNum };

    const onMove = (me: MouseEvent) => {
      if (!redactDragRef.current) return;
      const cur = { x: (me.clientX - r.left) / r.width, y: (me.clientY - r.top) / r.height };
      onRedactBoxesChange(
        redactBoxes.map(b => b).concat() // re-trigger live rect via a separate state path
      );
      // update live preview via the cropLive mechanism used by Viewer
      onCropLiveChange({ x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!redactDragRef.current) return;
      redactDragRef.current = null;
      onCropLiveChange(null);
      const cur = { x: (me.clientX - r.left) / r.width, y: (me.clientY - r.top) / r.height };
      const box = {
        x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y),
        x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y),
      };
      if (box.x1 - box.x0 > 0.01 && box.y1 - box.y0 > 0.005) {
        onRedactBoxesChange([...redactBoxes, {
          id: `r${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          page: pageNum, ...box,
        }]);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Crop drag (per-page) ───────────────────────────────────────────────────
  const cropDragRef = useRef<{ startFrac: { x: number; y: number } } | null>(null);

  function handleCropDown(e: React.MouseEvent<HTMLDivElement>, _pageNum: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const sf = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    cropDragRef.current = { startFrac: sf };
    onCropSelChange(null);

    const onMove = (me: MouseEvent) => {
      if (!cropDragRef.current) return;
      const cur = { x: (me.clientX - r.left) / r.width, y: (me.clientY - r.top) / r.height };
      onCropLiveChange({ x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) });
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!cropDragRef.current) return;
      cropDragRef.current = null;
      const cur = { x: (me.clientX - r.left) / r.width, y: (me.clientY - r.top) / r.height };
      const sel = { x0: Math.min(sf.x, cur.x), y0: Math.min(sf.y, cur.y), x1: Math.max(sf.x, cur.x), y1: Math.max(sf.y, cur.y) };
      onCropLiveChange(null);
      if (sel.x1 - sel.x0 > 0.01 && sel.y1 - sel.y0 > 0.005) onCropSelChange(sel);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ── Total scroll height ────────────────────────────────────────────────────
  const totalHeight =
    SCROLL_PADDING * 2 +
    Array.from({ length: numPages }, (_, i) => getH(i + 1)).reduce((s, h) => s + h, 0) +
    (numPages - 1) * PAGE_GAP;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={el => {
        containerRef.current = el;
        canvasAreaRef.current = el;
      }}
      className="flex-1 overflow-auto scrollbar-dark flex flex-col items-center"
      style={{ position: "relative" }}
    >
      {/* Fixed-height sentinel that sets the scroll height */}
      <div style={{ height: totalHeight, width: "100%", position: "relative" }}>
        {Array.from({ length: numPages }, (_, idx) => {
          const p = idx + 1;
          const h = getH(p);
          const w = getW(p);
          const yTop = pageYOffset(p);
          const inRange = p >= visibleRange.min && p <= visibleRange.max;
          const isActive = p === currentPage;

          // Per-page search highlights
          const pageSearchRects = searchQuery
            ? searchResults
                .map((r, ri) => ({ r, active: ri === searchIdx }))
                .filter(({ r }) => r.page === p)
                .flatMap(({ r, active }) => r.rects.map(rect => ({ ...rect, active })))
            : [];

          const pageRedactBoxes = redactBoxes.filter(b => b.page === p);
          const displayCrop = p === currentPage ? (cropLive ?? cropSelection) : null;
          const pageDiffs = diffHighlights?.get(p) ?? [];

          return (
            <div
              key={p}
              style={{
                position: "absolute",
                top: yTop,
                left: "50%",
                transform: "translateX(-50%)",
                width: w > 0 ? w : undefined,
                height: h,
              }}
            >
              {/* Page wrap — canvas + overlays */}
              <div
                ref={el => {
                  pageWrapRefs.current.set(p, el);
                  if (isActive && el) canvasWrapRef.current = el;
                }}
                className={cn(
                  "relative inline-block shadow-2xl rounded",
                  inRange ? "" : "bg-stone-700", // placeholder colour
                )}
                style={{
                  lineHeight: 0,
                  width: w > 0 ? w : undefined,
                  height: h,
                  opacity: inRange ? 1 : 0.3,
                  transition: reduceMotion ? "none" : "opacity 120ms ease-out",
                }}
                onMouseDown={e => {
                  // Update shared canvasWrapRef so Viewer's QuickActionBar coordinate
                  // calculations use this page's bounding rect.
                  const wrapEl = pageWrapRefs.current.get(p);
                  if (wrapEl) canvasWrapRef.current = wrapEl;

                  // Activate this page if clicking a non-current page.
                  if (p !== visiblePageRef.current) {
                    visiblePageRef.current = p;
                    onPageChange(p);
                  }

                  // Free-rect drag start (annotation fallback when no text selected).
                  if (!textSelectActive || canvasMode !== "annotate") return;
                  const wrap = canvasWrapRef.current;
                  if (!wrap) return;
                  const rect = wrap.getBoundingClientRect();
                  freeRectDragRef.current = {
                    x: (e.clientX - rect.left) / rect.width,
                    y: (e.clientY - rect.top)  / rect.height,
                  };
                }}
              >
                {/* Canvas — only rendered for visible range */}
                {inRange && (
                  <canvas
                    ref={el => pageCanvasRefs.current.set(p, el)}
                    role="img"
                    aria-label={`Page ${p}`}
                    className="rounded block"
                    style={{ display: "block" }}
                  />
                )}

                {/* Text layer — only on current page for selection */}
                {inRange && isActive && (canvasMode === "annotate" || canvasMode === "view") && (
                  <TextLayer
                    pdf={pdf}
                    pageNum={p}
                    scale={scale}
                    active={canvasMode === "view" ? true : textSelectActive}
                  />
                )}

                {/* Annotation layer — interactive on current page, read-only elsewhere */}
                {inRange && (
                  <AnnotationLayer
                    annotations={isActive && canvasMode === "annotate" ? annotations : []}
                    readOnlyAnnotations={
                      isActive && canvasMode === "annotate"
                        ? bakedAnnotations
                        : [...bakedAnnotations, ...annotations].filter(a => a.page === p)
                    }
                    page={p}
                    createMode={annotateSubMode}
                    hlColorIdx={hlColorIdx}
                    highlightColors={highlightColors}
                    onAnnotationsChange={onAnnotationsChange}
                    textSelectActive={isActive ? textSelectActive : false}
                    author={author}
                    shapeSubType={shapeSubType}
                    inkStrokeWidth={inkStrokeWidth}
                    inkColor={inkColor}
                    stampLabel={stampLabel}
                    snippets={snippets}
                    visible={annotationsVisible}
                    focusAnnotId={isActive ? focusAnnotId : null}
                    forceEditAnnotId={isActive ? forceEditAnnotId : null}
                    onForceEditConsumed={onForceEditConsumed}
                    onNavigateAnnot={onNavigateAnnot}
                    readOnly={!isActive || canvasMode !== "annotate"}
                  />
                )}

                {/* Search result highlights */}
                {inRange && pageSearchRects.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                    {pageSearchRects.map((r, i) => (
                      <div key={i} className="absolute" style={{
                        left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`,
                        width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`,
                        backgroundColor: r.active ? "rgba(255,120,0,0.45)" : "rgba(255,200,0,0.35)",
                        outline: r.active ? "1.5px solid rgba(217,119,6,0.9)" : "none",
                        borderRadius: 2,
                      }} />
                    ))}
                  </div>
                )}

                {/* Diff highlights (B6) */}
                {inRange && pageDiffs.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
                    {pageDiffs.map((d, i) => (
                      <div key={i} className="absolute" title={d.text} style={{
                        left: `${d.x0 * 100}%`, top: `${d.y0 * 100}%`,
                        width: `${(d.x1 - d.x0) * 100}%`,
                        height: `${Math.max((d.y1 - d.y0) * 100, 1.2)}%`,
                        backgroundColor: d.type === "remove"
                          ? "rgba(220,38,38,0.35)"    // red-600 at 35% opacity
                          : "rgba(34,197,94,0.35)",   // green-500 at 35%
                        outline: d.type === "remove"
                          ? "1px solid rgba(220,38,38,0.6)"
                          : "1px solid rgba(34,197,94,0.6)",
                        borderRadius: 1,
                      }} />
                    ))}
                  </div>
                )}

                {/* Redact overlay — only on the current page */}
                {inRange && isActive && canvasMode === "redact" && (
                  <div
                    className="absolute inset-0 cursor-crosshair"
                    style={{ userSelect: "none" }}
                    onMouseDown={e => handleRedactDown(e, p)}
                  >
                    {pageRedactBoxes.map(box => (
                      <div
                        key={box.id}
                        data-rbox="true"
                        className={cn(
                          "absolute pointer-events-auto",
                          selectedRedact === box.id && "ring-2 ring-brand-400",
                        )}
                        style={{
                          left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`,
                          width: `${(box.x1 - box.x0) * 100}%`,
                          height: `${(box.y1 - box.y0) * 100}%`,
                          background: "rgba(0,0,0,0.88)", cursor: "pointer",
                        }}
                        onClick={e => { e.stopPropagation(); onSelectRedact(box.id === selectedRedact ? null : box.id); }}
                      >
                        {selectedRedact === box.id && (
                          <button
                            className="absolute -top-1.5 -right-1.5 z-10 bg-red-500 hover:bg-red-400 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] transition"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation();
                              onRedactBoxesChange(redactBoxes.filter(b => b.id !== box.id));
                              onSelectRedact(null);
                            }}
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Crop overlay — only on the current page */}
                {inRange && isActive && canvasMode === "crop" && (
                  <div
                    className="absolute inset-0 cursor-crosshair"
                    style={{ userSelect: "none" }}
                    onMouseDown={e => handleCropDown(e, p)}
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

                {/* Page number badge */}
                <div
                  className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[9px] font-mono tabular-nums pointer-events-none select-none"
                  style={{ background: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.7)", zIndex: 10 }}
                >
                  {p}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
