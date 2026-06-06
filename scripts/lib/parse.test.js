import { describe, it, expect } from "vitest";
import { parseMorphologyRoot, collapseGeminate, matchNorm, matchRoot, parseMaqayisEntry } from "./parse.js";

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
