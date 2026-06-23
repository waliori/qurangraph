import { describe, it, expect } from "vitest";
import { distributionBySura, collocations, association, mergeCollocations, directNeighbors } from "./stats.js";

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

  it("counts TRUE token frequency — a word twice in one āyah counts twice", () => {
    const vd = { "2:1": { s: 2, sn: "س2", a: 1, words: [w("نور"), w("نور"), w("ارض")] } };
    const idx = { نور: ["2:1"] };
    const sl = [{ id: 2, name: "س2" }];
    const d = distributionBySura("نور", idx, vd, sl, "exact");
    expect(d[0].count).toBe(2); // two occurrences in the single verse, not 1
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

  it("uses the token model in windowed mode — valid metrics, token-level counts", () => {
    // With a ±1 window the co-occurrence count is token-level and the marginals are
    // corpus token frequencies, so PMI/LL/Log-Dice are still well-defined (no nulls).
    const c = collocations("نور", "exact", index, verseData, stop, 1, { sort: "logdice" });
    for (const x of c) {
      expect(x.pmi).toBeTypeOf("number");
      expect(x.logdice).toBeTypeOf("number");
      expect(Number.isFinite(x.logdice)).toBe(true);
    }
    // logdice ranking holds (descending).
    for (let i = 1; i < c.length; i++) expect(c[i - 1].logdice).toBeGreaterThanOrEqual(c[i].logdice);
  });

  it("respects window asymmetry (left/right) in the token model", () => {
    // In "2:3" نور is followed by ارض; with asym:"left" the after-neighbour ارض drops out.
    const right = collocations("نور", "exact", index, verseData, stop, 1, { asym: "right" });
    const left = collocations("نور", "exact", index, verseData, stop, 1, { asym: "left" });
    expect(right.find((x) => x.key === "ارض")).toBeTruthy();
    expect(left.find((x) => x.key === "ارض")).toBeFalsy();
  });

  it("attaches PMI, signed G², Log-Dice and a significance tier to every neighbour", () => {
    const c = collocations("نور", "exact", index, verseData, stop, 99, { sort: "ll" });
    const m = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(m["سماء"].pmi).toBeTypeOf("number");
    expect(m["سماء"].ll).toBeTypeOf("number");
    expect(m["سماء"].logdice).toBeTypeOf("number");
    expect(m["سماء"].sig).toBeTypeOf("number");
    // نور saturates this toy corpus (every verse), so its neighbours sit exactly at
    // chance — the figures are finite, not NaN. (Positivity is covered below.)
    expect(Number.isFinite(m["سماء"].pmi)).toBe(true);
    expect(Number.isFinite(m["سماء"].ll)).toBe(true);
  });

  it("can rank by Log-Dice", () => {
    const c = collocations("نور", "exact", index, verseData, stop, 99, { sort: "logdice" });
    for (let i = 1; i < c.length; i++) expect(c[i - 1].logdice).toBeGreaterThanOrEqual(c[i].logdice);
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
    expect(association(0, 5, 5, 100)).toEqual({ pmi: 0, ll: 0, logdice: 0, sig: 0 });
    expect(association(3, 0, 5, 100)).toEqual({ pmi: 0, ll: 0, logdice: 0, sig: 0 });
  });
  it("reports Log-Dice (frequency-stable, ≤14) and a significance tier", () => {
    // Perfect co-occurrence: every X is a Y and vice-versa → Log-Dice = 14 (the ceiling).
    expect(association(50, 50, 50, 1000).logdice).toBeCloseTo(14, 6);
    // A strongly attracted pair clears the p<.001 critical value (tier 3).
    expect(association(50, 100, 100, 1000).sig).toBe(3);
    // An independent pair is not significant (tier 0).
    expect(association(10, 100, 100, 1000).sig).toBe(0);
  });
});

describe("directNeighbors", () => {
  // نور at 1:1 is followed by سماء; at 2:3 preceded by في, followed by ارض; at 2:9
  // preceded by سماء (the verse "سماء نور" — see below).
  const vd = {
    "1:1": { s: 1, sn: "س1", a: 1, words: [w("نور"), w("سماء"), w("في")] },
    "2:3": { s: 2, sn: "س2", a: 3, words: [w("في"), w("نور"), w("ارض")] },
    "2:9": { s: 2, sn: "س2", a: 9, words: [w("سماء"), w("نور")] },
  };
  const idx = { نور: ["1:1", "2:3", "2:9"] };

  it("tallies immediate before/after tokens, position-aware, particles kept", () => {
    const n = directNeighbors("نور", "exact", idx, vd);
    const by = Object.fromEntries(n.map((x) => [x.key, x]));
    expect(by["سماء"]).toMatchObject({ before: 1, after: 1, total: 2 }); // after in 1:1, before in 2:9
    expect(by["ارض"]).toMatchObject({ before: 0, after: 1 });            // after in 2:3
    expect(by["في"]).toMatchObject({ before: 1, after: 0 });             // before in 2:3 (particle KEPT)
    expect(n[0].key).toBe("سماء"); // ranked by total desc
  });

  it("counts token-level — the term twice in a verse contributes both neighbours", () => {
    const vd2 = { "3:1": { s: 3, sn: "س3", a: 1, words: [w("نور"), w("نور"), w("ارض")] } };
    const n = directNeighbors("نور", "exact", { نور: ["3:1"] }, vd2);
    const by = Object.fromEntries(n.map((x) => [x.key, x]));
    expect(by["ارض"].after).toBe(1);     // follows the 2nd نور
    expect(by["نور"]).toBeUndefined();   // self-adjacency skipped
  });

  it("crossVerse spans the āya boundary within a sūra", () => {
    // نور is verse-final in both 4:1 and 4:2. With crossVerse its "after" reaches the
    // FIRST word of the next verse: عظيم (head of 4:2) and عليم (head of 4:3).
    const vd3 = {
      "4:1": { s: 4, sn: "س4", a: 1, words: [w("حكيم"), w("نور")] },
      "4:2": { s: 4, sn: "س4", a: 2, words: [w("عظيم"), w("نور")] },
      "4:3": { s: 4, sn: "س4", a: 3, words: [w("عليم"), w("غفور")] },
    };
    const idx3 = { نور: ["4:1", "4:2"] };
    const off = Object.fromEntries(directNeighbors("نور", "exact", idx3, vd3).map((x) => [x.key, x]));
    expect(off["عليم"]).toBeUndefined();           // no cross-boundary neighbour without the flag
    expect(off["عظيم"].after).toBe(0);             // عظيم only seen as a before-neighbour in 4:2
    const on = Object.fromEntries(directNeighbors("نور", "exact", idx3, vd3, { crossVerse: true }).map((x) => [x.key, x]));
    expect(on["عظيم"].after).toBe(1);              // first word of 4:2 (4:1's نور is verse-final)
    expect(on["عليم"].after).toBe(1);              // first word of 4:3 (4:2's نور is verse-final)
    expect(on["حكيم"].before).toBe(1);             // 4:1 in-verse before
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
