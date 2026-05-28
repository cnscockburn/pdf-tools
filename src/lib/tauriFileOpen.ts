/**
 * tauriFileOpen — handles opening PDF files from the OS in Tauri.
 *
 * Two entry points:
 * 1. **Startup**: check if a file was passed via CLI args (e.g. double-click a PDF
 *    when Stria isn't running, or "Open with" from Windows Explorer).
 * 2. **Single-instance event**: when Stria is already running and the user opens
 *    another PDF, the second instance sends its CLI args to the existing window
 *    via the `open-file` Tauri event. `listenForFileOpen` subscribes to that.
 *
 * This module is a no-op when running in the browser (non-Tauri).
 */

/** Whether we're running inside a Tauri WebView. */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Read a file from disk via the Rust backend and return a File object.
 */
async function readFileFromPath(filePath: string): Promise<File> {
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = await invoke<number[]>("read_file_bytes", { path: filePath });
  const uint8 = new Uint8Array(bytes);
  const name = filePath.split(/[/\\]/).pop() ?? "document.pdf";
  return new File([uint8], name, { type: "application/pdf" });
}

/**
 * Check if a PDF file was passed as a CLI argument and return it as a File object.
 * Returns null if not running in Tauri or no file was passed.
 */
export async function getCliFile(): Promise<File | null> {
  if (!isTauri) return null;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const filePath = await invoke<string | null>("get_cli_file_path");
    if (!filePath) return null;
    return await readFileFromPath(filePath);
  } catch (e) {
    console.warn("[tauriFileOpen] Failed to load CLI file:", e);
    return null;
  }
}

/**
 * Listen for the `open-file` event emitted by the single-instance plugin
 * when a second Stria instance is launched with a PDF argument.
 *
 * Returns an unlisten function. No-op in non-Tauri environments.
 */
export function listenForFileOpen(onFile: (file: File) => void): () => void {
  if (!isTauri) return () => {};

  let unlisten: (() => void) | null = null;

  import("@tauri-apps/api/event").then(({ listen }) => {
    listen<string>("open-file", async (event) => {
      try {
        const file = await readFileFromPath(event.payload);
        onFile(file);
      } catch (e) {
        console.warn("[tauriFileOpen] Failed to open file from event:", e);
      }
    }).then(fn => { unlisten = fn; });
  });

  return () => { unlisten?.(); };
}
