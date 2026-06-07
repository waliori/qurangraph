// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMemo, useState } from "react";
import { useExplorationHistory } from "./useExplorationHistory.js";

// Drive the hook from a tiny stateful host so a recorded step actually changes the
// tracked inputs (the record effect runs on those changes), and apply() restores them.
// The Sets are memoised on their backing arrays so their identity is stable across
// renders — mirroring the app's useState Sets; fresh Sets each render would retrigger
// the record effect forever.
function useHost() {
  const [s, setS] = useState({ surah: 2, ayah: 1, ew: [], ev: [], selected: null });
  const expandedWords = useMemo(() => new Set(s.ew), [s.ew]);
  const expandedVerses = useMemo(() => new Set(s.ev), [s.ev]);
  const apply = (snap) => setS({ surah: snap.surah, ayah: snap.ayah, ew: snap.ew, ev: snap.ev, selected: snap.selected });
  const h = useExplorationHistory({
    hydrated: true, surah: s.surah, ayah: s.ayah,
    expandedWords, expandedVerses, selected: s.selected, apply,
  });
  return { s, setS, ...h };
}

describe("useExplorationHistory", () => {
  it("starts with nothing to undo or redo", () => {
    const { result } = renderHook(() => useHost());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("records changes and undo/redo walks them", () => {
    const { result } = renderHook(() => useHost());
    // Two exploration steps.
    act(() => result.current.setS((p) => ({ ...p, selected: "w:a" })));
    act(() => result.current.setS((p) => ({ ...p, selected: "w:b" })));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.s.selected).toBe("w:b");

    act(() => result.current.undo());
    expect(result.current.s.selected).toBe("w:a");
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.s.selected).toBe("w:b");
  });

  it("does not record the programmatic restore as a new step", () => {
    const { result } = renderHook(() => useHost());
    act(() => result.current.setS((p) => ({ ...p, ayah: 2 })));
    act(() => result.current.setS((p) => ({ ...p, ayah: 3 })));
    act(() => result.current.undo()); // back to ayah 2
    expect(result.current.s.ayah).toBe(2);
    // After undo, a redo must still be available (the undo didn't clear it by
    // recording itself as a fresh change).
    expect(result.current.canRedo).toBe(true);
  });
});
