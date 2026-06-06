/**
 * MiniMap — a thin page-navigator strip with a dock-magnification "wave".
 *
 * At rest it's a slim bar: one tick per page, an accent marker at the current
 * page, and pips for pages that carry annotations. On hover the ticks near the
 * cursor swell (Gaussian falloff) so you can target a page precisely; the page
 * number floats above the cursor. Pause and a thumbnail preview of that page
 * appears. Click jumps immediately; click-and-drag scrubs and only navigates on
 * release (so a fast drag across a long document doesn't thrash the renderer).
 *
 * The strip is drawn on a <canvas> so it stays smooth even for 500-page PDFs.
 * Positioning is handled by the parent (Viewer places it above the toolbar).
 */
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { LocalAnnot } from "./AnnotationLayer";

interface Props {
  totalPages: number;
  currentPage: number;
  annotations: LocalAnnot[];
  onGoTo: (p: number) => void;
  accent?: "amber" | "cyan";
  /** Optional — enables the thumbnail-on-settle preview. */
  pdf?: PDFDocumentProxy | null;
  /** When true, skip the magnification animation (reduced motion). */
  reduceMotion?: boolean;
}

const STRIP_H = 34;       // canvas height in CSS px (room for the swell)
const BASE_TICK = 5;      // resting tick height
const MAX_TICK = 30;      // peak tick height under the cursor
const SIGMA = 4;          // wave spread, in pages
const SETTLE_MS = 350;    // stillness before the thumbnail appears

const ACCENTS = {
  amber: { strong: "#d97706", soft: "rgba(217,119,6,0.55)", pip: "#fbbf24" },
  cyan:  { strong: "#06b6d4", soft: "rgba(6,182,212,0.55)", pip: "#22d3ee" },
};

export default function MiniMap({ totalPages, currentPage, annotations, onGoTo, accent = "amber", pdf, reduceMotion }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  // Live interaction state kept in refs (no re-render per mousemove); a single
  // version counter triggers the React-side overlay (badge + thumbnail).
  const hoverFracRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [, force] = useState(0);
  const rafRef = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [thumb, setThumb] = useState<{ page: number; url: string } | null>(null);
  const thumbCache = useRef<Map<number, string>>(new Map());
  const thumbGen = useRef(0);

  const annotPages = useMemo(() => {
    const s = new Set<number>();
    for (const a of annotations) s.add(a.page);
    return s;
  }, [annotations]);

  // Measure width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const pageFromFrac = useCallback((frac: number) =>
    Math.max(1, Math.min(totalPages, Math.floor(frac * totalPages) + 1)), [totalPages]);

  // ── Canvas draw ────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(width * dpr);
    const h = Math.floor(STRIP_H * dpr);
    if (canvas.width !== w) canvas.width = w;     // resizing also clears the canvas
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, STRIP_H);

    const acc = ACCENTS[accent];
    const hover = hoverFracRef.current;
    const baseY = STRIP_H - 1;             // ticks grow upward from the bottom
    const stepX = width / totalPages;
    const tickW = Math.max(1, Math.min(stepX - 0.5, 6));

    for (let i = 0; i < totalPages; i++) {
      const page = i + 1;
      const cx = (i + 0.5) * stepX;
      const fracCenter = cx / width;
      let mag = 0;
      if (hover !== null && !reduceMotion) {
        const d = (fracCenter - hover) * totalPages; // distance in pages
        mag = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
      }
      const h = BASE_TICK + mag * (MAX_TICK - BASE_TICK);
      const isCurrent = page === currentPage;
      const hasAnnot = annotPages.has(page);

      ctx.fillStyle = isCurrent
        ? acc.strong
        : hasAnnot
          ? acc.pip
          : mag > 0.15
            ? "#a8a29e"   // stone-400 — lit near the cursor
            : "#57534e";  // stone-600 — resting
      ctx.fillRect(cx - tickW / 2, baseY - h, tickW, h);
    }

    // Current-page marker line (always visible, full height).
    const markerX = (currentPage - 0.5) * stepX;
    ctx.fillStyle = acc.strong;
    ctx.fillRect(markerX - 0.75, 0, 1.5, STRIP_H);
  }, [width, totalPages, currentPage, annotPages, accent, reduceMotion]);

  useEffect(() => { draw(); }, [draw]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; draw(); });
  }, [draw]);

  // ── Thumbnail on settle ──────────────────────────────────────────────────
  const requestThumb = useCallback(async (page: number) => {
    if (!pdf) return;
    const cached = thumbCache.current.get(page);
    if (cached) { setThumb({ page, url: cached }); return; }
    const gen = ++thumbGen.current;
    try {
      const p = await pdf.getPage(page);
      const vp = p.getViewport({ scale: 0.28 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      const cctx = c.getContext("2d");
      if (!cctx) return;
      cctx.fillStyle = "#fff"; cctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: cctx, viewport: vp }).promise;
      if (gen !== thumbGen.current) return; // superseded
      const url = c.toDataURL("image/jpeg", 0.7);
      thumbCache.current.set(page, url);
      if (thumbCache.current.size > 8) {
        // keep the cache small
        const firstKey = thumbCache.current.keys().next().value;
        if (firstKey !== undefined) thumbCache.current.delete(firstKey);
      }
      setThumb({ page, url });
    } catch { /* cancelled / page gone */ }
  }, [pdf]);

  const armSettle = useCallback((page: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => requestThumb(page), SETTLE_MS);
  }, [requestThumb]);

  // ── Pointer handlers ───────────────────────────────────────────────────────
  function fracFromEvent(e: React.PointerEvent | PointerEvent): number {
    const el = wrapRef.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  function onPointerMove(e: React.PointerEvent) {
    const frac = fracFromEvent(e);
    hoverFracRef.current = frac;
    scheduleDraw();
    force(v => v + 1); // update the floating badge position
    armSettle(pageFromFrac(frac));
  }

  function onPointerLeave() {
    if (draggingRef.current) return;
    hoverFracRef.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setThumb(null);
    scheduleDraw();
    force(v => v + 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hoverFracRef.current = fracFromEvent(e);
    scheduleDraw();
    force(v => v + 1);
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasDragging && hoverFracRef.current !== null) {
      onGoTo(pageFromFrac(hoverFracRef.current)); // deferred navigation on release
    }
  }

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (totalPages <= 1) return null;

  const hover = hoverFracRef.current;
  const hoverPage = hover !== null ? pageFromFrac(hover) : null;
  const acc = ACCENTS[accent];

  return (
    <div className="relative w-full select-none" style={{ height: STRIP_H }}>
      <div
        ref={wrapRef}
        aria-label="Page navigator"
        className="absolute inset-0 cursor-pointer"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <canvas ref={canvasRef} className="block" style={{ width, height: STRIP_H }} />
      </div>

      {/* Floating page number + thumbnail near the cursor */}
      {hover !== null && hoverPage !== null && width > 0 && (
        <div
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 flex flex-col items-center gap-1 z-50"
          style={{ left: Math.max(28, Math.min(width - 28, hover * width)) }}
        >
          {thumb && thumb.page === hoverPage && (
            <img
              src={thumb.url}
              alt={`Page ${hoverPage}`}
              className="rounded shadow-2xl border border-stone-600 bg-white"
              style={{ maxHeight: 140 }}
            />
          )}
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white shadow-lg tabular-nums"
            style={{ background: acc.strong }}
          >
            {hoverPage}
          </span>
        </div>
      )}
    </div>
  );
}
