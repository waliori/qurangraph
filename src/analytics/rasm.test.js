import { describe, it, expect } from "vitest";
import { norm } from "../arabic-utils.js";
import { rasmVariants, rasmProfile, rasmOrthography, orthoProfile, pleneDisplay, orthoIndexByNorm } from "./rasm.js";

// Real Uthmani tokens: إبراهيم drawn defectively (no yāʾ, al-Baqarah) and plene (with yāʾ).
const DEF = "إِبْرَٰهِۦمَ";   // 2:124, 2:125 — small superscript yāʾ ۦ, no full yāʾ
const PLENE = "إِبْرَٰهِيمَ"; // 4:125, 14:35 — full yāʾ
const SUN = "ٱلشَّمْسَ";      // a control word with a single spelling

const w = (orig, plemma) => ({ orig, norm: norm(orig), exact: norm(orig), plemma });
const verseData = {
  "2:124": { s: 2, sn: "البقرة", a: 124, words: [w(DEF, "ابراهيم"), w(SUN, "شمس")] },
  "2:125": { s: 2, sn: "البقرة", a: 125, words: [w(DEF, "ابراهيم")] },
  "4:125": { s: 4, sn: "النساء", a: 125, words: [w(PLENE, "ابراهيم")] },
  "14:35": { s: 14, sn: "ابراهيم", a: 35, words: [w(PLENE, "ابراهيم")] },
};

describe("rasmVariants", () => {
  it("detects one word drawn two ways (defective vs plene إبراهيم)", () => {
    const vs = rasmVariants(verseData);
    expect(vs).toHaveLength(1);
    const e = vs[0];
    expect(e.lemma).toBe("ابراهيم");
    expect(e.forms).toHaveLength(2);
    expect(e.total).toBe(4);
    expect(e.suraCount).toBe(3); // suras 2, 4, 14
    expect(e.forms.map((f) => f.count).reduce((a, b) => a + b, 0)).toBe(4);
    // the two drawn skeletons differ by the yāʾ
    const rasms = e.forms.map((f) => f.rasm).sort();
    expect(rasms[0]).not.toBe(rasms[1]);
  });

  it("does NOT merge two different words that share an as-read skeleton (lemma keying)", () => {
    // same four tokens, but the spellings belong to DIFFERENT lemmas → not one word's variants
    const split = {
      "2:124": { s: 2, sn: "س", a: 124, words: [w(DEF, "lemA")] },
      "2:125": { s: 2, sn: "س", a: 125, words: [w(DEF, "lemA")] },
      "4:125": { s: 4, sn: "س", a: 125, words: [w(PLENE, "lemB")] },
      "14:35": { s: 14, sn: "س", a: 35, words: [w(PLENE, "lemB")] },
    };
    expect(rasmVariants(split)).toHaveLength(0);
  });

  it("ignores words with only one spelling", () => {
    const single = { "1:1": { s: 1, sn: "س", a: 1, words: [w(SUN, "شمس"), w(SUN, "شمس")] } };
    expect(rasmVariants(single)).toHaveLength(0);
  });

  it("does NOT conflate a plural wāw-form with a singular alif-form (respecting number)", () => {
    // صَلَوَٰتِهِمْ is the PLURAL ṣalawāt — its wāw is a real glide /w/, NOT a silent seat — so it must
    // stay distinct from the singular صَلَاتِهِمْ. (The earlier blanket seat-fold wrongly merged them.)
    const PLURAL = "صَلَوَٰتِهِمْ", SINGULAR = "صَلَاتِهِمْ";
    const vd = {
      "23:9": { s: 23, sn: "المؤمنون", a: 9, words: [w(PLURAL, "صلاة")] },
      "6:92": { s: 6, sn: "الأنعام", a: 92, words: [w(SINGULAR, "صلاة")] },
    };
    expect(rasmVariants(vd)).toHaveLength(0); // two different words, not one word's two spellings
  });

  it("groups an open-tāʾ rasm with its closed-tāʾ twin as ONE word's two spellings (امرأت ↔ امرأة)", () => {
    // The muṣḥaf draws the SAME feminine noun both ways — ٱمْرَأَتُ (open tāʾ) and ٱمْرَأَةٌ (tāʾ marbūṭa).
    // pronKey folds the case-marked final tāʾ to ة so they share an as-read skeleton; the two distinct
    // DRAWN skeletons (امرات vs امراة) make it a rasm variant. (This is the classical تاءات مرسومة.)
    const OPEN = "ٱمْرَأَتُ", CLOSED = "ٱمْرَأَةٌ";
    const vd = {
      "12:30": { s: 12, sn: "يوسف", a: 30, words: [w(OPEN, "امرأة")] },
      "12:51": { s: 12, sn: "يوسف", a: 51, words: [w(CLOSED, "امرأة")] },
    };
    const vs = rasmVariants(vd);
    expect(vs).toHaveLength(1);
    expect(vs[0].forms.map((f) => f.rasm).sort()).toEqual(["امرات", "امراة"].sort());
  });

  it("does NOT fold a quiescent verbal tāʾ التأنيث (خَلَتْ stays apart from خُلَّة)", () => {
    // The verb's final ـتْ carries sukūn and has no tāʾ-marbūṭa twin — it must not merge with a ة noun,
    // even before morphology disambiguates by lemma.
    const VERB = "خَلَتْ", NOUN = "خُلَّةٌ";
    const vd = {
      "3:137": { s: 3, sn: "س", a: 137, words: [w(VERB, "خلا")] },
      "2:254": { s: 2, sn: "س", a: 254, words: [w(NOUN, "خلة")] },
    };
    expect(rasmVariants(vd)).toHaveLength(0);
  });

  it("gathers a word's spellings across PROCLITICS into one entry, cited by its bare form", () => {
    // كتاب is drawn defective كتٰب and plene كتاب; some occurrences carry و / بٱل. A rasm choice belongs
    // to the stem, so the proclitics must not split كتاب into وكتاب / بالكتاب entries — all four are one word.
    const DEF = "كِتَٰبٌ", PLENE = "كِتَابٌ", WA_DEF = "وَكِتَٰبٌ", BIL_PLENE = "بِٱلْكِتَابِ";
    const vd = {
      "1:1": { s: 1, sn: "س", a: 1, words: [w(DEF, "كِتاب")] },
      "1:2": { s: 1, sn: "س", a: 2, words: [w(PLENE, "كِتاب")] },
      "1:3": { s: 1, sn: "س", a: 3, words: [w(WA_DEF, "كِتاب")] },
      "1:4": { s: 1, sn: "س", a: 4, words: [w(BIL_PLENE, "كِتاب")] },
    };
    const vs = rasmVariants(vd);
    expect(vs).toHaveLength(1);                                              // ONE entry, not split by و/بال
    expect(vs[0].total).toBe(4);
    expect(vs[0].forms.map((f) => f.rasm).sort()).toEqual(["كتاب", "كتب"].sort());
    expect(vs[0].forms.every((f) => !/^(وَ|بِ)/.test(f.display))).toBe(true); // citation is the bare form
  });
});

describe("rasmProfile", () => {
  it("profiles the timeline, runs, switch-points and by-sūra distribution", () => {
    const id = rasmVariants(verseData)[0].id;
    const p = rasmProfile(verseData, id);
    expect(p).toBeTruthy();
    // muṣḥaf order: 2:124, 2:125 (one spelling) then 4:125, 14:35 (the other) → exactly one switch
    expect(p.timeline).toHaveLength(4);
    expect(p.switches).toHaveLength(1);
    expect(Math.max(...p.longestRun)).toBe(2); // each spelling runs twice consecutively
    expect(p.bySura).toHaveLength(3);
    // every form carries its highlighted āyāt list
    expect(p.formVerses).toHaveLength(2);
    const defForm = p.forms.findIndex((f) => f.count === 2 && f.first === "2:124");
    expect(p.formVerses[defForm].map((v) => v.vk)).toContain("2:124");
  });

  it("returns null for an unknown id", () => {
    expect(rasmProfile(verseData, "nope|nope")).toBeNull();
  });
});

describe("rasmOrthography (long-vowel rasm vs. spelled-out form)", () => {
  // Real Uthmani tokens carrying a dagger-alif (unwritten long ā).
  const SALAT = "ٱلصَّلَوٰةَ";  // wāw-seat ā → الصلاة
  const ZAKAT = "ٱلزَّكَوٰةَ";  // wāw-seat ā → الزكاة
  const KITAB = "ٱلْكِتَٰبَ";   // bare dagger (omitted alif) → الكتاب — modern writes the alif
  const NASARA = "نَصَٰرَىٰ";    // omitted alif + a maqṣūra ending → نصارى (classified by the omitted alif)
  const MUSA = "مُوسَىٰ";        // PURE alif-maqṣūra → موسى — modern keeps the ى, no difference → NOT catalogued
  const DHALIK = "ذَٰلِكَ";      // modern-defective (ذلك stays ذلك) → NOT catalogued
  const PLAIN = "بَيْتَ";        // no dagger → ignored
  const od = (orig) => ({ orig, norm: norm(orig), exact: norm(orig) });
  const vd = {
    "2:3": { s: 2, sn: "البقرة", a: 3, words: [od(SALAT), od(PLAIN)] },
    "2:43": { s: 2, sn: "البقرة", a: 43, words: [od(SALAT), od(ZAKAT)] },
    "2:2": { s: 2, sn: "البقرة", a: 2, words: [od(KITAB), od(DHALIK)] },
    "3:45": { s: 3, sn: "آل عمران", a: 45, words: [od(NASARA)] },
    "20:9": { s: 20, sn: "طه", a: 9, words: [od(MUSA)] },
  };

  it("plene-promotes the long-vowel devices", () => {
    expect(pleneDisplay(SALAT).replace(/[ًٌٍَُِّْ]/g, "")).toContain("ا"); // wāw-seat → alif
    expect(norm(pleneDisplay(SALAT))).toBe(norm("الصلاة"));
    expect(norm(pleneDisplay(ZAKAT))).toBe(norm("الزكاة"));
  });

  it("gathers a long-vowel word across PROCLITICS into one entry, cited by its bare form", () => {
    // الصلوة / بالصلوة / وصلوة all draw the one word صلوة — the proclitics must not make four entries.
    const wl = (orig, plemma) => ({ orig, norm: norm(orig), exact: norm(orig), plemma });
    const BARE = "صَلَوٰةِ", AL = "ٱلصَّلَوٰةَ", BIL = "بِٱلصَّلَوٰةِ", WAL = "وَٱلصَّلَوٰةِ";
    const vd = {
      "1:1": { s: 1, sn: "س", a: 1, words: [wl(AL, "صَلاة")] },
      "1:2": { s: 1, sn: "س", a: 2, words: [wl(BIL, "صَلاة")] },
      "1:3": { s: 1, sn: "س", a: 3, words: [wl(WAL, "صَلاة")] },
      "1:4": { s: 1, sn: "س", a: 4, words: [wl(BARE, "صَلاة")] },
    };
    const waw = rasmOrthography(vd).byCategory.find((g) => g.key === "waw");
    expect(waw.forms).toHaveLength(1);     // not four proclitic-split entries
    expect(waw.forms[0].count).toBe(4);
    expect(waw.forms[0].drawn).toBe(BARE); // citation = the proclitic-free occurrence
  });

  it("folds the wāw seat ONLY in the closed ـوٰة / ribā set", () => {
    expect(norm(pleneDisplay("ٱلْحَيَوٰةِ"))).toBe(norm("الحياة"));   // ḥayāh — no /w/, wāw-seat dropped
    expect(norm(pleneDisplay("ٱلنَّجَوٰةِ"))).toBe(norm("النجاة"));   // najāh
    expect(norm(pleneDisplay("ٱلرِّبَوٰا۟"))).toBe(norm("الربا"));    // ribā — seat + silent alif → one alif
    expect(norm(pleneDisplay("كَمِشْكَوٰةٍ"))).toBe(norm("كمشكاة")); // mishkāh
  });

  it("KEEPS a consonantal wāw — only its dagger-alif is written out (the reported bug)", () => {
    // سَمَٰوَٰت / أَزْوَٰج / وَٰحِد / أَمْوَٰل / رَوَٰسِى carry a real /w/; the old blanket fold wrongly deleted it.
    expect(norm(pleneDisplay("ٱلسَّمَٰوَٰتِ"))).toBe(norm("السماوات")); // NOT السمات
    expect(norm(pleneDisplay("أَزْوَٰجًا"))).toBe(norm("أزواجا"));      // NOT أزاجا
    expect(norm(pleneDisplay("وَٰحِدَةً"))).toBe(norm("واحدة"));        // NOT احدة
    expect(norm(pleneDisplay("أَمْوَٰلَهُمْ"))).toBe(norm("أموالهم"));   // NOT أمالهم
    // the PLURAL صَلَوَٰتِهِمْ has a real wāw (ṣalawāt) → keeps it, unlike the singular ٱلصَّلَوٰة
    expect(norm(pleneDisplay("صَلَوَٰتِهِمْ"))).toBe(norm("صلواتهم"));   // NOT صلاتهم
    const cat = rasmOrthography({ "23:9": { s: 23, sn: "س", a: 9, words: [{ orig: "صَلَوَٰتِهِمْ", norm: norm("صَلَوَٰتِهِمْ"), exact: "" }] } });
    expect(cat.byCategory.find((g) => g.key === "dagger")).toBeTruthy(); // omitted-alif, NOT wāw-seat
  });

  it("catalogues only genuine differences by device — no maqṣūra, no modern-defective words", () => {
    const o = rasmOrthography(vd);
    const cats = Object.fromEntries(o.byCategory.map((g) => [g.key, g.forms.map((f) => f.drawn)]));
    expect(Object.keys(cats).sort()).toEqual(["dagger", "waw"]); // maqṣūra is no longer a category
    expect(cats.waw.length).toBe(2);                              // صلوة, زكوة
    expect(cats.dagger).toContain(KITAB);                         // omitted alif — modern writes it
    expect(cats.dagger).toContain(NASARA);                        // mixed maqṣūra+omitted alif → dagger
    // PURE maqṣūra (موسى) and modern-defective (ذلك) and the plain word (بيت) are NOT catalogued
    expect(o.forms.some((f) => f.drawn === MUSA)).toBe(false);
    expect(o.forms.some((f) => f.drawn === DHALIK)).toBe(false);
    expect(o.forms.some((f) => f.drawn === PLAIN)).toBe(false);
  });

  it("keeps the ى of an alif-maqṣūra in the plene (modern keeps it — موسىٰ→موسى, NOT موسا)", () => {
    expect(pleneDisplay(MUSA)).toContain("ى");
    expect(pleneDisplay(MUSA)).not.toContain("ا");
    expect(norm(pleneDisplay("عَلَىٰ"))).toBe(norm("على"));   // not علا
    expect(norm(pleneDisplay("أُخْرَىٰ"))).toBe(norm("أخرى")); // not أخرا
    // a mixed word restores the medial alif but keeps the final ى
    expect(norm(pleneDisplay(NASARA))).toBe(norm("نصارى"));
  });

  it("drops modern-defective words (ذلك/هذا/إله/الرحمن) — modern leaves their ā unwritten too", () => {
    const dvd = { "1:1": { s: 1, sn: "س", a: 1, words: [
      od("ذَٰلِكَ"), od("هَٰذَا"), od("إِلَٰهَ"), od("ٱلرَّحْمَٰنِ"), od("وَلَٰكِنَّ"), od("هَٰٓؤُلَآءِ"),
      od("ٱلْكِتَٰبَ"), od("ٱلْهَٰلِكِينَ"), // these two are genuine and MUST stay
    ] } };
    const drawn = rasmOrthography(dvd).forms.map((f) => f.drawn);
    for (const w of ["ذَٰلِكَ", "هَٰذَا", "إِلَٰهَ", "ٱلرَّحْمَٰنِ", "وَلَٰكِنَّ", "هَٰٓؤُلَآءِ"]) expect(drawn).not.toContain(w);
    expect(drawn).toContain("ٱلْكِتَٰبَ");   // content word — modern writes the alif
    expect(drawn).toContain("ٱلْهَٰلِكِينَ"); // الهالكين is correct plene, not the إله family
  });

  it("profiles one form with its plene pair, by-sūra and highlighted āyāt", () => {
    const o = rasmOrthography(vd);
    const salat = o.forms.find((f) => f.drawn === SALAT);
    expect(salat.count).toBe(2); // 2:3 and 2:43
    const p = orthoProfile(vd, salat.id);
    expect(norm(p.plene)).toBe(norm("الصلاة"));
    expect(p.bySura[0]).toMatchObject({ sura: 2, count: 2 });
    expect(p.verseList.map((v) => v.vk)).toContain("2:3");
  });
});

// ── Canon reconciliation (locateEntry / reconcileCanon) ──
import { locateEntry, reconcileCanon, RASM_CANON } from "./rasmCanon.js";

describe("rasm canon reconciliation", () => {
  const RAHMAT = "رَحْمَت";        // open-tāʾ standalone (rule ḥadhf-tāʾ peculiarity)
  const WA_RAHMAT = "وَرَحْمَتُ";  // same word with a leading proclitic wāw → must still match
  const RAHMATAHU = "رَحْمَتَهُ";  // same skeleton + enclitic pronoun → must NOT match (normal Arabic)
  const A = "ٱلْأَرْضِ", B = "هَٰذَا";

  it("peels a leading proclitic but not an enclitic pronoun", () => {
    const vd = {
      "1:1": { s: 1, sn: "س", a: 1, words: [w(RAHMAT, "رحمة"), w(A, "ارض")] },
      "1:2": { s: 1, sn: "س", a: 2, words: [w(WA_RAHMAT, "رحمة")] },
      "1:3": { s: 1, sn: "س", a: 3, words: [w(RAHMATAHU, "رحمة")] },
    };
    const r = locateEntry(vd, { rasm: "رَحْمَت" });
    expect(r.found).toBe(2);                       // RAHMAT + WA_RAHMAT, not RAHMATAHU
    expect(r.verses.map((v) => v.vk)).toEqual(["1:1", "1:2"]);
    expect(r.verses[0].idx).toEqual([0]);          // highlights the right word position
  });

  it("matches a multi-word form as a contiguous run, not by its first word", () => {
    const vd = {
      "2:1": { s: 2, sn: "س", a: 1, words: [w("مَالِ", "مال"), w(B, "هذا"), w(A, "ارض")] },
      "2:2": { s: 2, sn: "س", a: 2, words: [w("مَالِ", "مال"), w(A, "ارض")] }, // مال alone → no match
    };
    const r = locateEntry(vd, { rasm: "مَالِ هَٰذَا" });
    expect(r.found).toBe(2);                        // both words of the one run in 2:1
    expect(r.verses).toHaveLength(1);
    expect(r.verses[0]).toMatchObject({ vk: "2:1", idx: [0, 1] });
  });

  it("reconciles the whole canon, attaching found-count + verses to every entry", () => {
    const vd = { "1:1": { s: 1, sn: "س", a: 1, words: [w(RAHMAT, "رحمة")] } };
    const rec = reconcileCanon(vd);
    expect(rec.rules.length).toBe(RASM_CANON.rules.length);
    let entries = 0, located = 0;
    for (const rule of rec.rules) for (const g of rule.groups) for (const e of g.entries) {
      entries++;
      expect(typeof e.found).toBe("number");
      expect(Array.isArray(e.verses)).toBe(true);
      if (e.found > 0) located++;
    }
    expect(entries).toBeGreaterThan(0);
    expect(located).toBeGreaterThan(0);            // رَحْمَت entry locates in 1:1
  });
});

// ── orthoIndexByNorm + pronunciation-aware match ──
describe("long-vowel rasm: norm index + search by pronunciation", () => {
  const KITAB = "ٱلْكِتَٰبَ", SALAT = "ٱلصَّلَوٰةَ", SAMAWAT = "ٱلسَّمَٰوَٰتِ";
  const od = (orig) => ({ orig, norm: norm(orig), exact: norm(orig) });
  const vd = {
    "1:1": { s: 1, sn: "س", a: 1, words: [od(KITAB), od(SALAT), od(SAMAWAT)] },
  };

  it("maps a word's norm to its long-vowel form id (inspector chip)", () => {
    const idx = orthoIndexByNorm(vd);
    expect(idx.get(norm(KITAB))).toMatch(/^o\|/); // resolves to an ortho form id
    expect(idx.get(norm(SALAT))).toMatch(/^o\|/);
  });

  it("finds a form by its PRONOUNCED spelling, not only the drawn rasm (سماوات → ٱلسَّمَٰوَٰت)", () => {
    const o = rasmOrthography(vd);
    const match = (q) => o.forms.filter((f) => norm(f.drawn).includes(norm(q)) || norm(f.plene).includes(norm(q)));
    expect(match("سماوات").some((f) => f.drawn === SAMAWAT)).toBe(true); // found by the spelled-out alif
    expect(match("صلاة").some((f) => f.drawn === SALAT)).toBe(true);
  });
});
