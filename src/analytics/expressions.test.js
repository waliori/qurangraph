import { describe, it, expect } from "vitest";
import { indexExpressions, frameContrast, headRows, expressionsForRoot, occVerses, FRAME_SPAN, COMPOUND_SPAN, idiomSpan } from "./expressions.js";

// A tiny inventory shaped like public/data/expressions.json.
const expr = {
  prepGloss: { "ب": { ar: "بـ", en: "bi" }, "إِلَى": { ar: "إِلَى", en: "ilā" } },
  frames: [
    { head: "آمَنَ", root: "أمن", pos: "verb", prep: "ب", count: 5, occ: [["2:3", 1, 2], ["2:8", 0, 1]] },
    { head: "آمَنَ", root: "أمن", pos: "verb", prep: "إِلَى", count: 1, occ: [["4:60", 0, 1]] },
    { head: "دَعا", root: "دعو", pos: "verb", prep: "إِلَى", count: 3, occ: [["12:33", 0, 1]] },
  ],
  headTotals: { "verb|آمَنَ": 10, "verb|دَعا": 4 },
  compounds: [
    { a: "سَبِيل", b: "اللَّه", aRoot: "سبل", bRoot: "أله", count: 4, ll: 90, occ: [["2:154", 3]] },
    { a: "يَوْم", b: "قِيامَة", aRoot: "يوم", bRoot: "قوم", count: 6, ll: 120, occ: [["2:85", 5]] },
  ],
  idioms: [
    { display: "حبل الله", skeleton: "حبل الله", en: "the rope of God", type: "curated", count: 1, occ: [["3:103", 2]] },
  ],
};

describe("indexExpressions + frameContrast", () => {
  const idx = indexExpressions(expr);

  it("groups frames by head and contrasts prepositions with the bare residual", () => {
    const c = frameContrast(expr, idx, "verb|آمَنَ");
    expect(c.preps.map((p) => p.prep)).toEqual(["ب", "إِلَى"]); // strongest first
    expect(c.governed).toBe(6);          // 5 + 1
    expect(c.total).toBe(10);
    expect(c.bare).toBe(4);              // 10 − 6
    expect(c.preps[0].gloss.en).toBe("bi");
  });

  it("returns null for an unknown head", () => {
    expect(frameContrast(expr, idx, "verb|nope")).toBeNull();
  });

  it("ranks head rows by governed count", () => {
    const rows = headRows(expr, idx);
    expect(rows[0].head).toBe("آمَنَ"); // 6 governed > دَعا 3
  });
});

describe("expressionsForRoot", () => {
  const idx = indexExpressions(expr);
  it("finds frames and compounds a root participates in", () => {
    expect(expressionsForRoot(expr, idx, "أمن").heads.map((h) => h.head)).toEqual(["آمَنَ"]);
    const comp = expressionsForRoot(expr, idx, "أله").compounds;
    expect(comp).toHaveLength(1);
    expect(comp[0].a).toBe("سَبِيل");
  });
  it("is empty for a root with no expressions", () => {
    expect(expressionsForRoot(expr, idx, "زززز")).toEqual({ heads: [], compounds: [] });
  });
});

describe("occVerses + spans", () => {
  const vd = { "2:3": {}, "2:8": {} };
  it("groups frame occurrences into verses with head+prep indices, in order", () => {
    const v = occVerses(expr.frames[0].occ, vd, FRAME_SPAN);
    expect(v.map((x) => x.vk)).toEqual(["2:3", "2:8"]);
    expect(v[0].hi.sort()).toEqual([1, 2]);
  });
  it("drops occurrences whose verse is absent from verseData", () => {
    const v = occVerses([["2:3", 0, 1], ["9:9", 0, 1]], vd, FRAME_SPAN);
    expect(v.map((x) => x.vk)).toEqual(["2:3"]);
  });
  it("compound span covers both nouns; idiom span covers the run", () => {
    expect(COMPOUND_SPAN(["2:154", 3])).toEqual([3, 4]);
    expect(idiomSpan(2)(["3:103", 2])).toEqual([2, 3]);
  });
});
