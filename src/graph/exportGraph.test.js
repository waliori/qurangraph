// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { toCsv, serializeSvg, buildConcordance } from "./exportGraph.js";

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

describe("buildConcordance (KWIC)", () => {
  const W = (s) => ({ orig: s });
  const verseWords = {
    "1:1": [W("الحمد"), W("لله"), W("رب"), W("العالمين")],
    "2:5": [W("رب"), W("اغفر"), W("لي"), W("رب")], // term twice → two rows
  };
  const meta = (k) => ({ s: +k.split(":")[0], a: +k.split(":")[1], ref: k });

  it("emits a header plus one row per occurrence, keyword centred with context", () => {
    const rows = buildConcordance(["1:1", "2:5"], (k) => verseWords[k], (w) => w.orig === "رب", meta, 2);
    expect(rows[0]).toEqual(["السورة", "الآية", "المرجع", "قبل", "الكلمة", "بعد"]);
    // 1:1 has رب once; 2:5 has it twice → 3 data rows.
    expect(rows.length).toBe(1 + 3);
    // 1:1: left = "الحمد لله", keyword = "رب", right = "العالمين"
    expect(rows[1]).toEqual([1, 1, "1:1", "الحمد لله", "رب", "العالمين"]);
    // 2:5 first رب is at index 0 → no left context; window picks the next two.
    expect(rows[2]).toEqual([2, 5, "2:5", "", "رب", "اغفر لي"]);
    // 2:5 second رب is last → no right context.
    expect(rows[3]).toEqual([2, 5, "2:5", "اغفر لي", "رب", ""]);
  });

  it("respects the context window size", () => {
    const rows = buildConcordance(["1:1"], (k) => verseWords[k], (w) => w.orig === "العالمين", meta, 1);
    expect(rows[1]).toEqual([1, 1, "1:1", "رب", "العالمين", ""]); // only 1 word of left context
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
