/**
 * TabShell — top-level shell that provides the tab context and renders all tabs.
 *
 * Replaces React Router's <BrowserRouter>/<Routes>. Every open tab is mounted
 * simultaneously; inactive tabs are hidden via display:none so their full
 * React state tree (PDF, annotations, scroll, mode) is preserved.
 */
import { useState, useCallback, useMemo } from "react";
import { TabContext, newTabId, defaultTabTitle, type Tab, type TabType, type TabContextValue } from "../lib/tabs";
import TabBar from "./TabBar";
import Home from "../pages/Home";
import Viewer from "../pages/Viewer";
import Merge from "../pages/Merge";
import Rearrange from "../pages/Rearrange";
import ImagesToPDF from "../pages/ImagesToPDF";

// ── Tab content renderer ─────────────────────────────────────────────────────

function TabContent({ tab }: { tab: Tab }) {
  switch (tab.type) {
    case "home":
      return <Home />;
    case "viewer":
      return <Viewer initialFile={tab.initialFile} tabId={tab.id} toolHint={tab.toolHint} />;
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

function makeHomeTab(): Tab {
  return { id: newTabId(), type: "home", title: "Home" };
}

export default function TabShell() {
  const [tabs, setTabs] = useState<Tab[]>([makeHomeTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const openTab = useCallback((type: TabType, opts?: { file?: File; toolHint?: string; title?: string }) => {
    const id = newTabId();
    const tab: Tab = {
      id,
      type,
      title: opts?.title ?? (opts?.file?.name ?? defaultTabTitle(type)),
      initialFile: opts?.file,
      toolHint: opts?.toolHint,
    };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        // Last tab closed — open a fresh Home tab
        const home = makeHomeTab();
        setActiveTabId(home.id);
        return [home];
      }
      // If we're closing the active tab, switch to an adjacent one
      setActiveTabId(current => {
        if (current !== id) return current;
        // Prefer the tab to the right, fall back to the left
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

  const ctx = useMemo<TabContextValue>(() => ({
    tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
  }), [tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle]);

  return (
    <TabContext.Provider value={ctx}>
      <div className="h-screen flex flex-col overflow-hidden">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitch={switchTab}
          onClose={closeTab}
          onNewTab={() => openTab("home")}
        />
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
      </div>
    </TabContext.Provider>
  );
}
