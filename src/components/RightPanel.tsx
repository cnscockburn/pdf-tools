import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { downloadBlob, parsePageRanges } from "../lib/utils";
import {
  compressPDF, watermarkPDF, encryptPDF, decryptPDF,
  pdfToImages, splitPDF, extractPages, rotatePages, deletePages,
} from "../api/client";

export type PanelTool =
  | "compress" | "watermark" | "split" | "extract"
  | "rotate-delete" | "security" | "pdf-to-images"
  | null;

interface Props {
  tool: PanelTool;
  file: File;
  pageCount: number;
  onClose: () => void;
  /** Called when a tool produces a modified document blob (updates working doc instead of downloading). */
  onApplied?: (blob: Blob) => void;
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
      <span className="text-sm font-semibold text-white">{title}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-white transition">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProcessBtn({ onClick, loading, disabled, label }: {
  onClick: () => void; loading: boolean; disabled: boolean; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="rounded-lg bg-red-900/50 border border-red-700 px-3 py-2 text-xs text-red-300">{msg}</p>;
}

// ---------------------------------------------------------------------------
// Compress
// ---------------------------------------------------------------------------
function CompressPanel({ file, onClose, onApplied }: { file: File; onClose: () => void; onApplied?: (blob: Blob) => void }) {
  const [quality, setQuality] = useState("ebook");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const QUALITIES = [
    { value: "screen",  label: "Screen",  desc: "Smallest file — 72 DPI images" },
    { value: "ebook",   label: "Balanced", desc: "Good quality — recommended" },
    { value: "printer", label: "Printer",  desc: "High quality — large file" },
  ];

  async function run() {
    setLoading(true); setError(null);
    try {
      const blob = await compressPDF(file, quality);
      if (onApplied) onApplied(blob);
      else downloadBlob(blob, `compressed_${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PanelHeader title="Compress PDF" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          {QUALITIES.map((q) => (
            <label key={q.value} className={cn(
              "flex items-center gap-3 rounded-lg border-2 p-3 cursor-pointer transition",
              quality === q.value ? "border-blue-500 bg-blue-900/30" : "border-gray-700 hover:border-gray-600"
            )}>
              <input type="radio" name="quality" value={q.value} checked={quality === q.value}
                onChange={() => setQuality(q.value)} className="accent-blue-500" />
              <div>
                <p className="text-sm font-medium text-white">{q.label}</p>
                <p className="text-xs text-gray-400">{q.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <Err msg={error} />
        <ProcessBtn onClick={run} loading={loading} disabled={false} label={onApplied ? "Apply Compression" : "Compress & Download"} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Watermark
// ---------------------------------------------------------------------------
const COLORS: { label: string; value: string; css: string }[] = [
  { label: "Gray",  value: "0.5,0.5,0.5", css: "rgba(128,128,128,0.5)" },
  { label: "Black", value: "0,0,0",        css: "rgba(0,0,0,0.5)" },
  { label: "Red",   value: "0.8,0,0",      css: "rgba(200,0,0,0.5)" },
  { label: "Blue",  value: "0,0,0.8",      css: "rgba(0,0,200,0.5)" },
];

function WatermarkPanel({ file, onClose, onApplied }: { file: File; onClose: () => void; onApplied?: (blob: Blob) => void }) {
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(0.3);
  const [angle, setAngle] = useState(45);
  const [fontsize, setFontsize] = useState(60);
  const [colorIdx, setColorIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!text.trim()) return;
    setLoading(true); setError(null);
    try {
      const blob = await watermarkPDF(file, { text, opacity, angle, fontsize, color: COLORS[colorIdx].value });
      if (onApplied) onApplied(blob);
      else downloadBlob(blob, `watermarked_${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PanelHeader title="Watermark" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Text</label>
          <input value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Color</label>
          <div className="flex gap-2">
            {COLORS.map((c, i) => (
              <button key={i} onClick={() => setColorIdx(i)} title={c.label}
                className={cn("h-7 w-7 rounded-full border-2 transition", colorIdx === i ? "border-white" : "border-transparent")}
                style={{ background: c.css }} />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Opacity — {Math.round(opacity * 100)}%</label>
          <input type="range" min={5} max={80} value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="w-full accent-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Angle — {angle}°</label>
          <input type="range" min={-90} max={90} value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-full accent-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Font size — {fontsize}pt</label>
          <input type="range" min={20} max={120} value={fontsize}
            onChange={(e) => setFontsize(Number(e.target.value))}
            className="w-full accent-blue-500" />
        </div>
        {/* Live CSS preview */}
        <div className="rounded-lg bg-gray-800 border border-gray-700 h-20 flex items-center justify-center overflow-hidden relative">
          <span className="absolute text-gray-300 text-[10px]">Preview</span>
          {text && (
            <span className="absolute font-bold whitespace-nowrap pointer-events-none select-none"
              style={{
                fontSize: `${Math.max(12, fontsize * 0.3)}px`,
                opacity,
                color: `rgb(${COLORS[colorIdx].value.split(",").map((v) => Math.round(Number(v) * 255)).join(",")})`,
                transform: `rotate(${-angle}deg)`,
              }}>
              {text}
            </span>
          )}
        </div>
        <Err msg={error} />
        <ProcessBtn onClick={run} loading={loading} disabled={!text.trim()} label={onApplied ? "Apply Watermark" : "Apply Watermark & Download"} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/** Convert a sorted list of 1-indexed page numbers into contiguous [start,end] ranges. */
function buildRangeList(pages: number[]): [number, number][] {
  if (pages.length === 0) return [];
  const list: [number, number][] = [[pages[0], pages[0]]];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i] === list[list.length - 1][1] + 1)
      list[list.length - 1][1] = pages[i];
    else
      list.push([pages[i], pages[i]]);
  }
  return list;
}

function SplitPanel({ file, pageCount, onClose, onApplied }: {
  file: File; pageCount: number; onClose: () => void; onApplied?: (blob: Blob) => void;
}) {
  const [ranges, setRanges] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute range list from current input for button label logic
  const rangeList = buildRangeList(parsePageRanges(ranges, pageCount));
  const isSingle = rangeList.length === 1;

  async function run() {
    const rl = buildRangeList(parsePageRanges(ranges, pageCount));
    if (rl.length === 0) { setError("Enter at least one valid page range."); return; }
    setLoading(true); setError(null);
    try {
      const blob = await splitPDF(file, rl);
      if (rl.length === 1 && onApplied) {
        // Single contiguous range → keep as the new working document
        onApplied(blob);
      } else {
        const stem = file.name.replace(/\.pdf$/i, "");
        downloadBlob(blob, `${stem}_split${rl.length > 1 ? ".zip" : ".pdf"}`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  const btnLabel = isSingle && onApplied
    ? `Keep Pages ${rangeList[0][0]}–${rangeList[0][1]}`
    : rangeList.length > 1
      ? "Split & Download ZIP"
      : "Split & Download";

  return (
    <>
      <PanelHeader title="Split PDF" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-xs text-gray-400">
          Single range: keeps those pages as the working document.
          Multiple ranges: downloads a ZIP with one PDF per range.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Ranges (e.g. <code className="text-gray-300">1-3, 5, 7-10</code>)
          </label>
          <input value={ranges} onChange={(e) => setRanges(e.target.value)}
            placeholder={`1-${pageCount}`}
            className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <Err msg={error} />
        <ProcessBtn onClick={run} loading={loading} disabled={!ranges.trim()}
          label={ranges.trim() ? btnLabel : "Split & Download"} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------
function ExtractPanel({ file, pageCount, onClose, onApplied }: { file: File; pageCount: number; onClose: () => void; onApplied?: (blob: Blob) => void }) {
  const [pages, setPages] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const parsed = parsePageRanges(pages, pageCount);
    if (parsed.length === 0) { setError("Enter at least one valid page number."); return; }
    setLoading(true); setError(null);
    try {
      const blob = await extractPages(file, parsed);
      if (onApplied) onApplied(blob);
      else { const stem = file.name.replace(/\.pdf$/i, ""); downloadBlob(blob, `${stem}_extracted.pdf`); }
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PanelHeader title="Extract Pages" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-xs text-gray-400">Pull out specific pages into a new PDF.</p>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Pages (e.g. <code className="text-gray-300">1, 3-5, 8</code>)
          </label>
          <input value={pages} onChange={(e) => setPages(e.target.value)}
            placeholder="1, 2, 3"
            className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <Err msg={error} />
        <ProcessBtn onClick={run} loading={loading} disabled={!pages.trim()} label={onApplied ? "Extract Pages" : "Extract & Download"} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rotate / Delete
// ---------------------------------------------------------------------------
function RotateDeletePanel({ file, pageCount, onClose, onApplied }: { file: File; pageCount: number; onClose: () => void; onApplied?: (blob: Blob) => void }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [angle, setAngle] = useState(90);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: number) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(p) ? s.delete(p) : s.add(p);
      return s;
    });
  }
  function selectAll() { setSelected(new Set(Array.from({ length: pageCount }, (_, i) => i + 1))); }
  function clearAll() { setSelected(new Set()); }

  async function runRotate() {
    if (selected.size === 0) return;
    setLoading(true); setError(null);
    try {
      const blob = await rotatePages(file, [...selected], angle);
      if (onApplied) onApplied(blob);
      else downloadBlob(blob, `rotated_${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  async function runDelete() {
    if (selected.size === 0) return;
    if (selected.size >= pageCount) { setError("Cannot delete all pages."); return; }
    setLoading(true); setError(null);
    try {
      const blob = await deletePages(file, [...selected]);
      if (onApplied) onApplied(blob);
      else downloadBlob(blob, `pages_removed_${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <>
      <PanelHeader title="Rotate / Delete Pages" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-xs text-blue-400 hover:underline">All</button>
          <button onClick={clearAll}  className="text-xs text-gray-400 hover:underline">None</button>
          <span className="text-xs text-gray-500 ml-auto">{selected.size} selected</span>
        </div>
        <div className="grid grid-cols-5 gap-1 max-h-48 overflow-y-auto">
          {pages.map((p) => (
            <button key={p} onClick={() => toggle(p)}
              className={cn(
                "rounded text-xs py-1 border transition",
                selected.has(p)
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
              )}>
              {p}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Rotate angle</label>
          <div className="flex gap-2">
            {[90, 180, 270].map((a) => (
              <button key={a} onClick={() => setAngle(a)}
                className={cn("flex-1 rounded-lg border py-1.5 text-xs transition",
                  angle === a ? "bg-blue-600 border-blue-500 text-white" : "border-gray-700 text-gray-300 hover:border-gray-500"
                )}>
                {a}°
              </button>
            ))}
          </div>
        </div>
        <Err msg={error} />
        <ProcessBtn onClick={runRotate} loading={loading} disabled={selected.size === 0}
          label={`Rotate ${selected.size || ""} page${selected.size !== 1 ? "s" : ""}${onApplied ? "" : " & Download"}`} />
        <button onClick={runDelete} disabled={loading || selected.size === 0}
          className="w-full rounded-lg border border-red-700 bg-red-900/30 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-900/50 disabled:opacity-40 transition">
          Delete selected pages
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Security (Encrypt / Decrypt)
// ---------------------------------------------------------------------------
function SecurityPanel({ file, onClose, onApplied }: {
  file: File; onClose: () => void; onApplied?: (blob: Blob) => void;
}) {
  const [tab, setTab] = useState<"encrypt" | "decrypt">("encrypt");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ownerPwd, setOwnerPwd] = useState("");
  const [showOwner, setShowOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchTab(t: "encrypt" | "decrypt") { setTab(t); setPassword(""); setConfirm(""); setError(null); }

  async function runEncrypt() {
    if (!password || password !== confirm) return;
    setLoading(true); setError(null);
    try {
      const blob = await encryptPDF(file, password, ownerPwd || undefined);
      if (onApplied) onApplied(blob);
      else downloadBlob(blob, `encrypted_${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  async function runDecrypt() {
    if (!password) return;
    setLoading(true); setError(null);
    try {
      const blob = await decryptPDF(file, password);
      if (onApplied) onApplied(blob);
      else downloadBlob(blob, `decrypted_${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PanelHeader title="Encrypt / Decrypt" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex rounded-lg bg-gray-800 p-0.5 gap-0.5">
          {(["encrypt", "decrypt"] as const).map((t) => (
            <button key={t} onClick={() => switchTab(t)}
              className={cn("flex-1 rounded-md py-1.5 text-xs font-medium transition",
                tab === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white")}>
              {t === "encrypt" ? "Encrypt" : "Decrypt"}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            {tab === "encrypt" ? "User password" : "Current password"}
          </label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === "encrypt" ? "Required to open PDF" : "Password to remove"}
            className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {tab === "encrypt" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className={cn("w-full rounded-lg border px-3 py-2 text-sm text-white bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500",
                  confirm && password !== confirm ? "border-red-500" : "border-gray-600")} />
              {confirm && password !== confirm && <p className="mt-1 text-xs text-red-400">Passwords don't match</p>}
            </div>
            <button onClick={() => setShowOwner(!showOwner)} className="text-xs text-blue-400 hover:underline">
              {showOwner ? "Hide" : "Set owner password (optional)"}
            </button>
            {showOwner && (
              <input type="password" value={ownerPwd} onChange={(e) => setOwnerPwd(e.target.value)}
                placeholder="Owner password (controls permissions)"
                className="w-full rounded-lg bg-gray-800 border border-gray-600 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
            <p className="text-xs text-gray-500">AES-256 encryption (PDF 2.0)</p>
          </>
        )}
        <Err msg={error} />
        <ProcessBtn
          onClick={tab === "encrypt" ? runEncrypt : runDecrypt}
          loading={loading}
          disabled={tab === "encrypt" ? (!password || password !== confirm) : !password}
          label={
            tab === "encrypt"
              ? (onApplied ? "Apply Encryption" : "Encrypt & Download")
              : (onApplied ? "Remove Password" : "Remove Password & Download")
          }
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PDF → Images
// ---------------------------------------------------------------------------
const DPIS = [
  { value: 72,  label: "72 DPI",  desc: "Screen — small files" },
  { value: 150, label: "150 DPI", desc: "Balanced — recommended" },
  { value: 300, label: "300 DPI", desc: "Print quality" },
];

function PdfToImagesPanel({ file, onClose }: { file: File; onClose: () => void }) {
  const [dpi, setDpi] = useState(150);
  const [fmt, setFmt] = useState<"png" | "jpg">("png");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try {
      const blob = await pdfToImages(file, dpi, fmt);
      const stem = file.name.replace(/\.pdf$/i, "");
      downloadBlob(blob, `${stem}_images.zip`);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <PanelHeader title="PDF to Images" onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Format</label>
          <div className="flex gap-2">
            {(["png", "jpg"] as const).map((f) => (
              <label key={f} className={cn("flex items-center gap-2 flex-1 rounded-lg border-2 px-3 py-2 cursor-pointer transition",
                fmt === f ? "border-blue-500 bg-blue-900/30" : "border-gray-700 hover:border-gray-600")}>
                <input type="radio" name="fmt" value={f} checked={fmt === f} onChange={() => setFmt(f)} className="accent-blue-500" />
                <div>
                  <p className="text-xs font-semibold text-white uppercase">{f}</p>
                  <p className="text-[10px] text-gray-400">{f === "png" ? "Lossless" : "Smaller"}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-400">Resolution</label>
          {DPIS.map((d) => (
            <label key={d.value} className={cn("flex items-center gap-3 rounded-lg border-2 p-2.5 cursor-pointer transition",
              dpi === d.value ? "border-blue-500 bg-blue-900/30" : "border-gray-700 hover:border-gray-600")}>
              <input type="radio" name="dpi" value={d.value} checked={dpi === d.value}
                onChange={() => setDpi(d.value)} className="accent-blue-500" />
              <div>
                <p className="text-xs font-medium text-white">{d.label}</p>
                <p className="text-[10px] text-gray-400">{d.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <Err msg={error} />
        <ProcessBtn onClick={run} loading={loading} disabled={false} label="Export as ZIP" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
export default function RightPanel({ tool, file, pageCount, onClose, onApplied }: Props) {
  if (!tool) return null;

  return (
    <div className="w-72 flex-shrink-0 flex flex-col bg-gray-900 border-l border-gray-700 overflow-hidden">
      {tool === "compress"      && <CompressPanel      file={file} onClose={onClose} onApplied={onApplied} />}
      {tool === "watermark"     && <WatermarkPanel     file={file} onClose={onClose} onApplied={onApplied} />}
      {tool === "split"         && <SplitPanel         file={file} pageCount={pageCount} onClose={onClose} onApplied={onApplied} />}
      {tool === "extract"       && <ExtractPanel       file={file} pageCount={pageCount} onClose={onClose} onApplied={onApplied} />}
      {tool === "rotate-delete" && <RotateDeletePanel  file={file} pageCount={pageCount} onClose={onClose} onApplied={onApplied} />}
      {tool === "security"      && <SecurityPanel      file={file} onClose={onClose} onApplied={onApplied} />}
      {tool === "pdf-to-images" && <PdfToImagesPanel   file={file} onClose={onClose} />}
    </div>
  );
}
