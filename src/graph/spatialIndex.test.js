import { describe, it, expect } from "vitest";
import { buildSpatialIndex, hitTest } from "./spatialIndex.js";

const nodes = [
  { id: "a", r: 10 },
  { id: "b", r: 10 },
  { id: "c", r: 20 },
];
const positions = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, c: { x: 0, y: 300 } };

describe("spatialIndex", () => {
  it("finds the node whose disc covers the point", () => {
    const idx = buildSpatialIndex(nodes, positions);
    expect(hitTest(idx, positions, 2, 2)?.id).toBe("a");
    expect(hitTest(idx, positions, 298, 1)?.id).toBe("b");
    expect(hitTest(idx, positions, 5, 315)?.id).toBe("c"); // within r=20 (+slack)
  });

  it("returns null when the point is outside every node's radius", () => {
    const idx = buildSpatialIndex(nodes, positions);
    expect(hitTest(idx, positions, 150, 150)).toBeNull();
    expect(hitTest(idx, positions, 40, 0)).toBeNull(); // 40 > 10 + slack from 'a'
  });

  it("picks the nearest when discs overlap", () => {
    const ov = [{ id: "x", r: 30 }, { id: "y", r: 30 }];
    const pos = { x: { x: 0, y: 0 }, y: { x: 20, y: 0 } };
    const idx = buildSpatialIndex(ov, pos);
    expect(hitTest(idx, pos, 3, 0)?.id).toBe("x");
    expect(hitTest(idx, pos, 17, 0)?.id).toBe("y");
  });

  it("falls back to a node's own x/y when it has no live position", () => {
    const seeded = [{ id: "s", r: 10, x: 500, y: 500 }];
    const idx = buildSpatialIndex(seeded, {});
    expect(hitTest(idx, {}, 502, 500)?.id).toBe("s");
  });

  it("guards against bad input", () => {
    expect(hitTest(null, positions, 0, 0)).toBeNull();
    expect(hitTest(buildSpatialIndex(nodes, positions), positions, NaN, 0)).toBeNull();
  });
});
