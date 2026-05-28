import { useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Layers, Scissors, Minimize2, EyeOff, LayoutGrid, FileImage,
  Keyboard, Columns, MessageSquare,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useTabContext, type TabType } from "../lib/tabs";
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

const CAPABILITIES = [
  { icon: <MessageSquare className="h-3 w-3" />, text: "8 annotation types with undo/redo" },
  { icon: <Keyboard className="h-3 w-3" />,      text: "Keyboard-first: press ? for shortcuts" },
  { icon: <Columns className="h-3 w-3" />,        text: "Side-by-side document comparison" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { openTab } = useTabContext();
  const fileRef        = useRef<HTMLInputElement>(null);
  const pendingToolRef = useRef<string | null>(null);

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
                "border-2 border-dashed transition-all duration-200 cursor-pointer",
                "py-14 px-8",
                isDragActive
                  ? "border-amber-400 bg-[#fffbeb] scale-[1.005]"
                  : "border-stone-300 bg-white hover:border-[#d4c5a0] hover:shadow-sm"
              )}
            >
              <input {...getInputProps()} />
              <svg
                className={cn("h-11 w-11 transition-colors duration-200", isDragActive ? "text-amber-500" : "text-stone-300")}
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

            {/* Capability hints */}
            <div className="flex items-center justify-center gap-5 mt-4">
              {CAPABILITIES.map((cap, i) => (
                <span key={i} className="flex items-center gap-1.5 text-[11px] text-stone-400">
                  <span className="text-stone-300">{cap.icon}</span>
                  {cap.text}
                </span>
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
                    "transition-all duration-150 ease-out",
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
          <p className="text-[10px] text-stone-400 text-center leading-relaxed">
            Everything runs on your machine. Documents are never uploaded, cached, or retained after you close them.
            <br />
            Your preferences and name persist between sessions; your files do not.
          </p>
        </div>
      </div>

      {/* Hidden file input for tool cards that need a file */}
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleToolFile} />
    </div>
  );
}
