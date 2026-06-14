import { describe, it, expect, beforeAll } from "vitest";
import { surahProfile, surahKeyness, surahCohesion, surahSelfSimilarity, surahBonds } from "./surah.js";
import { buildSeedIndex } from "./phrases.js";
import { setRootMap } from "../arabic-utils.js";

beforeAll(() => setRootMap({ قرطاس: "قرطس", نور: "نور", ضوء: "ضوأ", خير: "خير", ابقى: "بقي", الله: "أله" }));

const w = (s) => ({ orig: s, norm: s, exact: s });
const verse = (s, a, toks) => ({ s, a, sn: `س${s}`, text: toks.join(" "), words: toks.map(w) });
const verseData = {
  "1:1": verse(1, 1, ["قرطاس", "نور"]),
  "1:2": verse(1, 2, ["نور", "ضوء"]),
  "1:3": verse(1, 3, ["خير", "ابقى"]),
  "1:5": verse(1, 5, ["قرطاس", "ضوء"]),
  "1:7": verse(1, 7, ["خير", "ابقى"]),
  "2:1": verse(2, 1, ["الله", "ضوء"]),
};
const w2v = { قرطاس: ["1:1", "1:5"], نور: ["1:1", "1:2"], ضوء: ["1:2", "1:5", "2:1"], خير: ["1:3", "1:7"], ابقى: ["1:3", "1:7"], الله: ["2:1"] };
const r2v = { قرطس: ["1:1", "1:5"], نور: ["1:1", "1:2"], ضوأ: ["1:2", "1:5", "2:1"], خير: ["1:3", "1:7"], بقي: ["1:3", "1:7"], أله: ["2:1"] };

describe("surahProfile", () => {
  it("counts verses and detects refrains (verses repeated within the sūra)", () => {
    const p = surahProfile(1, verseData);
    expect(p.verseCount).toBe(5);
    expect(p.refrains.map((r) => r.text)).toContain("خير ابقى"); // 1:3 == 1:7
  });
});

describe("surahKeyness", () => {
  it("surfaces sūra-distinctive roots and drops ones over-represented elsewhere", () => {
    const key = surahKeyness(1, verseData, r2v);
    const roots = key.map((k) => k.root);
    expect(roots).toContain("خير"); // only in this sūra → over-represented
    expect(roots).not.toContain("ضوأ"); // also occurs in sūra 2 → not distinctive
  });
  it("scopes keyness to a comparison population (same revelation class)", () => {
    // قرطس fills sūra 1 (2 verses) AND sūra 2; corpus-wide it occurs in 4 verses, but among
    // the "Meccan" population {1:1,1:2,7:1} only the 2 sūra-1 verses count → far more distinctive there.
    const vd = {
      "1:1": verse(1, 1, ["قرطاس", "خير"]), "1:2": verse(1, 2, ["قرطاس", "نور"]),
      "2:1": verse(2, 1, ["قرطاس", "ضوء"]), "2:2": verse(2, 2, ["قرطاس", "ابقى"]),
      "7:1": verse(7, 1, ["نور", "ضوء"]),
    };
    const r2vL = { قرطس: ["1:1", "1:2", "2:1", "2:2"], خير: ["1:1"], نور: ["1:2", "7:1"], ضوأ: ["2:1", "7:1"], بقي: ["2:2"] };
    const all = surahKeyness(1, vd, r2vL).find((k) => k.root === "قرطس");
    const cls = surahKeyness(1, vd, r2vL, { population: new Set(["1:1", "1:2", "7:1"]) }).find((k) => k.root === "قرطس");
    expect(all.total).toBe(4);                          // corpus-wide verse count
    expect(cls.total).toBe(2);                          // counted only within the Meccan population
    expect(cls.keyness).toBeGreaterThan(all.keyness);   // more distinctive among its own class
  });
});

describe("surahCohesion", () => {
  it("scores adjacent-verse overlap, marking topic-shift dips", () => {
    const { seq } = surahCohesion(1, verseData, r2v);
    expect(seq).toHaveLength(4); // 5 verses → 4 adjacent pairs
    expect(seq[0].score).toBeGreaterThan(0); // 1:1↔1:2 share نور
    expect(seq[1].score).toBe(0); // 1:2↔1:3 share nothing → boundary
  });
  it("idf-weights overlap so a rarer shared root scores higher than a common one", () => {
    // قرطس occurs in 2 verses, ضوأ in 3 → sharing قرطس should weigh more than sharing ضوأ.
    // Adjacent pairs: 9:1↔9:2 share قرطس (df 2, rare); 9:2↔9:3 share ضوأ (df 3, ubiquitous here).
    const vd = { "9:1": verse(9, 1, ["قرطاس", "خير"]), "9:2": verse(9, 2, ["قرطاس", "ضوء"]), "9:3": verse(9, 3, ["ضوء", "نور"]) };
    const { seq } = surahCohesion(9, vd, r2v);
    const rare = seq.find((s) => s.shared.includes("قرطس"));
    const common = seq.find((s) => s.shared.includes("ضوأ"));
    expect(rare.score).toBeGreaterThan(common.score);
  });
});

describe("surahSelfSimilarity", () => {
  it("builds the matrix and ranks off-diagonal echoes", () => {
    const sim = surahSelfSimilarity(1, verseData, r2v);
    expect(sim.size).toBe(5);
    expect(sim.matrix.length).toBe(5);
    expect(sim.echoes[0].score).toBeCloseTo(1, 5); // 1:3 & 1:7 are identical
    expect([sim.echoes[0].ai, sim.echoes[0].aj].sort()).toEqual([3, 7]);
  });
});

describe("surahBonds", () => {
  const seed = buildSeedIndex(verseData);
  it("finds rare words recurring at distant points within the sūra", () => {
    const { wordBonds } = surahBonds(1, verseData, w2v, seed, null);
    const keys = wordBonds.map((b) => b.key);
    expect(keys).toContain("قرطاس"); // global 2, ayat 1 & 5
    expect(keys).not.toContain("نور"); // ayat 1 & 2 are adjacent (span < 2)
    const q = wordBonds.find((b) => b.key === "قرطاس");
    expect(q.global).toBe(2);
    expect(q.ayat).toEqual([1, 5]);
  });
  it("finds rare verbatim phrases recurring within the sūra", () => {
    const { phraseBonds } = surahBonds(1, verseData, w2v, seed, null);
    expect(phraseBonds[0].norm).toBe("خير ابقى");
    expect(phraseBonds[0].ayat).toEqual([3, 7]);
  });
});
