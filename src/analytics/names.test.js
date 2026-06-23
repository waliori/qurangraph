import { describe, it, expect } from "vitest";
import { divineNames, NAMES_99 } from "./names.js";

describe("divineNames", () => {
  const r2v = { رحم: ["1:1", "1:3", "2:163"], ملك: ["1:4", "3:26"], علم: ["2:32"] };
  it("returns the full canonical list with root-family counts, canonical order", () => {
    const out = divineNames(r2v);
    expect(out.length).toBe(NAMES_99.length); // every name listed
    expect(out[0]).toMatchObject({ name: "الله", root: null, count: 0 }); // الله unmapped/unlinked
    expect(out.find((n) => n.name === "الرحمن")).toMatchObject({ root: "رحم", count: 3 });
    expect(out.find((n) => n.name === "الملك")).toMatchObject({ root: "ملك", count: 2 });
    expect(out.find((n) => n.name === "العليم")).toMatchObject({ root: "علم", count: 1 });
  });
  it("yields count 0 for an unattested root, never throwing", () => {
    expect(divineNames({}).every((n) => n.count === 0)).toBe(true);
    expect(divineNames(null).length).toBe(NAMES_99.length);
  });
  it("distinguishes the root-FAMILY count from the definite name-FORM count", () => {
    const w2v = { الرحمن: ["1:1"] };
    const out = divineNames(r2v, w2v, (nm) => nm);
    const rahman = out.find((n) => n.name === "الرحمن");
    expect(rahman.familyCount).toBe(3);
    expect(rahman.formCount).toBe(1);
    expect(rahman.count).toBe(rahman.familyCount); // count aliases family (back-compat)
    expect(out.find((n) => n.name === "الملك").formCount).toBe(0); // form absent here
  });
  it("leaves formCount null when no exact index is supplied", () => {
    expect(divineNames(r2v).every((n) => n.formCount === null)).toBe(true);
  });
});
