/**
 * TabShell — top-level shell that provides the tab context and renders all tabs.
 *
 * Replaces React Router's <BrowserRouter>/<Routes>. Every open tab is mounted
 * simultaneously; inactive tabs are hidden via display:none so their full
 * React state tree (PDF, annotations, scroll, mode) is preserved.
 *
 * Side by side: two tabs can be displayed simultaneously — left/right
 * (horizontal) or top/bottom (vertical). Each pane is a fully independent tab.
 *
 * Ephemeral Home tabs: Home tabs created via Ctrl+T or "+" auto-close when
 * the user opens something from them. The initial Home tab persists.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { TabContext, newTabId, defaultTabTitle, type Tab, type TabType, type TabContextValue, type SplitDirection } from "../lib/tabs";
import { SettingsContext, type SettingsContextValue } from "../lib/settingsContext";
import { useSettings } from "../lib/storage";
import { getCliFile, listenForFileOpen } from "../lib/tauriFileOpen";
import TabBar from "./TabBar";
import SettingsDialog from "./SettingsDialog";
import Home from "../pages/Home";
import Viewer from "../pages/Viewer";
import Merge from "../pages/Merge";
import Rearrange from "../pages/Rearrange";
import ImagesToPDF from "../pages/ImagesToPDF";

// ── Tab content renderer ─────────────────────────────────────────────────────

function TabContent({ tab, isSecondaryPane }: { tab: Tab; isSecondaryPane?: boolean }) {
  switch (tab.type) {
    case "home":
      return <Home />;
    case "viewer":
      return <Viewer initialFile={tab.initialFile} tabId={tab.id} toolHint={tab.toolHint} isSecondaryPane={isSecondaryPane} mirrorGroupId={tab.mirrorGroupId} />;
    case "merge":
      return <Merge initialFile={tab.initialFile} />;
    case "rearrange":
      return <Rearrange initialFile={tab.initialFile} />;
    case "images-to-pdf":
      return <ImagesToPDF />;
    default:
      return null;
  }
}

// ── Shell ────────────────────────────────────────────────────────────────────

function makeHomeTab(ephemeral = false): Tab {
  return { id: newTabId(), type: "home", title: "Home", ephemeral };
}

export default function TabShell() {
  // ── Settings — single source of truth for the whole app ───────────────────
  const { settings, updateSettings, addSnippet, removeSnippet } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings  = useCallback(() => setSettingsOpen(true),  []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Apply reduce-motion class to <html> globally
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion ?? false);
  }, [settings.reduceMotion]);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>([makeHomeTab(false)]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  // ── Side by side state ─────────────────────────────────────────────────────
  const [sideBySideTabId, setSideBySideTabId] = useState<string | null>(null);
  const [sideBySideDirection, setSideBySideDirection] = useState<SplitDirection>("horizontal");

  const isSideBySide = sideBySideTabId !== null && tabs.some(t => t.id === sideBySideTabId);

  // Ref to current activeTabId + tabs for use inside callbacks
  const stateRef = useRef({ activeTabId, tabs });
  stateRef.current = { activeTabId, tabs };

  const openTab = useCallback((type: TabType, opts?: { file?: File; toolHint?: string; title?: string }) => {
    const id = newTabId();
    const tab: Tab = {
      id,
      type,
      title: opts?.title ?? (opts?.file?.name ?? defaultTabTitle(type)),
      initialFile: opts?.file,
      toolHint: opts?.toolHint,
    };

    const { activeTabId: currentActive, tabs: currentTabs } = stateRef.current;
    const activeTab = currentTabs.find(t => t.id === currentActive);

    setTabs(prev => {
      let next = [...prev, tab];
      // If the currently active tab is an ephemeral Home tab, remove it
      if (activeTab?.ephemeral && activeTab.type === "home") {
        next = next.filter(t => t.id !== activeTab.id);
      }
      return next;
    });
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    // If closing the side-by-side tab, exit side-by-side mode
    setSideBySideTabId(prev => prev === id ? null : prev);

    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const home = makeHomeTab(false);
        setActiveTabId(home.id);
        return [home];
      }
      setActiveTabId(current => {
        if (current !== id) return current;
        const newIdx = Math.min(idx, next.length - 1);
        return next[newIdx].id;
      });
      return next;
    });
  }, []);

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const updateTabTitle = useCallback((id: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t));
  }, []);

  // ── Side by side actions ───────────────────────────────────────────────────

  const openSideBySide = useCallback((direction: SplitDirection, mode: "mirror" | "new", currentFile?: File | null) => {
    setSideBySideDirection(direction);
    const id = newTabId();
    const mirrorGroupId = mode === "mirror" ? `mirror_${Date.now()}` : undefined;
    const tab: Tab = {
      id,
      type: "viewer",
      title: mode === "mirror" && currentFile ? currentFile.name : "Viewer",
      initialFile: mode === "mirror" && currentFile ? currentFile : undefined,
      mirrorGroupId,
    };
    // Tag the primary tab with the same mirrorGroupId so both panes sync
    if (mirrorGroupId) {
      setTabs(prev => prev.map(t =>
        t.id === stateRef.current.activeTabId ? { ...t, mirrorGroupId } : t
      ).concat(tab));
    } else {
      setTabs(prev => [...prev, tab]);
    }
    setSideBySideTabId(id);
  }, []);

  const closeSideBySide = useCallback(() => {
    const secondaryId = sideBySideTabId;
    // Remove the secondary tab and clear mirrorGroupId from the primary
    setTabs(prev => prev
      .filter(t => t.id !== secondaryId)
      .map(t => t.mirrorGroupId ? { ...t, mirrorGroupId: undefined } : t)
    );
    setSideBySideTabId(null);
  }, [sideBySideTabId]);

  // ── "New tab" handler — creates ephemeral Home tabs ────────────────────────
  const handleNewTab = useCallback(() => {
    const tab = makeHomeTab(true); // ephemeral
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  // ── Open file passed via CLI args ("Open with Stria" from Explorer) ────────
  useEffect(() => {
    getCliFile().then(file => {
      if (file) openTab("viewer", { file, title: file.name });
    });
    // Listen for files opened from a second instance (single-instance plugin)
    const unlisten = listenForFileOpen(file => {
      openTab("viewer", { file, title: file.name });
    });
    return unlisten;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabCtx = useMemo<TabContextValue>(() => ({
    tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
    sideBySideTabId, sideBySideDirection, openSideBySide, closeSideBySide, isSideBySide,
  }), [tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
       sideBySideTabId, sideBySideDirection, openSideBySide, closeSideBySide, isSideBySide]);

  const settingsCtx = useMemo<SettingsContextValue>(() => ({
    settings, updateSettings, addSnippet, removeSnippet,
    settingsOpen, openSettings, closeSettings,
  }), [settings, updateSettings, addSnippet, removeSnippet,
      settingsOpen, openSettings, closeSettings]);

  const uiScale = settings.uiScale ?? 1;

  return (
    <SettingsContext.Provider value={settingsCtx}>
    <TabContext.Provider value={tabCtx}>
      <div className="h-screen flex flex-col overflow-hidden">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          sideBySideTabId={isSideBySide ? sideBySideTabId : null}
          onSwitch={switchTab}
          onClose={closeTab}
          onNewTab={handleNewTab}
          onOpenSettings={openSettings}
        />

        {/* ── Content area — uiScale zoom applied here so every page scales ── */}
        {isSideBySide && sideBySideTabId ? (
          // Side by side: two panes visible
          <div
            className="flex-1 flex overflow-hidden"
            style={{
              flexDirection: sideBySideDirection === "horizontal" ? "row" : "column",
              ...(uiScale !== 1 ? { zoom: uiScale } as React.CSSProperties : {}),
            }}
          >
            {/* Primary pane (active tab) */}
            <div className="flex-1 relative overflow-hidden min-w-0 min-h-0">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className="absolute inset-0 flex flex-col"
                  style={{ display: tab.id === activeTabId ? "flex" : "none" }}
                >
                  <TabContent tab={tab} />
                </div>
              ))}
            </div>

            {/* Divider */}
            <div
              className={
                sideBySideDirection === "horizontal"
                  ? "w-px bg-stone-700 shrink-0"
                  : "h-px bg-stone-700 shrink-0"
              }
            />

            {/* Secondary pane — only render the side-by-side tab */}
            <div className="flex-1 relative overflow-hidden min-w-0 min-h-0">
              {tabs.filter(tab => tab.id === sideBySideTabId).map(tab => (
                <div
                  key={tab.id}
                  className="absolute inset-0 flex flex-col"
                >
                  <TabContent tab={tab} isSecondaryPane />
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Single view
          <div
            className="flex-1 relative overflow-hidden"
            style={uiScale !== 1 ? { zoom: uiScale } as React.CSSProperties : undefined}
          >
            {tabs.map(tab => (
              <div
                key={tab.id}
                className="absolute inset-0 flex flex-col"
                style={{ display: tab.id === activeTabId ? "flex" : "none" }}
              >
                <TabContent tab={tab} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Preferences dialog — rendered at shell level, accessible everywhere */}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onUpdate={updateSettings}
          onClose={closeSettings}
        />
      )}

    </TabContext.Provider>
    </SettingsContext.Provider>
  );
}
