import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

export type FractionalRect = { x0: number; y0: number; x1: number; y1: number };
export type FractionalPoint = { x: number; y: number };

interface RectOverlay extends FractionalRect {
  label?: string;
  color?: string;
  text?: string;      // renders text inside the rect (for freetext annotations)
  textColor?: string;
}

interface Props {
  file: File;
  pageNum: number;
  scale?: number;
  mode: "rect" | "point" | "readonly";
  rects?: RectOverlay[];
  onRect?: (r: FractionalRect) => void;
  onPoint?: (p: FractionalPoint) => void;
  /** Rendered inside the same relative container as the canvas — use for inline popups */
  children?: React.ReactNode;
}

export default function InteractivePageCanvas({
  file, pageNum, scale = 1.2, mode, rects = [], onRect, onPoint, children,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<FractionalPoint | null>(null);
  const [current, setCurrent] = useState<FractionalRect | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;

    (async () => {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      if (cancelled) return;
      const page = await pdf.getPage(pageNum);
      const vp = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, vp.width, vp.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise.catch(() => {});
    })();

    return () => { cancelled = true; };
  }, [file, pageNum, scale]);

  function getCoords(e: React.MouseEvent<HTMLDivElement>): FractionalPoint {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1)),
      y: Math.max(0, Math.min((e.clientY - rect.top) / rect.height, 1)),
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (mode === "readonly") return;
    if (mode === "point") { onPoint?.(getCoords(e)); return; }
    setDrag(getCoords(e));
    setCurrent(null);
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag || mode !== "rect") return;
    const p = getCoords(e);
    setCurrent({
      x0: Math.min(drag.x, p.x), y0: Math.min(drag.y, p.y),
      x1: Math.max(drag.x, p.x), y1: Math.max(drag.y, p.y),
    });
  }

  function onMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!drag || mode !== "rect") return;
    const p = getCoords(e);
    const r: FractionalRect = {
      x0: Math.min(drag.x, p.x), y0: Math.min(drag.y, p.y),
      x1: Math.max(drag.x, p.x), y1: Math.max(drag.y, p.y),
    };
    if (r.x1 - r.x0 > 0.01 && r.y1 - r.y0 > 0.005) onRect?.(r);
    setDrag(null);
    setCurrent(null);
  }

  const cursorClass = mode === "rect" ? "cursor-crosshair" : mode === "point" ? "cursor-cell" : "";

  return (
    <div className="relative inline-block shadow-lg rounded" style={{ lineHeight: 0 }}>
      <canvas ref={canvasRef} className="rounded" />

      {/* Interaction overlay */}
      <div
        ref={overlayRef}
        className={`absolute inset-0 ${cursorClass}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { if (drag) { setDrag(null); setCurrent(null); } }}
        style={{ userSelect: "none" }}
      />

      {/* Committed rects */}
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute pointer-events-none rounded-sm"
          style={{
            left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`,
            width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%`,
            border: `2px solid ${r.color ?? "#ef4444"}`,
            backgroundColor: r.color ? `${r.color}30` : "rgba(239,68,68,0.15)",
            overflow: "hidden",
          }}
        >
          {r.label && (
            <span className="absolute top-0 left-0 text-[9px] bg-red-500 text-white px-0.5 leading-tight">
              {r.label}
            </span>
          )}
          {r.text && (
            <span
              className="absolute inset-0 p-1 text-[11px] leading-tight overflow-hidden"
              style={{ color: r.textColor ?? "#1a1a1a", whiteSpace: "pre-wrap" }}
            >
              {r.text}
            </span>
          )}
        </div>
      ))}

      {/* In-progress drag rect */}
      {current && (
        <div
          className="absolute pointer-events-none rounded-sm"
          style={{
            left: `${current.x0 * 100}%`, top: `${current.y0 * 100}%`,
            width: `${(current.x1 - current.x0) * 100}%`,
            height: `${(current.y1 - current.y0) * 100}%`,
            border: "2px dashed #3b82f6",
            backgroundColor: "rgba(59,130,246,0.12)",
          }}
        />
      )}

      {/* Slot for inline popups (pending notes, freetext editors, etc.) */}
      {children}
    </div>
  );
}
