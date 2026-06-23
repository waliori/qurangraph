import { describe, it, expect } from "vitest";
import { pairingMatrix, pairingPairs } from "./pairing.js";

// jinn-side × ins-side, mirroring the actual claim:
//   jinn co-occurs with ins, jinnah with nas, jann with ins — jinn never with jann.
const jinn = { label: "جنّ", keys: ["6:112", "6:128", "72:6"] };
const jann = { label: "جانّ", keys: ["55:39", "55:56"] };
const jinnah = { label: "جِنّة", keys: ["114:6", "11:119"] };
const ins = { label: "إنس", keys: ["6:112", "6:128", "72:6", "55:39"] };
const nas = { label: "ناس", keys: ["114:6", "11:119"] };

describe("pairingMatrix — asymmetric (rows × cols)", () => {
  const m = pairingMatrix([jinn, jann, jinnah], [ins, nas]);
  it("counts co-occurrences per cell", () => {
    expect(m.cells[0][0].count).toBe(3); // جنّ × إنس
    expect(m.cells[0][1].count).toBe(0); // جنّ × ناس → empty
    expect(m.cells[1][0].count).toBe(1); // جانّ × إنس (55:39)
    expect(m.cells[2][1].count).toBe(2); // جِنّة × ناس
  });
  it("keeps the intersected verse keys per cell", () => {
    expect(m.cells[0][0].keys).toEqual(["6:112", "6:128", "72:6"]);
    expect(m.cells[2][1].keys).toEqual(["11:119", "114:6"]); // muṣḥaf order
  });
  it("exposes row/col totals", () => {
    expect(m.rowTotals).toEqual([3, 2, 2]);
    expect(m.colTotals).toEqual([4, 2]);
    expect(m.symmetric).toBe(false);
  });
});

describe("pairingMatrix — symmetric square shows the zero cell", () => {
  const m = pairingMatrix([jinn, jann, jinnah]);
  it("puts each term's own count on the diagonal", () => {
    expect(m.cells[0][0].count).toBe(3);
    expect(m.cells[1][1].count).toBe(2);
  });
  it("shows جنّ × جانّ = 0 (the argument's empty cell)", () => {
    expect(m.cells[0][1].count).toBe(0);
    expect(m.cells[1][0].count).toBe(0);
  });
});

describe("pairingPairs", () => {
  it("ranks pairs and keeps empties, de-duping the symmetric mirror", () => {
    const pairs = pairingPairs(pairingMatrix([jinn, jann, jinnah]));
    expect(pairs.length).toBe(3); // C(3,2) — no diagonal, no mirror dupes
    expect(pairs.every((p) => p.count === 0)).toBe(true); // none of the three co-occur here
  });
  it("on an asymmetric grid surfaces the strongest pair first", () => {
    const pairs = pairingPairs(pairingMatrix([jinn, jann, jinnah], [ins, nas]));
    expect(pairs[0]).toMatchObject({ row: "جنّ", col: "إنس", count: 3 });
    expect(pairs.some((p) => p.count === 0)).toBe(true); // empty cells preserved
  });
});
