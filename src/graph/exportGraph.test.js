// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { toCsv, serializeSvg } from "./exportGraph.js";

describe("toCsv", () => {
  it("escapes commas, quotes and newlines; leaves plain cells", () => {
    const csv = toCsv([["a", "b"], ["plain", 'has,comma'], ['has"quote', "line\nbreak"]]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toBe('plain,"has,comma"');
    expect(lines[2]).toBe('"has""quote","line\nbreak"');
  });
  it("renders Arabic verse text unquoted when it has no separators", () => {
    expect(toCsv([["بسم الله"]])).toBe("بسم الله");
  });
});

describe("serializeSvg", () => {
  it("frames the clone to the bbox and injects a background rect", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", "translate(100,50) scale(2)");
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", "10"); c.setAttribute("cy", "20");
    g.appendChild(c); svg.appendChild(g);
    const out = serializeSvg(svg, { bbox: { x: 0, y: 0, w: 400, h: 300 }, bg: "#000" });
    expect(out).toContain('viewBox="0 0 400 300"');
    expect(out).toContain('width="400"');
    expect(out).toContain("<rect");
    expect(out).not.toContain("translate(100,50)"); // pan/zoom transform stripped
  });
});
