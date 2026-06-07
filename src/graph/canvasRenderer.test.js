import { describe, it, expect } from "vitest";
import { drawScene } from "./canvasRenderer.js";
import { THEMES } from "../theme.js";

// A stub 2D context that records the calls drawScene makes, so we can assert it
// paints the right number of node discs (one arc per drawn node) without a real DOM.
function stubCtx() {
  const calls = { arc: 0, fillText: [], beginPath: 0, setTransform: 0 };
  return {
    calls,
    setTransform: () => { calls.setTransform++; },
    clearRect: () => {}, fillRect: () => {},
    beginPath: () => { calls.beginPath++; }, moveTo: () => {}, lineTo: () => {},
    arc: () => { calls.arc++; }, quadraticCurveTo: () => {}, closePath: () => {},
    stroke: () => {}, fill: () => {},
    fillText: (t) => { calls.fillText.push(t); },
    save: () => {}, restore: () => {}, setLineDash: () => {}, translate: () => {},
    set globalAlpha(_) {}, get globalAlpha() { return 1; },
    set strokeStyle(_) {}, set fillStyle(_) {}, set lineWidth(_) {},
    set font(_) {}, set lineCap(_) {}, set textAlign(_) {}, set textBaseline(_) {}, set direction(_) {},
  };
}

const nodes = [
  { id: "c", type: "center", label: "ٱلبقرة ١", r: 28, fixed: true, depth: 0, x: 100, y: 100, color: "#fbbf24" },
  { id: "w", type: "word", label: "نور", lookup: "نور", count: 3, r: 10, depth: 1, x: 140, y: 100 },
  { id: "far", type: "word", label: "بعيد", lookup: "بعيد", count: 2, r: 10, depth: 1, x: 9000, y: 9000 },
];
const links = [{ source: "c", target: "w", weight: 0.5 }, { source: "c", target: "far", weight: 0.5 }];
const nmap = Object.fromEntries(nodes.map((n) => [n.id, n]));
const positions = { c: { x: 100, y: 100 }, w: { x: 140, y: 100 }, far: { x: 9000, y: 9000 } };

function scene(extra = {}) {
  return {
    nodes, links, loopLinks: [], nmap, positions,
    transform: { x: 0, y: 0, k: 1 }, dims: { w: 400, h: 300 }, dpr: 1,
    T: THEMES.dark, theme: "dark", showLoops: true,
    hovered: null, selected: null, activeWordNodeIds: new Set(),
    highlightSet: null, highlightLinks: null, viewport: null, ...extra,
  };
}

describe("drawScene", () => {
  it("paints one disc per node and the word's count label", () => {
    const ctx = stubCtx();
    drawScene(ctx, scene());
    expect(ctx.calls.arc).toBe(3); // three node discs (no rings active)
    expect(ctx.calls.fillText).toContain("3"); // word count
    expect(ctx.calls.fillText).toContain("نور"); // word label
  });

  it("culls nodes outside the viewport (keeps the fixed centre)", () => {
    const ctx = stubCtx();
    drawScene(ctx, scene({ viewport: { minX: 0, minY: 0, maxX: 400, maxY: 300 } }));
    // centre + near word drawn, far word culled → 2 discs.
    expect(ctx.calls.arc).toBe(2);
    expect(ctx.calls.fillText).not.toContain("بعيد");
  });
});
