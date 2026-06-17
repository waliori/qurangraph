import { describe, it, expect } from "vitest";
import { norm } from "../arabic-utils.js";
import { buildRetrievalIndex, extractTerms, retrieve, extractSeeds } from "./retrieve.js";

// Tiny corpus. Build the root map from the ACTUAL normalised tokens so the fixtures don't
// depend on norm()'s internal folding rules.
const hafs = [
  { id: 1, verses: [
    { id: 1, text: "الحياة والموت" }, // roots: حيي, موت
    { id: 2, text: "نور وظلمات" },     // roots: نور, ظلم
  ] },
  { id: 2, verses: [
    { id: 1, text: "الحياة الدنيا" },  // roots: حيي, دنو
  ] },
];
const ROOTS = { "الحياة": "حيي", "والموت": "موت", "نور": "نور", "وظلمات": "ظلم", "الدنيا": "دنو" };
const rootMap = {};
for (const [w, r] of Object.entries(ROOTS)) rootMap[norm(w)] = r;

const semanticNeighbours = { "حيي": [["دنو", 0.5]] };
const relations = { byRoot: { "حيي": [{ other: "موت", polarity: "opposite", verses: ["1:1"] }] } };

const index = buildRetrievalIndex({ hafs, rootMap, lemmaMap: {} });
const data = { rootMap, lemmaMap: {}, semanticNeighbours, relations };

describe("buildRetrievalIndex", () => {
  it("inverts roots to verse refs and stores verse text", () => {
    expect(index.rootToRefs.get("حيي")).toEqual(["1:1", "2:1"]);
    expect(index.rootToRefs.get("موت")).toEqual(["1:1"]);
    expect(index.refText.get("1:2")).toBe("نور وظلمات");
  });
  it("dedupes a root that appears twice in one verse", () => {
    const idx = buildRetrievalIndex({ hafs: [{ id: 9, verses: [{ id: 1, text: "الحياة الحياة" }] }], rootMap, lemmaMap: {} });
    expect(idx.rootToRefs.get("حيي")).toEqual(["9:1"]);
  });
});

describe("extractTerms", () => {
  it("drops stopwords and resolves roots", () => {
    const terms = extractTerms("ما الحياة", { rootMap });
    expect(terms).toHaveLength(1);
    expect(terms[0].root).toBe("حيي");
  });
  it("dedupes repeated terms", () => {
    expect(extractTerms("نور نور", { rootMap })).toHaveLength(1);
  });
});

describe("retrieve", () => {
  it("returns direct, semantic-neighbour and opposite hits with reasons", () => {
    const r = retrieve("الحياة", index, data);
    const refs = r.verses.map((v) => v.ref);
    expect(refs).toContain("1:1"); // direct حيي + opposite موت
    expect(refs).toContain("2:1"); // direct حيي + neighbour دنو
    expect(r.related.map((x) => x.root)).toContain("دنو");
    expect(r.opposites.map((x) => x.other)).toContain("موت");
    // The verse with the most evidence (direct + opposite) outranks the rest.
    expect(r.verses[0].ref).toBe("1:1");
    expect(r.verses[0].reasons.some((x) => x.includes("حيي"))).toBe(true);
  });

  it("folds in dense (Layer 2b) refs via semanticRefs", () => {
    const r = retrieve("الحياة", index, data, { semanticRefs: [{ ref: "1:2", sim: 0.9 }] });
    expect(r.verses.map((v) => v.ref)).toContain("1:2");
  });

  it("returns null when nothing matches", () => {
    expect(retrieve("زورباكسيون", index, data)).toBeNull();
    expect(retrieve("", index, data)).toBeNull();
  });

  it("retrieves from seeds when the question has no Arabic terms ('analyze this verse')", () => {
    // English-only question → no query terms; seeds come from the attached selection.
    const r = retrieve("what can you say about this verse", index, data, {
      seeds: { roots: [], lemmas: [], refs: ["2:1"] }, // pretend a verse 2:1 is attached
    });
    expect(r).not.toBeNull();
    expect(r.verses.map((v) => v.ref)).toContain("2:1");
  });

  it("expands seed roots through the semantic layer", () => {
    const r = retrieve("analyze", index, data, { seeds: { roots: ["حيي"], lemmas: [], refs: [] } });
    expect(r.related.map((x) => x.root)).toContain("دنو");
    expect(r.verses.map((v) => v.ref)).toEqual(expect.arrayContaining(["1:1", "2:1"]));
  });
});

describe("extractSeeds", () => {
  it("pulls roots/lemmas/refs from attachable shapes", () => {
    const s = extractSeeds([
      { kind: "word", payload: { root: "فكر", lemma: "تَفَكَّرَ", verseRef: "2:219" } },
      { kind: "lexicon", payload: { root: "علم" } },
      { kind: "graph", payload: { centerRef: "2:255" } },
      { kind: "ws", payload: { type: "verse", payload: { surah: 1, ayah: 2 } } },
    ]);
    expect(s.roots).toEqual(expect.arrayContaining(["فكر", "علم"]));
    expect(s.lemmas).toContain("تَفَكَّرَ");
    expect(s.refs).toEqual(expect.arrayContaining(["2:219", "2:255", "1:2"]));
  });
});
