import { describe, it, expect, beforeAll } from "vitest";
import { setRootMap } from "../arabic-utils.js";
import { roleAt, roleBreakdown, ROLE_AR } from "./role.js";

const LEG = {
  pos: ["", "noun", "pn", "adj", "actpcpl", "pron", "verb", "particle", "passpcpl"],
  aspect: ["", "impf", "impv", "perf"], voice: ["", "act", "pass"], mood: ["", "ind", "jus", "subj"],
  gender: ["", "m", "f"], number: ["", "s", "p", "d"], gcase: ["", "gen", "nom", "acc"],
};
const POS = (p) => LEG.pos.indexOf(p), CASE = (c) => LEG.gcase.indexOf(c);
const tup = (pos, gcase = "") => [POS(pos), 0, 0, 0, 0, 0, 0, 0, CASE(gcase), 0, 0, 1];
beforeAll(() => setRootMap({}));
const w = (orig) => ({ orig, norm: orig, exact: orig });

// شياطين الجنّ → الجنّ is muḍāf ilayh (genitive after a noun)
// خلقنا الجانّ → الجانّ is object (accusative after a verb)
// إنسٌ ولا جانٌّ → جانّ is معطوف (after و)
// يا أيها الناس → الناس follows the vocative
// خُلق الإنسانُ → الإنسان nominative (subject of passive)
// مِن نارٍ → نار مجرور بحرف
const verseData = {
  "1:1": { words: [w("شياطين"), w("الجن")] },
  "1:2": { words: [w("خلقنا"), w("الجان")] },
  "1:3": { words: [w("انس"), w("ولا"), w("جان")] },
  "1:4": { words: [w("يا"), w("ايها"), w("الناس")] },
  "1:5": { words: [w("خلق"), w("الانسان")] },
  "1:6": { words: [w("خلقه"), w("من"), w("نار")] },
};
const M = { legend: LEG, lemmas: [""], roots: [""], v: {
  "1:1": [tup("noun", "nom"), tup("noun", "gen")],
  "1:2": [tup("verb"), tup("noun", "acc")],
  "1:3": [tup("noun", "nom"), tup("particle"), tup("noun", "nom")],
  "1:4": [tup("particle"), tup("noun", "nom"), tup("noun", "nom")],
  "1:5": [tup("verb"), tup("noun", "nom")],
  "1:6": [tup("verb"), tup("particle"), tup("noun", "gen")],
} };

describe("roleAt", () => {
  it("reads muḍāf ilayh (genitive after a noun)", () => {
    expect(roleAt(M, verseData, "1:1", 1).role).toBe("mudaf_ilayh");
  });
  it("reads object (accusative after a verb)", () => {
    expect(roleAt(M, verseData, "1:2", 1)).toMatchObject({ role: "object", case: "acc" });
  });
  it("reads maʿṭūf (after a conjunction)", () => {
    expect(roleAt(M, verseData, "1:3", 2).role).toBe("atf");
  });
  it("reads منادى (after a vocative particle)", () => {
    expect(roleAt(M, verseData, "1:4", 2).role).toBe("nida");
  });
  it("reads nominative subject", () => {
    expect(roleAt(M, verseData, "1:5", 1).role).toBe("nom");
  });
  it("separates مجرور بحرف from إضافة", () => {
    expect(roleAt(M, verseData, "1:6", 2).role).toBe("jarr");
  });
  it("returns unknown without morphology", () => {
    expect(roleAt({ v: {} }, verseData, "1:1", 1).role).toBe("unknown");
  });
});

describe("roleBreakdown", () => {
  it("tallies roles across an occurrence list, ranked", () => {
    const keys = ["1:1", "1:2", "1:3"];
    const posOf = (vk) => ({ "1:1": [1], "1:2": [1], "1:3": [2] }[vk] || []);
    const b = roleBreakdown(M, verseData, keys, posOf);
    expect(b.total).toBe(3);
    const roles = b.roles.map((r) => r.role);
    expect(roles).toContain("mudaf_ilayh");
    expect(roles).toContain("object");
    expect(roles).toContain("atf");
    expect(ROLE_AR.mudaf_ilayh).toBe("مضاف إليه");
  });
});
