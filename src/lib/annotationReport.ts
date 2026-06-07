import type { LocalAnnot } from "../components/AnnotationLayer";
import { downloadBlob } from "./utils";

// ── Shared type ───────────────────────────────────────────────────────────────

export interface ReportAnnotation {
  page: number;
  type: string;
  text: string;
  author: string;
  status: string;
  tags: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(type: string): string {
  const MAP: Record<string, string> = {
    note: "Note", highlight: "Highlight", freetext: "Text Box",
    underline: "Underline", strikethrough: "Strikethrough",
    ink: "Drawing", shape: "Shape", stamp: "Stamp",
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
      const a = ann as { author?: string; status?: string };
      const author = a.author ? ` — *${a.author}*` : "";
      const status = statusLabel(a.status);
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

// ── Flat row helper shared by CSV + JSON ──────────────────────────────────────

function toRow(ann: LocalAnnot): ReportAnnotation {
  const a = ann as { author?: string; status?: string; tags?: string[] };
  return {
    page:   ann.page,
    type:   typeLabel(ann.type),
    text:   annotText(ann),
    author: a.author ?? "",
    status: a.status  ?? "open",
    tags:   (a.tags ?? []).join("; "),
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

const CSV_COLS: (keyof ReportAnnotation)[] = ["page", "type", "text", "author", "status", "tags"];

function escapeCsv(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function generateCsvReport(annotations: LocalAnnot[]): string {
  const header = CSV_COLS.join(",");
  const rows = annotations
    .slice()
    .sort((a, b) => a.page - b.page)
    .map(ann => {
      const r = toRow(ann);
      return CSV_COLS.map(k => escapeCsv(r[k])).join(",");
    });
  return [header, ...rows].join("\r\n");
}

// ── JSON ──────────────────────────────────────────────────────────────────────

export function generateJsonReport(
  annotations: LocalAnnot[],
  filename: string,
): string {
  const rows = annotations
    .slice()
    .sort((a, b) => a.page - b.page)
    .map(toRow);
  return JSON.stringify(
    { filename, generated: new Date().toISOString(), count: rows.length, annotations: rows },
    null,
    2,
  );
}

// ── Download helpers ──────────────────────────────────────────────────────────

export function downloadAnnotationReport(annotations: LocalAnnot[], filename: string) {
  const md = generateMarkdownReport(annotations, filename);
  const stem = filename.replace(/\.pdf$/i, "");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  downloadBlob(blob, `${stem}_review.md`);
}

export function downloadAnnotationCsv(annotations: LocalAnnot[], filename: string) {
  const csv = generateCsvReport(annotations);
  const stem = filename.replace(/\.pdf$/i, "");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${stem}_review.csv`);
}

export function downloadAnnotationJson(annotations: LocalAnnot[], filename: string) {
  const json = generateJsonReport(annotations, filename);
  const stem = filename.replace(/\.pdf$/i, "");
  downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), `${stem}_review.json`);
}
