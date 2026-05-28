/**
 * TabBar — horizontal tab strip for switching between open documents/tools.
 *
 * Sits at the top of the window. Each tab shows an icon (by type), a title,
 * and a close button. The active tab has an amber bottom accent.
 *
 * Keyboard: Ctrl+T = new tab, Ctrl+W = close active, Ctrl+Tab / Ctrl+Shift+Tab = cycle.
 */
import { useEffect } from "react";
import {
  Home, FileText, Layers, LayoutGrid, FileImage, Plus, X, Settings,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { Tab, TabType } from "../lib/tabs";

// ── Icon map ─────────────────────────────────────────────────────────────────

const TAB_ICONS: Record<TabType, React.ReactNode> = {
  home:            <Home      className="h-3 w-3" />,
  viewer:          <FileText  className="h-3 w-3" />,
  merge:           <Layers    className="h-3 w-3" />,
  rearrange:       <LayoutGrid className="h-3 w-3" />,
  "images-to-pdf": <FileImage className="h-3 w-3" />,
};

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  tabs: Tab[];
  activeTabId: string;
  sideBySideTabId?: string | null;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
  onOpenSettings: () => void;
}

export default function TabBar({ tabs, activeTabId, sideBySideTabId, onSwitch, onClose, onNewTab, onOpenSettings }: Props) {
  // Global keyboard shortcuts for tab management
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+T — new tab
      if (ctrl && e.key === "t") {
        e.preventDefault();
        onNewTab();
        return;
      }

      // Ctrl+W — close active tab
      if (ctrl && e.key === "w") {
        e.preventDefault();
        onClose(activeTabId);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx < 0) return;
        const next = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        onSwitch(tabs[next].id);
        return;
      }

      // Ctrl+1–9 — jump to tab by position
      if (ctrl && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const i = parseInt(e.key) - 1;
        if (i < tabs.length) onSwitch(tabs[i].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, activeTabId, onSwitch, onClose, onNewTab]);

  return (
    <div className="bg-stone-900 border-b border-stone-700 flex items-end gap-0 shrink-0 overflow-x-auto scrollbar-none select-none"
      role="tablist"
    >
      {tabs.map(tab => {
        const active = tab.id === activeTabId;
        const inSplit = tab.id === sideBySideTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            onClick={() => onSwitch(tab.id)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSwitch(tab.id); } }}
            onAuxClick={e => { if (e.button === 1) { e.preventDefault(); onClose(tab.id); } }}
            className={cn(
              "group relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
              "min-w-0 max-w-[180px] shrink-0",
              active
                ? "text-white bg-stone-800"
                : inSplit
                  ? "text-stone-300 bg-stone-800/70"
                  : "text-stone-500 hover:text-stone-300 hover:bg-stone-800/50",
            )}
          >
            {/* Active indicator — bottom amber line */}
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
            )}
            {/* Side-by-side indicator — bottom cyan line */}
            {inSplit && !active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
            )}

            {/* Icon */}
            <span className={cn("shrink-0", active ? "text-amber-500" : "text-stone-600 group-hover:text-stone-400")}>
              {TAB_ICONS[tab.type]}
            </span>

            {/* Title */}
            <span className="truncate">{tab.title}</span>

            {/* Close button */}
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              className={cn(
                "shrink-0 ml-1 rounded p-0.5 transition-colors",
                "opacity-0 group-hover:opacity-100",
                active && "opacity-100",
                "hover:bg-stone-600 text-stone-500 hover:text-stone-300",
              )}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}

      {/* New tab button */}
      <button
        onClick={onNewTab}
        title="New tab (Ctrl+T)"
        aria-label="New tab"
        className="shrink-0 px-2.5 py-2 text-stone-600 hover:text-stone-300 hover:bg-stone-800/50 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {/* Spacer — pushes settings gear to the right */}
      <div className="flex-1" />

      {/* Settings gear — always visible, accessible from any tab */}
      <button
        onClick={onOpenSettings}
        title="Preferences"
        aria-label="Open preferences"
        className="shrink-0 px-2.5 py-2 text-stone-600 hover:text-stone-300 hover:bg-stone-800/50 transition-colors"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
