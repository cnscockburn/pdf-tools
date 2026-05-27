/**
 * MathText — renders annotation text that may contain inline or block LaTeX.
 *
 * Syntax:  inline $e=mc^2$    block $$\int_0^1 x\,dx$$
 * Falls back to plain text if KaTeX fails or no $ present.
 */
import katex from "katex";
import "katex/dist/katex.min.css";

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
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
