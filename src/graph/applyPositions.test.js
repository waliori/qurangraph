import { describe, it, expect } from "vitest";
import { applyPositions } from "./applyPositions.js";

// Minimal SVG-element stub that records setAttribute calls.
function stub() { const attrs = {}; return { attrs, setAttribute: (k, v) => { attrs[k] = String(v); } }; }

describe("applyPositions", () => {
  it("translates node groups to their positions", () => {
    const a = stub(), b = stub();
    const reg = { nodes: new Map([["a", a], ["b", b]]), links: new Map(), loops: new Map() };
    applyPositions(reg, { a: { x: 10, y: 20 }, b: { x: -5, y: 7 } });
    expect(a.attrs.transform).toBe("translate(10,20)");
    expect(b.attrs.transform).toBe("translate(-5,7)");
  });

  it("sets link endpoints from source/target positions", () => {
    const el = stub();
    const reg = { nodes: new Map(), links: new Map([[0, { el, s: "a", t: "b" }]]), loops: new Map() };
    applyPositions(reg, { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
    expect(el.attrs).toMatchObject({ x1: "1", y1: "2", x2: "3", y2: "4" });
  });

  it("recomputes loop path data", () => {
    const el = stub();
    const reg = { nodes: new Map(), links: new Map(), loops: new Map([[0, { el, s: "a", t: "b" }]]) };
    applyPositions(reg, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
    expect(el.attrs.d).toContain("M 0 0 Q");
    expect(el.attrs.d).toContain("10 0");
  });

  it("skips elements whose endpoints are missing, without throwing", () => {
    const el = stub();
    const reg = { nodes: new Map([["x", el]]), links: new Map(), loops: new Map() };
    expect(() => applyPositions(reg, {})).not.toThrow();
    expect(el.attrs.transform).toBeUndefined();
  });
});
