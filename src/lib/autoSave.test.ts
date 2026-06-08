/**
 * autoSave tests — unit coverage for the pure-TS logic.
 *
 * The Tauri IPC calls are no-ops in the test environment (isTauri = false in
 * jsdom / happy-dom), so we test the interval logic and the exported helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// autoSave.ts checks import.meta.env.PROD — default is undefined in test, so
// all IPC-gated paths are skipped. We can still test the public surface.

describe("autoSave module", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("startAutoSave returns a cancel function (no-op in non-Tauri env)", async () => {
    // In test environment (no Tauri), startAutoSave should return immediately
    // with a cancel fn that doesn't throw.
    const { startAutoSave } = await import("./autoSave");
    const cancel = startAutoSave("test-slot", () => null);
    expect(typeof cancel).toBe("function");
    expect(() => cancel()).not.toThrow();
  });

  it("startAutoSave does not call getBlob when not in prod Tauri", async () => {
    const { startAutoSave } = await import("./autoSave");
    const getBlobSpy = vi.fn(() => null);
    startAutoSave("test-slot", getBlobSpy);
    // Advance 3 minutes
    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    // In non-Tauri env the interval is never set, so getBlob is never called
    expect(getBlobSpy).not.toHaveBeenCalled();
  });

  it("listRecovery returns empty array in non-Tauri env", async () => {
    const { listRecovery } = await import("./autoSave");
    const files = await listRecovery();
    expect(files).toEqual([]);
  });

  it("writeRecovery resolves without throwing in non-Tauri env", async () => {
    const { writeRecovery } = await import("./autoSave");
    const blob = new Blob(["test"], { type: "application/pdf" });
    await expect(writeRecovery("slot", blob)).resolves.not.toThrow();
  });

  it("deleteRecovery resolves without throwing in non-Tauri env", async () => {
    const { deleteRecovery } = await import("./autoSave");
    await expect(deleteRecovery("slot")).resolves.not.toThrow();
  });
});
