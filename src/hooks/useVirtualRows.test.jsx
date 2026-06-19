// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useVirtualRows } from "./useVirtualRows.js";

const press = (api, key) => act(() => api.listProps.onKeyDown({ key, preventDefault() {} }));

describe("useVirtualRows keyboard navigation", () => {
  it("exposes listbox + option roving-tabindex props", () => {
    const { result } = renderHook(() => useVirtualRows({ count: 100, est: 50 }));
    expect(result.current.listProps.role).toBe("listbox");
    // Nothing focused yet → the container is tabbable so Tab can reach the list.
    expect(result.current.listProps.tabIndex).toBe(0);
    const r0 = result.current.rowProps(0);
    expect(r0).toMatchObject({ role: "option", "aria-setsize": 100, "aria-posinset": 1, tabIndex: -1 });
  });

  it("ArrowDown moves the roving cursor and hands the tabstop to the active row", () => {
    const { result } = renderHook(() => useVirtualRows({ count: 100, est: 50 }));
    press(result.current, "ArrowDown");
    expect(result.current.activeIndex).toBe(0);
    expect(result.current.rowProps(0).tabIndex).toBe(0); // active row tabbable
    expect(result.current.rowProps(1).tabIndex).toBe(-1);
    expect(result.current.listProps.tabIndex).toBe(-1); // container yields once a row is active
    press(result.current, "ArrowDown");
    expect(result.current.activeIndex).toBe(1);
  });

  it("End jumps to the last row, Home back to the first — past the rendered window", () => {
    const { result } = renderHook(() => useVirtualRows({ count: 100, est: 50 }));
    press(result.current, "End");
    expect(result.current.activeIndex).toBe(99);
    press(result.current, "Home");
    expect(result.current.activeIndex).toBe(0);
  });

  it("clamps at the boundaries", () => {
    const { result } = renderHook(() => useVirtualRows({ count: 3, est: 50 }));
    press(result.current, "ArrowUp"); // from -1 → 0, never negative
    expect(result.current.activeIndex).toBe(0);
    press(result.current, "End");
    press(result.current, "ArrowDown"); // already last → stays
    expect(result.current.activeIndex).toBe(2);
  });
});
