import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Layers, Scissors, Minimize2, EyeOff, LayoutGrid, FileImage,
  Keyboard, Columns, MessageSquare, ShieldCheck, X, FileText, Clock, Package,
} from "lucide-react";
import { cn, formatBytes } from "../lib/utils";
import { useTabContext, type TabType } from "../lib/tabs";
import { useFocusTrap } from "../lib/useFocusTrap";
import KeyboardCheatSheet from "../components/KeyboardCheatSheet";
import {
  isTauri, pickPdfFiles, openPathAsFile,
  loadRecentFiles, clearRecentFiles, removeRecentFile, type RecentFile,
} from "../lib/fileIntake";
import striaLogo from "../assets/stria-logo.png";

// ── Tool definitions ──────────────────────────────────────────────────────────

type ToolDef = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tabType?: TabType;
  needsFile?: true;
  toolHint?: string;
};

// Most-used operations first so the grid scans in frequency order.
const TOOLS: ToolDef[] = [
  {
    id: "merge",
    title: "Merge",
    description: "Combine multiple PDFs into one",
    icon: <Layers className="h-[15px] w-[15px]" />,
    tabType: "merge",
  },
  {
    id: "compress",
    title: "Compress",
    description: "Reduce file size",
    icon: <Minimize2 className="h-[15px] w-[15px]" />,
    needsFile: true,
    toolHint: "compress",
  },
  {
    id: "redact",
    title: "Redact",
    description: "Remove sensitive content",
    icon: <EyeOff className="h-[15px] w-[15px]" />,
    needsFile: true,
    toolHint: "redact",
  },
  {
    id: "split",
    title: "Split",
    description: "Divide into parts",
    icon: <Scissors className="h-[15px] w-[15px]" />,
    tabType: "rearrange",  // Opens Organise — click gaps between pages to place split lines
  },
  {
    id: "organize",
    title: "Organize",
    description: "Reorder, rotate, delete pages",
    icon: <LayoutGrid className="h-[15px] w-[15px]" />,
    tabType: "rearrange",
  },
  {
    id: "convert",
    title: "Images to PDF",
    description: "Turn images into a PDF",
    icon: <FileImage className="h-[15px] w-[15px]" />,
    tabType: "images-to-pdf",
  },
  {
    id: "batch",
    title: "Batch",
    description: "Process many PDFs at once",
    icon: <Package className="h-[15px] w-[15px]" />,
    tabType: "batch",
  },
];

// ── Capability hints shown beneath the drop zone ─────────────────────────────
// Each chip either opens a file (with an optional toolHint that pre-selects a
// viewer mode) or triggers a standalone action. Defined inside the component
// so chip handlers can close over state setters.
type CapabilityDef = { icon: React.ReactNode; text: string; kbd: string; title: string; onClick: () => void };

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { openTab } = useTabContext();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const privacyTrapRef = useFocusTrap<HTMLDivElement>(privacyOpen);
  const [recents, setRecents] = useState<RecentFile[]>(() => loadRecentFiles());
  const [recentError, setRecentError] = useState<string | null>(null);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  // Set window title; keep the recents list fresh when other surfaces change it.
  useEffect(() => {
    document.title = "Stria";
    const refresh = () => setRecents(loadRecentFiles());
    window.addEventListener("recent-files-changed", refresh);
    return () => window.removeEventListener("recent-files-changed", refresh);
  }, []);

  // Browser HTML5 drag-drop (Tauri native drops are handled globally in TabShell).
  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (f) openTab("viewer", { file: f });
  }, [openTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    noClick: isTauri, // in Tauri we open the native dialog ourselves (captures path)
  });

  // Open the file picker (native in Tauri → captures path & records a recent).
  async function openViaPicker(toolHint?: string) {
    const opened = await pickPdfFiles(false);
    const first = opened[0];
    if (first) openTab("viewer", { file: first.file, ...(toolHint ? { toolHint } : {}) });
  }

  function openToolFilePicker(toolHint?: string) {
    void openViaPicker(toolHint);
  }

  // Capability chips — each can either open a file or trigger a standalone action.
  const capabilities: CapabilityDef[] = [
    {
      icon: <MessageSquare className="h-3 w-3" />,
      text: "Annotate",
      kbd: "A",
      title: "Open a PDF and start annotating",
      onClick: () => openToolFilePicker("annotate"),
    },
    {
      icon: <Keyboard className="h-3 w-3" />,
      text: "All shortcuts",
      kbd: "?",
      title: "Show keyboard shortcuts",
      onClick: () => setCheatSheetOpen(true),
    },
    {
      icon: <Columns className="h-3 w-3" />,
      text: "Side by side",
      kbd: "Ctrl+\\",
      title: "Open a PDF and compare two documents side by side",
      onClick: () => openToolFilePicker(undefined),
    },
  ];

  // Re-open a recent file by its stored OS path.
  async function openRecent(r: RecentFile) {
    try {
      const file = await openPathAsFile(r.path);
      openTab("viewer", { file, title: file.name });
    } catch {
      setRecentError(`Couldn't open ${r.name} — it may have been moved or deleted.`);
      setRecents(removeRecentFile(r.path)); // drop the stale entry
    }
  }

  return (
    <div className="h-full flex flex-col bg-stone-50 app-dark:bg-stone-950 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-11 bg-white border-b border-stone-200 app-dark:bg-stone-900 app-dark:border-stone-800 px-6 flex items-center gap-3">
        <img src={striaLogo} alt="" aria-hidden="true" className="h-6 w-auto object-contain" />
        <div className="leading-none">
          <p className="text-[15px] font-semibold text-stone-900 app-dark:text-stone-100 tracking-[-0.01em] leading-[1.25]">Stria</p>
        </div>
        <span className="text-[11px] text-stone-400 ml-1">Local PDF toolkit</span>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-auto px-6 py-10">
        <div className="w-full max-w-2xl flex flex-col items-center gap-8">

          {/* ── Primary: file intake ──────────────────────────────────────── */}
          <div className="w-full">
            <div
              {...getRootProps(isTauri ? { onClick: () => openViaPicker() } : {})}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-5 rounded-2xl",
                "border-2 border-dashed transition-colors duration-200 cursor-pointer",
                "py-14 px-8",
                isDragActive
                  ? "border-brand-500 bg-[#fffbeb] app-dark:bg-brand-950/40 scale-[1.005]"
                  : "border-stone-300 bg-white hover:border-[#d4c5a0] hover:shadow-sm app-dark:border-stone-700 app-dark:bg-stone-900 app-dark:hover:border-brand-500/60"
              )}
            >
              <input {...getInputProps()} />
              <svg
                className={cn("h-11 w-11 transition-colors duration-200", isDragActive ? "text-brand-500" : "text-stone-300 app-dark:text-stone-600")}
                viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M10 38V18l10-12h18v32H10z" strokeLinejoin="round"/>
                <path d="M20 6v12h18M22 28l6-6 6 6M28 22v10" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="text-center">
                <p className="text-sm font-semibold text-stone-700 app-dark:text-stone-200">
                  {isDragActive ? "Drop the PDF here" : "Open a PDF to start reviewing"}
                </p>
                <p className="mt-1.5 text-xs text-stone-400 app-dark:text-stone-500">
                  Drop a file, or click to browse
                </p>
              </div>
            </div>

            {/* Capability shortcut chips */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {capabilities.map((cap, i) => (
                <button
                  key={i}
                  onClick={cap.onClick}
                  title={cap.title}
                  className="group flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white app-dark:bg-stone-900 app-dark:border-stone-800 px-2.5 py-1.5 text-[11px] text-stone-500 app-dark:text-stone-400 hover:border-stone-300 hover:text-stone-700 app-dark:hover:text-stone-200 app-dark:hover:border-stone-700 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                >
                  <span className="text-stone-300 app-dark:text-stone-600 group-hover:text-amber-600 transition-colors">{cap.icon}</span>
                  {cap.text}
                  <kbd className="rounded border border-stone-200 bg-stone-50 app-dark:bg-stone-800 app-dark:border-stone-700 px-1 text-[9px] font-mono text-stone-400 app-dark:text-stone-500">{cap.kbd}</kbd>
                </button>
              ))}
            </div>
          </div>

          {/* ── Recent files (Tauri — reopened by stored path) ─────────────── */}
          {recents.length > 0 && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-stone-400 uppercase tracking-[0.1em]">
                  <Clock className="h-3 w-3" /> Recent
                </span>
                <button
                  onClick={() => { clearRecentFiles(); setRecents([]); }}
                  className="text-[10px] text-stone-400 hover:text-stone-600 app-dark:hover:text-stone-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded px-1"
                >
                  Clear
                </button>
              </div>
              {recentError && (
                <p className="mb-1.5 text-[10px] text-red-500">{recentError}</p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {recents.slice(0, 6).map(r => (
                  <button
                    key={r.path}
                    onClick={() => openRecent(r)}
                    title={r.path}
                    className="group flex items-center gap-2 rounded-lg border border-stone-200 bg-white app-dark:bg-stone-900 app-dark:border-stone-800 px-2.5 py-2 text-left hover:border-stone-300 app-dark:hover:border-stone-700 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-stone-300 app-dark:text-stone-600 group-hover:text-amber-600 transition-colors" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-[12px] text-stone-700 app-dark:text-stone-200 group-hover:text-stone-900 app-dark:group-hover:text-white">{r.name}</span>
                      <span className="block text-[10px] text-stone-400 app-dark:text-stone-500">{formatBytes(r.size)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Divider ──────────────────────────────────────────────────── */}
          <div className="w-full flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-200 app-dark:bg-stone-800" />
            <span className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.1em]">or use a tool directly</span>
            <div className="flex-1 h-px bg-stone-200 app-dark:bg-stone-800" />
          </div>

          {/* ── Secondary: tool grid ─────────────────────────────────────── */}
          <div className="w-full grid grid-cols-3 gap-2">
            {TOOLS.map(tool => {
              const handleClick = tool.tabType
                ? () => openTab(tool.tabType!)
                : () => openToolFilePicker(tool.toolHint);

              return (
                <button
                  key={tool.id}
                  onClick={handleClick}
                  className={cn(
                    "group flex items-center gap-3 px-3.5 py-3 rounded-xl text-left",
                    "transition-[border-color,box-shadow] duration-150 ease-out",
                    "bg-white border border-stone-200",
                    "hover:border-stone-300 hover:shadow-sm",
                    "app-dark:bg-stone-900 app-dark:border-stone-800 app-dark:hover:border-stone-700",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                  )}
                >
                  <div className={cn(
                    "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                    "bg-stone-100 text-stone-400 transition-colors duration-150",
                    "app-dark:bg-stone-800 app-dark:text-stone-500",
                    "group-hover:bg-amber-50 group-hover:text-amber-600 app-dark:group-hover:bg-brand-950/50",
                  )}>
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-stone-700 app-dark:text-stone-200 group-hover:text-stone-900 app-dark:group-hover:text-white transition-colors duration-150 leading-tight">
                      {tool.title}
                    </p>
                    <p className="text-[10px] text-stone-400 app-dark:text-stone-500 leading-snug mt-0.5">
                      {tool.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Privacy footer ────────────────────────────────────────────── */}
          <button
            onClick={() => setPrivacyOpen(true)}
            className="group flex items-center gap-1.5 text-[10px] text-stone-400 hover:text-stone-600 app-dark:hover:text-stone-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded px-2 py-1"
          >
            <ShieldCheck className="h-3 w-3 text-stone-300 app-dark:text-stone-600 group-hover:text-green-600 transition-colors" />
            Everything runs on your machine — nothing is uploaded.
            <span className="underline decoration-dotted underline-offset-2">How it works</span>
          </button>
        </div>
      </div>

      {/* ── Keyboard shortcut reference ───────────────────────────────────── */}
      {cheatSheetOpen && <KeyboardCheatSheet onClose={() => setCheatSheetOpen(false)} />}

      {/* ── Privacy detail popup (UX-25) ──────────────────────────────────── */}
      {privacyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setPrivacyOpen(false); }}
        >
          <div ref={privacyTrapRef} className="bg-white border border-stone-200 app-dark:bg-stone-900 app-dark:border-stone-700 rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <h2 className="text-sm font-semibold text-stone-900 app-dark:text-stone-100">Private by design</h2>
              </div>
              <button onClick={() => setPrivacyOpen(false)} aria-label="Close" className="text-stone-400 hover:text-stone-700 app-dark:hover:text-white rounded p-0.5 hover:bg-stone-100 app-dark:hover:bg-stone-800 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2.5 text-xs text-stone-600 app-dark:text-stone-300 leading-relaxed">
              <li className="flex gap-2"><span className="text-green-600">•</span> Your PDFs never leave your computer. There is no cloud, no account, and no upload.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> All processing (annotate, redact, compress, crop, merge) runs in a local background service bundled with the app.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> Files are not cached or retained — close a tab and the document is gone from memory.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> Only small preferences (your name, colour labels, bookmarks) are saved locally between sessions.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> No telemetry, no analytics, no network calls to anyone.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
