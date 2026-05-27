import { describe, it, expect } from "vitest";
import { newTabId, defaultTabTitle, type TabType } from "./tabs";

describe("tabs", () => {
  describe("newTabId", () => {
    it("returns a string starting with 'tab_'", () => {
      const id = newTabId();
      expect(id).toMatch(/^tab_\d+_[a-z0-9]+$/);
    });

    it("returns unique IDs on successive calls", () => {
      const ids = new Set(Array.from({ length: 100 }, () => newTabId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("defaultTabTitle", () => {
    const cases: [TabType, string][] = [
      ["home", "Home"],
      ["viewer", "Viewer"],
      ["merge", "Merge"],
      ["rearrange", "Rearrange"],
      ["images-to-pdf", "Images to PDF"],
    ];

    it.each(cases)("returns %j for type %j", (type, expected) => {
      expect(defaultTabTitle(type)).toBe(expected);
    });
  });
});
