import { describe, it, expect } from "vitest";
import { fieldStats } from "./field.js";

const wd = (s, words) => ({ s, a: 1, sn: "س" + s, words: words.map((w) => ({ orig: w, norm: w, proot: w })) });
const verseData = {
  "1:1": wd(1, ["نور", "ظلم"]),
  "2:1": wd(2, ["نور"]),
  "2:2": { s: 2, a: 2, sn: "س2", words: [{ orig: "ظلم", norm: "ظلم", proot: "ظلم" }] },
};
const r2v = { نور: ["1:1", "2:1"], ظلم: ["1:1", "2:2"] };
const surahList = [{ id: 1, name: "س1" }, { id: 2, name: "س2" }];

describe("fieldStats", () => {
  it("aggregates a set of roots across sūras", () => {
    const f = fieldStats(["نور", "ظلم"], r2v, verseData, surahList);
    expect(f.rootCount).toBe(2);
    expect(f.totalVerses).toBe(3); // 1:1, 2:1, 2:2 (1:1 shared, counted once)
    const bySura = Object.fromEntries(f.distribution.map((d) => [d.sura, d.count]));
    expect(bySura[1]).toBe(2); // نور + ظلم both in 1:1
    expect(bySura[2]).toBe(2); // نور in 2:1, ظلم in 2:2
  });
  it("lists each root's own attestation, ignoring unknown roots", () => {
    const f = fieldStats(["نور", "غير_موجود"], r2v, verseData, surahList);
    expect(f.rootCount).toBe(1);
    expect(f.perRoot[0]).toMatchObject({ root: "نور", verses: 2 });
  });
});
