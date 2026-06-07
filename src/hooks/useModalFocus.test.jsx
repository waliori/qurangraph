// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useRef } from "react";
import { useModalFocus } from "./useModalFocus.js";

afterEach(cleanup);

// A minimal dialog wired to the hook, plus an outside button to test restoration.
function Harness({ open, onEscape }) {
  const ref = useRef(null);
  useModalFocus(open, ref, { onEscape });
  return (
    <div>
      <button data-testid="trigger">open</button>
      {open && (
        <div data-testid="dialog" ref={ref} tabIndex={-1}>
          <button data-testid="first">first</button>
          <button data-testid="last">last</button>
        </div>
      )}
    </div>
  );
}

describe("useModalFocus", () => {
  it("moves focus into the dialog when it opens", () => {
    const { getByTestId, rerender } = render(<Harness open={false} />);
    getByTestId("trigger").focus();
    rerender(<Harness open={true} />);
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("restores focus to the opener when it closes", () => {
    const { getByTestId, rerender } = render(<Harness open={false} />);
    const trigger = getByTestId("trigger");
    trigger.focus();
    rerender(<Harness open={true} />);
    rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(trigger);
  });

  it("calls onEscape on the Escape key", () => {
    const onEscape = vi.fn();
    render(<Harness open={true} onEscape={onEscape} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last element back to the first", () => {
    const { getByTestId } = render(<Harness open={true} />);
    const last = getByTestId("last");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    const { getByTestId } = render(<Harness open={true} />);
    getByTestId("first").focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByTestId("last"));
  });
});
