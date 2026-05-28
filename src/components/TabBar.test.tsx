import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TabBar from "./TabBar";
import type { Tab } from "../lib/tabs";

const tabs: Tab[] = [
  { id: "t1", type: "home", title: "Home" },
  { id: "t2", type: "viewer", title: "test.pdf" },
  { id: "t3", type: "merge", title: "Merge" },
];

function renderBar(overrides: Partial<Parameters<typeof TabBar>[0]> = {}) {
  const defaults = {
    tabs,
    activeTabId: "t1",
    onSwitch: vi.fn(),
    onClose: vi.fn(),
    onNewTab: vi.fn(),
    onOpenSettings: vi.fn(),
  };
  return { ...render(<TabBar {...defaults} {...overrides} />), ...defaults, ...overrides };
}

describe("TabBar", () => {
  it("renders all tab titles", () => {
    renderBar();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("test.pdf")).toBeInTheDocument();
    expect(screen.getByText("Merge")).toBeInTheDocument();
  });

  it("marks the active tab with aria-selected=true", () => {
    renderBar({ activeTabId: "t2" });
    const tabEls = screen.getAllByRole("tab");
    const activeTab = tabEls.find(t => t.getAttribute("aria-selected") === "true");
    expect(activeTab).toBeDefined();
    expect(activeTab!.textContent).toContain("test.pdf");
  });

  it("calls onSwitch when clicking a tab", () => {
    const { onSwitch } = renderBar();
    fireEvent.click(screen.getByText("Merge"));
    expect(onSwitch).toHaveBeenCalledWith("t3");
  });

  it("calls onClose when clicking a close button", () => {
    const { onClose } = renderBar({ activeTabId: "t2" });
    const closeBtn = screen.getByLabelText("Close test.pdf");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledWith("t2");
  });

  it("calls onNewTab when clicking the + button", () => {
    const { onNewTab } = renderBar();
    const newBtn = screen.getByLabelText("New tab");
    fireEvent.click(newBtn);
    expect(onNewTab).toHaveBeenCalledOnce();
  });

  it("renders close buttons as <button> elements for keyboard accessibility", () => {
    renderBar({ activeTabId: "t1" });
    const closeBtn = screen.getByLabelText("Close Home");
    expect(closeBtn.tagName).toBe("BUTTON");
  });

  it("shows cyan accent for sideBySideTabId", () => {
    const { container } = render(
      <TabBar
        tabs={tabs}
        activeTabId="t1"
        sideBySideTabId="t2"
        onSwitch={vi.fn()}
        onClose={vi.fn()}
        onNewTab={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );
    // The side-by-side tab should have a cyan bottom indicator
    const indicators = container.querySelectorAll(".bg-cyan-500");
    expect(indicators.length).toBeGreaterThan(0);
  });
});
