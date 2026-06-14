import { describe, it, expect, beforeAll } from "vitest";
import { rootFrequency, hapaxRoots, browseByMorph } from "./corpus.js";
import { setRootMap } from "../arabic-utils.js";

beforeAll(() => setRootMap({ نور: "نور", ضوء: "ضوأ", قرطاس: "قرطس", خير: "خير" }));

const w = (s, proot) => ({ orig: s, norm: s, exact: s, proot });
const verseData = {
  "1:1": { s: 1, a: 1, words: [w("نور", "نور"), w("نور", "نور"), w("ضوء", "ضوأ")] }, // نور twice
  "1:2": { s: 1, a: 2, words: [w("نور", "نور"), w("قرطاس", "قرطس")] },                // قرطس only here → hapax
  "2:1": { s: 2, a: 1, words: [w("ضوء", "ضوأ"), w("خير", "خير")] },
};

describe("rootFrequency", () => {
  it("ranks roots by true token frequency", () => {
    const f = rootFrequency(verseData);
    expect(f[0]).toMatchObject({ root: "نور", count: 3, verses: 2 }); // 3 tokens across 2 verses
    expect(f.find((r) => r.root === "ضوأ")).toMatchObject({ count: 2, verses: 2 });
  });
});

describe("hapaxRoots", () => {
  it("lists roots occurring exactly once, in muṣḥaf order", () => {
    const h = hapaxRoots(verseData);
    const roots = h.map((x) => x.root);
    expect(roots).toContain("قرطس"); // once, in 1:2
    expect(roots).toContain("خير");  // once, in 2:1
    expect(roots).not.toContain("نور");
    expect(h.find((x) => x.root === "قرطس").vk).toBe("1:2");
  });
});

describe("browseByMorph", () => {
  // Form II verbs (vf=2) at 1:1[0] and 2:1[1]; a Form I verb at 1:2[0].
  const M = {
    legend: { pos: ["", "verb"], aspect: [""], voice: [""], mood: [""], gender: [""], number: [""], gcase: [""] },
    lemmas: [""], roots: [""],
    v: {
      "1:1": [[1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      "1:2": [[1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      "2:1": [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]],
    },
  };
  it("catalogues words matching a grammatical filter, grouped by mode key", () => {
    const out = browseByMorph(verseData, M, { pos: [], form: [2], aspect: [], voice: [] }, "root");
    const keys = out.map((o) => o.key);
    expect(keys).toContain("نور"); // 1:1[0] Form II
    expect(keys).toContain("خير"); // 2:1[1] Form II
    expect(keys).not.toContain("قرطس"); // 1:2[0] is Form I → excluded
  });
  it("returns empty for an inactive filter or missing morphology", () => {
    expect(browseByMorph(verseData, M, { pos: [], form: [], aspect: [], voice: [] }, "root")).toEqual([]);
    expect(browseByMorph(verseData, null, { form: [2] }, "root")).toEqual([]);
  });
});
