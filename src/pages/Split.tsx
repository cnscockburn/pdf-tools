import { useState } from "react";
import Layout from "../components/Layout";
import FileDropZone from "../components/FileDropZone";
import ProcessButton from "../components/ProcessButton";
import { usePdfThumbnails } from "../components/PageThumbnailGrid";
import { splitPDF } from "../api/client";
import { downloadBlob } from "../lib/utils";

export default function Split() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"every" | "ranges">("every");
  const [rangeInput, setRangeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pageCount } = usePdfThumbnails(file);

  /** Parse "1-3, 5, 7-10" → [[1,3],[5,5],[7,10]] */
  function parseRanges(): [number, number][] {
    if (mode === "every") {
      return Array.from({ length: pageCount }, (_, i) => [i + 1, i + 1] as [number, number]);
    }
    const result: [number, number][] = [];
    for (const part of rangeInput.split(",").map((s) => s.trim())) {
      if (!part) continue;
      const m = part.match(/^(\d+)(?:-(\d+))?$/);
      if (m) {
        const start = parseInt(m[1]);
        const end = m[2] ? parseInt(m[2]) : start;
        result.push([start, end]);
      }
    }
    return result;
  }

  async function handleSplit() {
    if (!file) return;
    const ranges = parseRanges();
    if (!ranges.length) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await splitPDF(file, ranges);
      downloadBlob(blob, "split.zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Split PDF" description="Split a PDF into multiple files">
      <div className="space-y-6">
        <FileDropZone
          files={file ? [file] : []}
          onFiles={([f]) => setFile(f)}
          accept={{ "application/pdf": [".pdf"] }}
          hint="PDF files only"
        />

        {file && (
          <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
            <p className="text-sm text-stone-500">
              {pageCount ? `${pageCount} pages detected` : "Loading…"}
            </p>

            <div className="flex gap-3">
              {(["every", "ranges"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                    mode === m
                      ? "bg-brand-500 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {m === "every" ? "Split every page" : "Custom ranges"}
                </button>
              ))}
            </div>

            {mode === "ranges" && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Page ranges
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1-3, 5, 7-10"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                />
                <p className="mt-1 text-xs text-stone-400">
                  Each range becomes a separate PDF. Download arrives as a .zip.
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <ProcessButton
          onClick={handleSplit}
          loading={loading}
          disabled={!file || (mode === "ranges" && !rangeInput.trim())}
          label="Split PDF"
        />
      </div>
    </Layout>
  );
}
