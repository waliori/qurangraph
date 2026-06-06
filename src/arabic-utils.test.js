import { describe, it, expect } from "vitest";
import { norm, extractRoot, STOP } from "./arabic-utils.js";

describe("norm", () => {
  it("strips diacritics to a consonantal skeleton", () => {
    expect(norm("ٱلرَّحْمَٰنِ")).toBe("الرحمن");
    expect(norm("مَالِكِ")).toBe("مالك");
  });
  it("unifies the alif family and hamza carriers", () => {
    expect(norm("أحمد")).toBe("احمد");
    expect(norm("إيمان")).toBe("ايمان");
    expect(norm("آمن")).toBe("امن");
  });
  it("folds ة→ه and ى→ي", () => {
    expect(norm("صلاة")).toBe("صلاه");
    expect(norm("موسى")).toBe("موسي");
  });
  it("drops non-Arabic characters and whitespace", () => {
    expect(norm("  word123 ")).toBe("");
    expect(norm("الله!")).toBe("الله");
  });
});

describe("extractRoot", () => {
  it("groups the same triliteral family to one root", () => {
    const r = extractRoot("شهر");
    expect(extractRoot("شهور")).toBe(r);
    expect(extractRoot("الأشهر")).toBe(r);
    expect(r).toBe("شهر");
  });
  it("is deterministic / cached", () => {
    expect(extractRoot("الكتاب")).toBe(extractRoot("كتاب"));
  });
  it("applies curated overrides for common words", () => {
    expect(extractRoot("الرحمن")).toBe("رحم");
    expect(extractRoot("الرحيم")).toBe("رحم");
    expect(extractRoot("المؤمنون")).toBe("امن");
    expect(extractRoot("السماوات")).toBe("سمو");
  });
  it("returns a non-empty string for any token", () => {
    expect(extractRoot("في").length).toBeGreaterThan(0);
  });
});

describe("STOP", () => {
  it("contains common particles", () => {
    expect(STOP.has("في")).toBe(true);
    expect(STOP.has("من")).toBe(true);
    expect(STOP.has("شهر")).toBe(false);
  });
});
