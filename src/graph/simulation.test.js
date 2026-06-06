import { describe, it, expect } from "vitest";
import { createSimulation } from "./simulation.js";

function nodes() {
  return [
    { id: "center", r: 28, fixed: true, x: 800, y: 550 },
    { id: "w:a", r: 10, x: 850, y: 560 },
    { id: "v:1", r: 8, x: 900, y: 600 },
    { id: "v:2", r: 8, x: 905, y: 605 },
  ];
}
const links = [
  { source: "center", target: "w:a", dist: 160 },
  { source: "w:a", target: "v:1", dist: 130 },
  { source: "w:a", target: "v:2", dist: 130 },
];

function settle(sim, n = 300) { sim.reheat(1); let i = 0; while (sim.step() && i++ < n); }

describe("createSimulation", () => {
  it("keeps a fixed node exactly where it was placed", () => {
    const sim = createSimulation(1600, 1100);
    sim.sync(nodes(), links, []);
    settle(sim);
    const p = sim.getPositions();
    expect(p["center"]).toEqual({ x: 800, y: 550 });
  });

  it("produces finite coordinates and comes to rest", () => {
    const sim = createSimulation(1600, 1100);
    sim.sync(nodes(), links, []);
    settle(sim);
    for (const id of ["center", "w:a", "v:1", "v:2"]) {
      expect(Number.isFinite(sim.getPositions()[id].x)).toBe(true);
      expect(Number.isFinite(sim.getPositions()[id].y)).toBe(true);
    }
    expect(sim.alpha).toBeLessThan(0.006); // decayed to rest
  });

  it("separates two siblings that start on top of each other", () => {
    const sim = createSimulation(1600, 1100);
    sim.sync(nodes(), links, []);
    settle(sim);
    const p = sim.getPositions();
    const d = Math.hypot(p["v:1"].x - p["v:2"].x, p["v:1"].y - p["v:2"].y);
    expect(d).toBeGreaterThan(20); // collision pushed them apart for legibility
  });

  it("holds a pinned node at its pinned spot while the rest move", () => {
    const sim = createSimulation(1600, 1100);
    sim.sync(nodes(), links, []);
    sim.pin("w:a", 300, 300);
    settle(sim);
    expect(sim.getPositions()["w:a"]).toEqual({ x: 300, y: 300 });
  });

  it("keeps a dropped (stuck) node fixed across a re-sync", () => {
    const sim = createSimulation(1600, 1100);
    sim.sync(nodes(), links, []);
    sim.pin("v:1", 200, 200);
    sim.stick("v:1");
    sim.sync(nodes(), links, []); // structural rebuild must preserve the user pin
    settle(sim);
    expect(sim.getPositions()["v:1"]).toEqual({ x: 200, y: 200 });
    sim.clearSticky();
    settle(sim);
    expect(sim.getPositions()["v:1"]).not.toEqual({ x: 200, y: 200 });
  });

  it("makes a shared node travel toward whichever word is selected", () => {
    // v:s is parented to w:a but also shares w:b. Words pinned so we can compare
    // where the shared āyah comes to rest depending on which one is selected.
    const base = () => [
      { id: "center", r: 28, fixed: true, x: 800, y: 550 },
      { id: "w:a", r: 10, fixed: true, x: 400, y: 550 },
      { id: "w:b", r: 10, fixed: true, x: 1200, y: 550 },
      { id: "v:s", r: 8, x: 410, y: 560 },
    ];
    const lk = [{ source: "w:a", target: "v:s", dist: 130 }];
    const runWith = (selId) => {
      const sim = createSimulation(1600, 1100);
      sim.sync(base(), lk);
      sim.setSelected(selId, new Set(["v:s"]));
      settle(sim);
      return sim.getPositions()["v:s"];
    };
    const pA = runWith("w:a"), pB = runWith("w:b");
    const dAwhenA = Math.hypot(pA.x - 400, pA.y - 550);
    const dAwhenB = Math.hypot(pB.x - 400, pB.y - 550);
    const dBwhenB = Math.hypot(pB.x - 1200, pB.y - 550);
    expect(dAwhenB).toBeGreaterThan(dAwhenA); // selecting w:b pulls it away from w:a
    expect(dBwhenB).toBeLessThan(dAwhenB);    // …and it gathers around w:b
  });

  it("repairs a NaN-positioned body instead of propagating NaN", () => {
    // Sync a node whose position is NaN (?? only catches null/undefined, so NaN
    // survives into the body). Add a coincident sibling to exercise the
    // divide-by-zero path too. After stepping, the integrator's explicit guard
    // must have snapped every body finite — the old clamp could not.
    const sim = createSimulation(1600, 1100);
    const ns = [
      { id: "center", r: 28, fixed: true, x: 800, y: 550 },
      { id: "w:a", r: 10, x: NaN, y: NaN },
      { id: "v:1", r: 8, x: 900, y: 600 },
      { id: "v:2", r: 8, x: 900, y: 600 }, // coincident with v:1
    ];
    sim.sync(ns, links, []);
    sim.reheat(1);
    for (let i = 0; i < 20; i++) sim.step();
    const p = sim.getPositions();
    for (const id of ["center", "w:a", "v:1", "v:2"]) {
      expect(Number.isFinite(p[id].x)).toBe(true);
      expect(Number.isFinite(p[id].y)).toBe(true);
    }
  });

  it("is deterministic for identical input (no Math.random)", () => {
    const a = createSimulation(1600, 1100); a.sync(nodes(), links, []); settle(a);
    const b = createSimulation(1600, 1100); b.sync(nodes(), links, []); settle(b);
    for (const id of ["w:a", "v:1", "v:2"]) {
      expect(a.getPositions()[id].x).toBeCloseTo(b.getPositions()[id].x, 9);
      expect(a.getPositions()[id].y).toBeCloseTo(b.getPositions()[id].y, 9);
    }
  });
});
