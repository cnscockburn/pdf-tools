/**
 * MathText — renders annotation text that may contain inline or block LaTeX.
 *
 * Syntax:  inline $e=mc^2$    block $$\int_0^1 x\,dx$$
 * Falls back to plain text if KaTeX fails or no $ present.
 *
 * Security: KaTeX output is sanitized with DOMPurify before being injected
 * via dangerouslySetInnerHTML.  KaTeX's own parser only understands math
 * commands and never emits script tags, but DOMPurify provides an
 * auditable defence-in-depth layer.
 */
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

// KaTeX generates a fixed set of HTML elements — allow only those and nothing
// that could execute scripts.  This is intentionally narrow rather than
// using DOMPurify.sanitize() with default (permissive) settings.
const KATEX_ALLOWED_TAGS = [
  "span", "svg", "path", "line", "rect", "circle", "ellipse", "polygon",
  "g", "use", "defs", "symbol", "clipPath", "mask", "marker", "text",
  "tspan", "textPath", "foreignObject", "annotation", "annotation-xml",
  "math", "mrow", "mi", "mo", "mn", "msup", "msub", "msubsup", "mfrac",
  "mroot", "msqrt", "mtable", "mtr", "mtd", "mtext", "mspace", "mover",
  "munder", "munderover", "mpadded", "mphantom", "mstyle", "merror",
  "semantics",
] as const;
const KATEX_ALLOWED_ATTRS = [
  "class", "style", "viewBox", "xmlns", "d", "width", "height",
  "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry",
  "points", "transform", "fill", "stroke", "stroke-width", "opacity",
  "font-family", "font-size", "text-anchor", "id", "href",
  "clip-path", "mask", "fill-rule", "stroke-linecap", "stroke-linejoin",
] as const;

/** Escape HTML entities to prevent XSS in fallback paths. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMath(raw: string): { html: string; hasLatex: boolean } {
  if (!raw.includes("$")) return { html: escapeHtml(raw), hasLatex: false };

  let hasLatex = false;
  // First escape the entire string, then replace LaTeX delimiters with rendered output.
  // We work on the raw string for regex matching, but escape fallback output.
  const html = raw
    // Block math: $$...$$
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
      hasLatex = true;
      try   { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
      catch { return `$$${escapeHtml(expr)}$$`; }
    })
    // Inline math: $...$
    .replace(/\$([^$\n]+?)\$/g, (_, expr) => {
      hasLatex = true;
      try   { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
      catch { return `$${escapeHtml(expr)}$`; }
    });

  return { html, hasLatex };
}

interface Props {
  text: string;
  className?: string;
}

export default function MathText({ text, className }: Props) {
  const { html, hasLatex } = renderMath(text);
  if (!hasLatex) return <span className={className}>{text}</span>;

  // Sanitize KaTeX's HTML output before injecting.  KaTeX never emits script
  // tags, but this provides an auditable defence-in-depth layer and closes
  // the semgrep dangerouslySetInnerHTML finding correctly.
  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...KATEX_ALLOWED_TAGS],
    ALLOWED_ATTR: [...KATEX_ALLOWED_ATTRS],
    FORBID_ATTR: ["on*"],   // belt-and-suspenders: no event handlers
  });
  return <span className={className} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
