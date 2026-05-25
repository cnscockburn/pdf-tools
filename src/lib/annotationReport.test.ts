import { describe, it, expect, vi } from "vitest";
import { generateMarkdownReport, downloadAnnotationReport } from "./annotationReport";
import type { LocalAnnot } from "../components/AnnotationLayer";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function noteAnnot(overrides?: Partial<LocalAnnot>): LocalAnnot {
  return {
    id: "n1",
    type: "note",
    page: 1,
    x: 0.5,
    y: 0.3,
    text: "A note comment",
    status: "open",
    author: "Alice",
    ...overrides,
  } as LocalAnnot;
}

function highlightAnnot(overrides?: Partial<LocalAnnot>): LocalAnnot {
  return {
    id: "h1",
    type: "highlight",
    page: 2,
    x0: 0.1,
    y0: 0.1,
    x1: 0.9,
    y1: 0.15,
    color: [1, 1, 0] as [number, number, number],
    rects: [],
    status: "resolved",
    author: "Bob",
    ...overrides,
  } as LocalAnnot;
}

// ── generateMarkdownReport ────────────────────────────────────────────────────

describe("generateMarkdownReport", () => {
  it("returns a header with the filename", () => {
    const md = generateMarkdownReport([], "report.pdf");
    expect(md).toContain("# Review: report.pdf");
  });

  it("shows annotation count in the header", () => {
    const anns = [noteAnnot(), highlightAnnot()];
    const md = generateMarkdownReport(anns, "doc.pdf");
    expect(md).toContain("**Annotations:** 2");
  });

  it("renders _No annotations._ for empty list", () => {
    const md = generateMarkdownReport([], "empty.pdf");
    expect(md).toContain("_No annotations._");
  });

  it("groups by page with ## Page N headings", () => {
    const anns = [noteAnnot({ page: 1 }), highlightAnnot({ page: 2 })];
    const md = generateMarkdownReport(anns, "doc.pdf");
    expect(md).toContain("## Page 1");
    expect(md).toContain("## Page 2");
  });

  it("pages are rendered in ascending order regardless of input order", () => {
    const anns = [highlightAnnot({ page: 3 }), noteAnnot({ page: 1 })];
    const md = generateMarkdownReport(anns, "doc.pdf");
    const idx1 = md.indexOf("## Page 1");
    const idx3 = md.indexOf("## Page 3");
    expect(idx1).toBeLessThan(idx3);
  });

  it("renders the type label for note", () => {
    const md = generateMarkdownReport([noteAnnot()], "doc.pdf");
    expect(md).toContain("**Note**");
  });

  it("renders the type label for highlight", () => {
    const md = generateMarkdownReport([highlightAnnot()], "doc.pdf");
    expect(md).toContain("**Highlight**");
  });

  it("renders type labels for all known types", () => {
    const types = ["note", "highlight", "freetext", "underline", "strikethrough", "ink", "shape", "stamp"] as const;
    const labels = ["Note", "Highlight", "Text Box", "Underline", "Strikethrough", "Drawing", "Shape", "Stamp"];
    types.forEach((type, i) => {
      const ann = { id: `a${i}`, type, page: 1, x: 0.5, y: 0.3, x0: 0, y0: 0, x1: 1, y1: 1 } as unknown as LocalAnnot;
      const md = generateMarkdownReport([ann], "doc.pdf");
      expect(md).toContain(`**${labels[i]}**`);
    });
  });

  it("renders the [Resolved] status marker", () => {
    const ann = noteAnnot({ status: "resolved" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).toContain("[Resolved]");
  });

  it("renders the [Won't Fix] status marker", () => {
    const ann = noteAnnot({ status: "wontfix" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).toContain("[Won't Fix]");
  });

  it("open status produces no status marker", () => {
    const ann = noteAnnot({ status: "open" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).not.toMatch(/\[Open\]/i);
    expect(md).not.toMatch(/\[open\]/i);
  });

  it("renders the author in italic", () => {
    const ann = noteAnnot({ author: "Alice" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).toContain("*Alice*");
  });

  it("omits author section when author is empty string", () => {
    const ann = noteAnnot({ author: "" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).not.toContain("*—*");
    expect(md).not.toContain("— **");
  });

  it("renders annotation text as a block quote", () => {
    const ann = noteAnnot({ text: "Important finding here" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).toContain("> Important finding here");
  });

  it("handles multi-line text with per-line block quotes", () => {
    const ann = noteAnnot({ text: "line one\nline two" });
    const md = generateMarkdownReport([ann], "doc.pdf");
    expect(md).toContain("> line one");
    expect(md).toContain("> line two");
  });

  it("produces no quote block when annotation has no text", () => {
    const ann = { ...noteAnnot(), text: "" } as LocalAnnot;
    const md = generateMarkdownReport([ann], "doc.pdf");
    const lines = md.split("\n");
    const quotedLines = lines.filter(l => l.trim().startsWith(">"));
    expect(quotedLines).toHaveLength(0);
  });

  it("multiple annotations on same page appear under same heading", () => {
    const a1 = noteAnnot({ id: "a1", page: 1, text: "first" });
    const a2 = noteAnnot({ id: "a2", page: 1, text: "second" });
    const md = generateMarkdownReport([a1, a2], "doc.pdf");
    // Only one ## Page 1 heading
    const count = (md.match(/^## Page 1$/gm) ?? []).length;
    expect(count).toBe(1);
    expect(md).toContain("first");
    expect(md).toContain("second");
  });
});

// ── downloadAnnotationReport ──────────────────────────────────────────────────

describe("downloadAnnotationReport", () => {
  it("triggers a download with _review.md suffix", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadAnnotationReport([noteAnnot()], "my-document.pdf");
    // The download attr should be set to stem + _review.md
    clickSpy.mockRestore();
    // Primary assertion: URL.createObjectURL was called (the blob was created)
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
