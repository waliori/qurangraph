import { describe, it, expect, beforeAll } from "vitest";
import { setRootMap } from "../arabic-utils.js";
import { frameOccIndex, runConstruction, headOccurrences, availableFacets, definiteOf, constructionVerses } from "./construction.js";

// Minimal morphology object in the columnar shape decodeMorph() expects.
const LEG = {
  pos: ["", "noun", "pn", "adj", "actpcpl", "pron", "verb", "particle", "passpcpl"],
  aspect: ["", "impf", "impv", "perf"], voice: ["", "act", "pass"], mood: ["", "ind", "jus", "subj"],
  gender: ["", "m", "f"], number: ["", "s", "p", "d"], gcase: ["", "gen", "nom", "acc"],
};
const POS = (p) => LEG.pos.indexOf(p), VOICE = (v) => LEG.voice.indexOf(v), CASE = (c) => LEG.gcase.indexOf(c);
// tuple: [pos, vf, aspect, voice, mood, person, gender, number, gcase, lemma, root, precise]
const tup = (pos, { vf = 0, voice = "", gcase = "" } = {}) => [POS(pos), vf, 0, VOICE(voice), 0, 0, 0, 0, CASE(gcase), 0, 0, 1];

beforeAll(() => setRootMap({ شرك: "شرك", شيا: "شيء", شييا: "شيء" }));
const w = (orig, proot) => ({ orig, norm: orig, exact: orig, proot: proot || null });

// A:1 أشرك بالله (Form IV, frame بـ, object definite الله)
// B:1 أشرك مع الله شيئا (standalone مع, no frame)
// C:1 أن يشرك به شيئا (frame بـ on به, object شيئا indefinite, passive-ish head)
const verseData = {
  "A:1": { s: 1, a: 1, sn: "ا", text: "أشرك بالله", words: [w("أشرك", "شرك"), w("بالله")] },
  "B:1": { s: 2, a: 1, sn: "ب", text: "أشرك مع الله شيئا", words: [w("أشرك", "شرك"), w("مع"), w("الله"), w("شيئا")] },
  "C:1": { s: 3, a: 1, sn: "ج", text: "أن يشرك به شيئا", words: [w("أن"), w("يشرك", "شرك"), w("به"), w("شيئا")] },
};
const M = { legend: LEG, lemmas: [""], roots: [""], v: {
  "A:1": [tup("verb", { vf: 4, voice: "act" }), tup("pn", { gcase: "gen" })],
  "B:1": [tup("verb", { vf: 4, voice: "act" }), tup("particle"), tup("pn", { gcase: "nom" }), tup("noun", { gcase: "acc" })],
  "C:1": [tup("particle"), tup("verb", { vf: 4, voice: "pass" }), tup("pron"), tup("noun", { gcase: "acc" })],
} };
const expr = { frames: [{ head: "أشرك", pos: "verb", root: "شرك", prep: "ب", count: 2, occ: [["A:1", 0, 1], ["C:1", 1, 2]] }] };
const keys = ["A:1", "B:1", "C:1"];

describe("headOccurrences", () => {
  it("finds every head token in root mode", () => {
    const h = headOccurrences("شرك", "root", keys, verseData, M);
    expect(h.map((x) => `${x.vk}:${x.idx}`)).toEqual(["A:1:0", "B:1:0", "C:1:1"]);
    expect(h[2].m.voice).toBe("pass");
  });
});

describe("frameOccIndex", () => {
  it("indexes governed prepositions by head position", () => {
    const fi = frameOccIndex(expr);
    expect(fi.get("A:1|0")).toEqual([{ prep: "ب", idx: 1 }]);
    expect(fi.get("C:1|1")).toEqual([{ prep: "ب", idx: 2 }]);
  });
});

describe("runConstruction — governed preposition", () => {
  const fi = frameOccIndex(expr);
  it("keeps only frame بـ occurrences when present is required", () => {
    const r = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: fi,
      spec: { prep: { set: ["ب"], mode: "present", source: "any" } } });
    expect(r.occ.map((o) => o.vk)).toEqual(["A:1", "C:1"]);
    expect(r.byPrep.get("ب")).toBe(2);
  });
  it("detects a standalone مع that the frames do not carry", () => {
    const r = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: fi,
      spec: { prep: { set: ["مع"], mode: "present", source: "any" } } });
    expect(r.occ.map((o) => o.vk)).toEqual(["B:1"]);
    expect(r.occ[0].prep).toBe("مع");
  });
  it("absent mode returns the bare head (no governed particle)", () => {
    const r = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: fi,
      spec: { prep: { set: ["ب"], mode: "absent", source: "frame" } } });
    expect(r.occ.map((o) => o.vk)).toEqual(["B:1"]);
  });
});

describe("runConstruction — head morphology + object definiteness", () => {
  const fi = frameOccIndex(expr);
  it("filters the head by voice (passive only)", () => {
    const r = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: fi,
      spec: { headFilter: { voice: ["pass"] } } });
    expect(r.occ.map((o) => o.vk)).toEqual(["C:1"]);
  });
  it("distinguishes a definite object (بالله) from an indefinite one (شيئا)", () => {
    const def = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: fi,
      spec: { prep: { set: ["ب"], mode: "present", source: "frame" }, object: { definite: true } } });
    expect(def.occ.map((o) => o.vk)).toEqual(["A:1", "C:1"]); // بالله definite, and C's governed به (pronoun) is definite too
    const indef = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: fi,
      spec: { object: { definite: false } } });
    // bare-object path: next nominal after head — for C that's شيئا (indefinite, acc)
    expect(indef.occ.some((o) => o.vk === "C:1")).toBe(true);
  });
});

describe("definiteOf heuristic", () => {
  it("reads the article through a proclitic, and a tanwīn noun as indefinite", () => {
    expect(definiteOf(w("بالله"), { pos: "pn" })).toBe(true);
    expect(definiteOf(w("شيئا"), { pos: "noun", gcase: "acc" })).toBe(false);
    expect(definiteOf(w("به"), { pos: "pron" })).toBe(true);
  });
});

describe("availableFacets + constructionVerses", () => {
  it("enumerates attested forms/voices/preps from the data", () => {
    const h = headOccurrences("شرك", "root", keys, verseData, M);
    const f = availableFacets(h, frameOccIndex(expr));
    expect(f.forms).toEqual([4]);
    expect(f.voices.sort()).toEqual(["act", "pass"]);
    expect(f.preps).toEqual([{ prep: "ب", count: 2 }]);
    expect(f.hasBare).toBe(true); // B:1 has no frame
  });
  it("groups occurrences into highlightable verses", () => {
    const r = runConstruction({ lookup: "شرك", mode: "root", keys, verseData, M, frameIdx: frameOccIndex(expr),
      spec: { prep: { set: ["ب"], mode: "present", source: "frame" } } });
    const cv = constructionVerses(r.occ);
    expect(cv.keys).toEqual(["A:1", "C:1"]);
    expect(cv.hi["A:1"].sort()).toEqual([0, 1]);
  });
});
