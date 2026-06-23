import { describe, it, expect } from "vitest";
import { valencyProfile } from "./valency.js";

describe("valencyProfile", () => {
  const rootView = {
    heads: [
      { head: "آمَنَ", bare: 5, preps: [{ prep: "ب", count: 171 }, { prep: "ل", count: 12 }] },
      { head: "يؤمن", bare: 2, preps: [{ prep: "ب", count: 40 }] },
    ],
    collocations: [{ noun: "الله", count: 9 }, { noun: "اليوم", count: 4 }],
  };
  it("aggregates governed prepositions across heads, ranked", () => {
    const v = valencyProfile(rootView);
    expect(v.preps[0]).toEqual({ prep: "ب", count: 211 }); // 171 + 40
    expect(v.preps[1]).toEqual({ prep: "ل", count: 12 });
    expect(v.governed).toBe(223);
    expect(v.bare).toBe(7);
  });
  it("lists direct nominal collocates with a total", () => {
    const v = valencyProfile(rootView);
    expect(v.objects[0]).toEqual({ noun: "الله", count: 9 });
    expect(v.objectTotal).toBe(13);
  });
  it("returns null for an empty/non-verb root", () => {
    expect(valencyProfile(null)).toBeNull();
    expect(valencyProfile({ heads: [], collocations: [] })).toBeNull();
  });
});
