/**
 * OutlinePanel — renders the PDF table-of-contents / bookmark tree.
 *
 * Requires the PDFDocumentProxy; clicking any entry jumps to that page.
 */
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { cn } from "../lib/utils";

// PDF.js outline node shape
interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  items: OutlineNode[];
  bold?: boolean;
  italic?: boolean;
}

async function resolvePageIndex(pdf: PDFDocumentProxy, dest: string | unknown[] | null): Promise<number | null> {
  try {
    if (!dest) return null;
    let d: unknown[] | null = null;
    if (typeof dest === "string") {
      d = await pdf.getDestination(dest) as unknown[] | null;
    } else {
      d = dest as unknown[];
    }
    if (!d || !d[0]) return null;
    const pageIndex = await pdf.getPageIndex(d[0] as { num: number; gen: number });
    return pageIndex; // 0-indexed
  } catch {
    return null;
  }
}

interface NodeProps {
  node: OutlineNode;
  pdf: PDFDocumentProxy;
  depth: number;
  onGoTo: (page: number) => void;
  currentPage: number;
}

function OutlineNode({ node, pdf, depth, onGoTo, currentPage }: NodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.items && node.items.length > 0;

  // Navigation only — clicking the row jumps to the section. It does NOT toggle
  // the children (that would collapse a heading the first time you navigate to
  // it). Expand/collapse is driven solely by the chevron below.
  async function handleNavigate() {
    const idx = await resolvePageIndex(pdf, node.dest);
    if (idx !== null) onGoTo(idx + 1);
  }

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(v => !v);
  }

  return (
    <div>
      <div
        className="w-full flex items-center gap-1.5 pr-3 hover:bg-stone-800 viewer-light:hover:bg-stone-100 transition group"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Collapse section" : "Expand section"}
            onClick={handleToggle}
            className="shrink-0 text-stone-600 hover:text-stone-300 rounded transition py-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/50"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="shrink-0 text-stone-600"><span className="w-3 inline-block" /></span>
        )}
        <button
          type="button"
          onClick={handleNavigate}
          className={cn(
            "text-xs truncate flex-1 text-left py-2",
            node.bold ? "font-semibold" : "font-normal",
            node.italic ? "italic" : "",
            "text-stone-300 group-hover:text-white"
          )}
        >
          {node.title || "Untitled"}
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.items.map((child, i) => (
            <OutlineNode key={i} node={child} pdf={pdf} depth={depth + 1}
              onGoTo={onGoTo} currentPage={currentPage} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  pdf: PDFDocumentProxy;
  currentPage: number;
  onGoTo: (page: number) => void;
  /** When embedded in the combined Document panel: render at natural height and
   *  stay silent (render nothing) when the PDF has no outline. */
  embedded?: boolean;
}

export default function OutlinePanel({ pdf, currentPage, onGoTo, embedded }: Props) {
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ol = await pdf.getOutline() as OutlineNode[] | null;
        if (!cancelled) setOutline(ol);
      } catch {
        if (!cancelled) setOutline(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdf]);

  if (loading) {
    if (embedded) return <p className="px-3 py-2 text-[11px] text-stone-600">Loading outline…</p>;
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <span className="text-xs text-stone-500 animate-pulse">Loading outline…</span>
      </div>
    );
  }

  if (!outline || outline.length === 0) {
    // Embedded: stay silent so the combined Document panel can hide the section.
    if (embedded) return null;
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <BookOpen className="h-7 w-7 text-stone-600" />
        <p className="text-xs text-stone-500">This PDF has no bookmarks / table of contents.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "flex-1 overflow-y-auto"}>
      {outline.map((node, i) => (
        <OutlineNode key={i} node={node} pdf={pdf} depth={0}
          onGoTo={onGoTo} currentPage={currentPage} />
      ))}
    </div>
  );
}
