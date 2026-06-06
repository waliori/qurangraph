import { describe, it, expect } from "vitest";
import { forceLayout } from "./forceLayout.js";

function mkNodes() {
  return [
    { id: "center", r: 28, fixed: true, depth: 0 },
    { id: "w:a", r: 10, depth: 1 },
    { id: "w:b", r: 10, depth: 1 },
    { id: "v:1", r: 8, depth: 2 },
  ];
}
const links = [
  { source: "center", target: "w:a", dist: 130 },
  { source: "center", target: "w:b", dist: 130 },
  { source: "w:a", target: "v:1", dist: 95 },
];

describe("forceLayout", () => {
  it("is deterministic for identical input (no Math.random)", () => {
    const a = forceLayout(mkNodes(), links, 800, 600);
    const b = forceLayout(mkNodes(), links, 800, 600);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBeCloseTo(b[i].x, 10);
      expect(a[i].y).toBeCloseTo(b[i].y, 10);
    }
  });

  it("keeps a fixed node at the centre when it has no coords", () => {
    const nodes = forceLayout(mkNodes(), links, 800, 600);
    const c = nodes.find((n) => n.id === "center");
    expect(c.x).toBeCloseTo(400, 6);
    expect(c.y).toBeCloseTo(300, 6);
  });

  it("does not move a pinned node that already has coords", () => {
    const nodes = mkNodes().map((n) => (n.id === "w:a" ? { ...n, fixed: true, x: 123, y: 456 } : n));
    forceLayout(nodes, links, 800, 600);
    const pinned = nodes.find((n) => n.id === "w:a");
    expect(pinned.x).toBe(123);
    expect(pinned.y).toBe(456);
  });

  it("produces finite coordinates for all nodes", () => {
    const nodes = forceLayout(mkNodes(), links, 800, 600);
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});
