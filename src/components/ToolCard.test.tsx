import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import ToolCard from "./ToolCard";
import { TabContext, type TabContextValue } from "../lib/tabs";

// ToolCard uses useTabContext so it must be wrapped in TabContext.Provider
const mockCtx: TabContextValue = {
  tabs: [],
  activeTabId: "",
  openTab: vi.fn(() => "mock-id"),
  closeTab: vi.fn(),
  switchTab: vi.fn(),
  updateTabTitle: vi.fn(),
};

function renderCard(to: "merge" | "viewer" = "merge") {
  return render(
    <TabContext.Provider value={mockCtx}>
      <ToolCard
        icon={FileText}
        title="Merge PDFs"
        description="Combine multiple files"
        to={to}
        color="bg-brand-500"
      />
    </TabContext.Provider>
  );
}

describe("ToolCard", () => {
  it("renders the title", () => {
    renderCard();
    expect(screen.getByText("Merge PDFs")).toBeInTheDocument();
  });

  it("renders the description", () => {
    renderCard();
    expect(screen.getByText("Combine multiple files")).toBeInTheDocument();
  });

  it("renders as a button element", () => {
    renderCard();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders the icon as an SVG", () => {
    const { container } = renderCard();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("applies the color prop to the icon container", () => {
    const { container } = renderCard();
    const iconBox = container.querySelector(".bg-brand-500");
    expect(iconBox).toBeTruthy();
  });

  it("is keyboard focusable", () => {
    renderCard();
    const btn = screen.getByRole("button");
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});
