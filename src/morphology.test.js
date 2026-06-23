import { describe, it, expect } from "vitest";
import { decodeMorph, morphAt, verseGroupingKeys, passesMorphFilter, morphFilterSummary, filterOccurrencesByMorph } from "./morphology.js";
import { wordGroupKey } from "./arabic-utils.js";

// A tiny columnar morphology object. Tuple field order (see decodeMorph):
// [pos, vf, aspect, voice, mood, person, gender, number, gcase, lemma, root, precise]
const M = {
  legend: { pos: ["verb"], aspect: ["", "perf", "impf"], voice: ["", "act", "pass"], mood: [""], gender: [""], number: [""], gcase: [""] },
  lemmas: ["قال"],
  roots: ["قول"],
  v: {
    "1:1": [[0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1]], // قال — verb, Form I, perfect, active
    "2:2": [[0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1]], // يقول — verb, Form I, imperfect, active
  },
};
const verseData = {
  "1:1": { s: 1, sn: "س1", a: 1, words: [{ orig: "قال", norm: "قال", proot: "قول" }] },
  "2:2": { s: 2, sn: "س2", a: 2, words: [{ orig: "يقول", norm: "يقول", proot: "قول" }] },
};

describe("decodeMorph / morphAt", () => {
  it("decodes a tuple via the legend", () => {
    const m = decodeMorph(M.v["1:1"][0], M);
    expect(m).toMatchObject({ pos: "verb", vf: 1, aspect: "perf", voice: "act", root: "قول", lemma: "قال", precise: true });
  });
  it("morphAt resolves by position", () => {
    expect(morphAt(M, "2:2", 0).aspect).toBe("impf");
    expect(morphAt(M, "9:9", 0)).toBeNull();
  });
  it("verseGroupingKeys aligns to words", () => {
    expect(verseGroupingKeys(M, "1:1", (s) => s)).toEqual([{ proot: "قول", plemma: "قال" }]);
  });
});

describe("morphFilterSummary", () => {
  it("renders an Arabic summary of the active constraints", () => {
    expect(morphFilterSummary({ pos: ["verb"], form: [], aspect: ["perf"], voice: ["pass"] })).toBe("فعل · ماضٍ · مجهول");
    expect(morphFilterSummary({ pos: [], form: [2], aspect: [], voice: [] })).toBe("الصيغة II");
    expect(morphFilterSummary({ pos: [], form: [], aspect: [], voice: [] })).toBe("");
  });
});

describe("filterOccurrencesByMorph", () => {
  const keys = ["1:1", "2:2"];
  it("keeps only occurrences whose reading matches the filter", () => {
    const perf = { pos: [], form: [], aspect: ["perf"], voice: [] };
    expect(filterOccurrencesByMorph(keys, "قول", "root", verseData, M, perf, wordGroupKey)).toEqual(["1:1"]);
    const impf = { pos: [], form: [], aspect: ["impf"], voice: [] };
    expect(filterOccurrencesByMorph(keys, "قول", "root", verseData, M, impf, wordGroupKey)).toEqual(["2:2"]);
  });
  it("returns an empty list when nothing matches", () => {
    const form4 = { pos: [], form: [4], aspect: [], voice: [] };
    expect(filterOccurrencesByMorph(keys, "قول", "root", verseData, M, form4, wordGroupKey)).toEqual([]);
  });
  it("is a no-op when the filter is inactive or morphology is absent", () => {
    const none = { pos: [], form: [], aspect: [], voice: [] };
    expect(filterOccurrencesByMorph(keys, "قول", "root", verseData, M, none, wordGroupKey)).toBe(keys);
    const perf = { pos: [], form: [], aspect: ["perf"], voice: [] };
    expect(filterOccurrencesByMorph(keys, "قول", "root", verseData, null, perf, wordGroupKey)).toBe(keys);
  });
});

describe("passesMorphFilter sanity", () => {
  it("a word with no morphology fails an active filter", () => {
    expect(passesMorphFilter(null, { pos: ["verb"], form: [], aspect: [], voice: [] })).toBe(false);
    expect(passesMorphFilter(null, { pos: [], form: [], aspect: [], voice: [] })).toBe(true);
  });
  it("constrains on the advanced axes (person / number / mood / case)", () => {
    const m = { pos: "verb", vf: 4, aspect: "impf", voice: "act", person: 2, number: "p", mood: "jus", gcase: null };
    expect(passesMorphFilter(m, { person: [2] })).toBe(true);
    expect(passesMorphFilter(m, { person: [3] })).toBe(false);
    expect(passesMorphFilter(m, { number: ["p"], mood: ["jus"] })).toBe(true);
    expect(passesMorphFilter(m, { number: ["s"] })).toBe(false);
    const noun = { pos: "noun", gcase: "gen", number: "s" };
    expect(passesMorphFilter(noun, { gcase: ["gen"] })).toBe(true);
    expect(passesMorphFilter(noun, { gcase: ["nom"] })).toBe(false);
  });
});

describe("morphFilterSummary advanced axes", () => {
  it("renders person / number / mood / case in the summary", () => {
    expect(morphFilterSummary({ person: [2], number: ["p"] })).toBe("مخاطب · جمع");
    expect(morphFilterSummary({ mood: ["jus"] })).toBe("مجزوم");
    expect(morphFilterSummary({ gcase: ["gen"] })).toBe("مجرور");
  });
});
