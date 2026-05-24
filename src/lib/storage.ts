import { useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Settings {
  /** Display name stamped on new annotations. */
  author: string;
}

// ── Persistence ──────────────────────────────────────────────────────────────

const KEY = "pdf-tools-settings";

function defaults(): Settings {
  return { author: "" };
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  function updateSettings(updates: Partial<Settings>) {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      persist(next);
      return next;
    });
  }

  return { settings, updateSettings };
}
