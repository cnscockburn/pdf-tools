/**
 * TextLayer — renders the PDF.js text layer over the PDF canvas.
 *
 * When `active` is true the div intercepts pointer events and allows the
 * browser's native text selection.  When false it is purely presentational
 * (transparent, pointer-events none) but still renders the text nodes so
 * that Ctrl+F search highlighting works via the `.search-highlight` class.
 */
import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { TextLayer as PdfTextLayer } from "pdfjs-dist";

interface Props {
  pdf: PDFDocumentProxy;
  pageNum: number;
  scale: number;
  /** Allow text selection (pointer-events: auto) */
  active: boolean;
}

export default function TextLayer({ pdf, pageNum, scale, active }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = divRef.current;
    if (!container) return;
    let cancelled = false;
    let layer: InstanceType<typeof PdfTextLayer> | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        container.style.width  = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;
        container.innerHTML    = "";

        layer = new PdfTextLayer({
          textContentSource: page.streamTextContent(),
          container,
          viewport,
        });
        await layer.render();
      } catch {
        /* cancelled or page gone — ignore */
      }
    })();

    return () => {
      cancelled = true;
      layer?.cancel();
      if (divRef.current) divRef.current.innerHTML = "";
    };
  }, [pdf, pageNum, scale]);

  return (
    <div
      ref={divRef}
      className="textLayer absolute inset-0 overflow-hidden leading-none"
      style={{
        pointerEvents: active ? "auto" : "none",
        userSelect:    active ? "text"  : "none",
        zIndex: 3,
      }}
    />
  );
}
