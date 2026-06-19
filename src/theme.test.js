import { describe, it, expect } from "vitest";
import { rarityWeight, eColor, eWidth, eDash, eDashArr } from "./theme.js";

describe("edge rarity encoding", () => {
  it("rarer connecting words carry more weight", () => {
    expect(rarityWeight(2)).toBeGreaterThan(rarityWeight(100));
  });
  it("width grows with rarity (a redundant, non-colour channel)", () => {
    expect(eWidth(rarityWeight(2))).toBeGreaterThan(eWidth(rarityWeight(100)));
  });
  it("colour differs between common and rare tiers", () => {
    expect(eColor(rarityWeight(2))).not.toBe(eColor(rarityWeight(100)));
  });
  it("dash texture: common bulk solid, high-signal tiers dashed", () => {
    expect(eDash(rarityWeight(150))).toBe(""); // very common → solid
    expect(eDash(rarityWeight(2))).not.toBe(""); // hapax-ish → dashed (colour-blind cue)
  });
  it("eDashArr returns the canvas number[] form", () => {
    expect(eDashArr(rarityWeight(150))).toEqual([]);
    expect(eDashArr(rarityWeight(2)).every((n) => typeof n === "number")).toBe(true);
  });
});
