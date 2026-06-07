import { describe, it, expect } from "vitest";
import { buildQuadtree, repulsionForce } from "./quadtree.js";

describe("quadtree / Barnes-Hut repulsion", () => {
  it("returns zero force for an empty tree", () => {
    expect(repulsionForce(null, { x: 0, y: 0 }, 55, 200)).toEqual({ fx: 0, fy: 0 });
  });

  it("pushes a body away from a single neighbour", () => {
    const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
    const tree = buildQuadtree([a, b]);
    const { fx, fy } = repulsionForce(tree, a, 55, 200);
    expect(fx).toBeLessThan(0); // a is pushed left, away from b on its right
    expect(Math.abs(fy)).toBeCloseTo(0, 6);
  });

  it("does not repel a body from itself", () => {
    const a = { x: 5, y: 5 };
    const tree = buildQuadtree([a]);
    expect(repulsionForce(tree, a, 55, 200)).toEqual({ fx: 0, fy: 0 });
  });

  it("exerts long-range force with no distance cutoff (the old grid had one)", () => {
    // The previous grid+cutoff scheme zeroed any pair beyond ~547px. Barnes-Hut must
    // still push apart bodies far past that.
    const a = { x: 0, y: 0 }, far = { x: 5000, y: 0 };
    const tree = buildQuadtree([a, far]);
    const { fx } = repulsionForce(tree, a, 55, 200);
    expect(fx).toBeLessThan(0);
    expect(fx).not.toBe(0);
  });

  it("approximates a distant cluster by its centre of mass (force scales with count)", () => {
    const probe = { x: 0, y: 0 };
    const one = repulsionForce(buildQuadtree([probe, { x: 2000, y: 0 }]), probe, 55, 200).fx;
    // A tight far cluster of three bodies repels ~3× as hard as one (same direction).
    const three = repulsionForce(
      buildQuadtree([probe, { x: 2000, y: 0 }, { x: 2001, y: 1 }, { x: 1999, y: -1 }]),
      probe, 55, 200,
    ).fx;
    expect(three).toBeLessThan(one); // more negative = stronger leftward push
    expect(three / one).toBeGreaterThan(2.5);
  });

  it("handles coincident bodies without NaN/Infinity", () => {
    const a = { x: 10, y: 10 }, b = { x: 10, y: 10 }, c = { x: 10, y: 10 };
    const f = repulsionForce(buildQuadtree([a, b, c]), a, 55, 200);
    expect(Number.isFinite(f.fx)).toBe(true);
    expect(Number.isFinite(f.fy)).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const mk = () => [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: -50, y: 12 }, { x: 200, y: -200 }];
    const f1 = repulsionForce(buildQuadtree(mk()), { x: 0, y: 0 }, 55, 200);
    const f2 = repulsionForce(buildQuadtree(mk()), { x: 0, y: 0 }, 55, 200);
    expect(f1).toEqual(f2);
  });
});
