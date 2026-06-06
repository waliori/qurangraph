import { describe, it, expect } from "vitest";
import { buildSeedIndex, findSharedPhrases } from "./phrases.js";

// Toy "norm == orig" words; the matcher only reads w.norm + w.orig.
const w = (s) => ({ orig: s, norm: s });
const verse = (s, a, toks) => ({ s, a, sn: `س${s}`, words: toks.map(w) });

describe("findSharedPhrases", () => {
  it("finds a shared trigram and lists the other verses (center excluded, mushaf order)", () => {
    const vd = {
      "1:1": verse(1, 1, ["نور", "في", "السماء", "والارض"]),
      "3:3": verse(3, 3, ["قال", "نور", "في", "السماء", "يضيء"]),
      "2:2": verse(2, 2, ["نور", "في", "السماء"]),
    };
    const idx = buildSeedIndex(vd);
    const ph = findSharedPhrases("1:1", vd, idx);
    expect(ph).toHaveLength(1);
    expect(ph[0].norm).toBe("نور في السماء");
    expect(ph[0].len).toBe(3);
    expect(ph[0].verses).toEqual(["2:2", "3:3"]); // sorted, center omitted
  });

  it("reports only the maximal run, dropping its rolling suffix", () => {
    const vd = {
      "1:1": verse(1, 1, ["الحمد", "لله", "رب", "العالمين"]),
      "5:5": verse(5, 5, ["الحمد", "لله", "رب", "العالمين", "الرحمن"]),
    };
    const ph = findSharedPhrases("1:1", vd, buildSeedIndex(vd));
    expect(ph).toHaveLength(1); // not also the contained "لله رب العالمين"
    expect(ph[0].len).toBe(4);
    expect(ph[0].norm).toBe("الحمد لله رب العالمين");
  });

  it("ignores runs shorter than the seed length", () => {
    const vd = {
      "1:1": verse(1, 1, ["نور", "في", "الارض"]),
      "2:2": verse(2, 2, ["نور", "في", "الليل"]), // shares only the 2-gram "نور في"
    };
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))).toEqual([]);
  });

  it("does not match a phrase that only repeats inside the center verse", () => {
    const vd = { "1:1": verse(1, 1, ["سبحان", "ربي", "سبحان", "ربي", "العظيم"]) };
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))).toEqual([]);
  });

  it("ranks longer / more-widely-shared phrases first and keeps original spelling", () => {
    const vd = {
      "1:1": verse(1, 1, ["فبأي", "آلاء", "ربكما", "تكذبان", "ثم", "ويل", "يومئذ"]),
      "55:13": verse(55, 13, ["فبأي", "آلاء", "ربكما", "تكذبان"]),
      "55:16": verse(55, 16, ["فبأي", "آلاء", "ربكما", "تكذبان"]),
      "77:15": verse(77, 15, ["ويل", "يومئذ", "للمكذبين"]),
    };
    const ph = findSharedPhrases("1:1", vd, buildSeedIndex(vd));
    expect(ph[0].len).toBe(4); // the longer refrain first
    expect(ph[0].tokens).toEqual(["فبأي", "آلاء", "ربكما", "تكذبان"]);
    expect(ph[0].verses).toEqual(["55:13", "55:16"]);
  });

  it("returns nothing for a missing or too-short center verse", () => {
    const vd = { "1:1": verse(1, 1, ["ا", "ب"]) };
    expect(findSharedPhrases("9:9", vd, buildSeedIndex(vd))).toEqual([]);
    expect(findSharedPhrases("1:1", vd, buildSeedIndex(vd))).toEqual([]);
  });
});
