import { describe, it, expect } from "vitest";
import { distributionBySura, collocations, association, mergeCollocations } from "./stats.js";

const w = (s) => ({ orig: s, norm: s, exact: s });
const verseData = {
  "1:1": { s: 1, sn: "س1", a: 1, words: [w("نور"), w("سماء"), w("في")] },
  "2:3": { s: 2, sn: "س2", a: 3, words: [w("نور"), w("ارض")] },
  "2:9": { s: 2, sn: "س2", a: 9, words: [w("نور"), w("سماء")] },
};
const index = { نور: ["1:1", "2:3", "2:9"], سماء: ["1:1", "2:9"] };
const surahList = [{ id: 1, name: "س1" }, { id: 2, name: "س2" }, { id: 3, name: "س3" }];
const stop = new Set(["في"]);

describe("distributionBySura", () => {
  it("counts occurrences per sūrah over the full list (zeros included)", () => {
    const d = distributionBySura("نور", index, verseData, surahList);
    expect(d).toEqual([
      { sura: 1, name: "س1", count: 1 },
      { sura: 2, name: "س2", count: 2 },
      { sura: 3, name: "س3", count: 0 },
    ]);
    expect(d.reduce((s, x) => s + x.count, 0)).toBe(index["نور"].length);
  });
});

describe("collocations", () => {
  it("ranks within-verse co-occurring words, excluding the term and stop words", () => {
    const c = collocations("نور", "exact", index, verseData, stop);
    const map = Object.fromEntries(c.map((x) => [x.key, x.count]));
    expect(map["سماء"]).toBe(2); // co-occurs in 1:1 and 2:9
    expect(map["ارض"]).toBe(1);  // only 2:3
    expect(map["في"]).toBeUndefined(); // stop word excluded
    expect(map["نور"]).toBeUndefined(); // the term itself excluded
    expect(c[0].key).toBe("سماء"); // ranked by count
  });

  it("excludes a neighbour whose GROUPING key (not just surface) is a stop word", () => {
    // In root mode a neighbour's surface form (يقول) isn't in the stop set, but its
    // root (قول) is — it must still be dropped, matching the graph's getUW().
    const vd = {
      "1:1": { s: 1, sn: "س", a: 1, words: [{ orig: "نور", norm: "نور", proot: "نور" }, { orig: "يقول", norm: "يقول", proot: "قول" }] },
    };
    const idx = { "نور": ["1:1"], "قول": ["1:1"] };
    const c = collocations("نور", "root", idx, vd, new Set(["قول"]));
    expect(c.find((x) => x.key === "قول")).toBeUndefined();
  });

  it("attaches PMI + signed log-likelihood to every neighbour", () => {
    const c = collocations("نور", "exact", index, verseData, stop, 99, { sort: "ll" });
    const m = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(m["سماء"].pmi).toBeTypeOf("number");
    expect(m["سماء"].ll).toBeTypeOf("number");
    // نور saturates this toy corpus (every verse), so its neighbours sit exactly at
    // chance — the figures are finite zeros, not NaN. (Positivity is covered below.)
    expect(Number.isFinite(m["سماء"].pmi)).toBe(true);
    expect(Number.isFinite(m["سماء"].ll)).toBe(true);
  });
});

describe("association", () => {
  it("is ~0 for an independent pair and positive when drawn together", () => {
    // Independent: k = a·b/N exactly → PMI 0, G² 0.
    expect(association(10, 100, 100, 1000).pmi).toBeCloseTo(0, 6);
    expect(association(10, 100, 100, 1000).ll).toBeCloseTo(0, 6);
    // Over-represented co-occurrence → both measures positive.
    const over = association(50, 100, 100, 1000);
    expect(over.pmi).toBeGreaterThan(0);
    expect(over.ll).toBeGreaterThan(0);
  });
  it("signs the log-likelihood negative when a pair co-occurs less than chance", () => {
    expect(association(1, 100, 100, 1000).ll).toBeLessThan(0);
  });
  it("returns zeros for degenerate inputs", () => {
    expect(association(0, 5, 5, 100)).toEqual({ pmi: 0, ll: 0 });
    expect(association(3, 0, 5, 100)).toEqual({ pmi: 0, ll: 0 });
  });
});

describe("mergeCollocations", () => {
  const a = [
    { key: "سماء", label: "سماء", count: 5, pmi: 2, ll: 9 },
    { key: "ارض", label: "أرض", count: 3, pmi: 1, ll: 4 },
  ];
  const b = [
    { key: "سماء", label: "سماء", count: 2, pmi: 1, ll: 3 },
    { key: "بحر", label: "بحر", count: 4, pmi: 3, ll: 6 },
  ];

  it("splits neighbours into shared vs. distinct, carrying both terms' figures", () => {
    const { shared, onlyA, onlyB } = mergeCollocations(a, b);
    expect(shared).toHaveLength(1);
    expect(shared[0].key).toBe("سماء");
    expect(shared[0].a.count).toBe(5);
    expect(shared[0].b.count).toBe(2);
    expect(onlyA.map((x) => x.key)).toEqual(["ارض"]);
    expect(onlyB.map((x) => x.key)).toEqual(["بحر"]);
  });

  it("preserves input order and tolerates empty lists", () => {
    expect(mergeCollocations([], b)).toEqual({ shared: [], onlyA: [], onlyB: b });
    expect(mergeCollocations(a, [])).toEqual({ shared: [], onlyA: a, onlyB: [] });
    expect(mergeCollocations(undefined, undefined)).toEqual({ shared: [], onlyA: [], onlyB: [] });
  });
});
