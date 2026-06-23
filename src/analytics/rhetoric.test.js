import { describe, it, expect } from "vitest";
import { rhetoricScan } from "./rhetoric.js";

const w = (s) => ({ orig: s, norm: s });
const verseData = {
  "91:1": { s: 91, a: 1, words: [w("والشمس"), w("وضحاها")] },          // qasam-wāw opening
  "2:20": { s: 2, a: 20, words: [w("اذا"), w("اظلم"), w("عليهم")] },   // conditional إذا
  "68:39": { s: 68, a: 39, words: [w("ام"), w("لكم"), w("ايمان")] },   // (control: no oath)
  "53:53": { s: 53, a: 53, words: [w("اقسموا"), w("بالله")] },          // أقسموا — oath (Form IV)
  "5:3": { s: 5, a: 3, words: [w("وان"), w("تستقسموا"), w("بالازلام")] }, // تستقسموا — Form X, NOT oath
  "4:8": { s: 4, a: 8, words: [w("القسمة"), w("فارزقوهم")] },           // القسمة — noun, NOT oath
};
// Minimal morphology: form-gates the قسم root. Tuple field order per decodeMorph:
// [pos, vf, aspect, voice, mood, person, gender, number, gcase, lemma, root, precise]
const M = {
  legend: { pos: ["", "verb", "noun"], aspect: [""], voice: [""], mood: [""], gender: [""], number: [""], gcase: [""] },
  lemmas: [""], roots: ["", "قسم"],
  v: {
    "53:53": [[1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]],  // word0 أقسموا: verb, Form IV, root قسم → OATH
    "5:3": [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 10, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]], // word1 تستقسموا: verb, Form X, قسم → NOT oath
    "4:8": [[2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]],    // word0 القسمة: NOUN, root قسم → NOT oath
  },
};

describe("rhetoricScan — oath", () => {
  it("detects qasam-wāw openings, oath particles, and swearing verbs (Form IV)", () => {
    const vks = rhetoricScan(verseData, M).oath.map((o) => o.vk);
    expect(vks).toContain("91:1"); // والشمس opening
    expect(vks).toContain("53:53"); // أقسموا (Form IV) — swear
  });
  it("EXCLUDES تستقسموا (Form X, divination) and القسمة (noun, division) via the form gate", () => {
    const vks = rhetoricScan(verseData, M).oath.map((o) => o.vk);
    expect(vks).not.toContain("5:3");  // تستقسموا — not an oath
    expect(vks).not.toContain("4:8");  // القسمة — not an oath
  });
  it("without morphology, falls back to particles + wāw openings only (no false قسم matches)", () => {
    const vks = rhetoricScan(verseData, null).oath.map((o) => o.vk);
    expect(vks).toContain("91:1");      // wāw opening still detected
    expect(vks).not.toContain("53:53"); // can't confirm the verb form → skipped (precision-first)
    expect(vks).not.toContain("5:3");
  });
});

describe("rhetoricScan — conditional", () => {
  it("detects unambiguous conditional particles, not ambiguous ones", () => {
    const { conditional } = rhetoricScan(verseData, M);
    expect(conditional.map((c) => c.vk)).toEqual(["2:20"]); // إذا only
    expect(conditional[0].marker).toBe("اذا");
  });
  it("can scope to one sūra", () => {
    expect(rhetoricScan(verseData, M, { suraId: 91 }).conditional).toHaveLength(0);
  });
});
