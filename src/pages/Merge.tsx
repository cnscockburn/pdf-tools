import { useState } from "react";
import Layout from "../components/Layout";
import FileDropZone from "../components/FileDropZone";
import ProcessButton from "../components/ProcessButton";
import { mergePDFs } from "../api/client";
import { downloadBlob } from "../lib/utils";

interface MergeProps {
  initialFile?: File;
}

export default function Merge({ initialFile }: MergeProps = {}) {
  const [files, setFiles] = useState<File[]>(initialFile ? [initialFile] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMerge() {
    if (files.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await mergePDFs(files);
      downloadBlob(blob, "merged.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <Layout title="Merge PDFs" description="Combine multiple PDF files into one">
      <div className="space-y-6">
        <FileDropZone
          files={[]}
          onFiles={(added) => setFiles((prev) => [...prev, ...added])}
          multiple
          accept={{ "application/pdf": [".pdf"] }}
          label="Drop PDFs here (add as many as you need)"
          hint="PDF files only"
        />

        {files.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
            <div className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">
              Files to merge
            </div>
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm truncate max-w-sm text-stone-800">{f.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="ml-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <ProcessButton
          onClick={handleMerge}
          loading={loading}
          disabled={files.length < 2}
          label={files.length < 2 ? "Add at least 2 PDFs" : `Merge ${files.length} files`}
        />
      </div>
    </Layout>
  );
}
