import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revocation — Tauri WebView2 may start the download asynchronously
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Parse a page range string like "1-3, 5, 7-10" into 1-indexed page numbers */
export function parsePageRanges(input: string, totalPages: number): number[] {
  const pages = new Set<number>();
  const parts = input.split(",").map((s) => s.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr);
      const end = endStr ? parseInt(endStr) : totalPages;
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= Math.min(end, totalPages); i++) {
          if (i >= 1) pages.add(i);
        }
      }
    } else {
      const n = parseInt(part);
      if (!isNaN(n) && n >= 1 && n <= totalPages) pages.add(n);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}
