import { describe, it, expect } from "vitest";
import { muqattaatOf, surahLetterProfile } from "./letters.js";

const w = (s) => ({ orig: s, norm: s });
const verse = (s, a, toks) => ({ s, a, words: toks.map(w) });

describe("muqattaatOf", () => {
  it("returns the distinct opening letters of a disjoined-letter sūra", () => {
    expect(muqattaatOf(2)).toEqual(["ا", "ل", "م"]);   // الٓمٓ
    expect(muqattaatOf(50)).toEqual(["ق"]);            // قٓ
    expect(muqattaatOf(42)).toEqual(["ح", "م", "ع", "س", "ق"]); // حمٓ عٓسٓقٓ
  });
  it("returns null for a non-muqaṭṭaʿāt sūra", () => {
    expect(muqattaatOf(1)).toBeNull();
  });
});

describe("surahLetterProfile", () => {
  // Sūra 50 (قٓ): ق deliberately frequent here, rare elsewhere → ratio > 1.
  const verseData = {
    "50:1": verse(50, 1, ["قاف", "قول", "قريب"]),  // many ق
    "50:2": verse(50, 2, ["قال", "قوم"]),
    "1:1": verse(1, 1, ["نور", "ضوء"]),             // sūra 1 — not a muqaṭṭaʿāt opening; no ق
    "1:2": verse(1, 2, ["حمد", "علم"]),
  };
  it("flags the opening and quantifies over-representation", () => {
    const p = surahLetterProfile(50, verseData);
    expect(p.isMuqattaat).toBe(true);
    expect(p.opening).toEqual(["ق"]);
    const q = p.muqattaat.find((m) => m.letter === "ق");
    expect(q.count).toBeGreaterThan(0);
    expect(q.ratio).toBeGreaterThan(1); // ق far over-represented in its own sūra
  });
  it("reports no muqaṭṭaʿāt for an ordinary sūra but still gives top letters", () => {
    const p = surahLetterProfile(1, verseData);
    expect(p.isMuqattaat).toBe(false);
    expect(p.opening).toBeNull();
    expect(p.top.length).toBeGreaterThan(0);
  });
});
