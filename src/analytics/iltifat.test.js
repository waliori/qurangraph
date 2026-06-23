import { describe, it, expect } from "vitest";
import { versePerson, suraIltifat } from "./iltifat.js";

// Columnar morphology. Tuple: [pos, vf, aspect, voice, mood, person, gender, number, gcase, lemma, root, precise]
const M = {
  legend: { pos: ["", "verb", "pron"], aspect: [""], voice: [""], mood: [""], gender: [""], number: ["", "s", "p"], gcase: [""] },
  lemmas: [""], roots: [""],
  v: {
    "1:3": [[1, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 1]],                                  // verb, 3rd, sing
    "1:4": [[1, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 1]],                                  // verb, 3rd, sing
    "1:5": [[2, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1]], // إياك (pron 2) + نعبد (verb 1)
    "1:6": [[1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1]],                                  // verb, 1st, sing
    "1:7": [[1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 1]],                                  // verb, 1st, PLURAL
  },
};
const w = (s) => ({ orig: s, norm: s });
const verseData = {
  "1:3": { s: 1, a: 3, words: [w("يعلم")] },
  "1:4": { s: 1, a: 4, words: [w("يحمد")] },
  "1:5": { s: 1, a: 5, words: [w("اياك"), w("نعبد")] },
  "1:6": { s: 1, a: 6, words: [w("اعبد")] },
  "1:7": { s: 1, a: 7, words: [w("نعبد")] },
};

describe("versePerson", () => {
  it("picks the dominant person, ties resolving to the operative (last) verb", () => {
    expect(versePerson(verseData["1:5"].words, M, "1:5")).toMatchObject({ person: 1, sample: "نعبد" });
  });
  it("returns null for a verse with no verb/pronoun", () => {
    expect(versePerson([w("نور")], M, "9:9")).toBeNull();
  });
});

describe("suraIltifat", () => {
  it("builds a person contour and flags person + number turns", () => {
    const { contour, shifts } = suraIltifat(1, verseData, M);
    expect(contour).toHaveLength(5);
    expect(contour[0].person).toBe(3);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toMatchObject({ type: "person", a: 4, b: 5, from: 3, to: 1 }); // 3rd → 1st
    expect(shifts[1]).toMatchObject({ type: "number", a: 6, b: 7, from: "s", to: "p" }); // divine plural turn (within 1st person)
  });
  it("is empty without morphology", () => {
    expect(suraIltifat(1, verseData, null).shifts).toEqual([]);
  });
});
