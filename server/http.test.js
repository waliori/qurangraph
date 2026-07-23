import { describe, it, expect } from "vitest";
import { createRouter, qInt, qEnum, qBool, page, toCsv, ApiError } from "./http.js";

const q = (s) => new URLSearchParams(s);

describe("router", () => {
  const r = createRouter();
  r.add("/", () => "index");
  r.add("/verses/:key", () => "one");
  r.add("/verses/:surah/:ayah", () => "two");
  r.add("/lexicons/:id/:root", () => "lex");

  it("matches literal and parameterised segments", () => {
    expect(r.match("/").route.handler()).toBe("index");
    expect(r.match("/verses/2:255").params).toEqual({ key: "2:255" });
    expect(r.match("/verses/2/255").params).toEqual({ surah: "2", ayah: "255" });
  });

  it("distinguishes patterns of different length", () => {
    expect(r.match("/verses/2:255").route.handler()).toBe("one");
    expect(r.match("/verses/2/255").route.handler()).toBe("two");
  });

  it("percent-decodes parameters, so Arabic paths arrive readable", () => {
    expect(r.match(`/lexicons/maqayis/${encodeURIComponent("علم")}`).params).toEqual({ id: "maqayis", root: "علم" });
  });

  it("returns null for an unknown path instead of a wrong match", () => {
    expect(r.match("/nope")).toBe(null);
    expect(r.match("/verses")).toBe(null);
  });
});

describe("query validation", () => {
  it("rejects non-integers and out-of-range values with a 400", () => {
    expect(() => qInt(q("limit=abc"), "limit")).toThrow(ApiError);
    expect(() => qInt(q("limit=2.5"), "limit")).toThrow(/must be an integer/);
    expect(() => qInt(q("limit=9999"), "limit", { max: 500 })).toThrow(/between/);
    expect(qInt(q(""), "limit", { def: 50 })).toBe(50);
    expect(qInt(q("limit=10"), "limit")).toBe(10);
  });

  it("rejects values outside an enum and names the alternatives", () => {
    expect(() => qEnum(q("mode=wrong"), "mode", ["exact", "root"], "exact")).toThrow(/exact, root/);
    expect(qEnum(q(""), "mode", ["exact", "root"], "exact")).toBe("exact");
  });

  it("reads the usual spellings of true", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on"]) expect(qBool(q(`x=${v}`), "x")).toBe(true);
    for (const v of ["0", "false", "no"]) expect(qBool(q(`x=${v}`), "x")).toBe(false);
    expect(qBool(q(""), "x", true)).toBe(true);
  });
});

describe("pagination", () => {
  const list = Array.from({ length: 100 }, (_, i) => i);

  it("slices and reports the whole", () => {
    const p = page(list, { limit: 10, offset: 20 }, "https://x/api/v1/roots?limit=10&offset=20");
    expect(p.items).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(p.meta).toMatchObject({ count: 10, total: 100, limit: 10, offset: 20, has_more: true });
    expect(p.links.next).toContain("offset=30");
  });

  it("has no next link on the last page", () => {
    const p = page(list, { limit: 10, offset: 95 }, "https://x/api/v1/roots");
    expect(p.meta).toMatchObject({ count: 5, has_more: false });
    expect(p.links.next).toBeUndefined();
  });

  it("handles an offset past the end", () => {
    const p = page(list, { limit: 10, offset: 500 }, "https://x/");
    expect(p.items).toEqual([]);
    expect(p.meta.has_more).toBe(false);
  });
});

describe("csv", () => {
  it("unions the columns across rows and escapes separators", () => {
    const csv = toCsv([{ root: "كتب", n: 1 }, { root: 'a"b,c', n: 2, extra: "x" }]);
    const [head, ...rows] = csv.trim().split("\n");
    expect(head).toBe("root,n,extra");
    expect(rows[0]).toBe("كتب,1,");
    expect(rows[1]).toBe('"a""b,c",2,x');
  });

  it("flattens arrays and nested objects rather than emitting [object Object]", () => {
    const csv = toCsv([{ roots: ["a", "b"], links: { ui: "u" } }]);
    expect(csv).toContain("a b");
    expect(csv).toContain('"{""ui"":""u""}"');
  });

  it("refuses a non-tabular payload instead of mangling it", () => {
    expect(() => toCsv({ term: "x" })).toThrow(/list of rows/);
    expect(() => toCsv([])).toThrow(/list of rows/);
  });
});
