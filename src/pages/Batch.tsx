/**
 * Batch — apply a single operation to multiple PDFs at once.
 *
 * User drops multiple PDFs, picks an operation (Compress, Watermark,
 * PDF→Images), configures it once, then runs it across all files.
 * Results download as a ZIP.
 *
 * v1 operation set: Compress, Watermark, PDF→Images.
 */
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { X, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { cn, formatBytes, downloadBlob } from "../lib/utils";
import Layout from "../components/Layout";
import { compressPDF, watermarkPDF, pdfToImages, type WatermarkOptions } from "../api/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Operation = "compress" | "watermark" | "to-images";

interface BatchFile {
  id: string;
  file: File;
  status: "pending" | "running" | "done" | "error";
  error?: string;
  resultBlob?: Blob;
  resultName?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stemOf(name: string) { return name.replace(/\.pdf$/i, ""); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function Batch() {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [op, setOp] = useState<Operation>("compress");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  // Compress settings
  const [compressQuality, setCompressQuality] = useState<"screen" | "ebook" | "printer" | "lossless">("ebook");

  // Watermark settings
  const [wmText, setWmText] = useState("DRAFT");
  const [wmOpacity, setWmOpacity] = useState(0.3);
  const [wmAngle, setWmAngle] = useState(45);

  // to-images settings
  const [imgDpi, setImgDpi] = useState(150);
  const [imgFmt, setImgFmt] = useState<"png" | "jpg">("png");

  const onDrop = useCallback((dropped: File[]) => {
    const newFiles = dropped
      .filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      .filter(f => !files.some(b => b.file.name === f.name && b.file.size === f.size))
      .map(f => ({ id: `${f.name}-${f.size}`, file: f, status: "pending" as const }));
    setFiles(prev => [...prev, ...newFiles]);
    setDone(false);
  }, [files]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
  });

  function removeFile(id: string) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  async function processFile(bf: BatchFile): Promise<Partial<BatchFile>> {
    try {
      let blob: Blob;
      let resultName: string;
      if (op === "compress") {
        blob = await compressPDF(bf.file, compressQuality);
        resultName = `${stemOf(bf.file.name)}_compressed.pdf`;
      } else if (op === "watermark") {
        const opts: WatermarkOptions = {
          text: wmText || "DRAFT",
          opacity: wmOpacity,
          angle: wmAngle,
          fontsize: 60,
          color: "0.5,0.5,0.5",
        };
        blob = await watermarkPDF(bf.file, opts);
        resultName = `${stemOf(bf.file.name)}_watermarked.pdf`;
      } else {
        blob = await pdfToImages(bf.file, imgDpi, imgFmt);
        resultName = `${stemOf(bf.file.name)}_images.zip`;
      }
      return { status: "done", resultBlob: blob, resultName };
    } catch (e) {
      return { status: "error", error: e instanceof Error ? e.message : "Failed" };
    }
  }

  async function runBatch() {
    if (files.length === 0 || running) return;
    setRunning(true);
    setDone(false);

    // Process files sequentially to avoid slamming the sidecar
    for (const bf of files) {
      setFiles(prev => prev.map(f => f.id === bf.id ? { ...f, status: "running" } : f));
      const result = await processFile(bf);
      setFiles(prev => prev.map(f => f.id === bf.id ? { ...f, ...result } : f));
    }

    setRunning(false);
    setDone(true);
  }

  async function downloadAll() {
    const results = files.filter(f => f.status === "done" && f.resultBlob);
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadBlob(results[0].resultBlob!, results[0].resultName!);
      return;
    }

    // Bundle multiple results into a ZIP
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const r of results) {
      zip.file(r.resultName!, r.resultBlob!);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, `batch_results.zip`);
  }

  const pendingCount = files.filter(f => f.status === "pending").length;
  const doneCount = files.filter(f => f.status === "done").length;
  const errorCount = files.filter(f => f.status === "error").length;

  return (
    <Layout title="Batch" description="Apply one operation to many PDFs at once">
      <div className="space-y-6">

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            "w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors duration-200 cursor-pointer py-10 px-6",
            isDragActive
              ? "border-brand-500 bg-[#fffbeb] app-dark:bg-brand-950/40"
              : "border-stone-300 bg-white hover:border-[#d4c5a0] app-dark:border-stone-700 app-dark:bg-stone-900 app-dark:hover:border-brand-500/60",
          )}
        >
          <input {...getInputProps()} />
          <FileText className={cn("h-8 w-8 transition-colors", isDragActive ? "text-brand-500" : "text-stone-300 app-dark:text-stone-600")} />
          <div className="text-center">
            <p className="text-sm font-semibold text-stone-700 app-dark:text-stone-200">
              {isDragActive ? "Drop PDFs here" : "Drop multiple PDFs here"}
            </p>
            <p className="text-xs text-stone-400 mt-1">Or click to browse — select as many PDFs as you like</p>
          </div>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map(bf => (
              <div key={bf.id} className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                bf.status === "done" ? "border-green-200 bg-green-50 app-dark:border-green-800/40 app-dark:bg-green-950/20"
                : bf.status === "error" ? "border-red-200 bg-red-50 app-dark:border-red-800/40 app-dark:bg-red-950/20"
                : bf.status === "running" ? "border-brand-200 bg-amber-50/50 app-dark:border-brand-800/40 app-dark:bg-brand-950/10"
                : "border-stone-200 bg-white app-dark:border-stone-800 app-dark:bg-stone-900",
              )}>
                {bf.status === "running" && <Loader2 className="h-4 w-4 text-brand-500 animate-spin shrink-0" />}
                {bf.status === "done" && <Check className="h-4 w-4 text-green-500 shrink-0" />}
                {bf.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
                {bf.status === "pending" && <FileText className="h-4 w-4 text-stone-400 shrink-0" />}
                <span className="flex-1 truncate text-stone-700 app-dark:text-stone-200">{bf.file.name}</span>
                <span className="text-xs text-stone-400 shrink-0">{formatBytes(bf.file.size)}</span>
                {bf.status === "error" && bf.error && (
                  <span className="text-xs text-red-500 shrink-0 max-w-[140px] truncate">{bf.error}</span>
                )}
                {bf.status === "pending" && (
                  <button onClick={() => removeFile(bf.id)} aria-label="Remove" className="shrink-0 text-stone-400 hover:text-stone-700 transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Operation picker */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-600 app-dark:text-stone-400 mb-2 uppercase tracking-wide">Operation</label>
              <div className="flex gap-2">
                {(["compress", "watermark", "to-images"] as Operation[]).map(o => (
                  <button
                    key={o}
                    onClick={() => setOp(o)}
                    disabled={running}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition border",
                      op === o
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white text-stone-600 border-stone-200 hover:border-stone-300 app-dark:bg-stone-900 app-dark:text-stone-300 app-dark:border-stone-700",
                    )}
                  >
                    {o === "compress" ? "Compress" : o === "watermark" ? "Watermark" : "PDF → Images"}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-operation settings */}
            {op === "compress" && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs text-stone-600 app-dark:text-stone-400">Quality:</label>
                {(["screen", "ebook", "printer", "lossless"] as const).map(q => (
                  <button key={q} onClick={() => setCompressQuality(q)} disabled={running}
                    className={cn("px-2.5 py-1 rounded-lg text-xs transition border",
                      compressQuality === q ? "bg-brand-500 text-white border-brand-500" : "text-stone-500 border-stone-200 hover:border-stone-300 app-dark:border-stone-700")}>
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {op === "watermark" && (
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <label className="block text-[10px] text-stone-500 mb-1">Text</label>
                  <input value={wmText} onChange={e => setWmText(e.target.value)} maxLength={200} disabled={running}
                    className="rounded-lg border border-stone-200 app-dark:border-stone-700 bg-white app-dark:bg-stone-900 px-2.5 py-1.5 text-xs text-stone-700 app-dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-brand-500 w-32" />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-1">Opacity {Math.round(wmOpacity * 100)}%</label>
                  <input type="range" min={5} max={100} value={Math.round(wmOpacity * 100)}
                    onChange={e => setWmOpacity(parseInt(e.target.value) / 100)} disabled={running}
                    className="w-24 accent-brand-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-1">Angle {wmAngle}°</label>
                  <input type="range" min={0} max={359} value={wmAngle}
                    onChange={e => setWmAngle(parseInt(e.target.value))} disabled={running}
                    className="w-24 accent-brand-500" />
                </div>
              </div>
            )}

            {op === "to-images" && (
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <label className="block text-[10px] text-stone-500 mb-1">DPI</label>
                  <input type="number" min={36} max={600} value={imgDpi}
                    onChange={e => setImgDpi(Math.max(36, Math.min(600, parseInt(e.target.value) || 150)))}
                    disabled={running}
                    className="rounded-lg border border-stone-200 app-dark:border-stone-700 bg-white app-dark:bg-stone-900 px-2.5 py-1.5 text-xs text-stone-700 app-dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-brand-500 w-20 no-spinner" />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-500 mb-1">Format</label>
                  <div className="flex gap-1.5">
                    {(["png", "jpg"] as const).map(f => (
                      <button key={f} onClick={() => setImgFmt(f)} disabled={running}
                        className={cn("px-2.5 py-1 rounded-lg text-xs transition border",
                          imgFmt === f ? "bg-brand-500 text-white border-brand-500" : "text-stone-500 border-stone-200 hover:border-stone-300 app-dark:border-stone-700 uppercase")}>
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Run + download buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={runBatch}
                disabled={running || files.length === 0 || pendingCount === 0}
                className="flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 px-5 py-2.5 text-sm font-semibold text-white transition shadow-sm"
              >
                {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : `Run on ${pendingCount} file${pendingCount !== 1 ? "s" : ""}`}
              </button>

              {done && doneCount > 0 && (
                <button
                  onClick={downloadAll}
                  className="flex items-center gap-2 rounded-xl bg-stone-800 hover:bg-stone-700 app-dark:bg-stone-700 app-dark:hover:bg-stone-600 px-5 py-2.5 text-sm font-semibold text-white transition"
                >
                  Download {doneCount} result{doneCount !== 1 ? "s" : ""}
                  {errorCount > 0 && <span className="text-red-400">({errorCount} error{errorCount !== 1 ? "s" : ""})</span>}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
