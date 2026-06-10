import { describe, it, expect } from "vitest";
import { buildSeedIndex, findSharedPhrases } from "./phrases.js";

// Toy "norm == orig" words; the matcher only reads w.norm + w.orig.
const w = (s) => ({ orig: s, norm: s });
const verse = (s, a, toks) => ({ s, a, sn: `س${s}`, words: toks.map(w) });

describe("findSharedPhrases", () => {
  it("finds a shared run and lists the other verses (center excluded, mushaf order)", () => {
    const vd = {
      "1:1": verse(1, 1, ["نور", "في", "السماء", "والارض"]),
      "3:3": verse(3, 3, ["قال", "نور", "في", "السماء", "يضيء"]),
      "2:2": verse(2, 2, ["نور", "في", "السماء"]),
    };
    const ph = findSharedPhrases("1:1", vd, buildSeedIndex(vd));
    expect(ph[0].norm).toBe("نور في السماء");
    expect(ph[0].len).toBe(3);
    expect(ph[0].verses).toEqual(["2:2", "3:3"]); // sorted, center omitted
    // The contained sub-runs ("نور في", "في السماء") are pruned — same verse set, shorter.
    expect(ph).toHaveLength(1);
  });

  it("reports the maximal run and prunes sub-runs with no wider resonance", () => {
    const vd = {
      "1:1": verse(1, 1, ["الحمد", "لله", "رب", "العالمين"]),
      "5:5": verse(5, 5, ["الحمد", "لله", "رب", "العالمين", "الرحمن"]),
    };
    const ph = findSharedPhrases("1:1", vd, buildSeedIndex(vd));
    expect(ph).toHaveLength(1); // not also the contained "لله رب العالمين"
    expect(ph[0].len).toBe(4);
  });

  it("finds 2-word runs by default; minLen raises the floor", () => {
    const vd = {
      "1:1": verse(1, 1, ["نور", "في", "الارض"]),
      "2:2": verse(2, 2, ["نور", "في", "الليل"]), // shares only the 2-gram "نور في"
    };
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))[0].norm).toBe("نور في");
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd), { minLen: 3 })).toEqual([]);
  });

  it("surfaces a widely-shared sub-phrase nested in a rarer longer phrase", () => {
    const vd = {
      "1:1": verse(1, 1, ["الف", "صبر", "جميل", "دال"]),
      "2:2": verse(2, 2, ["الف", "صبر", "جميل", "دال"]),        // shares the full 4-run
      "3:3": verse(3, 3, ["واو", "صبر", "جميل", "نون"]),        // shares only "صبر جميل"
      "4:4": verse(4, 4, ["هاء", "صبر", "جميل", "ميم"]),        // shares only "صبر جميل"
    };
    const ph = findSharedPhrases("1:1", vd, buildSeedIndex(vd));
    const byNorm = Object.fromEntries(ph.map((p) => [p.norm, p]));
    expect(byNorm["الف صبر جميل دال"].verses).toEqual(["2:2"]);
    // "صبر جميل" is shared by 3 verses → kept despite sitting inside the 4-run (1 verse).
    expect(byNorm["صبر جميل"].verses).toEqual(["2:2", "3:3", "4:4"]);
  });

  it("de-duplicates a run that recurs at multiple start positions in the center", () => {
    const vd = {
      "1:1": verse(1, 1, ["رب", "العالمين", "ثم", "رب", "العالمين"]),
      "2:2": verse(2, 2, ["قال", "رب", "العالمين"]),
    };
    const ph = findSharedPhrases("1:1", vd, buildSeedIndex(vd));
    expect(ph.filter((p) => p.norm === "رب العالمين")).toHaveLength(1);
  });

  it("ignoreParticles matches verses differing only by a حرف", () => {
    const vd = {
      "1:1": verse(1, 1, ["نعمة", "ربكما", "تكذبان"]),
      "2:2": verse(2, 2, ["نعمة", "فلا", "ربكما", "تكذبان"]), // فلا is a particle
    };
    // Exact matching only recovers the fragment after the inserted particle.
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))[0].norm).toBe("ربكما تكذبان");
    // Ignoring particles recovers the full shared content run across the inserted فلا.
    const idxP = buildSeedIndex(vd, { ignoreParticles: true });
    const ph = findSharedPhrases("1:1", vd, idxP, { ignoreParticles: true });
    expect(ph[0].norm).toBe("نعمة ربكما تكذبان");
    expect(ph[0].verses).toEqual(["2:2"]);
  });

  it("does not match a phrase that only repeats inside the center verse", () => {
    const vd = { "1:1": verse(1, 1, ["سبحان", "ربي", "سبحان", "ربي", "العظيم"]) };
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))).toEqual([]);
  });

  it("returns nothing for a missing or too-short center verse", () => {
    const vd = { "1:1": verse(1, 1, ["ا"]) };
    expect(findSharedPhrases("9:9", vd, buildSeedIndex(vd))).toEqual([]);
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))).toEqual([]);
  });
});
