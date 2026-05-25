import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FileText } from "lucide-react";
import ToolCard from "./ToolCard";

// ToolCard uses useNavigate so it must be wrapped in MemoryRouter
function renderCard(to = "/merge") {
  return render(
    <MemoryRouter>
      <ToolCard
        icon={FileText}
        title="Merge PDFs"
        description="Combine multiple files"
        to={to}
        color="bg-brand-500"
      />
    </MemoryRouter>
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
