import { describe, it, expect } from "vitest";
import { detectLookupIntent } from "./intent.js";

describe("detectLookupIntent", () => {
  it("detects 'all verses' style lookups (en + ar)", () => {
    expect(detectLookupIntent("Show me every verse this word occurs in.")).toBe("verses");
    expect(detectLookupIntent("list all verses")).toBe("verses");
    expect(detectLookupIntent("أرني كل الآيات")).toBe("verses");
    expect(detectLookupIntent("ما مواضع هذه الكلمة؟")).toBe("verses");
  });

  it("detects distribution lookups", () => {
    expect(detectLookupIntent("what is the distribution of this word")).toBe("distribution");
    expect(detectLookupIntent("ما توزيع هذا الجذر")).toBe("distribution");
  });

  it("returns null for analytical / open questions", () => {
    expect(detectLookupIntent("what can you say about this verse")).toBeNull();
    expect(detectLookupIntent("explain the morphology of this word")).toBeNull();
    expect(detectLookupIntent("")).toBeNull();
  });
});
