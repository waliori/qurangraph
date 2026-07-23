// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { arrivedViaSharedLink, DIRECT_VISIT_KEY } from "./onboarding.js";

describe("arrivedViaSharedLink", () => {
  beforeEach(() => { sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("a bare URL is a direct visit, and marks the tab", () => {
    expect(arrivedViaSharedLink(false)).toBe(false);
    expect(sessionStorage.getItem(DIRECT_VISIT_KEY)).toBe("1");
  });

  it("link state on a fresh tab is a shared link", () => {
    expect(arrivedViaSharedLink(true)).toBe(true);
  });

  it("stays a shared link across reloads of the same tab", () => {
    expect(arrivedViaSharedLink(true)).toBe(true);
    expect(arrivedViaSharedLink(true)).toBe(true); // reload: still no direct marker
  });

  it("a reload after a direct visit is NOT a shared link, even though the app wrote a hash", () => {
    arrivedViaSharedLink(false);          // first boot, bare URL
    expect(arrivedViaSharedLink(true)).toBe(false); // reload with the self-written #s=…
  });

  it("does not mark the tab direct when arriving via a link", () => {
    arrivedViaSharedLink(true);
    expect(sessionStorage.getItem(DIRECT_VISIT_KEY)).toBe(null);
  });

  it("treats a hash as a shared link when sessionStorage throws (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(arrivedViaSharedLink(true)).toBe(true);
    expect(arrivedViaSharedLink(false)).toBe(false);
  });
});
