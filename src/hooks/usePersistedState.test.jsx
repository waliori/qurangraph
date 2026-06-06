// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedState } from "./usePersistedState.js";

describe("usePersistedState", () => {
  beforeEach(() => localStorage.clear());

  it("uses the fallback when nothing is stored", () => {
    const { result } = renderHook(() => usePersistedState("k", 7));
    expect(result.current[0]).toBe(7);
  });

  it("reads a previously persisted value", () => {
    localStorage.setItem("k", JSON.stringify("hello"));
    const { result } = renderHook(() => usePersistedState("k", "x"));
    expect(result.current[0]).toBe("hello");
  });

  it("writes updates back to localStorage", () => {
    const { result } = renderHook(() => usePersistedState("k", 1));
    act(() => result.current[1](42));
    expect(JSON.parse(localStorage.getItem("k"))).toBe(42);
  });

  it("sanitizes an out-of-range stored value to the fallback", () => {
    localStorage.setItem("qg.surah", JSON.stringify(999));
    const sane = (v, f) => (Number.isInteger(v) && v >= 1 && v <= 114 ? v : f);
    const { result } = renderHook(() => usePersistedState("qg.surah", 2, sane));
    expect(result.current[0]).toBe(2);
  });

  it("falls back when the stored JSON is corrupt", () => {
    localStorage.setItem("k", "{not json");
    const { result } = renderHook(() => usePersistedState("k", "safe"));
    expect(result.current[0]).toBe("safe");
  });
});
