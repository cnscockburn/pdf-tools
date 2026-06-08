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
import { TabContext, newTabId, defaultTabTitle, type Tab, type TabType, type TabContextValue, type SplitDirection, type CloseGuardResult } from "../lib/tabs";
import { SettingsContext, type SettingsContextValue } from "../lib/settingsContext";
import { useSettings } from "../lib/storage";
import { getCliFile, listenForFileOpen } from "../lib/tauriFileOpen";
import { onWindowFileDrop, openPathAsFile } from "../lib/fileIntake";
import { listRecovery, deleteRecovery } from "../lib/autoSave";
import TabBar from "./TabBar";
import SettingsDialog from "./SettingsDialog";
import KeyboardCheatSheet from "./KeyboardCheatSheet";
import Home from "../pages/Home";
import Viewer from "../pages/Viewer";
import Merge from "../pages/Merge";
import Rearrange from "../pages/Rearrange";
import ImagesToPDF from "../pages/ImagesToPDF";
import Batch from "../pages/Batch";

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
    case "batch":
      return <Batch />;
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
  // Shell-level cheat sheet so it's reachable from Settings (and Home tab) too.
  const [shellCheatSheetOpen, setShellCheatSheetOpen] = useState(false);

  // Apply reduce-motion class to <html> globally
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion ?? false);
  }, [settings.reduceMotion]);

  // Apply the two independent theme axes to <html> (light/dark mode).
  useEffect(() => {
    document.documentElement.classList.toggle("app-dark", (settings.appTheme ?? "light") === "dark");
  }, [settings.appTheme]);
  useEffect(() => {
    document.documentElement.classList.toggle("viewer-light", (settings.viewerTheme ?? "dark") === "light");
  }, [settings.viewerTheme]);

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

  // ── B10: Recovery prompt ───────────────────────────────────────────────────
  // On startup check for leftover recovery snapshots (= documents that were open
  // when the app last crashed or was force-quit). Offer to restore each one.
  const [recoveryFiles, setRecoveryFiles] = useState<Array<{ slot: string; path: string }>>([]);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  useEffect(() => {
    listRecovery().then(files => {
      if (files.length > 0) setRecoveryFiles(files);
    });
  }, []); // eslint-disable-line

  async function restoreRecovery(r: { slot: string; path: string }) {
    try {
      const file = await openPathAsFile(r.path);
      openTab("viewer", { file, title: `Recovered — ${file.name}` });
      await deleteRecovery(r.slot);
    } catch { /* ignore */ }
    setRecoveryFiles(prev => prev.filter(x => x.slot !== r.slot));
  }

  async function discardRecovery(r: { slot: string }) {
    await deleteRecovery(r.slot);
    setRecoveryFiles(prev => prev.filter(x => x.slot !== r.slot));
  }

  // ── Close guards ───────────────────────────────────────────────────────────
  // Tabs (Viewer) register a guard consulted before close. A blocked close
  // surfaces a confirmation dialog instead of discarding work silently.
  const closeGuardsRef = useRef<Map<string, () => CloseGuardResult>>(new Map());
  const [pendingClose, setPendingClose] = useState<{ id: string; message: string; details?: string } | null>(null);

  const registerCloseGuard = useCallback((tabId: string, guard: () => CloseGuardResult) => {
    closeGuardsRef.current.set(tabId, guard);
  }, []);
  const unregisterCloseGuard = useCallback((tabId: string) => {
    closeGuardsRef.current.delete(tabId);
  }, []);

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

  // Actually remove a tab — no guard check (call only after confirming).
  const doCloseTab = useCallback((id: string) => {
    closeGuardsRef.current.delete(id);
    // If closing a mirrored secondary pane, also clear the mirrorGroupId from
    // its partner so the surviving pane stops syncing to a dead group (P1-35).
    const closing = stateRef.current.tabs.find(t => t.id === id);
    const groupId = closing?.mirrorGroupId;

    // If closing the side-by-side tab, exit side-by-side mode
    setSideBySideTabId(prev => prev === id ? null : prev);

    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx < 0) return prev;
      let next = prev.filter(t => t.id !== id);
      // Clear the partner's mirrorGroupId.
      if (groupId) next = next.map(t => t.mirrorGroupId === groupId ? { ...t, mirrorGroupId: undefined } : t);
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

  const closeTab = useCallback((id: string) => {
    const guard = closeGuardsRef.current.get(id);
    if (guard) {
      const result = guard();
      if (!result.safe) {
        setPendingClose({ id, message: result.message ?? "You have unsaved changes.", details: result.details });
        return;
      }
    }
    doCloseTab(id);
  }, [doCloseTab]);

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
    if (!secondaryId) return;
    // Route through closeTab so the secondary pane's unsaved-changes guard runs
    // (P1-24) and the partner's mirrorGroupId is cleared (P1-35).
    closeTab(secondaryId);
  }, [sideBySideTabId, closeTab]);

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
    // Native OS drag-drop onto the window → open each PDF in a Viewer tab.
    // (Tauri-only; the browser uses react-dropzone per page. Paths captured
    //  here are recorded as recent files by fileIntake.)
    const unlistenDrop = onWindowFileDrop(opened => {
      for (const { file } of opened) openTab("viewer", { file, title: file.name });
    });
    return () => { unlisten(); unlistenDrop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabCtx = useMemo<TabContextValue>(() => ({
    tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
    registerCloseGuard, unregisterCloseGuard,
    sideBySideTabId, sideBySideDirection, openSideBySide, closeSideBySide, isSideBySide,
  }), [tabs, activeTabId, openTab, closeTab, switchTab, updateTabTitle,
       registerCloseGuard, unregisterCloseGuard,
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

            {/* Divider — 2px and a lighter tone so the seam stays visible
                between two dark panes on a wide monitor. */}
            <div
              className={
                sideBySideDirection === "horizontal"
                  ? "w-0.5 bg-stone-600 shrink-0"
                  : "h-0.5 bg-stone-600 shrink-0"
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
          onOpenCheatSheet={() => { closeSettings(); setShellCheatSheetOpen(true); }}
        />
      )}

      {/* Shell-level cheat sheet — reachable from Settings and Home */}
      {shellCheatSheetOpen && (
        <KeyboardCheatSheet onClose={() => setShellCheatSheetOpen(false)} />
      )}

      {/* ── B10: Recovery restore prompt ────────────────────────────────────── */}
      {recoveryFiles.length > 0 && !recoveryDismissed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Restore recovered documents"
          className="fixed inset-0 z-[350] flex items-center justify-center bg-black/70"
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Recover unsaved documents?</h2>
              <p className="mt-1.5 text-xs text-stone-400 leading-relaxed">
                Stria found {recoveryFiles.length} auto-saved snapshot{recoveryFiles.length !== 1 ? "s" : ""} from the previous session.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {recoveryFiles.map(r => (
                <div key={r.slot} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-stone-300 truncate">{r.path.split(/[/\\]/).pop()}</span>
                  <button onClick={() => restoreRecovery(r)} className="shrink-0 rounded-lg bg-brand-500 hover:bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition">Restore</button>
                  <button onClick={() => discardRecovery(r)} className="shrink-0 rounded-lg bg-stone-700 hover:bg-stone-600 px-3 py-1.5 text-xs text-stone-300 transition">Discard</button>
                </div>
              ))}
            </div>
            <button onClick={() => setRecoveryDismissed(true)} className="text-[11px] text-stone-500 hover:text-stone-300 transition self-end">Dismiss all</button>
          </div>
        </div>
      )}

      {/* ── Close-guard confirmation (uncommitted annotations, P1-03/P1-24) ──── */}
      {pendingClose && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved changes"
          className="fixed inset-0 z-[350] flex items-center justify-center bg-black/70"
          onClick={e => { if (e.target === e.currentTarget) setPendingClose(null); }}
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl w-[380px] max-w-[90vw] p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Close this tab?</h2>
              <p className="mt-1.5 text-xs text-stone-400 leading-relaxed">
                {pendingClose.message}
                {pendingClose.details && <><br />{pendingClose.details}</>}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { const id = pendingClose.id; setPendingClose(null); doCloseTab(id); }}
                className="rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-xs font-semibold text-white transition shadow-lg"
              >
                Close without saving
              </button>
              <button
                onClick={() => setPendingClose(null)}
                className="rounded-xl bg-stone-700 hover:bg-stone-600 border border-stone-600 px-4 py-2.5 text-xs font-medium text-stone-300 transition"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

    </TabContext.Provider>
    </SettingsContext.Provider>
  );
}
