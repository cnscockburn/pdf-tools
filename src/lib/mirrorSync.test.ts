import { describe, it, expect, vi, beforeEach } from "vitest";
import { subscribe, publish, _clearAll } from "./mirrorSync";

beforeEach(() => {
  _clearAll();
});

describe("mirrorSync", () => {
  it("delivers published data to subscribers", () => {
    const listener = vi.fn();
    subscribe("g1", listener);
    publish("g1", "sender-a", { value: 42 });
    expect(listener).toHaveBeenCalledWith({ value: 42 }, "sender-a");
  });

  it("does not deliver to different group", () => {
    const listener = vi.fn();
    subscribe("g1", listener);
    publish("g2", "sender-a", { value: 42 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers to multiple listeners in the same group", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("g1", a);
    subscribe("g1", b);
    publish("g1", "sender-a", "hello");
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("passes senderId so listener can self-filter", () => {
    const listener = vi.fn();
    subscribe("g1", listener);
    publish("g1", "me", "data");
    expect(listener).toHaveBeenCalledWith("data", "me");
    // Listener receives its own sender ID — it can choose to ignore
  });

  it("unsubscribe removes the listener", () => {
    const listener = vi.fn();
    const unsub = subscribe("g1", listener);
    unsub();
    publish("g1", "sender-a", "data");
    expect(listener).not.toHaveBeenCalled();
  });

  it("cleans up empty channel after last unsubscribe", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribe("g1", a);
    const unsubB = subscribe("g1", b);
    unsubA();
    unsubB();
    // Publishing to a cleaned-up group should be a no-op
    publish("g1", "sender", "data");
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("handles publish to non-existent group gracefully", () => {
    // Should not throw
    expect(() => publish("nonexistent", "sender", "data")).not.toThrow();
  });

  it("supports multiple independent groups", () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    subscribe("group-a", listenerA);
    subscribe("group-b", listenerB);

    publish("group-a", "s1", "for-a");
    publish("group-b", "s2", "for-b");

    expect(listenerA).toHaveBeenCalledWith("for-a", "s1");
    expect(listenerA).not.toHaveBeenCalledWith("for-b", "s2");
    expect(listenerB).toHaveBeenCalledWith("for-b", "s2");
    expect(listenerB).not.toHaveBeenCalledWith("for-a", "s1");
  });

  // A2: page navigation events are published through the same channel
  it("delivers page-navigation events typed with { page }", () => {
    const listener = vi.fn();
    subscribe<{ page?: number; annotations?: unknown[]; baked?: unknown[] }>("nav-group", listener);
    publish("nav-group", "pane-1", { page: 5 });
    expect(listener).toHaveBeenCalledWith({ page: 5 }, "pane-1");
  });

  it("listener can distinguish annotation-only vs page-only events", () => {
    const received: Array<{ page?: number; annotations?: unknown[] }> = [];
    subscribe<{ page?: number; annotations?: unknown[] }>("g2", (data) => {
      received.push(data);
    });
    publish("g2", "s", { page: 3 });
    publish("g2", "s", { annotations: [], baked: [] });
    expect(received).toHaveLength(2);
    expect(received[0]).toHaveProperty("page", 3);
    expect(received[0]).not.toHaveProperty("annotations");
    expect(received[1]).toHaveProperty("annotations");
    expect(received[1]).not.toHaveProperty("page");
  });
});
