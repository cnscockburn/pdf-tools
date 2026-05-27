/**
 * Tab system — replaces React Router for in-app navigation.
 *
 * Each tab is an independent mount of a page component (Home, Viewer, Merge, etc.).
 * Inactive tabs stay in the DOM (display:none) so all React state is preserved.
 */
import { createContext, useContext } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type TabType = "home" | "viewer" | "merge" | "rearrange" | "images-to-pdf";

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  /** Passed to the page component on first mount. */
  initialFile?: File;
  /** For Viewer tabs: pre-select a tool panel or mode on load. */
  toolHint?: string;
  /**
   * Whether this Home tab is "ephemeral" — created by Ctrl+T or the + button.
   * Ephemeral Home tabs auto-close when the user opens something from them.
   * The very first Home tab (on app launch) is NOT ephemeral.
   */
  ephemeral?: boolean;
}

export type SplitDirection = "horizontal" | "vertical";

export interface TabContextValue {
  tabs: Tab[];
  activeTabId: string;
  /** Open a new tab and return its id. Automatically switches to it. */
  openTab: (type: TabType, opts?: { file?: File; toolHint?: string; title?: string }) => string;
  /** Close a tab by id. If it's the last tab, a new Home tab opens. */
  closeTab: (id: string) => void;
  /** Switch to an existing tab by id. */
  switchTab: (id: string) => void;
  /** Update the display title of a tab (e.g. when a file is loaded). */
  updateTabTitle: (id: string, title: string) => void;

  // ── Side by side ────────────────────────────────────────────────────────
  /** The id of the tab in the secondary (right/bottom) pane, or null. */
  sideBySideTabId: string | null;
  /** Direction: horizontal = left/right, vertical = top/bottom. */
  sideBySideDirection: SplitDirection;
  /**
   * Open a second pane alongside the active tab.
   * - mode "mirror": duplicates the current file into the second pane.
   * - mode "new": opens an empty viewer in the second pane.
   */
  openSideBySide: (direction: SplitDirection, mode: "mirror" | "new", currentFile?: File | null) => void;
  /** Close the side-by-side pane, keeping the active tab. */
  closeSideBySide: () => void;
  /** Whether side-by-side is currently active. */
  isSideBySide: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

let _tabSeq = 0;

export function newTabId(): string {
  return `tab_${Date.now()}_${(++_tabSeq).toString(36)}`;
}

const TAB_TYPE_TITLES: Record<TabType, string> = {
  home: "Home",
  viewer: "Viewer",
  merge: "Merge",
  rearrange: "Rearrange",
  "images-to-pdf": "Images to PDF",
};

export function defaultTabTitle(type: TabType): string {
  return TAB_TYPE_TITLES[type];
}

// ── Context ──────────────────────────────────────────────────────────────────

export const TabContext = createContext<TabContextValue | null>(null);

export function useTabContext(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabContext must be used inside <TabShell>");
  return ctx;
}
