import { useDropzone, type DropzoneOptions } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn, formatBytes } from "../lib/utils";

interface Props extends Pick<DropzoneOptions, "multiple" | "accept"> {
  files: File[];
  onFiles: (files: File[]) => void;
  label?: string;
}

export default function FileDropZone({ files, onFiles, multiple = false, accept, label }: Props) {
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
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-brand-500 bg-brand-50"
            : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto mb-3 h-10 w-10 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">
          {isDragActive ? "Drop here" : label ?? "Drop PDF here or click to browse"}
        </p>
        <p className="mt-1 text-xs text-gray-400">PDF files only</p>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm"
            >
              <span className="truncate max-w-xs text-gray-700">{f.name}</span>
              <span className="ml-2 shrink-0 text-gray-400">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
