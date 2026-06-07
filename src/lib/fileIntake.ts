/**
 * fileIntake — unified PDF intake that captures the OS path when running in
 * Tauri, so files can be recorded in (and re-opened from) the recent list.
 *
 * - In Tauri: native open dialog + native window drag-drop both yield real
 *   paths, which we read through the Rust `read_file_bytes` command.
 * - In the browser (dev): falls back to a hidden <input>; no path is available,
 *   so those opens simply aren't recorded as recents.
 */

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface OpenedFile {
  file: File;
  /** Absolute OS path, when known (Tauri only). */
  path?: string;
}

// ── Reading by path (Tauri) ──────────────────────────────────────────────────

export async function openPathAsFile(path: string): Promise<File> {
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = await invoke<number[]>("read_file_bytes", { path });
  const name = path.split(/[/\\]/).pop() ?? "document.pdf";
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

// ── Native open dialog / browser fallback ────────────────────────────────────

/**
 * Open the file picker and return the chosen PDF(s). In Tauri this uses the
 * native dialog and yields paths; in the browser it uses a hidden <input>.
 */
export async function pickPdfFiles(multiple = false): Promise<OpenedFile[]> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selection = await open({
      multiple,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!selection) return [];
    const paths = Array.isArray(selection) ? selection : [selection];
    const out: OpenedFile[] = [];
    for (const path of paths) {
      try {
        const file = await openPathAsFile(path);
        recordRecentFile(path, file.size);
        out.push({ file, path });
      } catch { /* skip unreadable */ }
    }
    return out;
  }

  // Browser fallback — hidden input, no path.
  return new Promise<OpenedFile[]>(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.multiple = multiple;
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      resolve(files.map(file => ({ file })));
    };
    input.click();
  });
}

// ── Native window drag-drop (Tauri) ──────────────────────────────────────────

/**
 * Subscribe to native OS file drops on the window. Returns an unlisten fn.
 * No-op in the browser (react-dropzone handles HTML5 drops there).
 */
export function onWindowFileDrop(cb: (files: OpenedFile[]) => void): () => void {
  if (!isTauri) return () => {};
  let unlisten: (() => void) | null = null;
  let cancelled = false;

  import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
    getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") return;
      const pdfPaths = event.payload.paths.filter(p => p.toLowerCase().endsWith(".pdf"));
      if (pdfPaths.length === 0) return;
      const opened: OpenedFile[] = [];
      for (const path of pdfPaths) {
        try {
          const file = await openPathAsFile(path);
          recordRecentFile(path, file.size);
          opened.push({ file, path });
        } catch { /* skip */ }
      }
      if (opened.length > 0) cb(opened);
    }).then(fn => { if (cancelled) fn(); else unlisten = fn; });
  });

  return () => { cancelled = true; unlisten?.(); };
}

// ── Recent files store (localStorage, path-based) ─────────────────────────────

const RECENTS_KEY = "pdf-tools-recent-files";
const MAX_RECENTS = 12;

export interface RecentFile {
  path: string;
  name: string;
  size: number;
  openedAt: number;
}

export function loadRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is RecentFile =>
      r && typeof r.path === "string" && typeof r.name === "string");
  } catch { return []; }
}

/** Record (or bump) a recent file. Most-recent first, de-duplicated by path. */
export function recordRecentFile(path: string, size: number): void {
  if (!isTauri) return; // only meaningful when we have a real path to reopen
  const name = path.split(/[/\\]/).pop() ?? path;
  const list = loadRecentFiles().filter(r => r.path !== path);
  list.unshift({ path, name, size, openedAt: Date.now() });
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
    window.dispatchEvent(new Event("recent-files-changed"));
  } catch { /* quota — ignore */ }
}

export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(RECENTS_KEY);
    window.dispatchEvent(new Event("recent-files-changed"));
  } catch { /* ignore */ }
}

/** Drop a single recent entry (e.g. a file that has since moved/been deleted). */
export function removeRecentFile(path: string): RecentFile[] {
  const next = loadRecentFiles().filter(r => r.path !== path);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("recent-files-changed"));
  } catch { /* ignore */ }
  return next;
}
