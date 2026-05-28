/**
 * SettingsContext — app-wide settings accessible from any component.
 *
 * The context is provided once at the TabShell level so every tab
 * (Home, Viewer, Merge, …) shares the same Settings instance and the
 * same "open preferences" action.
 */
import { createContext, useContext } from "react";
import type { Settings } from "./storage";

export interface SettingsContextValue {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  addSnippet: (text: string) => void;
  removeSnippet: (id: string) => void;
  /** Whether the preferences dialog is currently open. */
  settingsOpen: boolean;
  /** Open the preferences dialog from anywhere in the app. */
  openSettings: () => void;
  /** Close the preferences dialog. */
  closeSettings: () => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * useSettingsContext — must be called inside a SettingsContext.Provider.
 * Throws if called outside (fail-fast for mis-wired components).
 */
export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be used inside a SettingsContext.Provider");
  return ctx;
}
