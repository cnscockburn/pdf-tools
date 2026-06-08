/**
 * autoSave — periodic crash-recovery checkpointing for the Viewer.
 *
 * In packaged Tauri builds, the working blob + pending annotation state is
 * written to %AppData%\Stria\recovery\<slot>.pdf every AUTO_SAVE_INTERVAL_MS.
 * On startup, TabShell reads any recovery files and offers to restore them.
 *
 * The slot is the tab's ID, so multiple tabs are checkpointed independently.
 *
 * In dev/browser mode the IPC commands are absent; all functions are no-ops.
 */

import { isTauri } from "./fileIntake";

const AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const PROD = typeof import.meta !== "undefined" && (import.meta as { env?: { PROD?: boolean } }).env?.PROD;

async function invokeAutoSave<T>(cmd: string, args: Record<string, unknown>): Promise<T | null> {
  if (!isTauri || !PROD) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

/** Write a recovery snapshot for the given tab slot. */
export async function writeRecovery(slot: string, blob: Blob): Promise<void> {
  const data = Array.from(new Uint8Array(await blob.arrayBuffer()));
  await invokeAutoSave("write_recovery_file", { slot, data });
}

/** Delete the recovery snapshot for a slot (call on clean download/close). */
export async function deleteRecovery(slot: string): Promise<void> {
  await invokeAutoSave("delete_recovery_file", { slot });
}

/** Return all recovery entries, or [] if none / not in Tauri. */
export async function listRecovery(): Promise<Array<{ slot: string; path: string }>> {
  const result = await invokeAutoSave<Array<{ slot: string; path: string }>>(
    "list_recovery_files",
    {},
  );
  return result ?? [];
}

/** Hook: start the auto-save interval; returns a cancel function.
 *
 * `getBlob()` is called each tick to get the current working blob.
 * If it returns null, the tick is skipped.
 */
export function startAutoSave(
  slot: string,
  getBlob: () => Blob | null,
): () => void {
  if (!isTauri || !PROD) return () => {};
  const id = setInterval(async () => {
    const blob = getBlob();
    if (!blob) return;
    try { await writeRecovery(slot, blob); } catch { /* ignore write errors */ }
  }, AUTO_SAVE_INTERVAL_MS);
  return () => clearInterval(id);
}
