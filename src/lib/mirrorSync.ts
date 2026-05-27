/**
 * mirrorSync — lightweight pub/sub for synchronizing annotations between
 * mirrored side-by-side Viewer panes.
 *
 * Each mirrored pair shares a `groupId`. When one pane's annotations change,
 * it publishes the full annotation array; the other pane receives it and
 * updates its own state. A `senderId` prevents echo (a pane ignores its own
 * broadcasts).
 */

type Listener<T> = (data: T, senderId: string) => void;

const channels = new Map<string, Set<Listener<unknown>>>();

/** Subscribe to a mirror group. Returns an unsubscribe function. */
export function subscribe<T>(groupId: string, listener: Listener<T>): () => void {
  if (!channels.has(groupId)) channels.set(groupId, new Set());
  const set = channels.get(groupId)!;
  const wrapped = listener as Listener<unknown>;
  set.add(wrapped);
  return () => {
    set.delete(wrapped);
    if (set.size === 0) channels.delete(groupId);
  };
}

/** Publish data to all subscribers in a mirror group. Passes senderId so listeners can ignore their own broadcasts. */
export function publish<T>(groupId: string, senderId: string, data: T): void {
  const set = channels.get(groupId);
  if (!set) return;
  for (const listener of set) {
    listener(data, senderId);
  }
}

/** Clear all channels. Used in tests only. */
export function _clearAll(): void {
  channels.clear();
}
