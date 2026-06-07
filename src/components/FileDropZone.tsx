import { useDropzone, type DropzoneOptions } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn, formatBytes } from "../lib/utils";

interface Props extends Pick<DropzoneOptions, "multiple" | "accept"> {
  files: File[];
  onFiles: (files: File[]) => void;
  label?: string;
  hint?: string;
}

export default function FileDropZone({ files, onFiles, multiple = false, accept, label, hint }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => onFiles(multiple ? [...files, ...accepted] : accepted),
    multiple,
    accept,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
          isDragActive
            ? "border-brand-500 bg-[#fffbeb] app-dark:bg-brand-950/40 scale-[1.01]"
            : "border-stone-300 hover:border-[#d4c5a0] hover:bg-stone-50 app-dark:border-stone-700 app-dark:hover:border-brand-500/60 app-dark:hover:bg-stone-900"
        )}
        tabIndex={0}
        role="button"
        aria-label={label ?? "Drop file here or click to browse"}
      >
        <input {...getInputProps()} />
        <UploadCloud className={cn("mx-auto mb-3 h-10 w-10 transition-colors duration-200", isDragActive ? "text-brand-500" : "text-stone-400 app-dark:text-stone-500")} />
        <p className="text-sm font-medium text-stone-700 app-dark:text-stone-200">
          {isDragActive ? "Drop here" : label ?? "Drop PDF here or click to browse"}
        </p>
        {hint && <p className="mt-1 text-xs text-stone-400 app-dark:text-stone-500">{hint}</p>}
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-white border border-stone-200 app-dark:bg-stone-900 app-dark:border-stone-800 px-3 py-2 text-sm"
            >
              <span className="truncate max-w-xs text-stone-700 app-dark:text-stone-200">{f.name}</span>
              <span className="ml-2 shrink-0 text-stone-400 app-dark:text-stone-500">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
