import { describe, it, expect, beforeEach } from "vitest";
import { setRootMap, setLemmaMap } from "./arabic-utils.js";
import { looseResolve, resolvePhrase, buildRomanIndex, romanResolve } from "./search.js";

// The جنن family: bare جن is the VERB (6:76); jinn-the-noun lives under ٱلْجِنّ (الجن).
const LEMMAS = { "جن": "جَنَّ", "الجن": "جِنّ", "جنه": "جَنَّة", "جان": "جانّ" };
const ROOTS = { "جن": "جنن", "الجن": "جنن", "جنه": "جنن", "جان": "جنن" };
const ALIAS = { "جن": "جن", "الجن": "الجن", "جنه": "جنه", "جان": "جان" };
const INDEX = {
  exact: { "جن": ["6:76"], "الجن": ["6:100", "72:1"], "جنه": ["2:265"], "جان": ["27:10"] },
  lemma: { "جَنَّ": ["6:76"], "جِنّ": ["6:100", "72:1"], "جَنَّة": ["2:265"], "جانّ": ["27:10"] },
  root: { "جنن": ["6:76", "6:100", "72:1", "2:265", "27:10"] },
};

beforeEach(() => { setRootMap(ROOTS); setLemmaMap(LEMMAS); });

describe("looseResolve", () => {
  it("surfaces jinn (جِنّ) as a candidate from a bare query that resolves to the verb", () => {
    const { direct, candidates } = looseResolve("جن", "lemma", "loose", INDEX, ALIAS);
    expect(direct.lookup).toBe("جَنَّ"); // the naive direct hit is the verb…
    const keys = candidates.map((c) => c.lookup);
    expect(keys).toContain("جِنّ");      // …but the noun is now offered as an alternative
    expect(keys).toContain("جَنَّة");
    expect(candidates[0].lookup).toBe("جِنّ"); // exact-tier (الجن→جن) ranks first, then by count
  });

  it("ranks words that ARE the query (exact) above words that merely start with it", () => {
    // جناح starts with جن but is a different word; the senses of جن itself must lead.
    const alias = { ...ALIAS, "جناح": "جناح" };
    const index = { ...INDEX, lemma: { ...INDEX.lemma, "جُناح": new Array(24).fill("x") } };
    setLemmaMap({ ...LEMMAS, "جناح": "جُناح" });
    const { candidates } = looseResolve("جن", "lemma", "loose", index, alias);
    const ji = candidates.findIndex((c) => c.lookup === "جِنّ");
    const ju = candidates.findIndex((c) => c.lookup === "جُناح");
    expect(ji).toBeGreaterThanOrEqual(0);
    expect(ju).toBeGreaterThan(ji); // جُناح (prefix-only, count 24) ranks BELOW جِنّ (exact)
    setLemmaMap(LEMMAS); // restore for other tests
  });

  it("auto-resolves an unambiguous lemma to a single candidate", () => {
    const { candidates } = looseResolve("جان", "lemma", "loose", INDEX, ALIAS);
    expect(candidates.map((c) => c.lookup)).toEqual(["جانّ"]);
  });

  it("collapses the whole family to one root in root mode", () => {
    const { candidates } = looseResolve("جن", "root", "loose", INDEX, ALIAS);
    expect(candidates.map((c) => c.lookup)).toEqual(["جنن"]);
  });

  it("returns no candidates for an absent term", () => {
    expect(looseResolve("زززز", "lemma", "loose", INDEX, ALIAS).candidates).toEqual([]);
    expect(looseResolve("ا", "lemma", "loose", INDEX, ALIAS).candidates).toEqual([]); // too short
  });

  it("a degraded (hamza-dropped) alias key never leaks into a prefix search", () => {
    // جِئْنَا (lemma جاءَ) is indexed under strong key جينا and the FUZZY key جنا. A search for
    // جن must not surface جاءَ via that degraded key — fuzzy keys resolve, they don't suggest.
    const fuzzy = { "جنا": "جينا" };
    const idx = { ...INDEX, lemma: { ...INDEX.lemma, "جاءَ": new Array(262).fill("x") } };
    setLemmaMap({ ...LEMMAS, "جينا": "جاءَ" });
    const keys = looseResolve("جن", "lemma", "loose", idx, ALIAS, fuzzy).candidates.map((c) => c.lookup);
    expect(keys).not.toContain("جاءَ"); // the leak is gone
    expect(keys).toContain("جِنّ");     // the real sense still surfaces
    setLemmaMap(LEMMAS);
  });

  it("still RESOLVES a hamza-variant query through the fuzzy tier (direct hit)", () => {
    // Query whose only bridge to a corpus form is the hamza-dropped key still resolves directly.
    const fuzzy = { "جناك": "جينك" };
    const idx = { lemma: { "جاءَ": ["27:21"] } };
    setLemmaMap({ "جينك": "جاءَ" });
    const { direct } = looseResolve("جناك", "lemma", "loose", idx, {}, fuzzy);
    expect(direct?.lookup).toBe("جاءَ");
    setLemmaMap(LEMMAS);
  });

  it("finds an affix-bound word (جبريل never bare → وجبريل / لجبريل) from its stem", () => {
    // The proper noun only ever occurs with a proclitic; peeling و/ل must surface it.
    const alias = { "وجبريل": "وجبريل", "لجبريل": "لجبريل" };
    setLemmaMap({ "وجبريل": "جِبْرِيل", "لجبريل": "جِبْرِيل" });
    const idx = { lemma: { "جِبْرِيل": ["2:97", "2:98", "66:4"] }, exact: { "وجبريل": ["2:98", "66:4"], "لجبريل": ["2:97"] } };
    const lemmaC = looseResolve("جبريل", "lemma", "loose", idx, alias).candidates.map((c) => c.lookup);
    expect(lemmaC).toContain("جِبْرِيل"); // all forms unified under the lemma
    const wordC = looseResolve("جبريل", "exact", "loose", idx, alias).candidates.map((c) => c.lookup);
    expect(wordC).toEqual(expect.arrayContaining(["وجبريل", "لجبريل"])); // both surface forms surface
    setLemmaMap(LEMMAS);
  });

  it("peels a preposition+article cluster (وبالحق → الحق → حق)", () => {
    const alias = { "وبالحق": "وبالحق" };
    setLemmaMap({ "وبالحق": "حَقّ" });
    const idx = { lemma: { "حَقّ": ["2:26"] } };
    const c = looseResolve("حق", "lemma", "loose", idx, alias).candidates.map((x) => x.lookup);
    expect(c).toContain("حَقّ");
    setLemmaMap(LEMMAS);
  });

  it("peels a 3-deep proclitic stack (وللكفرين = و + ل + ل → كفرين)", () => {
    // conjunction و + preposition لِ + the article's lām (alif elided) — three leading letters.
    const alias = { "وللكفرين": "وللكفرين" };
    setLemmaMap({ "وللكفرين": "كافِر" });
    const idx = { lemma: { "كافِر": ["2:24"] } };
    const c = looseResolve("كفرين", "lemma", "loose", idx, alias).candidates.map((x) => x.lookup);
    expect(c).toContain("كافِر");
    setLemmaMap(LEMMAS);
  });

  it("resolves an alif-maqṣūra-as-ā name from the conventional alif spelling (ميكال)", () => {
    // muṣḥaf وَمِيكَىٰلَ → norm وميكيل, but searchAlef now collapses ىٰ→ا giving وميكال, which
    // the bare alif query ميكال reaches by peeling the و. (This is the headline ميكال bug.)
    const alias = { "وميكيل": "وميكيل", "وميكال": "وميكيل" };
    setLemmaMap({ "وميكيل": "مِيكال" });
    const idx = { lemma: { "مِيكال": ["2:98"] }, exact: { "وميكيل": ["2:98"] } };
    const c = looseResolve("ميكال", "lemma", "loose", idx, alias).candidates.map((x) => x.lookup);
    expect(c).toContain("مِيكال");
    setLemmaMap(LEMMAS);
  });

  it("bridges a conventional name spelling to its Qur'anic form (ميكائيل → مِيكال)", () => {
    const alias = { "وميكيل": "وميكيل", "وميكال": "وميكيل" };
    setLemmaMap({ "وميكيل": "مِيكال" });
    const idx = { lemma: { "مِيكال": ["2:98"] } };
    const c = looseResolve("ميكائيل", "lemma", "loose", idx, alias).candidates.map((x) => x.lookup);
    expect(c).toContain("مِيكال"); // the curated NAME_VARIANTS bridge (skeletons don't overlap)
    setLemmaMap(LEMMAS);
  });

  it("bridges David's modern double-wāw spelling to the muṣḥaf form (داوود → داود)", () => {
    const alias = { "داود": "داود" }; // muṣḥaf دَاوُد → norm داود
    setLemmaMap({ "داود": "داوُد" });
    const idx = { lemma: { "داوُد": ["2:251"] } };
    const top = looseResolve("داوود", "lemma", "loose", idx, alias).candidates[0];
    expect(top.lookup).toBe("داوُد");
    expect(top.tier).toBe(3); // a clean exact bridge, not the tier-0 edit-distance fallback
    setLemmaMap(LEMMAS);
  });

  it("folds a final open-taa to taa-marbuta (التورات → التوراة)", () => {
    const alias = { "التوراه": "التوراه" };
    setLemmaMap({ "التوراه": "تَوْراة" });
    const idx = { lemma: { "تَوْراة": ["3:3"] } };
    const c = looseResolve("التورات", "lemma", "loose", idx, alias).candidates.map((x) => x.lookup);
    expect(c).toContain("تَوْراة");
    setLemmaMap(LEMMAS);
  });

  it("meets a hamza-seat variant without the drop-key leak (رؤيا → رءيا)", () => {
    // carrier query رؤيا must reach the muṣḥaf's bare-ء form رُءْيَا, length-preserving.
    const alias = { "رءيا": "رءيا" };
    setLemmaMap({ "رءيا": "رُؤْيا" });
    const idx = { lemma: { "رُؤْيا": ["12:5"] } };
    const c = looseResolve("رؤيا", "lemma", "loose", idx, alias).candidates.map((x) => x.lookup);
    expect(c).toContain("رُؤْيا");
    setLemmaMap(LEMMAS);
  });

  it("offers a near-miss via bounded edit distance only when nothing else matches", () => {
    const alias = { "ابراهيم": "ابراهيم" };
    setLemmaMap({ "ابراهيم": "إِبْرَاهِيم" });
    const idx = { lemma: { "إِبْرَاهِيم": ["2:124"] } };
    const top = looseResolve("ابراهييم", "lemma", "loose", idx, alias).candidates[0]; // doubled ي typo
    expect(top.lookup).toBe("إِبْرَاهِيم");
    expect(top.tier).toBe(0);
    expect(top.dist).toBe(1);
    // a clean exact hit must NOT be demoted to the fuzzy tier
    expect(looseResolve("ابراهيم", "lemma", "loose", idx, alias).candidates[0].tier).toBe(3);
    setLemmaMap(LEMMAS);
  });

  it("a wild typo past the edit budget still returns nothing", () => {
    const alias = { "ابراهيم": "ابراهيم" };
    setLemmaMap({ "ابراهيم": "إِبْرَاهِيم" });
    expect(looseResolve("زقتمبر", "lemma", "loose", { lemma: { "إِبْرَاهِيم": ["2:124"] } }, alias).candidates).toEqual([]);
    setLemmaMap(LEMMAS);
  });
});

describe("resolvePhrase (multi-word)", () => {
  it("intersects every token's surface forms — حبل occurs only as بِحَبْل", () => {
    const alias = { "بحبل": "بحبل", "حبل": "حبل", "الله": "الله" };
    const idx = { exact: { "بحبل": ["3:103"], "حبل": ["50:16"], "الله": ["3:103", "2:255"] }, lemma: {}, root: {} };
    const r = resolvePhrase("حبل الله", idx, alias);
    expect(r.keys).toContain("3:103");      // حبل الله — the rope of Allah
    expect(r.keys).not.toContain("50:16");  // حبل الوريد (no الله there)
  });

  it("returns null when the tokens never co-occur, or it isn't multi-word", () => {
    const alias = { "نور": "نور", "ظلمات": "ظلمات" };
    const idx = { exact: { "نور": ["24:35"], "ظلمات": ["2:17"] }, lemma: {}, root: {} };
    expect(resolvePhrase("نور ظلمات", idx, alias)).toBe(null); // disjoint
    expect(resolvePhrase("نور", idx, alias)).toBe(null);       // single token
  });

  it("separates a contiguous phrase from mere co-occurrence when verseData is given", () => {
    const alias = { "بحبل": "بحبل", "الله": "الله" };
    const idx = { exact: { "بحبل": ["3:103", "2:1"], "الله": ["3:103", "2:1"] }, lemma: {}, root: {} };
    // 3:103 has them adjacent (بِحَبْلِ ٱللَّه); 2:1 has both words but apart.
    const verseData = {
      "3:103": { words: [{ norm: "واعتصموا" }, { norm: "بحبل" }, { norm: "الله" }] },
      "2:1": { words: [{ norm: "بحبل" }, { norm: "كان" }, { norm: "الله" }] },
    };
    const r = resolvePhrase("بحبل الله", idx, alias, {}, verseData);
    expect(r.keys.sort()).toEqual(["2:1", "3:103"]); // both co-occur
    expect(r.adjacent).toEqual(["3:103"]);           // only one is the real phrase
  });
});

describe("romanResolve (Latin search)", () => {
  const ALIASR = { "الرحمن": "الرحمن", "موسي": "موسي", "كتب": "كتب" };
  const W2V = { "الرحمن": new Array(45).fill("x"), "موسي": new Array(136).fill("x"), "كتب": new Array(67).fill("x") };
  const idx = buildRomanIndex(Object.keys(W2V));

  it("resolves a romanized query to the Arabic word (de-articled prefix)", () => {
    const top = romanResolve("rahman", idx, W2V)[0];
    expect(top.lookup).toBe("الرحمن"); // skeleton rhmn matches الرحمن via the stripped article
    expect(top.roman).toBe(true);
  });
  it("matches a name whose long vowels the user spells out (musa → موسي)", () => {
    expect(romanResolve("musa", idx, W2V).map((c) => c.lookup)).toContain("موسي");
    expect(romanResolve("kitab", idx, W2V).map((c) => c.lookup)).toContain("كتب");
  });
  it("returns nothing for Arabic input — the Latin path must never run on Arabic", () => {
    expect(romanResolve("الرحمن", idx, W2V)).toEqual([]);
  });
});
