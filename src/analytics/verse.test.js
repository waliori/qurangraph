import { describe, it, expect, beforeAll } from "vitest";
import { verseProfile, similarVerses } from "./verse.js";
import { setRootMap } from "../arabic-utils.js";

// rootOf reads the installed map; install one keyed by the toy norms below.
beforeAll(() => setRootMap({ علم: "علم", كتب: "كتب", رحم: "رحم", نور: "نور", قول: "قول" }));

const w = (s) => ({ orig: s, norm: s });
const verse = (s, a, toks) => ({ s, a, sn: `س${s}`, text: toks.join(" "), words: toks.map(w) });
const verseData = {
  "1:1": verse(1, 1, ["علم", "كتب", "في"]),     // roots علم, كتب (في = particle, no root)
  "2:2": verse(2, 2, ["علم", "كتب", "نور"]),     // roots علم, كتب, نور
  "3:3": verse(3, 3, ["قول", "رحم"]),            // roots قول, رحم
  "4:4": verse(4, 4, ["علم"]),                   // root علم
};
const r2v = { علم: ["1:1", "2:2", "4:4"], كتب: ["1:1", "2:2"], نور: ["2:2"], قول: ["3:3"], رحم: ["3:3"] };

describe("verseProfile", () => {
  it("reports length, distinct roots, rhyme and the rarest/unique roots", () => {
    const p = verseProfile("2:2", verseData, r2v, null);
    expect(p.ref).toBe("2:2");
    expect(p.wordCount).toBe(3);
    expect(p.rootCount).toBe(3); // علم, كتب, نور
    expect(p.rhyme).toBe("ور"); // نور → last two skeleton letters
    expect(p.uniqueRoots).toEqual(["نور"]); // df 1 → occurs only here
    expect(p.rarestRoots[0]).toEqual({ root: "نور", freq: 1 });
  });
  it("excludes unrooted tokens from the root count", () => {
    const p = verseProfile("1:1", verseData, r2v, null);
    expect(p.rootCount).toBe(2); // في has no root
  });
});

describe("similarVerses", () => {
  it("ranks verses by idf-weighted shared roots, most similar first", () => {
    const sim = similarVerses("1:1", verseData, r2v);
    expect(sim[0].vk).toBe("2:2"); // shares both علم + كتب
    expect(sim[0].shared.sort()).toEqual(["علم", "كتب"].sort());
    expect(sim.map((s) => s.vk)).toContain("4:4"); // shares only علم → lower
    expect(sim.find((s) => s.vk === "2:2").score).toBeGreaterThan(sim.find((s) => s.vk === "4:4").score);
  });
  it("returns nothing for a verse with no shared roots", () => {
    expect(similarVerses("3:3", verseData, r2v)).toEqual([]); // قول/رحم occur nowhere else
  });
});
