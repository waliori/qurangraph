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

  it("makes a shared node travel to the selected word instead of its parent", () => {
    // v:s is parented to w:a but also shares w:b (a loop link in the real graph).
    const ns = [
      { id: "center", r: 28, fixed: true, x: 800, y: 550 },
      { id: "w:a", r: 10, x: 600, y: 550 },
      { id: "w:b", r: 10, x: 1000, y: 550 },
      { id: "v:s", r: 8, x: 600, y: 560 },
    ];
    const lk = [
      { source: "center", target: "w:a", dist: 160 },
      { source: "center", target: "w:b", dist: 160 },
      { source: "w:a", target: "v:s", dist: 130 },
    ];
    const sim = createSimulation(1600, 1100);
    sim.sync(ns, lk);
    sim.setSelected("w:b", new Set(["v:s"])); // select w:b; v:s is its shared āyah
    settle(sim);
    const p = sim.getPositions();
    const dB = Math.hypot(p["v:s"].x - p["w:b"].x, p["v:s"].y - p["w:b"].y);
    const dA = Math.hypot(p["v:s"].x - p["w:a"].x, p["v:s"].y - p["w:a"].y);
    expect(dB).toBeLessThan(dA); // travelled to the selection, not its parent
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
