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
import { useState, useCallback, useMemo, useRef } from "react";
import { TabContext, newTabId, defaultTabTitle, type Tab, type TabType, type TabContextValue, type SplitDirection } from "../lib/tabs";
import TabBar from "./TabBar";
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
    // Clear mirrorGroupId from all tabs when exiting side-by-side
    setTabs(prev => prev.map(t => t.mirrorGroupId ? { ...t, mirrorGroupId: undefined } : t));
    setSideBySideTabId(null);
  }, []);

  // ── "New tab" handler — creates ephemeral Home tabs ────────────────────────
  const handleNewTab = useCallback(() => {
    const id = newTabId();
    const tab = makeHomeTab(true); // ephemeral
    tab.id = id;
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
  }, []);

  const ctx = useMemo<TabContextValue>(() => ({
    tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
    sideBySideTabId, sideBySideDirection, openSideBySide, closeSideBySide, isSideBySide,
  }), [tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
       sideBySideTabId, sideBySideDirection, openSideBySide, closeSideBySide, isSideBySide]);

  return (
    <TabContext.Provider value={ctx}>
      <div className="h-screen flex flex-col overflow-hidden">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          sideBySideTabId={isSideBySide ? sideBySideTabId : null}
          onSwitch={switchTab}
          onClose={closeTab}
          onNewTab={handleNewTab}
        />

        {/* ── Content area ─────────────────────────────────────────────────── */}
        {isSideBySide && sideBySideTabId ? (
          // Side by side: two panes visible
          <div
            className="flex-1 flex overflow-hidden"
            style={{ flexDirection: sideBySideDirection === "horizontal" ? "row" : "column" }}
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

            {/* Secondary pane */}
            <div className="flex-1 relative overflow-hidden min-w-0 min-h-0">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className="absolute inset-0 flex flex-col"
                  style={{ display: tab.id === sideBySideTabId ? "flex" : "none" }}
                >
                  <TabContent tab={tab} isSecondaryPane />
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Single view
          <div className="flex-1 relative overflow-hidden">
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
    </TabContext.Provider>
  );
}
