// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { logCrash, getCrashes, clearCrashes } from "./errorLog.js";

describe("errorLog", () => {
  beforeEach(() => clearCrashes());

  it("records a crash with message, source and timestamp", () => {
    logCrash(new Error("boom"), { source: "react", info: { componentStack: "<App>" } });
    const all = getCrashes();
    expect(all).toHaveLength(1);
    expect(all[0].message).toBe("boom");
    expect(all[0].source).toBe("react");
    expect(all[0].componentStack).toBe("<App>");
    expect(typeof all[0].at).toBe("string");
  });

  it("accepts a non-Error value without throwing", () => {
    logCrash("just a string", { source: "promise" });
    expect(getCrashes()[0]).toMatchObject({ message: "just a string", source: "promise" });
  });

  it("caps the ring buffer at 20 most-recent records", () => {
    for (let i = 0; i < 30; i++) logCrash(new Error(`e${i}`));
    const all = getCrashes();
    expect(all).toHaveLength(20);
    expect(all[0].message).toBe("e10"); // oldest 10 dropped
    expect(all[19].message).toBe("e29");
  });

  it("clearCrashes empties the log", () => {
    logCrash(new Error("x"));
    clearCrashes();
    expect(getCrashes()).toEqual([]);
  });
});
