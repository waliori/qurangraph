import { describe, it, expect } from "vitest";
import { radicalKin } from "./kinship.js";

describe("radicalKin", () => {
  const roots = ["علم", "عمل", "لعم", "علن", "سلم", "قطع", "قطف", "كتب", "عق"];
  const countOf = (r) => ({ علم: 100, عمل: 80, لعم: 1, علن: 5, سلم: 30, قطع: 20, قطف: 2 }[r] || 0);

  it("finds anagrams (same radicals, different order) and ranks by frequency", () => {
    const { anagrams } = radicalKin("علم", roots, countOf);
    const found = anagrams.map((a) => a.root);
    expect(found).toContain("عمل");
    expect(found).toContain("لعم");
    expect(found).not.toContain("علم"); // not itself
    expect(anagrams[0].root).toBe("عمل"); // higher count first
  });

  it("finds roots sharing two radicals (not anagrams)", () => {
    const { shared } = radicalKin("علم", roots, countOf);
    const found = shared.map((s) => s.root);
    expect(found).toContain("علن"); // ع,ل shared
    expect(found).toContain("سلم"); // ل,م shared
    expect(found).not.toContain("عمل"); // an anagram, excluded from shared
    expect(found).not.toContain("كتب"); // nothing shared
    expect(shared.every((s) => s.common >= 2)).toBe(true);
  });

  it("handles short/empty roots gracefully", () => {
    expect(radicalKin("", roots, countOf)).toEqual({ anagrams: [], shared: [] });
    const { anagrams } = radicalKin("عق", roots, countOf);
    expect(Array.isArray(anagrams)).toBe(true);
  });
});
