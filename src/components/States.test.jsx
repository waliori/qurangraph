// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);
import { EmptyState, LoadingState, ErrorState } from "./States.jsx";
import { DisclosurePanel } from "./DisclosurePanel.jsx";
import { SigStars, fmtMetric } from "./Significance.jsx";

describe("States", () => {
  it("EmptyState / LoadingState render their default messages", () => {
    const { rerender } = render(<EmptyState />);
    expect(screen.getByRole("status")).toBeTruthy();
    rerender(<LoadingState message="…" />);
    expect(screen.getByText("…")).toBeTruthy();
  });
  it("ErrorState shows a retry button that fires onRetry", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="boom" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByText(/إعادة|Retry/));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it("ErrorState omits the button when no onRetry is given", () => {
    render(<ErrorState message="boom" />);
    expect(screen.queryByText(/إعادة|Retry/)).toBeNull();
  });
});

describe("DisclosurePanel", () => {
  it("toggles its body open and closed", () => {
    render(<DisclosurePanel label="Method"><p>secret</p></DisclosurePanel>);
    expect(screen.queryByText("secret")).toBeNull();
    const btn = screen.getByRole("button", { name: /Method/ });
    fireEvent.click(btn);
    expect(screen.getByText("secret")).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(screen.queryByText("secret")).toBeNull();
  });
  it("respects defaultOpen", () => {
    render(<DisclosurePanel label="M" defaultOpen><p>shown</p></DisclosurePanel>);
    expect(screen.getByText("shown")).toBeTruthy();
  });
});

describe("Significance", () => {
  it("fmtMetric formats compactly", () => {
    expect(fmtMetric(null)).toBe("");
    expect(fmtMetric(3.14159)).toBe("3.1");
    expect(fmtMetric(250)).toBe("250");
  });
  it("SigStars renders one star per tier and nothing at tier 0", () => {
    const { container, rerender } = render(<SigStars sig={3} />);
    expect(container.textContent).toBe("★★★");
    rerender(<SigStars sig={0} />);
    expect(container.textContent).toBe("");
  });
});
