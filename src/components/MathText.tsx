/**
 * MathText — renders annotation text that may contain inline or block LaTeX.
 *
 * Syntax:  inline $e=mc^2$    block $$\int_0^1 x\,dx$$
 * Falls back to plain text if KaTeX fails or no $ present.
 */
import katex from "katex";
import "katex/dist/katex.min.css";

function renderMath(raw: string): { html: string; hasLatex: boolean } {
  if (!raw.includes("$")) return { html: raw, hasLatex: false };

  let hasLatex = false;
  const html = raw
    // Block math: $$...$$
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
      hasLatex = true;
      try   { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
      catch { return `$$${expr}$$`; }
    })
    // Inline math: $...$
    .replace(/\$([^$\n]+?)\$/g, (_, expr) => {
      hasLatex = true;
      try   { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
      catch { return `$${expr}$`; }
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
