import { describe, it, expect } from "vitest";
import { verifyAnswer, normalizePhrase } from "./verify.js";

const refText = new Map([
  ["2:219", "يسألونك عن الخمر والميسر قل فيهما إثم كبير"],
  ["1:1", "بسم الله الرحمن الرحيم"],
]);

const typesOf = (r) => r.issues.map((i) => i.type);

describe("verifyAnswer", () => {
  it("flags a reference that doesn't exist in the muṣḥaf", () => {
    const r = verifyAnswer("As stated in 9:99, the matter is clear.", { refText });
    expect(typesOf(r)).toContain("badRef");
    expect(r.issues[0].ref).toBe("9:99");
  });

  it("flags Arabic quoted next to a reference that the verse doesn't contain (misquote)", () => {
    const r = verifyAnswer("The verse 2:219 says أمن يخرج الحي من الميت.", { refText });
    expect(typesOf(r)).toContain("misquote");
    expect(r.issues.find((i) => i.type === "misquote").ref).toBe("2:219");
  });

  it("does NOT flag a correct quote near its reference", () => {
    const r = verifyAnswer("In 2:219: عن الخمر والميسر قل فيهما.", { refText });
    expect(typesOf(r)).not.toContain("misquote");
  });

  it("flags a valid reference that wasn't in the attached context", () => {
    const r = verifyAnswer("Compare with 1:1.", { refText, allowedRefs: new Set(["2:219"]) });
    expect(typesOf(r)).toContain("offContext");
  });

  it("is clean for a grounded English answer with no refs", () => {
    const r = verifyAnswer("This root denotes reflection and considered thought.", { refText });
    expect(r.issues).toHaveLength(0);
  });

  it("ignores short Arabic prose (under the word threshold) with no nearby ref", () => {
    const r = verifyAnswer("الجذر فكر يدل على التدبر", { refText });
    expect(r.issues).toHaveLength(0);
  });
});

describe("normalizePhrase", () => {
  it("folds diacritics so quote matching is orthography-proof", () => {
    expect(normalizePhrase("الْخَمْرِ وَالْمَيْسِرِ")).toBe(normalizePhrase("الخمر والميسر"));
  });
});
