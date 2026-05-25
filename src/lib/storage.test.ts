import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSettings, useSettings, useBookmarks } from "./storage";
import { renderHook, act } from "@testing-library/react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStorage() {
  localStorage.clear();
}

// ── loadSettings ──────────────────────────────────────────────────────────────

describe("loadSettings", () => {
  beforeEach(resetStorage);

  it("returns defaults when localStorage is empty", () => {
    const s = loadSettings();
    expect(s.author).toBe("");
    expect(s.snippets).toEqual([]);
  });

  it("returns saved author", () => {
    localStorage.setItem("pdf-tools-settings", JSON.stringify({ author: "Alice", snippets: [] }));
    const s = loadSettings();
    expect(s.author).toBe("Alice");
  });

  it("merges saved values with defaults (partial data)", () => {
    localStorage.setItem("pdf-tools-settings", JSON.stringify({ author: "Bob" }));
    const s = loadSettings();
    expect(s.author).toBe("Bob");
    expect(s.snippets).toEqual([]);
  });

  it("falls back to defaults on corrupted JSON", () => {
    localStorage.setItem("pdf-tools-settings", "{ not json }}}");
    const s = loadSettings();
    expect(s.author).toBe("");
    expect(s.snippets).toEqual([]);
  });
});

// ── useSettings hook ──────────────────────────────────────────────────────────

describe("useSettings", () => {
  beforeEach(resetStorage);

  it("initialises with persisted author", () => {
    localStorage.setItem("pdf-tools-settings", JSON.stringify({ author: "Carol", snippets: [] }));
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.author).toBe("Carol");
  });

  it("updateSettings patches specific fields", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.updateSettings({ author: "Dave" }));
    expect(result.current.settings.author).toBe("Dave");
  });

  it("persists updated settings to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.updateSettings({ author: "Eve" }));
    const stored = JSON.parse(localStorage.getItem("pdf-tools-settings") ?? "{}");
    expect(stored.author).toBe("Eve");
  });

  it("updateSettings does not clobber unrelated fields", () => {
    const { result } = renderHook(() => useSettings());
    act(() => result.current.updateSettings({ snippets: [{ id: "s1", text: "Note this" }] }));
    act(() => result.current.updateSettings({ author: "Frank" }));
    expect(result.current.settings.snippets).toHaveLength(1);
    expect(result.current.settings.author).toBe("Frank");
  });
});

// ── useBookmarks hook ─────────────────────────────────────────────────────────

describe("useBookmarks", () => {
  beforeEach(resetStorage);

  it("starts with no bookmarks when storage is empty", () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks).toEqual([]);
  });

  it("addBookmark adds a bookmark with auto-label", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.addBookmark(5));
    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].page).toBe(5);
    expect(result.current.bookmarks[0].label).toBe("Page 5");
  });

  it("addBookmark accepts a custom label", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.addBookmark(3, "My bookmark"));
    expect(result.current.bookmarks[0].label).toBe("My bookmark");
  });

  it("addBookmark ignores duplicate page numbers", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => {
      result.current.addBookmark(7);
      result.current.addBookmark(7);
    });
    expect(result.current.bookmarks).toHaveLength(1);
  });

  it("bookmarks are sorted by page number", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => {
      result.current.addBookmark(10);
      result.current.addBookmark(2);
      result.current.addBookmark(6);
    });
    const pages = result.current.bookmarks.map(b => b.page);
    expect(pages).toEqual([2, 6, 10]);
  });

  it("removeBookmark removes the correct bookmark", () => {
    // Use fake timers so the two addBookmark calls get distinct Date.now() values
    // (bookmark IDs are `bk${Date.now()}` — same ms = duplicate id = both removed).
    vi.useFakeTimers();
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.addBookmark(1));
    vi.advanceTimersByTime(1);
    act(() => result.current.addBookmark(2));
    vi.useRealTimers();
    // bookmarks are sorted: [page=1, page=2]; remove page=1
    const idToRemove = result.current.bookmarks[0].id;
    act(() => result.current.removeBookmark(idToRemove));
    expect(result.current.bookmarks).toHaveLength(1);
    expect(result.current.bookmarks[0].page).toBe(2);
  });

  it("renameBookmark updates the label", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.addBookmark(4));
    const id = result.current.bookmarks[0].id;
    act(() => result.current.renameBookmark(id, "Chapter 1"));
    expect(result.current.bookmarks[0].label).toBe("Chapter 1");
  });

  it("persists bookmarks to localStorage", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => result.current.addBookmark(3, "Section A"));
    const raw = localStorage.getItem("pdf-tools-bookmarks");
    expect(raw).toBeTruthy();
    const saved = JSON.parse(raw!);
    expect(saved[0].page).toBe(3);
    expect(saved[0].label).toBe("Section A");
  });

  it("loads existing bookmarks from localStorage on mount", () => {
    localStorage.setItem(
      "pdf-tools-bookmarks",
      JSON.stringify([{ id: "bk-existing", page: 8, label: "Appendix" }])
    );
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.bookmarks[0].page).toBe(8);
    expect(result.current.bookmarks[0].label).toBe("Appendix");
  });
});
