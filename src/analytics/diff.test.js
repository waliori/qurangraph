import { describe, it, expect } from "vitest";
import { alignWords, verseDiff } from "./diff.js";

const w = (s) => ({ orig: s, norm: s });
const verse = (toks) => ({ words: toks.map(w) });

describe("alignWords", () => {
  it("marks shared tokens same and a one-word swap as del+ins", () => {
    // … فكلوا منها … vs … وكلوا منها … and ادخلوا vs اسكنوا
    const a = ["وقلنا", "ادخلوا", "القريه", "فكلوا"].map(w);
    const b = ["وقلنا", "اسكنوا", "القريه", "وكلوا"].map(w);
    const ops = alignWords(a, b);
    const same = ops.filter((o) => o.type === "same").map((o) => o.a.orig);
    expect(same).toEqual(["وقلنا", "القريه"]);
    expect(ops.some((o) => o.type === "del" && o.a.orig === "ادخلوا")).toBe(true);
    expect(ops.some((o) => o.type === "ins" && o.b.orig === "اسكنوا")).toBe(true);
  });
});

describe("verseDiff", () => {
  const vd = {
    "2:58": verse(["وادخلوا", "الباب", "سجدا", "وقولوا", "حطه"]),
    "7:161": verse(["وادخلوا", "الباب", "سجدا", "وقولوا", "حطه"]), // identical skeleton
    "x:1": verse(["وادخلوا", "الباب", "ركعا"]),
  };
  it("flags identical skeletons", () => {
    const d = verseDiff("2:58", "7:161", vd);
    expect(d.identical).toBe(true);
    expect(d.ratio).toBe(1);
  });
  it("computes the change set and ratio for a partial match", () => {
    const d = verseDiff("2:58", "x:1", vd);
    expect(d.identical).toBe(false);
    expect(d.same).toBe(2); // وادخلوا، الباب
    expect(d.ratio).toBeLessThan(1);
  });
  it("returns null on a missing verse", () => {
    expect(verseDiff("2:58", "9:9", vd)).toBeNull();
  });
});
