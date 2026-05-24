import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cn } from "../lib/utils";

interface Props {
  file: File;
  selectable?: boolean;
  selected?: Set<number>;
  onToggle?: (page: number) => void;
  /** Controlled order for rearrange mode (1-indexed page numbers) */
  order?: number[];
}

export function usePdfThumbnails(file: File | null, scale = 0.25) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setLoading(true);
    setThumbnails([]);

    (async () => {
      const buf = await file.arrayBuffer();
      const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({ data: buf }).promise;
      if (cancelled) return;
      setPageCount(pdf.numPages);
      const thumbs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        // White fill prevents transparent-canvas-looks-black issue
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        thumbs.push(canvas.toDataURL());
        if (!cancelled) setThumbnails([...thumbs]);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [file, scale]);

  return { thumbnails, pageCount, loading };
}

export default function PageThumbnailGrid({ file, selectable, selected, onToggle, order }: Props) {
  const { thumbnails, pageCount, loading } = usePdfThumbnails(file);
  const display = order ?? Array.from({ length: pageCount }, (_, i) => i + 1);

  if (loading && thumbnails.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Rendering pages…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
      {display.map((pageNum, idx) => {
        const thumb = thumbnails[pageNum - 1];
        const isSelected = selected?.has(pageNum) ?? false;
        return (
          <button
            key={`${pageNum}-${idx}`}
            onClick={() => selectable && onToggle?.(pageNum)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border-2 p-1 transition",
              selectable ? "cursor-pointer" : "cursor-default",
              isSelected
                ? "border-brand-500 bg-brand-50"
                : "border-gray-200 hover:border-gray-300 bg-white"
            )}
          >
            {thumb ? (
              <img src={thumb} alt={`Page ${pageNum}`} className="w-full rounded shadow-sm" />
            ) : (
              <div className="w-full aspect-[3/4] bg-gray-100 rounded animate-pulse" />
            )}
            <span className="text-[10px] text-gray-500">p.{pageNum}</span>
          </button>
        );
      })}
    </div>
  );
}
