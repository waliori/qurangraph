import { describe, it, expect } from "vitest";
import { association, g2, pmi, logDice, sigTier, SIG_CRIT } from "./assoc.js";

describe("g2 (signed log-likelihood)", () => {
  it("is 0 for an independent pair and positive when attracted", () => {
    expect(g2(10, 100, 100, 1000)).toBeCloseTo(0, 6);
    expect(g2(50, 100, 100, 1000)).toBeGreaterThan(0);
  });
  it("is negative when a pair co-occurs less than chance", () => {
    expect(g2(1, 100, 100, 1000)).toBeLessThan(0);
  });
  it("is 0 for degenerate inputs", () => {
    expect(g2(0, 5, 5, 100)).toBe(0);
    expect(g2(3, 0, 5, 100)).toBe(0);
  });
});

describe("pmi", () => {
  it("is 0 at independence and positive above it", () => {
    expect(pmi(10, 100, 100, 1000)).toBeCloseTo(0, 6);
    expect(pmi(50, 100, 100, 1000)).toBeGreaterThan(0);
  });
});

describe("logDice (frequency-stable, ≤14)", () => {
  it("hits the ceiling 14 for a perfectly bound pair", () => {
    expect(logDice(50, 50, 50)).toBeCloseTo(14, 6);
  });
  it("is independent of corpus size N (only depends on k,a,b)", () => {
    expect(logDice(20, 40, 60)).toBeCloseTo(14 + Math.log2((2 * 20) / (40 + 60)), 6);
  });
  it("is 0 for a zero-joint pair (no −∞)", () => {
    expect(logDice(0, 5, 5)).toBe(0);
  });
});

describe("sigTier", () => {
  it("maps |G²| to χ²(1df) tiers 0..3", () => {
    expect(sigTier(0)).toBe(0);
    expect(sigTier(SIG_CRIT[0])).toBe(1);
    expect(sigTier(SIG_CRIT[1])).toBe(2);
    expect(sigTier(SIG_CRIT[2])).toBe(3);
    expect(sigTier(-99)).toBe(3); // uses absolute value
  });
});

describe("association (combined record)", () => {
  it("returns { pmi, ll, logdice, sig } with consistent fields", () => {
    const r = association(50, 100, 100, 1000);
    expect(r).toHaveProperty("pmi");
    expect(r).toHaveProperty("ll");
    expect(r).toHaveProperty("logdice");
    expect(r.sig).toBe(sigTier(r.ll));
  });
  it("collapses degenerate inputs to all-zero", () => {
    expect(association(0, 1, 1, 1)).toEqual({ pmi: 0, ll: 0, logdice: 0, sig: 0 });
  });
});
