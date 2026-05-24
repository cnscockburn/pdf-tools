/**
 * QuickActionBar — floats above a text selection.
 * Parent is responsible for positioning (viewport px coords).
 */
import { Highlighter, Underline, Strikethrough, MessageSquare, Copy } from "lucide-react";

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

const BTN = "flex items-center justify-center p-1.5 rounded hover:bg-gray-700 transition";

export default function QuickActionBar({ x, y, onHighlight, onUnderline, onStrikethrough, onComment, onCopy }: Props) {
  return (
    <div
      className="fixed z-50 flex items-center gap-0.5 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl px-1.5 py-1"
      style={{ left: x, top: y - 46, transform: "translateX(-50%)" }}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <button className={BTN} title="Highlight (H)" onClick={onHighlight}>
        <Highlighter className="h-3.5 w-3.5 text-yellow-400" />
      </button>
      <button className={BTN} title="Underline (U)" onClick={onUnderline}>
        <Underline className="h-3.5 w-3.5 text-blue-400" />
      </button>
      <button className={BTN} title="Strikethrough (S)" onClick={onStrikethrough}>
        <Strikethrough className="h-3.5 w-3.5 text-red-400" />
      </button>
      <div className="w-px h-3.5 bg-gray-700 mx-0.5" />
      <button className={BTN} title="Add note" onClick={onComment}>
        <MessageSquare className="h-3.5 w-3.5 text-gray-300" />
      </button>
      <button className={BTN} title="Copy text" onClick={onCopy}>
        <Copy className="h-3.5 w-3.5 text-gray-300" />
      </button>
    </div>
  );
}
