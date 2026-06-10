import { describe, it, expect } from "vitest";
import { derivationFamily } from "./derivation.js";

/* Minimal morphology object matching the columnar decode format (legend dicts +
 * lemmas/roots arrays + v: vk → [tuple…]). Tuple fields:
 * [pos, vf, aspect, voice, mood, person, gender, number, gcase, lemma, root, precise] */
const M = {
  legend: {
    pos: ["", "verb", "noun", "actpcpl"], aspect: ["", "perf", "impf"], voice: ["", "act"],
    mood: [""], gender: [""], number: [""], gcase: [""],
    fields: ["pos", "vf", "aspect", "voice", "mood", "person", "gender", "number", "gcase", "lemma", "root", "precise"],
  },
  lemmas: ["", "عَلِمَ", "عِلْم", "عَالِم"],
  roots: ["", "علم"],
  v: {
    "1:1": [
      [1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1], // عَلِمَ — verb, Form I, perfect, active
      [2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 1], // عِلْم — noun (maṣdar)
    ],
    "2:1": [
      [3, 1, 0, 0, 0, 0, 0, 0, 0, 3, 1, 1], // عَالِم — active participle
      [1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1], // عَلِمَ again (second occurrence)
    ],
  },
};
const verseData = {
  "1:1": { s: 1, a: 1, words: [
    { orig: "عَلِمَ", norm: "علم", proot: "علم", plemma: "علم" },
    { orig: "عِلْمٌ", norm: "علم", proot: "علم", plemma: "علم" },
  ] },
  "2:1": { s: 2, a: 1, words: [
    { orig: "عَالِمٌ", norm: "عالم", proot: "علم", plemma: "علم" },
    { orig: "عَلِمُوا", norm: "علموا", proot: "علم", plemma: "علم" },
  ] },
};
const r2v = { علم: ["1:1", "2:1"] };

describe("derivationFamily", () => {
  it("splits a root into distinct derived lemmas with morphology + counts", () => {
    const fam = derivationFamily("علم", r2v, verseData, M);
    const byLemma = Object.fromEntries(fam.map((f) => [f.lemma, f]));
    expect(Object.keys(byLemma).sort()).toEqual(["عَالِم", "عَلِمَ", "عِلْم"].sort());
    expect(byLemma["عَلِمَ"].count).toBe(2); // two occurrences (1:1, 2:1)
    expect(byLemma["عَلِمَ"].verses).toEqual(["1:1", "2:1"]);
    expect(byLemma["عِلْم"].pos).toBe("noun");
    expect(byLemma["عَالِم"].pos).toBe("actpcpl");
  });

  it("orders verbs (by Form) before participles before nominals", () => {
    const fam = derivationFamily("علم", r2v, verseData, M);
    expect(fam.map((f) => f.pos)).toEqual(["verb", "actpcpl", "noun"]);
  });

  it("collects distinct surface examples per derivative", () => {
    const fam = derivationFamily("علم", r2v, verseData, M);
    const verb = fam.find((f) => f.lemma === "عَلِمَ");
    expect(verb.examples).toContain("عَلِمَ");
    expect(verb.examples).toContain("عَلِمُوا");
  });

  it("falls back to lemma/skeleton grouping without morphology", () => {
    const fam = derivationFamily("علم", r2v, verseData, null);
    expect(fam.length).toBeGreaterThan(0);
    expect(fam.reduce((s, f) => s + f.count, 0)).toBe(4); // all four occurrences counted
  });
});
