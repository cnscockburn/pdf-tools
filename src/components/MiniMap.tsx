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
 * Width: clamps between MIN_STRIP_W (≈floating toolbar) and the full container
 * width, proportional to page count so sparse PDFs don't get absurdly wide ticks.
 *
 * Animation: the wave swell position and amplitude both lerp smoothly toward
 * their targets via a continuous RAF loop, giving a natural "docking" feel.
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

const STRIP_H     = 34;   // canvas height in CSS px (room for the swell)
const BASE_TICK   = 5;    // resting tick height
const MAX_TICK    = 30;   // peak tick height under the cursor
const SIGMA       = 4;    // wave spread, in pages
const SETTLE_MS   = 350;  // stillness before the thumbnail appears

// Proportional width: each page gets ~STEP_PX at minimum.
// Strip never goes below MIN_STRIP_W (≈ floating toolbar) or above the container.
const STEP_PX     = 10;
const MIN_STRIP_W = 440;

const ACCENTS = {
  amber: { strong: "#d97706", soft: "rgba(217,119,6,0.55)", pip: "#fbbf24" },
  cyan:  { strong: "#06b6d4", soft: "rgba(6,182,212,0.55)", pip: "#22d3ee" },
};

export default function MiniMap({ totalPages, currentPage, annotations, onGoTo, accent = "amber", pdf, reduceMotion }: Props) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Live interaction state — mutated in event handlers, read in RAF loop.
  const hoverFracRef    = useRef<number | null>(null); // actual cursor fraction
  const renderedHoverRef = useRef<number | null>(null); // lerped cursor fraction (canvas)
  const waveAmplRef     = useRef(0);                   // lerped 0→1 amplitude
  const draggingRef     = useRef(false);
  const animRunningRef  = useRef(false);

  const [, force]         = useState(0);
  const rafRef            = useRef(0);
  const settleTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [thumb, setThumb] = useState<{ page: number; url: string; key: number } | null>(null);
  const thumbCache        = useRef<Map<number, string>>(new Map());
  const thumbGen          = useRef(0);
  const thumbKeyRef       = useRef(0);

  const annotPages = useMemo(() => {
    const s = new Set<number>();
    for (const a of annotations) s.add(a.page);
    return s;
  }, [annotations]);

  // Measure the outer container; strip width is derived from this.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setContainerWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Derived strip width — proportional to page count, clamped.
  const stripWidth = containerWidth > 0
    ? Math.min(containerWidth, Math.max(MIN_STRIP_W, totalPages * STEP_PX))
    : 0;

  const pageFromFrac = useCallback((frac: number) =>
    Math.max(1, Math.min(totalPages, Math.floor(frac * totalPages) + 1)), [totalPages]);

  // ── Canvas draw ────────────────────────────────────────────────────────────
  // Reads from renderedHoverRef + waveAmplRef (not raw hoverFracRef) so the
  // wave is always at the lerped position, not the snapped cursor position.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const w = stripWidth;
    if (!canvas || w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.floor(w * dpr);
    const ch = Math.floor(STRIP_H * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, STRIP_H);

    const acc   = ACCENTS[accent];
    const hover = renderedHoverRef.current;
    const ampl  = waveAmplRef.current;
    const baseY = STRIP_H - 1;
    const stepX = w / totalPages;
    const tickW = Math.max(1, Math.min(stepX - 0.5, 6));

    for (let i = 0; i < totalPages; i++) {
      const page = i + 1;
      const cx = (i + 0.5) * stepX;
      const fracCenter = cx / w;
      let mag = 0;
      if (hover !== null && ampl > 0.005 && !reduceMotion) {
        const d = (fracCenter - hover) * totalPages; // distance in pages
        mag = Math.exp(-(d * d) / (2 * SIGMA * SIGMA)) * ampl;
      }
      const h = BASE_TICK + mag * (MAX_TICK - BASE_TICK);
      const isCurrent = page === currentPage;
      const hasAnnot  = annotPages.has(page);

      ctx.fillStyle = isCurrent
        ? acc.strong
        : hasAnnot
          ? acc.pip
          : mag > 0.15
            ? "#a8a29e"   // stone-400 — lit near cursor
            : "#57534e";  // stone-600 — resting
      ctx.fillRect(cx - tickW / 2, baseY - h, tickW, h);
    }

    // Current-page marker (full-height, always visible).
    const markerX = (currentPage - 0.5) * stepX;
    ctx.fillStyle = acc.strong;
    ctx.fillRect(markerX - 0.75, 0, 1.5, STRIP_H);
  }, [stripWidth, totalPages, currentPage, annotPages, accent, reduceMotion]);

  useEffect(() => { draw(); }, [draw]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  // Lerps renderedHoverRef toward hoverFracRef, and waveAmplRef toward 0 or 1.
  // Runs until both have settled; re-triggers itself via RAF.
  const startAnim = useCallback(() => {
    if (animRunningRef.current) return;
    animRunningRef.current = true;

    function loop() {
      const targetHover = hoverFracRef.current;
      const currentHover = renderedHoverRef.current;
      const targetAmpl = (targetHover !== null && !reduceMotion) ? 1 : 0;
      const curAmpl = waveAmplRef.current;

      // Lerp wave amplitude (ease-in on enter, ease-out on leave).
      const amplSpeed = targetAmpl > curAmpl ? 0.14 : 0.10;
      const nextAmpl = curAmpl + (targetAmpl - curAmpl) * amplSpeed;
      waveAmplRef.current = Math.abs(nextAmpl - targetAmpl) < 0.004 ? targetAmpl : nextAmpl;

      // Lerp hover position (only when a cursor position is active).
      if (targetHover !== null) {
        if (currentHover === null) {
          renderedHoverRef.current = targetHover;
        } else {
          const next = currentHover + (targetHover - currentHover) * 0.22;
          renderedHoverRef.current = Math.abs(next - targetHover) < 0.0005 ? targetHover : next;
        }
      } else if (waveAmplRef.current < 0.004) {
        // Wave fully gone — clear rendered position too.
        renderedHoverRef.current = null;
      }

      draw();

      const stillMoving =
        Math.abs(waveAmplRef.current - targetAmpl) > 0.004 ||
        (targetHover !== null && currentHover !== null &&
          Math.abs((renderedHoverRef.current ?? targetHover) - targetHover) > 0.0005);

      if (stillMoving) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        animRunningRef.current = false;
        rafRef.current = 0;
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [draw, reduceMotion]);

  // ── Thumbnail on settle ────────────────────────────────────────────────────
  const requestThumb = useCallback(async (page: number) => {
    if (!pdf) return;
    const cached = thumbCache.current.get(page);
    if (cached) { setThumb({ page, url: cached, key: ++thumbKeyRef.current }); return; }
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
      if (gen !== thumbGen.current) return;
      const url = c.toDataURL("image/jpeg", 0.7);
      thumbCache.current.set(page, url);
      if (thumbCache.current.size > 8) {
        const firstKey = thumbCache.current.keys().next().value;
        if (firstKey !== undefined) thumbCache.current.delete(firstKey);
      }
      setThumb({ page, url, key: ++thumbKeyRef.current });
    } catch { /* cancelled / page gone */ }
  }, [pdf]);

  const armSettle = useCallback((page: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => requestThumb(page), SETTLE_MS);
  }, [requestThumb]);

  // ── Pointer handlers ───────────────────────────────────────────────────────
  // fracFromEvent maps clientX to the strip fraction (0–1), accounting for the
  // fact that the strip may be narrower than the container (centered).
  function fracFromEvent(e: React.PointerEvent | PointerEvent): number {
    const el = wrapRef.current!;
    const r = el.getBoundingClientRect();
    // Strip is centered; offset within the strip.
    const containerW = r.width;
    const sw = Math.min(containerW, Math.max(MIN_STRIP_W, totalPages * STEP_PX));
    const stripLeft = r.left + (containerW - sw) / 2;
    return Math.max(0, Math.min(1, (e.clientX - stripLeft) / sw));
  }

  function onPointerMove(e: React.PointerEvent) {
    const frac = fracFromEvent(e);
    hoverFracRef.current = frac;
    startAnim();
    force(v => v + 1); // update badge position
    armSettle(pageFromFrac(frac));
  }

  function onPointerLeave() {
    if (draggingRef.current) return;
    hoverFracRef.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setThumb(null);
    startAnim(); // let the wave retract smoothly
    force(v => v + 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hoverFracRef.current = fracFromEvent(e);
    startAnim();
    force(v => v + 1);
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (wasDragging && hoverFracRef.current !== null) {
      onGoTo(pageFromFrac(hoverFracRef.current));
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

  // Badge left position: relative to the container, accounting for strip centering.
  const badgeLeft = hover !== null && containerWidth > 0
    ? (containerWidth - stripWidth) / 2 + hover * stripWidth
    : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ height: STRIP_H }}
    >
      {/* Centered strip — narrows for small PDFs */}
      <div
        aria-label="Page navigator"
        className="absolute top-0 bottom-0 cursor-pointer"
        style={{
          left:  containerWidth > 0 ? (containerWidth - stripWidth) / 2 : 0,
          width: stripWidth || "100%",
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: stripWidth, height: STRIP_H }}
        />
      </div>

      {/* Floating page number + thumbnail near the cursor */}
      {hover !== null && hoverPage !== null && badgeLeft !== null && stripWidth > 0 && (
        <div
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 flex flex-col items-center gap-1 z-50"
          style={{ left: Math.max(28, Math.min(containerWidth - 28, badgeLeft)) }}
        >
          {thumb && thumb.page === hoverPage && (
            <img
              key={thumb.key}
              src={thumb.url}
              alt={`Page ${hoverPage}`}
              className="rounded shadow-2xl border border-stone-600 viewer-light:border-stone-300 bg-white"
              style={{
                maxHeight: 140,
                animation: "minimap-thumb-in 160ms ease-out both",
              }}
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
