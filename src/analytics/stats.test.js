import { describe, it, expect } from "vitest";
import { distributionBySura, collocations } from "./stats.js";

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
});
