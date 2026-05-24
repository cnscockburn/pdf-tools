import type { LocalAnnot } from "../components/AnnotationLayer";
import { downloadBlob } from "./utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(type: string): string {
  const MAP: Record<string, string> = {
    note: "Note",
    highlight: "Highlight",
    freetext: "Text Box",
    underline: "Underline",
    strikethrough: "Strikethrough",
  };
  return MAP[type] ?? type;
}

function statusLabel(status?: string): string {
  if (!status || status === "open")    return "";
  if (status === "resolved")           return " [Resolved]";
  if (status === "wontfix")            return " [Won't Fix]";
  return ` [${status}]`;
}

function annotText(ann: LocalAnnot): string {
  if ("text" in ann && ann.text) return ann.text;
  return "";
}

// ── Report generation ─────────────────────────────────────────────────────────

export function generateMarkdownReport(annotations: LocalAnnot[], filename: string): string {
  const lines: string[] = [
    `# Review: ${filename}`,
    ``,
    `**Annotations:** ${annotations.length}  `,
    `**Generated:** ${new Date().toLocaleString()}`,
    ``,
    `---`,
    ``,
  ];

  if (annotations.length === 0) {
    lines.push("_No annotations._");
    return lines.join("\n");
  }

  // Group by page
  const byPage = new Map<number, LocalAnnot[]>();
  for (const ann of annotations) {
    const list = byPage.get(ann.page) ?? [];
    list.push(ann);
    byPage.set(ann.page, list);
  }

  for (const page of Array.from(byPage.keys()).sort((a, b) => a - b)) {
    lines.push(`## Page ${page}`, ``);
    for (const ann of byPage.get(page)!) {
      const author = ann.author ? ` — *${ann.author}*` : "";
      const status = statusLabel(ann.status);
      const text = annotText(ann);
      lines.push(`- **${typeLabel(ann.type)}**${status}${author}`);
      if (text) {
        // Indent multi-line quote
        const quoted = text.split("\n").map(l => `  > ${l}`).join("\n");
        lines.push(quoted);
      }
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export function downloadAnnotationReport(annotations: LocalAnnot[], filename: string) {
  const md = generateMarkdownReport(annotations, filename);
  const stem = filename.replace(/\.pdf$/i, "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${stem}_review.md`);
}
