import { describe, it, expect } from "vitest";
import { encodeState, decodeState } from "./useUrlState.js";

describe("URL state round-trip", () => {
  it("decode(encode(state)) preserves all fields (incl. sets & morph filter)", () => {
    const state = {
      surah: 2, ayah: 228, mode: "lemma", precision: "strict", theme: "light", maxBranch: 25,
      hideStop: false, showLoops: false, rareOnly: true,
      // Sets, as the app actually passes them (regression: Set has no .length)
      expandedWords: new Set(["غفر@2:228", "كتب@2:228"]), expandedVerses: new Set(["3:7"]),
      selected: "w:غفر@2:228", transform: { x: -12.3, y: 44.6, k: 1.25 },
      morphFilter: { pos: ["verb"], form: [4], aspect: ["impf"], voice: [] },
      stopExtra: ["زيد"], stopDisabled: ["الله"],
    };
    const back = decodeState(encodeState(state));
    expect(back.surah).toBe(2);
    expect(back.ayah).toBe(228);
    expect(back.mode).toBe("lemma");
    expect(back.precision).toBe("strict");
    expect(back.theme).toBe("light");
    expect(back.maxBranch).toBe(25);
    expect(back.hideStop).toBe(false);
    expect(back.showLoops).toBe(false);
    expect(back.rareOnly).toBe(true);
    expect(back.expandedWords.sort()).toEqual(["كتب@2:228", "غفر@2:228"].sort());
    expect(back.expandedVerses).toEqual(["3:7"]);
    expect(back.selected).toBe("w:غفر@2:228");
    expect(back.transform).toEqual({ x: -12, y: 45, k: 1.25 }); // x/y rounded to int, k to 3dp for short URLs
    expect(back.morphFilter).toEqual({ pos: ["verb"], form: [4], aspect: ["impf"], voice: [] });
    expect(back.stopExtra).toEqual(["زيد"]);
    expect(back.stopDisabled).toEqual(["الله"]);
  });

  it("defaults a fresh state to a short payload and decodes back to defaults", () => {
    const enc = encodeState({ surah: 2, ayah: 1, mode: "exact", precision: "loose", theme: "dark", maxBranch: 10, hideStop: true, showLoops: true, rareOnly: false });
    const back = decodeState(enc);
    expect(back.mode).toBe("exact");
    expect(back.hideStop).toBe(true);
    expect(back.rareOnly).toBe(false);
    expect(back.expandedWords).toEqual([]);
  });

  it("returns null on garbage", () => {
    expect(decodeState("")).toBe(null);
    expect(decodeState("#s=not%20json")).toBe(null);
  });
});
