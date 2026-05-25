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

export interface Settings {
  /** Display name stamped on new annotations. */
  author: string;
  /** Saved comment snippets (reusable text). */
  snippets: Snippet[];
}

// ── Persistence ──────────────────────────────────────────────────────────────

const KEY = "pdf-tools-settings";
const BOOKMARKS_KEY = "pdf-tools-bookmarks";

function defaults(): Settings {
  return { author: "", snippets: [] };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
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
