import { describe, it, expect } from "vitest";
import { relationsOf, oppositesOf, candidatesOf, verseAntithesis, oppositesCatalogue, candidatesCatalogue } from "./relations.js";

const data = {
  byRoot: {
    صدق: [
      { other: "كذب", otherEn: "lying", polarity: "opposite", cat: "belief", relatedness: 0.14, contrast: 1, framed: true, verses: ["75:31", "75:32"] },
      { other: "كثر", polarity: "candidate", relatedness: 0.1, contrast: 1, framed: true, verses: ["10:1"] },
    ],
    كذب: [{ other: "صدق", otherEn: "truthfulness", polarity: "opposite", cat: "belief", relatedness: 0.14, contrast: 1, framed: true, verses: ["75:31", "75:32"] }],
  },
  catalogue: [
    { a: "حيي", b: "موت", gloss: "life ↔ death", relatedness: 0.2, contrast: 2, framed: true, verses: ["2:154", "3:169"] },
    { a: "صدق", b: "كذب", gloss: "truthfulness ↔ lying", relatedness: 0.14, contrast: 1, framed: true, verses: ["75:31", "75:32"] },
    { a: "نور", b: "ظلم", gloss: "light ↔ darkness", relatedness: 0.3, contrast: 0, framed: false, verses: ["2:257"] },
  ],
  candidates: [{ a: "حقق", b: "كثر", relatedness: 0.1, contrast: 2, verses: ["10:55"] }],
};

describe("relationsOf / oppositesOf / candidatesOf", () => {
  it("splits a root's relations into curated opposites and candidates", () => {
    expect(oppositesOf("صدق", data).map((r) => r.other)).toEqual(["كذب"]);
    expect(candidatesOf("صدق", data).map((r) => r.other)).toEqual(["كثر"]);
    expect(relationsOf("missing", data)).toEqual([]);
    expect(relationsOf("صدق", null)).toEqual([]);
  });
});

describe("verseAntithesis", () => {
  it("returns only FRAMED curated pairs whose construction falls at the verse", () => {
    expect(verseAntithesis("75:32", data).map((c) => `${c.a}/${c.b}`)).toEqual(["صدق/كذب"]);
    expect(verseAntithesis("2:257", data)).toEqual([]); // نور/ظلم present at 2:257 but not framed → excluded
    expect(verseAntithesis("1:1", data)).toEqual([]);
  });
});

describe("catalogues", () => {
  it("exposes curated (with framedOnly filter) and candidates separately", () => {
    expect(oppositesCatalogue(data).length).toBe(3);
    expect(oppositesCatalogue(data, { framedOnly: true }).map((c) => c.a)).toEqual(["حيي", "صدق"]);
    expect(candidatesCatalogue(data).map((c) => c.a)).toEqual(["حقق"]);
  });
});
