import { describe, it, expect, beforeEach } from "vitest";
import { norm, setRootMap, rootOf, rootKey, extractRoot, STOP } from "./arabic-utils.js";

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

describe("precomputed root lookup", () => {
  beforeEach(() => setRootMap({ "يتربصن": "ربص", "شهور": "شهر", "السماوات": "سمو" }));

  it("rootOf returns the mapped root or null", () => {
    expect(rootOf("شهور")).toBe("شهر");
    expect(rootOf("السماوات")).toBe("سمو");
    expect(rootOf("في")).toBe(null); // no-root token
  });
  it("rootKey returns the root, or the word itself when ungrouped", () => {
    expect(rootKey("يتربصن")).toBe("ربص");
    expect(rootKey("في")).toBe("في");
  });
  it("extractRoot normalises then looks up", () => {
    expect(extractRoot("شُهُورٌ")).toBe("شهر");
    expect(extractRoot("مِن")).toBe("من"); // ungrouped passthrough
  });
  it("setRootMap(null) clears the map safely", () => {
    setRootMap(null);
    expect(rootOf("شهور")).toBe(null);
    expect(rootKey("شهور")).toBe("شهور");
  });
});

describe("STOP", () => {
  it("contains common particles", () => {
    expect(STOP.has("في")).toBe(true);
    expect(STOP.has("من")).toBe(true);
    expect(STOP.has("شهر")).toBe(false);
  });
});
