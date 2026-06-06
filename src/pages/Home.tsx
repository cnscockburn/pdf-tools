import { useCallback, useRef, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Layers, Scissors, Minimize2, EyeOff, LayoutGrid, FileImage,
  Keyboard, Columns, MessageSquare, ShieldCheck, X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useTabContext, type TabType } from "../lib/tabs";
import { useFocusTrap } from "../lib/useFocusTrap";
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

const TOOLS: ToolDef[] = [
  {
    id: "merge",
    title: "Merge",
    description: "Combine multiple PDFs into one",
    icon: <Layers className="h-[15px] w-[15px]" />,
    tabType: "merge",
  },
  {
    id: "split",
    title: "Split",
    description: "Divide by page range",
    icon: <Scissors className="h-[15px] w-[15px]" />,
    needsFile: true,
    toolHint: "split",
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
];

// ── Capability hints shown beneath the drop zone ─────────────────────────────
// Each is a shortcut chip that, when clicked, opens a file and drops you into
// that capability (UX-24). `toolHint` (if set) pre-selects a viewer mode.

const CAPABILITIES: { icon: React.ReactNode; text: string; kbd: string; toolHint?: string }[] = [
  { icon: <MessageSquare className="h-3 w-3" />, text: "Annotate",       kbd: "A",      toolHint: "annotate" },
  { icon: <Keyboard className="h-3 w-3" />,       text: "All shortcuts",  kbd: "?" },
  { icon: <Columns className="h-3 w-3" />,         text: "Side by side",   kbd: "Ctrl+\\" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { openTab } = useTabContext();
  const fileRef        = useRef<HTMLInputElement>(null);
  const pendingToolRef = useRef<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const privacyTrapRef = useFocusTrap<HTMLDivElement>(privacyOpen);

  // Set window title
  useEffect(() => { document.title = "Stria"; }, []);

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (f) openTab("viewer", { file: f });
  }, [openTab]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  function openToolFilePicker(toolHint?: string) {
    pendingToolRef.current = toolHint ?? null;
    fileRef.current?.click();
  }

  function handleToolFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      const tool = pendingToolRef.current;
      openTab("viewer", { file: f, ...(tool ? { toolHint: tool } : {}) });
    }
    pendingToolRef.current = null;
    e.target.value = "";
  }

  return (
    <div className="h-full flex flex-col bg-stone-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-11 bg-white border-b border-stone-200 px-6 flex items-center gap-3">
        <img src={striaLogo} alt="" aria-hidden="true" className="h-6 w-auto object-contain" />
        <div className="leading-none">
          <p className="text-[15px] font-semibold text-stone-900 tracking-[-0.01em] leading-[1.25]">Stria</p>
        </div>
        <span className="text-[11px] text-stone-400 ml-1">Local PDF toolkit</span>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-auto px-6 py-10">
        <div className="w-full max-w-2xl flex flex-col items-center gap-8">

          {/* ── Primary: file intake ──────────────────────────────────────── */}
          <div className="w-full">
            <div
              {...getRootProps()}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-5 rounded-2xl",
                "border-2 border-dashed transition-colors duration-200 cursor-pointer",
                "py-14 px-8",
                isDragActive
                  ? "border-brand-500 bg-[#fffbeb] scale-[1.005]"
                  : "border-stone-300 bg-white hover:border-[#d4c5a0] hover:shadow-sm"
              )}
            >
              <input {...getInputProps()} />
              <svg
                className={cn("h-11 w-11 transition-colors duration-200", isDragActive ? "text-brand-500" : "text-stone-300")}
                viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M10 38V18l10-12h18v32H10z" strokeLinejoin="round"/>
                <path d="M20 6v12h18M22 28l6-6 6 6M28 22v10" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="text-center">
                <p className="text-sm font-semibold text-stone-700">
                  {isDragActive ? "Drop the PDF here" : "Open a PDF to start reviewing"}
                </p>
                <p className="mt-1.5 text-xs text-stone-400">
                  Drop a file, or click to browse
                </p>
              </div>
            </div>

            {/* Capability shortcut chips — click to open a file and jump in */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {CAPABILITIES.map((cap, i) => (
                <button
                  key={i}
                  onClick={() => openToolFilePicker(cap.toolHint)}
                  title={`Open a PDF and ${cap.text.toLowerCase()}`}
                  className="group flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] text-stone-500 hover:border-stone-300 hover:text-stone-700 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
                >
                  <span className="text-stone-300 group-hover:text-amber-600 transition-colors">{cap.icon}</span>
                  {cap.text}
                  <kbd className="rounded border border-stone-200 bg-stone-50 px-1 text-[9px] font-mono text-stone-400">{cap.kbd}</kbd>
                </button>
              ))}
            </div>
          </div>

          {/* ── Divider ──────────────────────────────────────────────────── */}
          <div className="w-full flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-[10px] font-medium text-stone-400 uppercase tracking-[0.1em]">or use a tool directly</span>
            <div className="flex-1 h-px bg-stone-200" />
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
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                  )}
                >
                  <div className={cn(
                    "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                    "bg-stone-100 text-stone-400 transition-colors duration-150",
                    "group-hover:bg-amber-50 group-hover:text-amber-600",
                  )}>
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-stone-700 group-hover:text-stone-900 transition-colors duration-150 leading-tight">
                      {tool.title}
                    </p>
                    <p className="text-[10px] text-stone-400 leading-snug mt-0.5">
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
            className="group flex items-center gap-1.5 text-[10px] text-stone-400 hover:text-stone-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded px-2 py-1"
          >
            <ShieldCheck className="h-3 w-3 text-stone-300 group-hover:text-green-600 transition-colors" />
            Everything runs on your machine — nothing is uploaded.
            <span className="underline decoration-dotted underline-offset-2">How it works</span>
          </button>
        </div>
      </div>

      {/* ── Privacy detail popup (UX-25) ──────────────────────────────────── */}
      {privacyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Privacy"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setPrivacyOpen(false); }}
        >
          <div ref={privacyTrapRef} className="bg-white border border-stone-200 rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <h2 className="text-sm font-semibold text-stone-900">Private by design</h2>
              </div>
              <button onClick={() => setPrivacyOpen(false)} aria-label="Close" className="text-stone-400 hover:text-stone-700 rounded p-0.5 hover:bg-stone-100 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2.5 text-xs text-stone-600 leading-relaxed">
              <li className="flex gap-2"><span className="text-green-600">•</span> Your PDFs never leave your computer. There is no cloud, no account, and no upload.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> All processing (annotate, redact, compress, crop, merge) runs in a local background service bundled with the app.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> Files are not cached or retained — close a tab and the document is gone from memory.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> Only small preferences (your name, colour labels, bookmarks) are saved locally between sessions.</li>
              <li className="flex gap-2"><span className="text-green-600">•</span> No telemetry, no analytics, no network calls to anyone.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Hidden file input for tool cards that need a file */}
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleToolFile} />
    </div>
  );
}
