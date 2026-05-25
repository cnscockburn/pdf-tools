import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProcessButton from "./ProcessButton";

describe("ProcessButton", () => {
  it("renders the label", () => {
    render(<ProcessButton onClick={() => {}} loading={false} label="Compress PDF" />);
    expect(screen.getByRole("button", { name: /compress pdf/i })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const fn = vi.fn();
    render(<ProcessButton onClick={fn} loading={false} label="Go" />);
    await userEvent.click(screen.getByRole("button"));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("is disabled while loading is true", () => {
    render(<ProcessButton onClick={() => {}} loading={true} label="Go" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when disabled prop is true", () => {
    render(<ProcessButton onClick={() => {}} loading={false} disabled={true} label="Go" />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is enabled when not loading and not disabled", () => {
    render(<ProcessButton onClick={() => {}} loading={false} disabled={false} label="Go" />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("does not fire onClick when loading", async () => {
    const fn = vi.fn();
    render(<ProcessButton onClick={fn} loading={true} label="Go" />);
    await userEvent.click(screen.getByRole("button"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("shows spinner icon while loading", () => {
    const { container } = render(<ProcessButton onClick={() => {}} loading={true} label="Loading" />);
    // lucide-react renders an SVG; check for one
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("hides spinner icon when not loading", () => {
    const { container } = render(<ProcessButton onClick={() => {}} loading={false} label="Done" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeNull();
  });

  it("applies reduced-opacity class when disabled", () => {
    render(<ProcessButton onClick={() => {}} loading={false} disabled={true} label="No" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/opacity-50/);
  });

  it("applies cursor-not-allowed class when loading", () => {
    render(<ProcessButton onClick={() => {}} loading={true} label="Wait" />);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/cursor-not-allowed/);
  });
});
