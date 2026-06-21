import { describe, it, expect } from "vitest";
import { arabicSkeletons, latinSkeleton, isLatinQuery } from "./romanize.js";

describe("arabicSkeletons", () => {
  it("keeps hard consonants, drops short vowels / gutturals / bare alif", () => {
    expect(arabicSkeletons("رحمن")[0]).toBe("rhmn");
    expect(arabicSkeletons("كتب")[0]).toBe("ktb");
  });
  it("treats a word-initial و/ي as a consonant but a medial one as a (dropped) long vowel", () => {
    expect(arabicSkeletons("يوسف")[0]).toBe("ysf"); // initial ي kept, medial و dropped
    expect(arabicSkeletons("موسي")[0]).toBe("ms");  // both و and ي are medial → dropped
  });
  it("folds emphatics onto their plain partner (ص/س, ط/ت, ق/ك)", () => {
    expect(arabicSkeletons("صلح")[0]).toBe("slh");
    expect(arabicSkeletons("قلب")[0]).toBe("klb");
  });
  it("treats taa-marbuta as h (already folded by norm), so صلاة → slh ('salah')", () => {
    expect(arabicSkeletons("صلوه")[0]).toBe("slh"); // ه from a normed ة
    expect(arabicSkeletons("صلاة")[0]).toBe("slh"); // raw ة maps to h too
  });
});

describe("latinSkeleton", () => {
  it("folds digraphs and drops short vowels to the same alphabet", () => {
    expect(latinSkeleton("Rahman")).toBe("rhmn");
    expect(latinSkeleton("Yusuf")).toBe("ysf");
    expect(latinSkeleton("shaytan")).toBe("sytn"); // sh→s
    expect(latinSkeleton("khalid")).toBe("kld");   // kh→k
  });
  it("normalises c/q/x→k, p→b, v→f and strips apostrophes", () => {
    expect(latinSkeleton("Qur'an")).toBe("krn");
    expect(latinSkeleton("Iblis")).toBe("bls");
  });
});

describe("isLatinQuery", () => {
  it("is true for plain Latin, false for Arabic or mixed", () => {
    expect(isLatinQuery("rahman")).toBe(true);
    expect(isLatinQuery("الرحمن")).toBe(false);
    expect(isLatinQuery("rahman الرحمن")).toBe(false);
    expect(isLatinQuery("255")).toBe(false);
  });
});
