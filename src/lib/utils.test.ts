import { describe, it, expect, vi, beforeEach } from "vitest";
import { cn, downloadBlob, formatBytes, parsePageRanges } from "./utils";

// ── cn (class-name merger) ────────────────────────────────────────────────────

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("handles conditional object syntax", () => {
    expect(cn({ "text-red-500": true, "text-green-500": false })).toBe("text-red-500");
  });

  it("returns empty string when all falsy", () => {
    expect(cn(false, undefined)).toBe("");
  });
});

// ── formatBytes ───────────────────────────────────────────────────────────────

describe("formatBytes", () => {
  it("formats bytes under 1 KB as B", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats values in KB range", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats values in MB range", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("boundary: exactly 1 KB is not shown as B", () => {
    expect(formatBytes(1024)).toContain("KB");
  });

  it("boundary: exactly 1 MB is not shown as KB", () => {
    expect(formatBytes(1024 * 1024)).toContain("MB");
  });
});

// ── parsePageRanges ───────────────────────────────────────────────────────────

describe("parsePageRanges", () => {
  const total = 10;

  it("parses a single page number", () => {
    expect(parsePageRanges("3", total)).toEqual([3]);
  });

  it("parses a simple range", () => {
    expect(parsePageRanges("2-5", total)).toEqual([2, 3, 4, 5]);
  });

  it("parses multiple comma-separated items", () => {
    expect(parsePageRanges("1, 3, 5", total)).toEqual([1, 3, 5]);
  });

  it("parses mixed ranges and singles", () => {
    expect(parsePageRanges("1-3, 5, 8-9", total)).toEqual([1, 2, 3, 5, 8, 9]);
  });

  it("deduplicates pages", () => {
    expect(parsePageRanges("1-3, 2-4", total)).toEqual([1, 2, 3, 4]);
  });

  it("sorts the result numerically", () => {
    expect(parsePageRanges("9, 1, 5", total)).toEqual([1, 5, 9]);
  });

  it("clamps range end to totalPages", () => {
    expect(parsePageRanges("8-15", total)).toEqual([8, 9, 10]);
  });

  it("ignores page 0 and negative pages", () => {
    expect(parsePageRanges("0, -1, 1", total)).toEqual([1]);
  });

  it("ignores pages beyond totalPages", () => {
    expect(parsePageRanges("11, 12", total)).toEqual([]);
  });

  it("open-ended range (no end after dash) uses totalPages as end", () => {
    expect(parsePageRanges("8-", total)).toEqual([8, 9, 10]);
  });

  it("returns empty array for empty input", () => {
    expect(parsePageRanges("", total)).toEqual([]);
  });

  it("ignores non-numeric tokens", () => {
    expect(parsePageRanges("abc, 3", total)).toEqual([3]);
  });

  it("works with a 1-page document", () => {
    expect(parsePageRanges("1", 1)).toEqual([1]);
    expect(parsePageRanges("1-1", 1)).toEqual([1]);
  });
});

// ── downloadBlob ──────────────────────────────────────────────────────────────

describe("downloadBlob", () => {
  beforeEach(() => {
    // jsdom doesn't implement click on anchor; stub it
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  it("creates a temporary anchor and clicks it", () => {
    const blob = new Blob(["test"], { type: "application/pdf" });
    downloadBlob(blob, "test.pdf");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("sets the correct download filename", () => {
    const blob = new Blob(["data"]);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        expect(this.download).toBe("output.pdf");
      }
    );
    downloadBlob(blob, "output.pdf");
    clickSpy.mockRestore();
  });

  it("calls URL.createObjectURL", () => {
    downloadBlob(new Blob(["x"]), "x.pdf");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});
