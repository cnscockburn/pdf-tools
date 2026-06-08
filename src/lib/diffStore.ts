/**
 * Diff data store (B6) — a module-level map used to pass PDF comparison results
 * from the primary Viewer to a freshly-opened secondary pane.
 *
 * Flow:
 *   1. Primary Viewer computes diff via /api/diff and stores it here keyed by a UUID.
 *   2. Primary Viewer opens a side-by-side pane passing the UUID as a toolHint
 *      ("diff:XXXX").
 *   3. Secondary Viewer reads the UUID from its toolHint on mount, fetches the
 *      relevant highlights, and displays them.
 *
 * Data is not persisted between app launches — it is ephemeral and only lives for
 * the duration of the diff session.
 */
import type { DiffRegion } from "./viewerTypes";

export interface DiffEntry {
  /** Highlights to show in the primary (A) pane: words removed from A. */
  a: Map<number, DiffRegion[]>;
  /** Highlights to show in the secondary (B) pane: words added in B. */
  b: Map<number, DiffRegion[]>;
}

const store = new Map<string, DiffEntry>();

export function setDiff(id: string, entry: DiffEntry): void {
  store.set(id, entry);
}

export function getDiff(id: string): DiffEntry | undefined {
  return store.get(id);
}

export function clearDiff(id: string): void {
  store.delete(id);
}
