import { useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { UploadCloud, Merge, Image } from "lucide-react";
import { cn } from "../lib/utils";

export default function Home() {
  const navigate = useNavigate();

  const onDrop = useCallback((files: File[]) => {
    const f = files[0];
    if (f) navigate("/viewer", { state: { file: f } });
  }, [navigate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
  });

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="bg-white border-b border-stone-200 px-8 py-5">
        <h1 className="text-2xl font-bold text-stone-900">PDF Tools</h1>
        <p className="mt-0.5 text-sm text-stone-500">Local toolkit — your files never leave your machine</p>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-10">

        {/* Primary action: open a file */}
        <div className="w-full max-w-xl">
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all",
              isDragActive
                ? "border-brand-500 bg-brand-50 scale-[1.01]"
                : "border-stone-300 bg-white hover:border-brand-400 hover:bg-brand-50/40"
            )}
          >
            <input {...getInputProps()} />
            <UploadCloud className={cn("mx-auto mb-4 h-14 w-14 transition-colors", isDragActive ? "text-brand-500" : "text-stone-400")} />
            <p className="text-lg font-semibold text-stone-800">
              {isDragActive ? "Drop it here" : "Open a PDF"}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              Drag & drop, or click to browse — opens in the viewer with all tools available
            </p>
          </div>
        </div>

        {/* Secondary: multi-file tools */}
        <div className="w-full max-w-xl">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-3">Need multiple files?</p>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/merge"
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 py-4 hover:border-brand-300 hover:bg-brand-50/40 transition group">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 group-hover:bg-brand-200 transition">
                <Merge className="h-5 w-5 text-brand-600" />
              </span>
              <div>
                <p className="text-sm font-semibold text-stone-800">Merge PDFs</p>
                <p className="text-xs text-stone-500">Combine multiple files into one</p>
              </div>
            </Link>
            <Link to="/images-to-pdf"
              className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-5 py-4 hover:border-pink-300 hover:bg-pink-50/40 transition group">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-100 group-hover:bg-pink-200 transition">
                <Image className="h-5 w-5 text-pink-600" />
              </span>
              <div>
                <p className="text-sm font-semibold text-stone-800">Images to PDF</p>
                <p className="text-xs text-stone-500">Convert JPEGs or PNGs into a PDF</p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
