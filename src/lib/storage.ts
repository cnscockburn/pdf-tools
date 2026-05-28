import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Snippet {
  id: string;
  text: string;
}

export interface UserBookmark {
  id: string;
  page: number;
  label: string;
}

export type UiScale = 1 | 1.25 | 1.5;

export interface Settings {
  /** Display name stamped on new annotations. */
  author: string;
  /** Saved comment snippets (reusable text). */
  snippets: Snippet[];
  /**
   * Custom labels for the 4 highlight colors (index 0-3 = Yellow, Cyan, Green, Pink).
   * Overrides the default colour names everywhere they are displayed.
   * When undefined or shorter than 4, missing entries fall back to defaults.
   */
  colorLabels: [string, string, string, string];
  /** Global UI zoom factor — 1 = 100%, 1.25 = 125%, 1.5 = 150%. */
  uiScale: UiScale;
}

// ── Persistence ──────────────────────────────────────────────────────────────

const KEY = "pdf-tools-settings";
const BOOKMARKS_KEY = "pdf-tools-bookmarks";

export const DEFAULT_COLOR_LABELS: [string, string, string, string] = ["Yellow", "Cyan", "Green", "Pink"];

function defaults(): Settings {
  return { author: "", snippets: [], colorLabels: [...DEFAULT_COLOR_LABELS], uiScale: 1.25 };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      const d = defaults();
      return {
        ...d,
        ...parsed,
        // Ensure colorLabels is always a 4-element tuple, filling gaps from defaults
        colorLabels: [
          parsed.colorLabels?.[0] ?? d.colorLabels[0],
          parsed.colorLabels?.[1] ?? d.colorLabels[1],
          parsed.colorLabels?.[2] ?? d.colorLabels[2],
          parsed.colorLabels?.[3] ?? d.colorLabels[3],
        ],
        uiScale: ([1, 1.25, 1.5] as UiScale[]).includes(parsed.uiScale as UiScale)
          ? (parsed.uiScale as UiScale)
          : d.uiScale,
      };
    }
  } catch { /* ignore */ }
  return defaults();
}

function persist(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function loadBookmarksRaw(): UserBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function persistBookmarks(b: UserBookmark[]) {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  function updateSettings(updates: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      persist(next);
      return next;
    });
  }

  function addSnippet(text: string) {
    if (!text.trim()) return;
    updateSettings({
      snippets: [
        ...settings.snippets.filter(s => s.text !== text.trim()),
        { id: `sn${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: text.trim() },
      ],
    });
  }

  function removeSnippet(id: string) {
    updateSettings({ snippets: settings.snippets.filter(s => s.id !== id) });
  }

  return { settings, updateSettings, addSnippet, removeSnippet };
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<UserBookmark[]>(loadBookmarksRaw);

  function addBookmark(page: number, label?: string) {
    setBookmarks(prev => {
      if (prev.some(b => b.page === page)) return prev;
      const next = [...prev, { id: `bk${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, page, label: label ?? `Page ${page}` }]
        .sort((a, b) => a.page - b.page);
      persistBookmarks(next);
      return next;
    });
  }

  function removeBookmark(id: string) {
    setBookmarks(prev => {
      const next = prev.filter(b => b.id !== id);
      persistBookmarks(next);
      return next;
    });
  }

  function renameBookmark(id: string, label: string) {
    setBookmarks(prev => {
      const next = prev.map(b => b.id === id ? { ...b, label } : b);
      persistBookmarks(next);
      return next;
    });
  }

  return { bookmarks, addBookmark, removeBookmark, renameBookmark };
}
