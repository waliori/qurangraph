import { describe, it, expect } from "vitest";
import { buildLazyGraph, getDescendants, getPathToCenter } from "./buildGraph.js";
import { setRootMap } from "../arabic-utils.js";

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
