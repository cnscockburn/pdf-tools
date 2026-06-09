/**
 * MiniMap — page-navigator strip with a dock-magnification "wave".
 *
 * At rest: one tick per page, accent marker at the current page, pips for
 * annotated pages. On hover: ticks near the cursor swell (Gaussian falloff);
 * a page-number badge floats above; pausing shows a thumbnail preview.
 * Click or click-and-drag scrubs live (updates page on every page crossing).
 *
 * Width: clamps between MIN_STRIP_W (≈ the floating toolbar) and the container
 * width, proportional to page count so sparse PDFs don't fill the whole bar.
 *
 * Animation: waveAmplRef lerps 0→1 on hover entry and 1→0 on leave, giving a
 * smooth "dock" swell. renderedHoverRef follows the cursor with slight lag.
 * The RAF loop uses a drawRef (always the latest draw fn) to avoid stale closures.
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

const STRIP_H     = 34;   // canvas height in CSS px
const BASE_TICK   = 5;    // resting tick height
const MAX_TICK    = 30;   // peak tick height under cursor
const SIGMA       = 4;    // wave spread in pages
const SETTLE_MS   = 350;  // stillness before thumbnail appears

const STEP_PX     = 10;   // ideal pixels per page (for width sizing)
const MIN_STRIP_W = 440;  // minimum strip width ≈ floating toolbar width

const ACCENTS = {
  amber: { strong: "#d97706", pip: "#fbbf24" },
  cyan:  { strong: "#06b6d4", pip: "#22d3ee" },
};

export default function MiniMap({
  totalPages, currentPage, annotations, onGoTo,
  accent = "amber", pdf, reduceMotion,
}: Props) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // ── Animation state in refs (no re-render per frame) ─────────────────────
  const hoverFracRef     = useRef<number | null>(null); // actual cursor position (0-1)
  const renderedHoverRef = useRef<number | null>(null); // lerped cursor position
  const waveAmplRef      = useRef(0);                  // lerped wave amplitude 0→1
  const draggingRef      = useRef(false);
  const animRunningRef   = useRef(false);
  const lastNavPageRef   = useRef<number | null>(null); // last page navigated during drag
  // Keep reduceMotion in a ref so the RAF loop always reads the current value
  // without needing to be recreated when the prop changes.
  const reduceMotionRef  = useRef(!!reduceMotion);
  useEffect(() => { reduceMotionRef.current = !!reduceMotion; }, [reduceMotion]);

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

  // Measure container width so we can compute the proportional strip width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setContainerWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Proportional strip width — grows with page count, min = toolbar width.
  const stripWidth = containerWidth > 0
    ? Math.min(containerWidth, Math.max(MIN_STRIP_W, totalPages * STEP_PX))
    : 0;

  const pageFromFrac = useCallback((frac: number) =>
    Math.max(1, Math.min(totalPages, Math.floor(frac * totalPages) + 1)), [totalPages]);

  // ── Canvas draw ────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const w = stripWidth;
    if (!canvas || w <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.floor(w * dpr);
    const ch = Math.floor(STRIP_H * dpr);
    if (canvas.width !== cw)  canvas.width = cw;
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
      const cx   = (i + 0.5) * stepX;
      let mag = 0;
      if (hover !== null && ampl > 0.005 && !reduceMotion) {
        const d = ((cx / w) - hover) * totalPages;  // distance in pages
        mag = Math.exp(-(d * d) / (2 * SIGMA * SIGMA)) * ampl;
      }
      const th = BASE_TICK + mag * (MAX_TICK - BASE_TICK);
      const isCurrent = page === currentPage;
      const hasAnnot  = annotPages.has(page);

      ctx.fillStyle = isCurrent
        ? acc.strong
        : hasAnnot
          ? acc.pip
          : mag > 0.15
            ? "#a8a29e"   // stone-400 — lit near cursor
            : "#57534e";  // stone-600 — resting
      ctx.fillRect(cx - tickW / 2, baseY - th, tickW, th);
    }

    // Current-page marker — full height.
    const markerX = (currentPage - 0.5) * stepX;
    ctx.fillStyle = acc.strong;
    ctx.fillRect(markerX - 0.75, 0, 1.5, STRIP_H);
  }, [stripWidth, totalPages, currentPage, annotPages, accent, reduceMotion]);

  // Always keep drawRef pointed at the latest draw so the RAF loop avoids stale closures.
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => { draw(); }, [draw]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  // Runs until both waveAmplRef and renderedHoverRef have fully settled.
  // Uses drawRef.current() so it always calls the latest draw, even if draw
  // was recreated while the loop was running (e.g. currentPage changed).
  const startAnim = useCallback(() => {
    if (animRunningRef.current) return;
    animRunningRef.current = true;

    function loop() {
      const targetHover = hoverFracRef.current;
      const targetAmpl  = (targetHover !== null && !reduceMotionRef.current) ? 1 : 0;

      // Lerp wave amplitude.
      const amplSpeed = targetAmpl > waveAmplRef.current ? 0.14 : 0.10;
      const nextAmpl  = waveAmplRef.current + (targetAmpl - waveAmplRef.current) * amplSpeed;
      waveAmplRef.current = Math.abs(nextAmpl - targetAmpl) < 0.004 ? targetAmpl : nextAmpl;

      // Lerp cursor position.
      if (targetHover !== null) {
        if (renderedHoverRef.current === null) {
          renderedHoverRef.current = targetHover; // snap on first entry
        } else {
          const next = renderedHoverRef.current + (targetHover - renderedHoverRef.current) * 0.22;
          renderedHoverRef.current =
            Math.abs(next - targetHover) < 0.0005 ? targetHover : next;
        }
      } else if (waveAmplRef.current < 0.004) {
        renderedHoverRef.current = null;
      }

      drawRef.current();

      // Stop once amplitude and position have both settled.
      // onPointerMove re-calls startAnim() for each cursor movement, so the
      // wave position stays current without a perpetual 60fps idle loop.
      const amplUnsettled = Math.abs(waveAmplRef.current - targetAmpl) > 0.004;
      const posUnsettled  = targetHover !== null &&
                            renderedHoverRef.current !== null &&
                            Math.abs(renderedHoverRef.current - targetHover) > 0.0005;

      if (amplUnsettled || posUnsettled) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        animRunningRef.current = false;
        rafRef.current = 0;
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []); // stable — all values read via refs (drawRef, reduceMotionRef, hoverFracRef, etc.)

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
  // Maps clientX to a 0-1 fraction within the strip (which may be narrower than
  // the full container when there are few pages).
  function fracFromEvent(e: React.PointerEvent | PointerEvent): number {
    const el = wrapRef.current!;
    const r  = el.getBoundingClientRect();
    const cW = r.width;
    const sw = Math.min(cW, Math.max(MIN_STRIP_W, totalPages * STEP_PX));
    const stripLeft = r.left + (cW - sw) / 2;
    return Math.max(0, Math.min(1, (e.clientX - stripLeft) / sw));
  }

  function onPointerMove(e: React.PointerEvent) {
    const frac = fracFromEvent(e);
    hoverFracRef.current = frac;
    startAnim();
    force(v => v + 1); // update badge/thumb overlay position

    const page = pageFromFrac(frac);
    armSettle(page);

    // Live scrub: navigate to the page under the cursor while dragging.
    if (draggingRef.current && page !== lastNavPageRef.current) {
      lastNavPageRef.current = page;
      onGoTo(page);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onGoTo(Math.max(1, currentPage - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onGoTo(Math.min(totalPages, currentPage + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onGoTo(1);
    } else if (e.key === "End") {
      e.preventDefault();
      onGoTo(totalPages);
    }
  }

  function onPointerLeave() {
    if (draggingRef.current) return;
    hoverFracRef.current = null;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setThumb(null);
    startAnim(); // retract wave smoothly
    force(v => v + 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    draggingRef.current  = true;
    lastNavPageRef.current = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    hoverFracRef.current = fracFromEvent(e);
    startAnim();
    force(v => v + 1);
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasDragging  = draggingRef.current;
    const didLiveScrub = lastNavPageRef.current !== null;
    draggingRef.current    = false;
    lastNavPageRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // Navigate on release only when no live scrub happened (i.e. the user
    // clicked without dragging). If they dragged, the scrub already called
    // onGoTo for every page crossing — firing it again on release is a no-op
    // at best and double-navigation at worst.
    if (wasDragging && !didLiveScrub && hoverFracRef.current !== null) {
      onGoTo(pageFromFrac(hoverFracRef.current));
    }
  }

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (totalPages <= 1) return null;

  const hover     = hoverFracRef.current;
  const hoverPage = hover !== null ? pageFromFrac(hover) : null;
  const acc       = ACCENTS[accent];
  const badgeLeft = hover !== null && containerWidth > 0
    ? (containerWidth - stripWidth) / 2 + hover * stripWidth
    : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ height: STRIP_H }}
    >
      {/* Centered strip — narrower than container for small PDFs */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Page navigator"
        aria-valuemin={1}
        aria-valuemax={totalPages}
        aria-valuenow={currentPage}
        aria-valuetext={`Page ${currentPage} of ${totalPages}`}
        className="absolute top-0 bottom-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        style={{
          left:  containerWidth > 0 ? (containerWidth - stripWidth) / 2 : 0,
          width: stripWidth || "100%",
        }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: stripWidth || "100%", height: STRIP_H }}
        />
      </div>

      {/* Floating page number + thumbnail — decorative, hidden from assistive technology */}
      {hover !== null && hoverPage !== null && badgeLeft !== null && stripWidth > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 flex flex-col items-center gap-1 z-50"
          style={{ left: Math.max(28, Math.min(containerWidth - 28, badgeLeft)) }}
        >
          {thumb && thumb.page === hoverPage && (
            <img
              key={thumb.key}
              src={thumb.url}
              alt={`Page ${hoverPage}`}
              className="rounded shadow-2xl border border-stone-600 viewer-light:border-stone-300 bg-white"
              style={{ maxHeight: 140, animation: "minimap-thumb-in 160ms ease-out both" }}
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
