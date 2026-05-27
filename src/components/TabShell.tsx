/**
 * TabShell — top-level shell that provides the tab context and renders all tabs.
 *
 * Replaces React Router's <BrowserRouter>/<Routes>. Every open tab is mounted
 * simultaneously; inactive tabs are hidden via display:none so their full
 * React state tree (PDF, annotations, scroll, mode) is preserved.
 *
 * Split view: two tabs can be displayed simultaneously side by side (horizontal)
 * or stacked (vertical). Each pane is a fully independent tab with its own
 * toolbar, sidebar, and state. The active tab receives keyboard focus.
 */
import { useState, useCallback, useMemo } from "react";
import { TabContext, newTabId, defaultTabTitle, type Tab, type TabType, type TabContextValue, type SplitDirection } from "../lib/tabs";
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

  // ── Split view state ───────────────────────────────────────────────────────
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [splitDirection, setSplitDirection] = useState<SplitDirection>("horizontal");

  const isSplit = splitTabId !== null && tabs.some(t => t.id === splitTabId);

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
    // If closing the split tab, exit split mode
    setSplitTabId(prev => prev === id ? null : prev);

    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        const home = makeHomeTab();
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

  // ── Split view actions ─────────────────────────────────────────────────────

  const splitView = useCallback((direction: SplitDirection, opts?: { file?: File }) => {
    setSplitDirection(direction);
    // Open a new viewer tab in the split pane
    const id = newTabId();
    const tab: Tab = {
      id,
      type: "viewer",
      title: opts?.file?.name ?? "Viewer",
      initialFile: opts?.file,
    };
    setTabs(prev => [...prev, tab]);
    setSplitTabId(id);
  }, []);

  const closeSplit = useCallback(() => {
    setSplitTabId(null);
  }, []);

  const ctx = useMemo<TabContextValue>(() => ({
    tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
    splitTabId, splitDirection, splitView, closeSplit, isSplit,
  }), [tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
       splitTabId, splitDirection, splitView, closeSplit, isSplit]);

  // Determine which tab ids are visible
  const visibleIds = new Set<string>();
  visibleIds.add(activeTabId);
  if (isSplit && splitTabId) visibleIds.add(splitTabId);

  return (
    <TabContext.Provider value={ctx}>
      <div className="h-screen flex flex-col overflow-hidden">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          splitTabId={isSplit ? splitTabId : null}
          onSwitch={switchTab}
          onClose={closeTab}
          onNewTab={() => openTab("home")}
        />

        {/* ── Content area ─────────────────────────────────────────────────── */}
        {isSplit && splitTabId ? (
          // Split view: two panes visible
          <div
            className="flex-1 flex overflow-hidden"
            style={{ flexDirection: splitDirection === "horizontal" ? "row" : "column" }}
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
                splitDirection === "horizontal"
                  ? "w-px bg-stone-700 shrink-0"
                  : "h-px bg-stone-700 shrink-0"
              }
            />

            {/* Secondary pane (split tab) */}
            <div className="flex-1 relative overflow-hidden min-w-0 min-h-0">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className="absolute inset-0 flex flex-col"
                  style={{ display: tab.id === splitTabId ? "flex" : "none" }}
                >
                  <TabContent tab={tab} />
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
