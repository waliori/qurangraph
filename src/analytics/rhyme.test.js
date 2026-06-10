import { describe, it, expect } from "vitest";
import { rhymeKey, finalWord, suraRhymeScheme, rhymeMates } from "./rhyme.js";

describe("rhymeKey / finalWord", () => {
  it("takes the last two skeleton letters of the final word", () => {
    expect(rhymeKey("ذلك الكتاب لا ريب فيه هدى للمتقين")).toBe("ين"); // للمتقين → …ين
    expect(rhymeKey("الحمد لله رب العالمين")).toBe("ين");
  });
  it("returns the original final word for display", () => {
    expect(finalWord("الحمد لله رب العالمين")).toBe("العالمين");
  });
  it("returns null on empty input", () => {
    expect(rhymeKey("")).toBeNull();
  });
});

describe("suraRhymeScheme", () => {
  const verseData = {
    "1:1": { s: 1, a: 1, text: "بسم الله الرحمن الرحيم" },
    "1:2": { s: 1, a: 2, text: "الحمد لله رب العالمين" },
    "1:3": { s: 1, a: 3, text: "الرحمن الرحيم" },
    "2:1": { s: 2, a: 1, text: "الم" },
  };
  it("orders verses by āya and tallies the dominant ending", () => {
    const { seq, scheme, total, dominant } = suraRhymeScheme(1, verseData);
    expect(total).toBe(3);
    expect(seq.map((r) => r.a)).toEqual([1, 2, 3]);
    expect(seq[0].key).toBe("يم"); // الرحيم
    expect(seq[1].key).toBe("ين"); // العالمين
    expect(dominant).toBe("يم"); // يم appears twice (1:1, 1:3) vs ين once
    expect(scheme.find((s) => s.key === "يم").count).toBe(2);
  });
});

describe("rhymeMates", () => {
  const verseData = {
    "1:1": { s: 1, a: 1, text: "بسم الله الرحمن الرحيم" },
    "1:3": { s: 1, a: 3, text: "الرحمن الرحيم" },
    "2:2": { s: 2, a: 2, text: "ذلك الكتاب لا ريب فيه هدى للمتقين" },
  };
  it("finds verses sharing the ending, in muṣḥaf order, excluding self", () => {
    expect(rhymeMates("يم", verseData, "1:1")).toEqual(["1:3"]);
    expect(rhymeMates("ين", verseData, null)).toEqual(["2:2"]);
  });
});
