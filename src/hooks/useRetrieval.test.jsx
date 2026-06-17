// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useRetrieval } from "./useRetrieval.js";

/* The verify-after-answer effect in AssistantPanel puts the useRetrieval result in its dep
 * array. If that object got a fresh identity every render, the effect re-ran every render —
 * and once a non-null verifyResult re-rendered the panel, it looped forever at 100% CPU
 * (frozen UI). The fix memoizes the return; this guards that it stays referentially stable. */
describe("useRetrieval", () => {
  it("returns a referentially stable object across re-renders", () => {
    const { result, rerender } = renderHook(() => useRetrieval());
    const first = result.current;
    expect(typeof first.run).toBe("function");
    expect(typeof first.verify).toBe("function");
    rerender();
    expect(result.current).toBe(first);
    rerender();
    expect(result.current).toBe(first);
    // the stable callbacks too
    expect(result.current.run).toBe(first.run);
    expect(result.current.verify).toBe(first.verify);
  });
});
