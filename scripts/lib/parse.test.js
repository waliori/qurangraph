import { describe, it, expect } from "vitest";
import { parseMorphologyRoot, parseMorphology, aggregateWord, collapseGeminate, matchNorm, matchRoot, parseMaqayisEntry, parseLexiconText } from "./parse.js";

describe("parseMorphologyRoot", () => {
  it("extracts ROOT when present", () => {
    expect(parseMorphologyRoot("ROOT:سمو|LEM:اسْم|M|GEN")).toBe("سمو");
    expect(parseMorphologyRoot("PN|ROOT:أله|LEM:اللَّه|GEN")).toBe("أله");
  });
  it("returns null when no root (particles/prefixes)", () => {
    expect(parseMorphologyRoot("P|PREF|LEM:ب")).toBe(null);
    expect(parseMorphologyRoot("DET|PREF|LEM:ال")).toBe(null);
  });
});

describe("parseMorphology", () => {
  it("reads root, lemma, case and agreement for a noun", () => {
    const m = parseMorphology("ROOT:سمو|LEM:اسْم|M|GEN", "N");
    expect(m.root).toBe("سمو");
    expect(m.lemma).toBe("اسْم");
    expect(m.pos).toBe("noun");
    expect(m.gcase).toBe("gen");
    expect(m.gender).toBe("m");
  });
  it("reads verb form, aspect, voice, mood and person/number", () => {
    const m = parseMorphology("IMPF|VF:1|ROOT:عبد|LEM:عَبَدَ|1P|MOOD:IND", "V");
    expect(m).toMatchObject({ root: "عبد", vf: 1, aspect: "impf", voice: "act", mood: "ind", person: 1, number: "p", pos: "verb" });
  });
  it("detects passive and higher forms", () => {
    const m = parseMorphology("PERF|VF:4|PASS|ROOT:نزل|LEM:أَنزَلَ|3MS", "V");
    expect(m).toMatchObject({ vf: 4, aspect: "perf", voice: "pass", person: 3, gender: "m", number: "s" });
  });
  it("flags proper nouns, participles and affixes", () => {
    expect(parseMorphology("PN|ROOT:أله|LEM:اللَّه|GEN", "N").pos).toBe("pn");
    expect(parseMorphology("PASS_PCPL|VF:1|ROOT:غضب|LEM:مَغْضُوب|M|GEN", "N").pos).toBe("passpcpl");
    expect(parseMorphology("P|PREF|LEM:ب", "P").pref).toBe(true);
    expect(parseMorphology("PRON|SUFF|3MP", "N").suff).toBe(true);
  });
});

describe("aggregateWord", () => {
  it("concatenates segment forms and lifts the stem's morphology", () => {
    // بِسْمِ = بِ (prefix particle) + سْمِ (noun stem carrying the root)
    const w = aggregateWord([
      { form: "بِ", features: "P|PREF|LEM:ب", posClass: "P" },
      { form: "سْمِ", features: "ROOT:سمو|LEM:اسْم|M|GEN", posClass: "N" },
    ]);
    expect(w.form).toBe("بِسْمِ");
    expect(w.root).toBe("سمو");
    expect(w.lemma).toBe("اسْم");
    expect(w.pos).toBe("noun");
    expect(w.pref).toBeUndefined(); // a word is not an affix
  });
  it("keeps verb + attached pronoun on the verb stem", () => {
    const w = aggregateWord([
      { form: "تَأْخُذُ", features: "IMPF|VF:1|ROOT:أخذ|LEM:أَخَذَ|3FS|MOOD:IND", posClass: "V" },
      { form: "هُۥ", features: "PRON|SUFF|3MS", posClass: "N" },
    ]);
    expect(w.root).toBe("أخذ");
    expect(w.aspect).toBe("impf");
    expect(w.pos).toBe("verb");
  });
});

describe("collapseGeminate", () => {
  it("collapses geminate triliterals", () => {
    expect(collapseGeminate("ربب")).toBe("رب");
    expect(collapseGeminate("مدد")).toBe("مد");
  });
  it("leaves non-geminates untouched", () => {
    expect(collapseGeminate("سمو")).toBe("سمو");
    expect(collapseGeminate("علم")).toBe("علم");
  });
});

describe("matchNorm", () => {
  it("unifies the alif/hamza family", () => {
    expect(matchNorm("أله")).toBe(matchNorm("اله"));
    expect(matchNorm("سوأ")).toBe(matchNorm("سوء"));
  });
  it("folds the final weak letter و/ي/ى", () => {
    expect(matchNorm("صلو")).toBe(matchNorm("صلى"));
    expect(matchNorm("رأي")).toBe(matchNorm("رأى"));
  });
  it("does not merge distinct strong roots", () => {
    expect(matchNorm("قول")).not.toBe(matchNorm("قيل"));
  });
});

describe("matchRoot", () => {
  const headers = new Set(["سمو", "رب", "أله", "علم", "صلى", "سوء"]);
  const normMap = new Map([...headers].map((h) => [matchNorm(h), h]));
  it("matches exactly", () => { expect(matchRoot("سمو", headers, normMap)).toBe("سمو"); });
  it("matches geminate via collapse", () => { expect(matchRoot("ربب", headers, normMap)).toBe("رب"); });
  it("matches via alif/hamza normalisation", () => { expect(matchRoot("اله", headers, normMap)).toBe("أله"); });
  it("matches weak-final via normalisation", () => {
    expect(matchRoot("صلو", headers, normMap)).toBe("صلى");
    expect(matchRoot("سوأ", headers, normMap)).toBe("سوء");
  });
  it("returns null when unmatched", () => { expect(matchRoot("زقم", headers, normMap)).toBe(null); });
});

describe("parseMaqayisEntry", () => {
  it("extracts concise + full from prose + continuation lines", () => {
    const r = parseMaqayisEntry([
      "# السين والميم والواو أصل يدل على العلو. يقال سموت، إذا علوت.",
      "~~وسما بصره: علا.",
      "# إذا نزل السماء بأرض قوم ... رعيناه", // poetry — excluded
    ]);
    expect(r.c).toBe("السين والميم والواو أصل يدل على العلو");
    expect(r.f).toContain("يقال سموت");
    expect(r.f).toContain("وسما بصره");
    expect(r.f).not.toContain("رعيناه");
  });
  it("skips page markers and strips OpenITI markup", () => {
    const r = parseMaqayisEntry([
      "# PageV03P098",
      "# الراء والحاء والميم أصل واحد ms0008 يدل على الرقة.",
    ]);
    expect(r.c).toBe("الراء والحاء والميم أصل واحد يدل على الرقة");
    expect(r.f).not.toMatch(/ms\d+/);
  });
  it("returns null with no prose", () => {
    expect(parseMaqayisEntry(["~~orphan"])).toBe(null);
  });
});

describe("parseLexiconText", () => {
  it("parses Lisān-style entries (bare root line + definition, [ * ] delimited)", () => {
    const text = [
      "######OpenITI#",
      "# أبأ",
      "# ] أبأ : الأباءة الأجمة القصب [ * ] [",
      "~~والجمع أباء عن الأصمعي",
      "# أتأ",
      "# ] أتأ : حكى أبو علي في التذكرة",
    ].join("\n");
    const e = parseLexiconText(text, "lisan");
    expect(Object.keys(e).sort()).toEqual(["أبأ", "أتأ"]);
    expect(e["أبأ"].c).toContain("الأباءة الأجمة القصب");
    expect(e["أبأ"].full).not.toContain("*"); // OCR markers cleaned
  });

  it("parses Mufradāt-style entries (# root : definition)", () => {
    const text = [
      "######OpenITI#",
      "# PageV01P006 المفردات في غريب القرآن",
      "# أبا : الأب الوالد",
      "~~ويسمى كل من كان سببا في إيجاد شيء",
      "# أبد : الأبد الدوام",
    ].join("\n");
    const e = parseLexiconText(text, "mufradat");
    expect(Object.keys(e).sort()).toEqual(["أبا", "أبد"]);
    expect(e["أبا"].c).toContain("الأب الوالد");
    expect(e["أبد"].c).toContain("الدوام");
  });
});
