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
  /** Top of the bar anchor — bar appears above this y */
  y: number;
  onHighlight:     () => void;
  onUnderline:     () => void;
  onStrikethrough: () => void;
  onComment:       () => void;
  onCopy:          () => void;
}

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

export default function QuickActionBar({ x, y, onHighlight, onUnderline, onStrikethrough, onComment, onCopy }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(68);
  useEffect(() => {
    if (barRef.current) setBarH(barRef.current.offsetHeight + 8);
  }, []);

  return (
    <div
      ref={barRef}
      className="fixed z-50 flex items-center gap-0.5 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl px-1.5 py-1"
      style={{ left: x, top: y - barH, transform: "translateX(-50%)" }}
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
