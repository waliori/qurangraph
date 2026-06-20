import { describe, it, expect, beforeEach } from "vitest";
import { norm, normStrict, searchAlef, strongKeys, hamzaSeatKey, setRootMap, setLemmaMap, rootOf, rootKey, lemmaOf, lemmaKey, groupKey, wordGroupKey, extractRoot, STOP, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "./arabic-utils.js";

describe("norm", () => {
  it("strips diacritics to a consonantal skeleton", () => {
    expect(norm("ٱلرَّحْمَٰنِ")).toBe("الرحمن");
    expect(norm("مَالِكِ")).toBe("مالك");
  });
  it("unifies the alif family and hamza carriers", () => {
    expect(norm("أحمد")).toBe("احمد");
    expect(norm("إيمان")).toBe("ايمان");
    expect(norm("آمن")).toBe("امن");
  });
  it("folds ة→ه and ى→ي", () => {
    expect(norm("صلاة")).toBe("صلاه");
    expect(norm("موسى")).toBe("موسي");
  });
  it("drops non-Arabic characters and whitespace", () => {
    expect(norm("  word123 ")).toBe("");
    expect(norm("الله!")).toBe("الله");
  });
  it("maps Persian/Urdu keyboard look-alikes to Arabic instead of deleting them", () => {
    expect(norm("میکائیل")).toBe("ميكاييل"); // Farsi yeh U+06CC + kaf U+06A9 — was "مايل"
    expect(norm("کتاب")).toBe("كتاب");        // Farsi kaf
    expect(norm("گل")).toBe("كل");            // gaf → kaf
  });
  it("folds presentation-form ligatures via NFKC (ﻻ → لا)", () => {
    expect(norm("ﻻ")).toBe("لا");
    expect(norm("ﷲ")).toBe("الله"); // Allah ligature
  });
});

describe("forgiving search keys (imlāʾī tolerance)", () => {
  it("collapses an alif-maqṣūra-as-ā seat to a single alif (searchAlef)", () => {
    expect(searchAlef("وَمِيكَىٰلَ")).toBe("وميكال"); // ىٰ → ا, not the ميكيل that norm yields
    expect(searchAlef("مُوسَىٰ")).toBe("موسا");
    expect(searchAlef("ٱلصَّلَوٰةِ")).toBe("الصلاه"); // the existing waw-seat case still holds
  });
  it("unifies every hamza seat to a bare ء in place, length-preserving (hamzaSeatKey)", () => {
    expect(hamzaSeatKey("رؤيا")).toBe("رءيا");      // carrier ؤ → ء
    expect(hamzaSeatKey("رُءْيَا")).toBe("رءيا");     // bare ء unchanged → they meet
    expect(hamzaSeatKey("يستهزئون")).toBe("يستهزءون");
    expect(hamzaSeatKey("جِئْنَا")).toBe("جءنا");     // NOT جنا — no consonant dropped, no leak
    expect(hamzaSeatKey("ماء")).toBe("ماء");        // ء kept, never merges into ما
  });
  it("strongKeys includes the seat-unified form so a hamza variant can be suggested", () => {
    expect(strongKeys("رؤيا")).toContain("رءيا");
  });
});

describe("precomputed root lookup", () => {
  beforeEach(() => setRootMap({ "يتربصن": "ربص", "شهور": "شهر", "السماوات": "سمو" }));

  it("rootOf returns the mapped root or null", () => {
    expect(rootOf("شهور")).toBe("شهر");
    expect(rootOf("السماوات")).toBe("سمو");
    expect(rootOf("في")).toBe(null); // no-root token
  });
  it("rootKey returns the root, or the word itself when ungrouped", () => {
    expect(rootKey("يتربصن")).toBe("ربص");
    expect(rootKey("في")).toBe("في");
  });
  it("extractRoot normalises then looks up", () => {
    expect(extractRoot("شُهُورٌ")).toBe("شهر");
    expect(extractRoot("مِن")).toBe("من"); // ungrouped passthrough
  });
  it("setRootMap(null) clears the map safely", () => {
    setRootMap(null);
    expect(rootOf("شهور")).toBe(null);
    expect(rootKey("شهور")).toBe("شهور");
  });
});

describe("norm precision", () => {
  it("strict mode keeps ة / ى / hamza distinct (no folding)", () => {
    expect(normStrict("صلاة")).toBe("صلاة");      // loose folds to صلاه
    expect(normStrict("موسى")).toBe("موسى");      // loose folds to موسي
    expect(norm("صلاة", { fold: false })).toBe("صلاة");
    // alif family + diacritics are still normalised even in strict mode
    expect(normStrict("ٱلرَّحْمَٰنِ")).toBe("الرحمن");
  });
  it("loose and strict differ only on the foldable letters", () => {
    expect(norm("آية")).toBe("ايه");
    expect(normStrict("آية")).toBe("اية");
  });
});

describe("lemma lookup + groupKey", () => {
  beforeEach(() => { setRootMap({ "استغفر": "غفر", "غفور": "غفر" }); setLemmaMap({ "استغفر": "استغفر", "غفور": "غفور" }); });
  it("lemmaOf / lemmaKey mirror the root API", () => {
    expect(lemmaOf("استغفر")).toBe("استغفر");
    expect(lemmaOf("في")).toBe(null);
    expect(lemmaKey("غفور")).toBe("غفور");
    expect(lemmaKey("في")).toBe("في");
  });
  it("groupKey selects the key for the active mode", () => {
    expect(groupKey("استغفر", "exact")).toBe("استغفر");
    expect(groupKey("استغفر", "lemma")).toBe("استغفر");
    expect(groupKey("استغفر", "root")).toBe("غفر");
  });
});

describe("wordGroupKey (position-correct grouping)", () => {
  beforeEach(() => { setRootMap({ "قل": "قول" }); setLemmaMap({ "قل": "قال" }); });

  it("falls back to the voted maps when the word has no per-occurrence analysis", () => {
    const w = { orig: "قُلْ", norm: "قل", exact: "قل" };
    expect(wordGroupKey(w, "exact")).toBe("قل");
    expect(wordGroupKey(w, "root")).toBe("قول");  // voted root
    expect(wordGroupKey(w, "lemma")).toBe("قال"); // voted lemma
  });

  it("uses the word's own root/lemma when present (homograph disambiguation)", () => {
    // Same surface skeleton قل, but this occurrence is analysed as قلل, not the
    // commoner قول — so it must group under قلل rather than the voted root.
    const w = { orig: "قُلَّ", norm: "قل", exact: "قل", proot: "قلل", plemma: "قلل" };
    expect(wordGroupKey(w, "root")).toBe("قلل");
    expect(wordGroupKey(w, "lemma")).toBe("قلل");
    expect(wordGroupKey(w, "exact")).toBe("قل"); // exact is unaffected by analysis
  });

  it("exact mode prefers the precision-aware surface (w.exact), then w.norm", () => {
    expect(wordGroupKey({ norm: "صلاه", exact: "صلاة" }, "exact")).toBe("صلاة");
    expect(wordGroupKey({ norm: "صلاه" }, "exact")).toBe("صلاه");
  });
});

describe("STOP groups", () => {
  it("particles and content defaults are separate, union is the default STOP", () => {
    expect(STOP_PARTICLES.has("في")).toBe(true);
    expect(STOP_CONTENT_DEFAULT.has("الله")).toBe(true);
    expect(STOP_PARTICLES.has("الله")).toBe(false);
    expect(STOP.has("في")).toBe(true);
    expect(STOP.has("الله")).toBe(true);
    expect(STOP.has("شهر")).toBe(false);
  });
});
