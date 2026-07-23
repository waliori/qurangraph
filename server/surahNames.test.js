import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSurahIndex, LATIN, latinKey, arabicKey } from "./surahNames.js";
import { parseVerseKey } from "./routes/corpus.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HAFS = path.join(REPO, "public", "data", "quran-hafs.json");
const HAVE_DATA = fs.existsSync(HAFS);

/* The Arabic side is derived from the corpus, so the real names are used where present;
 * the collision and safety properties are what matter and they need the true list. */
const surahList = HAVE_DATA
  ? JSON.parse(fs.readFileSync(HAFS, "utf8")).map((s) => ({ id: s.id, name: s.name }))
  : [];

describe.skipIf(!HAVE_DATA)("sūrah names", () => {
  const idx = buildSurahIndex(surahList);

  it("covers all 114 and refuses to build if any spelling is ambiguous", () => {
    // buildSurahIndex throws on a collision, so reaching here is the assertion; this
    // guards the invariant for future edits to LATIN.
    expect(Object.keys(LATIN)).toHaveLength(114);
    expect(surahList).toHaveLength(114);
    expect(idx.byKey.size).toBeGreaterThan(500);
  });

  it("every sūrah is reachable by number, by Arabic name, and by transliteration", () => {
    for (const s of surahList) {
      expect(idx.lookup(String(s.id)), `#${s.id} by number`).toBe(s.id);
      expect(idx.lookup(s.name), `#${s.id} by name ${s.name}`).toBe(s.id);
      for (const base of LATIN[s.id]) {
        expect(idx.lookup(base), `#${s.id} by "${base}"`).toBe(s.id);
        expect(idx.lookup(`al-${base}`), `#${s.id} by "al-${base}"`).toBe(s.id);
      }
    }
  });

  it("accepts the spellings people actually type", () => {
    const cases = [
      ["2", 2], ["البقرة", 2], ["بقرة", 2], ["baqarah", 2], ["Al-Baqarah", 2], ["al baqara", 2],
      ["الفاتحة", 1], ["fatiha", 1], ["آل عمران", 3], ["imran", 3],
      ["يس", 36], ["الإخلاص", 112], ["الاخلاص", 112], ["ash-shams", 91], ["an-nas", 114],
    ];
    for (const [input, want] of cases) expect(idx.lookup(input), input).toBe(want);
  });

  /* The whole reason this table exists rather than reusing the corpus romanizer, which
   * answers يوسف for "yasin", المسد for "maida" and النساء for "nas". */
  it("does not confuse the names the fuzzy romanizer gets wrong", () => {
    expect(idx.lookup("yasin")).toBe(36);      // Yā-Sīn, not Yūsuf (12)
    expect(idx.lookup("yaseen")).toBe(36);
    expect(idx.lookup("yusuf")).toBe(12);
    expect(idx.lookup("maida")).toBe(5);       // Al-Māʾida, not Al-Masad (111)
    expect(idx.lookup("masad")).toBe(111);
    expect(idx.lookup("nas")).toBe(114);       // An-Nās, not An-Nisāʾ (4)
    expect(idx.lookup("nisa")).toBe(4);
    expect(idx.lookup("nasr")).toBe(110);
  });

  it("keeps the near-miss pairs apart", () => {
    expect([idx.lookup("hajj"), idx.lookup("hijr"), idx.lookup("hujurat")]).toEqual([22, 15, 49]);
    expect([idx.lookup("naml"), idx.lookup("nahl")]).toEqual([27, 16]);
    expect([idx.lookup("alaq"), idx.lookup("ala")]).toEqual([96, 87]);
    expect([idx.lookup("qaf"), idx.lookup("quraysh")]).toEqual([50, 106]);
  });

  it("returns null rather than a guess for anything it does not know", () => {
    for (const junk of ["", "   ", "zzz", "999", "0", "115", "kitab", "al-", "42x"]) {
      expect(idx.lookup(junk), junk).toBe(null);
    }
  });

  it("suggests candidates for a typo — but only as a hint", () => {
    const near = idx.near("baqra");
    expect(near.map((n) => n.id)).toContain(2);
    expect(idx.lookup("baqra")).toBe(null);   // suggested, never returned
  });

  it("normalises input consistently", () => {
    expect(latinKey("Al-Baqarah!")).toBe("albaqarah");
    expect(arabicKey(" آل  عمران ")).toBe(arabicKey("آلعمران"));
  });
});

describe.skipIf(!HAVE_DATA)("verse keys", () => {
  const idx = buildSurahIndex(surahList);

  it("takes a number, a name or a transliteration for the sūrah half", () => {
    for (const k of ["2:255", "2/255", "2,255", "البقرة:255", "بقرة/255", "al-baqarah:255", "baqarah/255"]) {
      expect(parseVerseKey(k, idx), k).toBe("2:255");
    }
  });

  it("stays numeric-only without an index", () => {
    expect(parseVerseKey("2:255")).toBe("2:255");
    expect(() => parseVerseKey("البقرة:255")).toThrow(/not a verse key/);
  });

  it("distinguishes a malformed key from an unknown sūrah", () => {
    expect(() => parseVerseKey("banana", idx)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => parseVerseKey("2:255:1", idx)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => parseVerseKey("baqra:1", idx)).toThrow(expect.objectContaining({ status: 404 }));
  });
});
