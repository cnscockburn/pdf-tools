import { useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Layers, Scissors, Minimize2, EyeOff, LayoutGrid, FileImage } from "lucide-react";
import { cn } from "../lib/utils";
import striaLogo from "../assets/stria-logo.png";

// ── Tool definitions ──────────────────────────────────────────────────────────

type ToolDef = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href?: string;       // navigate directly (no file needed)
  needsFile?: true;    // open file picker → viewer with tool pre-selected
  toolHint?: string;   // panel id or mode to activate once file loads
};

const TOOLS: ToolDef[] = [
  {
    id: "merge",
    title: "Merge",
    description: "Combine multiple PDFs into one document",
    icon: <Layers className="h-[18px] w-[18px]" />,
    href: "/merge",
  },
  {
    id: "split",
    title: "Split",
    description: "Divide a PDF into separate files by page range",
    icon: <Scissors className="h-[18px] w-[18px]" />,
    needsFile: true,
    toolHint: "split",
  },
  {
    id: "compress",
    title: "Compress",
    description: "Reduce file size without visible quality loss",
    icon: <Minimize2 className="h-[18px] w-[18px]" />,
    needsFile: true,
    toolHint: "compress",
  },
  {
    id: "redact",
    title: "Redact",
    description: "Permanently remove sensitive content",
    icon: <EyeOff className="h-[18px] w-[18px]" />,
    needsFile: true,
    toolHint: "redact",
  },
  {
    id: "organize",
    title: "Organize",
    description: "Reorder, rotate, and remove pages",
    icon: <LayoutGrid className="h-[18px] w-[18px]" />,
    href: "/rearrange",
  },
  {
    id: "convert",
    title: "Convert",
    description: "Turn images into a single PDF",
    icon: <FileImage className="h-[18px] w-[18px]" />,
    href: "/images-to-pdf",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const fileRef        = useRef<HTMLInputElement>(null);
  const pendingToolRef = useRef<string | null>(null);

  // Drop zone — opens a PDF in the viewer (no tool hint, just open the file)
  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (f) navigate("/viewer", { state: { file: f } });
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  // Tool cards that need a file: store the tool hint, open the picker, then
  // navigate to the viewer with both the file and the tool hint in router state.
  function openToolFilePicker(toolHint?: string) {
    pendingToolRef.current = toolHint ?? null;
    fileRef.current?.click();
  }

  function handleToolFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      const tool = pendingToolRef.current;
      navigate("/viewer", { state: { file: f, ...(tool ? { tool } : {}) } });
    }
    pendingToolRef.current = null;
    e.target.value = "";
  }

  return (
    <div className="h-screen flex flex-col bg-stone-50 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="shrink-0 h-12 bg-white border-b border-stone-200 px-6 flex items-center gap-3">
        <img src={striaLogo} alt="" aria-hidden="true" className="h-7 w-auto object-contain" />
        <div className="leading-none">
          <p className="text-[16px] font-semibold text-stone-900 tracking-[-0.01em] leading-[1.25]">Stria</p>
          <p className="text-[12px] text-stone-400 leading-[1.25] mt-0.5">PDF toolkit</p>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: "1fr 1fr" }}>

        {/* Left — file intake ───────────────────────────────────────────── */}
        <div className="bg-white border-r border-stone-200 flex flex-col p-8 gap-5 overflow-hidden">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-[0.08em]">Open a file</p>

          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-4 rounded-xl",
              "border-2 border-dashed transition-all duration-200 cursor-pointer",
              isDragActive
                ? "border-amber-400 bg-[#fffbeb] scale-[1.01]"
                : "border-stone-300 bg-stone-50 hover:border-[#d4c5a0] hover:bg-white"
            )}
          >
            <input {...getInputProps()} />
            <svg
              className={cn("h-12 w-12 transition-colors duration-200", isDragActive ? "text-amber-500" : "text-stone-300")}
              viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M10 38V18l10-12h18v32H10z" strokeLinejoin="round"/>
              <path d="M20 6v12h18M22 28l6-6 6 6M28 22v10" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="text-center px-4">
              <p className="text-sm font-semibold text-stone-700">
                {isDragActive ? "Drop the PDF here" : "Drop a PDF, or click to browse"}
              </p>
              <p className="mt-1 text-xs text-stone-400">Opens in the review workspace with all tools available</p>
            </div>
          </div>

          <p className="text-[11px] text-stone-400 leading-relaxed">
            Files never leave your machine. All processing runs locally via the bundled backend.
          </p>
        </div>

        {/* Right — tool list ────────────────────────────────────────────── */}
        <div className="overflow-auto p-8 flex flex-col gap-4">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-[0.08em]">Document tools</p>

          <nav className="flex flex-col gap-0.5" aria-label="Document tools">
            {TOOLS.map(tool => {
              const row = (
                <div
                  className={cn(
                    "group flex items-center gap-3.5 px-3.5 py-3 rounded-xl cursor-pointer",
                    "transition-all duration-150 ease-out",
                    "hover:bg-white hover:shadow-sm",
                  )}
                >
                  <div className={cn(
                    "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                    "bg-stone-100 text-stone-400 transition-colors duration-150",
                    "group-hover:bg-amber-50 group-hover:text-amber-600",
                  )}>
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-stone-700 group-hover:text-stone-900 transition-colors duration-150">
                      {tool.title}
                    </p>
                    <p className="text-[11px] text-stone-400 leading-snug mt-0.5">
                      {tool.description}
                    </p>
                  </div>
                </div>
              );

              if (tool.href) {
                return <Link key={tool.id} to={tool.href} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">{row}</Link>;
              }
              return (
                <button key={tool.id} onClick={() => openToolFilePicker(tool.toolHint)} className="w-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50">
                  {row}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Hidden file input for tool cards that need a file */}
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleToolFile} />
    </div>
  );
}
