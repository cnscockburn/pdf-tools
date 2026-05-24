import { useState } from "react";
import Layout from "../components/Layout";
import FileDropZone from "../components/FileDropZone";
import ProcessButton from "../components/ProcessButton";
import { imagesToPDF } from "../api/client";
import { downloadBlob, formatBytes } from "../lib/utils";

export default function ImagesToPDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleConvert() {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await imagesToPDF(files);
      downloadBlob(blob, "images.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Images to PDF" description="Convert JPEG, PNG, or TIFF images into a PDF">
      <div className="space-y-6">
        <FileDropZone
          files={[]}
          onFiles={(added) => setFiles((prev) => [...prev, ...added])}
          multiple
          accept={{ "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/tiff": [".tif", ".tiff"] }}
          label="Drop images here — each image becomes one page"
        />

        {files.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              {files.length} image(s) — each becomes one PDF page in order
            </div>
            <div className="divide-y divide-gray-100">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-12 w-10 object-cover rounded border border-gray-200"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-gray-800">{f.name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(f.size)}</p>
                  </div>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <ProcessButton
          onClick={handleConvert}
          loading={loading}
          disabled={files.length === 0}
          label={files.length === 0 ? "Add images first" : `Convert ${files.length} image(s) to PDF`}
        />
      </div>
    </Layout>
  );
}
