import { describe, it, expect } from "vitest";
import { buildLazyGraph, getDescendants, getPathToCenter } from "./buildGraph.js";
import { setRootMap, setLemmaMap } from "../arabic-utils.js";

function word(s) { return { orig: s, norm: s }; }

const verseData = {
  "1:1": { text: "الحمد لله رب", s: 1, a: 1, sn: "الفاتحة", words: [word("الحمد"), word("لله"), word("رب")] },
  "2:5": { text: "رب العالمين", s: 2, a: 5, sn: "البقرة", words: [word("رب"), word("العالمين")] },
  "3:7": { text: "الحمد رب", s: 3, a: 7, sn: "آل عمران", words: [word("الحمد"), word("رب")] },
};
const w2v = { "الحمد": ["1:1", "3:7"], "لله": ["1:1"], "رب": ["1:1", "2:5", "3:7"] };
const r2v = w2v;

describe("buildLazyGraph", () => {
  it("builds a centre with its unique words", () => {
    const { nodes } = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(), new Set(), false, 10, "exact");
    expect(nodes.find((n) => n.type === "center").verseKey).toBe("1:1");
    const words = nodes.filter((n) => n.type === "word").map((n) => n.lookup).sort();
    expect(words).toEqual(["الحمد", "رب", "لله"]);
  });

  it("expands a word into the verses that contain it", () => {
    const { nodes, links } = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(["رب@1:1"]), new Set(), false, 10, "exact");
    const verses = nodes.filter((n) => n.type === "verse").map((n) => n.verseKey).sort();
    expect(verses).toEqual(["2:5", "3:7"]);
    expect(links.length).toBeGreaterThan(0);
  });

  it("ranks child verses by shared-word count (most related first)", () => {
    const { nodes } = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(["رب@1:1"]), new Set(), false, 10, "exact");
    const verses = nodes.filter((n) => n.type === "verse");
    // 3:7 shares {الحمد, رب}=2, 2:5 shares {رب}=1  → 3:7 must come first
    expect(verses[0].verseKey).toBe("3:7");
    expect(verses[0].sharedCount).toBe(2);
    expect(verses[1].sharedCount).toBe(1);
  });

  it("respects maxBranch", () => {
    const { nodes } = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(["رب@1:1"]), new Set(), false, 1, "exact");
    expect(nodes.filter((n) => n.type === "verse").length).toBe(1);
  });

  it("returns empty graph for an unknown verse", () => {
    const { nodes } = buildLazyGraph("99:99", verseData, w2v, r2v, new Set(), new Set(), false, 10, "exact");
    expect(nodes).toEqual([]);
  });

  it("gives every node finite coordinates", () => {
    const { nodes } = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(["رب@1:1"]), new Set(), false, 10, "exact", 800, 600);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe("root mode (precomputed roots)", () => {
  const vd = {
    "1:1": { text: "يتربصن يتربص في", s: 1, a: 1, sn: "س", words: [word("يتربصن"), word("يتربص"), word("في")] },
  };
  const idx = { "ربص": ["1:1"], "في": ["1:1"] };

  it("groups different surface forms of one root into a single word node, leaves no-root tokens ungrouped", () => {
    setRootMap({ "يتربصن": "ربص", "يتربص": "ربص" }); // "في" intentionally unmapped
    const { nodes } = buildLazyGraph("1:1", vd, idx, idx, new Set(), new Set(), false, 10, "root");
    const words = nodes.filter((n) => n.type === "word");
    const lookups = words.map((n) => n.lookup).sort();
    expect(lookups).toEqual(["ربص", "في"]); // two forms of ربص collapsed to one
    const rabs = words.find((n) => n.lookup === "ربص");
    const fi = words.find((n) => n.lookup === "في");
    expect(rabs.rootLabel).toBe("ربص");   // real root → labelled
    expect(fi.rootLabel).toBe(null);       // no root → ungrouped, no label
    setRootMap(null);
  });
});

describe("lemma mode (precomputed lemmas)", () => {
  const vd = {
    "1:1": { text: "استغفر يستغفر غفور", s: 1, a: 1, sn: "س", words: [word("استغفر"), word("يستغفر"), word("غفور")] },
  };
  const l2v = { "استغفر": ["1:1"], "غفور": ["1:1"] };

  it("collapses inflections of one lemma but keeps distinct lemmas of a shared root apart", () => {
    // استغفر/يستغفر share lemma استغفر; غفور is a different lemma (same root غفر).
    setLemmaMap({ "استغفر": "استغفر", "يستغفر": "استغفر", "غفور": "غفور" });
    const { nodes } = buildLazyGraph("1:1", vd, l2v, l2v, new Set(), new Set(), false, 10, "lemma", 800, 600, { l2v });
    const lookups = nodes.filter((n) => n.type === "word").map((n) => n.lookup).sort();
    expect(lookups).toEqual(["استغفر", "غفور"]); // two forms of one lemma collapsed
    setLemmaMap(null);
  });
});

describe("position-correct root grouping (homographs)", () => {
  // قل appears twice: once analysed as قول (say), once as قلل (few). With voted
  // grouping both collapse to the commoner قول; with per-occurrence roots attached
  // (w.proot) they split into two word nodes under their real roots.
  const W = (s, proot) => ({ orig: s, norm: s, proot });
  const vd = {
    "1:1": { text: "قل قل", s: 1, a: 1, sn: "س", words: [W("قل", "قول"), W("قل", "قلل")] },
  };
  // Position-correct index: each root points at the verse once.
  const idx = { "قول": ["1:1"], "قلل": ["1:1"] };

  it("splits a homograph surface form into its two real roots", () => {
    setRootMap({ "قل": "قول" }); // voted reading is قول for the bare form
    const { nodes } = buildLazyGraph("1:1", vd, idx, idx, new Set(), new Set(), false, 10, "root");
    const lookups = nodes.filter((n) => n.type === "word").map((n) => n.lookup).sort();
    expect(lookups).toEqual(["قلل", "قول"]); // two distinct roots, not one voted قول
    setRootMap(null);
  });
});

describe("morphology filter", () => {
  const vd = {
    "1:1": { text: "alpha beta", s: 1, a: 1, sn: "س", words: [word("alpha"), word("beta")] },
  };
  const w2v = { alpha: ["1:1"], beta: ["1:1"] };
  // Tuple fields: [pos,vf,aspect,voice,mood,person,gender,number,gcase,lemma,root,precise]
  const M = {
    legend: { pos: ["", "noun", "verb"], aspect: ["", "perf", "impf"], voice: ["", "act", "pass"], mood: [""], gender: [""], number: [""], gcase: [""] },
    lemmas: [""], roots: [""],
    v: { "1:1": [[2, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]] },
  };

  it("drops words whose morphology fails an active filter", () => {
    const { nodes } = buildLazyGraph("1:1", vd, w2v, w2v, new Set(), new Set(), false, 10, "exact", 800, 600, { M, morphFilter: { pos: ["verb"], form: [], aspect: [], voice: [] } });
    const words = nodes.filter((n) => n.type === "word").map((n) => n.lookup);
    expect(words).toEqual(["alpha"]); // only the verb survives a verb-only filter
  });

  it("shows all words when no filter is active", () => {
    const { nodes } = buildLazyGraph("1:1", vd, w2v, w2v, new Set(), new Set(), false, 10, "exact", 800, 600, { M, morphFilter: { pos: [], form: [], aspect: [], voice: [] } });
    expect(nodes.filter((n) => n.type === "word").length).toBe(2);
  });
});

describe("rarity edge weighting", () => {
  it("assigns a higher weight to links through a rarer connecting word", () => {
    // رب is in 3 verses (common), لله in 1 (rare). Expanding each, the link from
    // the rarer word must carry the larger weight.
    const g1 = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(["رب@1:1"]), new Set(), false, 10, "exact");
    const g2 = buildLazyGraph("1:1", verseData, w2v, r2v, new Set(["الحمد@1:1"]), new Set(), false, 10, "exact");
    const wRib = g1.links.find((l) => l.source === "w:رب@1:1" && l.weight != null).weight;     // count 3
    const wHamd = g2.links.find((l) => l.source === "w:الحمد@1:1" && l.weight != null).weight;  // count 2
    expect(wHamd).toBeGreaterThan(wRib); // rarer (fewer verses) → stronger signal
  });
});

describe("graph traversal helpers", () => {
  const links = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "a", target: "d" },
  ];
  it("getDescendants collects the subtree inclusively", () => {
    expect([...getDescendants("a", links)].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...getDescendants("b", links)].sort()).toEqual(["b", "c"]);
  });
  it("getPathToCenter walks parent pointers", () => {
    const parentMap = { c: "b", b: "a" };
    expect([...getPathToCenter("c", parentMap)].sort()).toEqual(["a", "b", "c"]);
  });
});
