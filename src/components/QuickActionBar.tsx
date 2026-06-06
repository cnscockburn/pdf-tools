/**
 * QuickActionBar — floats above a text selection.
 * Shows labeled action buttons with key-binding chips for fast markup.
 */
import { useRef, useState, useEffect } from "react";
import { Highlighter, Underline, Strikethrough, MessageSquare, Copy } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  /** Horizontal centre of the bar in viewport px */
  x: number;
  /** Top of the selection in viewport px — bar prefers to sit above this */
  y: number;
  /** Bottom of the selection in viewport px — bar flips here when no room above */
  yBottom: number;
  onHighlight:     () => void;
  onUnderline:     () => void;
  onStrikethrough: () => void;
  onComment:       () => void;
  onCopy:          () => void;
}

/** Keep the bar inside the viewport, below the top chrome. */
const TOP_CHROME_PX = 56; // top bar (~36) + menu bar; keep the bar clear of it
const EDGE_PAD = 8;

function Btn({ icon, label, k, onClick }: {
  icon: ReactNode; label: string; k?: string; onClick: () => void;
}) {
  return (
    <button
      className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg hover:bg-stone-700 transition min-w-[2.75rem]"
      onClick={onClick}
      title={k ? `${label} (${k})` : label}
    >
      {icon}
      <span className="text-[9px] text-stone-400 leading-none whitespace-nowrap">{label}</span>
      {k && (
        <kbd className="rounded border border-stone-600 bg-stone-800 px-1 text-[8px] font-mono leading-3 text-stone-500">
          {k}
        </kbd>
      )}
    </button>
  );
}

export default function QuickActionBar({ x, y, yBottom, onHighlight, onUnderline, onStrikethrough, onComment, onCopy }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ h: 68, w: 240 });
  useEffect(() => {
    if (barRef.current) {
      setSize({ h: barRef.current.offsetHeight, w: barRef.current.offsetWidth });
    }
  }, []);

  // Prefer above the selection. If that would collide with the top chrome, flip
  // to below. Never overlap the selection itself (gap of EDGE_PAD on both paths).
  const aboveTop = y - size.h - EDGE_PAD;
  const placeBelow = aboveTop < TOP_CHROME_PX;
  const top = placeBelow ? yBottom + EDGE_PAD : aboveTop;

  // Clamp horizontally so the (centre-anchored) bar stays fully on screen.
  const half = size.w / 2;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const left = Math.min(vw - half - EDGE_PAD, Math.max(half + EDGE_PAD, x));

  return (
    <div
      ref={barRef}
      className="fixed z-50 flex items-center gap-0.5 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl px-1.5 py-1"
      style={{ left, top, transform: "translateX(-50%)" }}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <Btn icon={<Highlighter  className="h-3.5 w-3.5 text-yellow-400" />} label="Highlight"  k="H" onClick={onHighlight} />
      <Btn icon={<Underline    className="h-3.5 w-3.5 text-sky-400"    />} label="Underline"  k="U" onClick={onUnderline} />
      <Btn icon={<Strikethrough className="h-3.5 w-3.5 text-red-400"  />} label="Strike"     k="S" onClick={onStrikethrough} />
      <div className="w-px h-9 bg-stone-700 mx-0.5" />
      <Btn icon={<MessageSquare className="h-3.5 w-3.5 text-stone-300"/>} label="Note"        onClick={onComment} />
      <Btn icon={<Copy          className="h-3.5 w-3.5 text-stone-300" />} label="Copy"        onClick={onCopy} />
    </div>
  );
}
