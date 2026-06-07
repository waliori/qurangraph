// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { GraphLayer } from "./GraphLayer.jsx";
import { THEMES } from "../theme.js";

afterEach(cleanup);

// A near node (inside the viewport) and a far node (well outside it).
const nodes = [
  { id: "v:1:1", type: "center", label: "ٱلفاتحة ١", r: 28, fixed: true, depth: 0, x: 100, y: 100 },
  { id: "w:near", type: "word", label: "قريب", lookup: "قريب", count: 2, r: 10, depth: 1, x: 120, y: 120 },
  { id: "w:far", type: "word", label: "بعيد", lookup: "بعيد", count: 2, r: 10, depth: 1, x: 9000, y: 9000 },
];
const links = [{ source: "v:1:1", target: "w:near" }, { source: "v:1:1", target: "w:far" }];
const positions = { "v:1:1": { x: 100, y: 100 }, "w:near": { x: 120, y: 120 }, "w:far": { x: 9000, y: 9000 } };

function renderLayer(viewport) {
  const reg = { nodes: new Map(), links: new Map(), loops: new Map() };
  const nmap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const noop = () => {};
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svg);
  return render(
    <GraphLayer nodes={nodes} links={links} loopLinks={[]} positions={positions} nmap={nmap} reg={reg}
      viewport={viewport} highlightSet={null} highlightLinks={null} activeWordNodeIds={new Set()}
      hovered={null} selected={null} showLoops={true} T={THEMES.dark} theme="dark"
      onNodeEnter={noop} onNodeLeave={noop} onNodeClick={noop} />,
    { container: svg },
  );
}

describe("GraphLayer viewport culling", () => {
  it("renders every node when no viewport is set (small-graph fast path)", () => {
    const { container } = renderLayer(null);
    expect(container.querySelectorAll("[data-node]").length).toBe(3);
  });

  it("drops nodes outside the viewport but keeps the fixed centre", () => {
    const { container } = renderLayer({ minX: 0, minY: 0, maxX: 400, maxY: 400 });
    const ids = [...container.querySelectorAll("[data-node]")].map((el) => el.getAttribute("data-node"));
    expect(ids).toContain("v:1:1"); // centre always
    expect(ids).toContain("w:near"); // inside the rect
    expect(ids).not.toContain("w:far"); // culled
  });
});
