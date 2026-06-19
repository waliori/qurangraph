import { describe, it, expect, beforeEach } from "vitest";
import { setRootMap, setLemmaMap } from "./arabic-utils.js";
import { looseResolve } from "./search.js";

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
});
