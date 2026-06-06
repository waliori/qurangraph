// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import QuranGraph from "./QuranGraph.jsx";

/* Minimal corpus fixture: two surahs sharing the (non-stop) word "العالمين". */
const HAFS = [
  { id: 1, name: "الفاتحة", total_verses: 2, verses: [
    { id: 1, text: "الحمد لله رب العالمين" },
    { id: 2, text: "الرحمن الرحيم" },
  ] },
  { id: 2, name: "البقرة", total_verses: 1, verses: [
    { id: 1, text: "ذلك الكتاب العالمين" },
  ] },
];

function mockFetch() {
  return vi.fn((url) => {
    let body = {};
    if (url.includes("quran-hafs")) body = HAFS;
    else if (url.includes("roots")) body = {};            // empty root map (exact mode)
    else if (url.includes("root-meanings")) body = {};
    return Promise.resolve({ ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) });
  });
}

describe("QuranGraph", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", mockFetch());
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("loads the corpus and renders the centre verse", async () => {
    localStorage.setItem("qg.surah", JSON.stringify(1));
    localStorage.setItem("qg.ayah", JSON.stringify(1));
    render(<QuranGraph />);
    // Loading screen first, then the verse text (in the top ayah panel + centre node).
    expect(await screen.findAllByText("الحمد")).not.toHaveLength(0);
    expect(screen.getByLabelText("السورة").value).toBe("1");
  });

  it("clamps an out-of-range persisted surah to the fallback", async () => {
    localStorage.setItem("qg.surah", JSON.stringify(999)); // invalid → fallback 2
    localStorage.setItem("qg.ayah", JSON.stringify(1));
    render(<QuranGraph />);
    await screen.findByLabelText("السورة");
    expect(screen.getByLabelText("السورة").value).toBe("2");
  });

  it("expands a word when its verse-text token is clicked", async () => {
    localStorage.setItem("qg.surah", JSON.stringify(1));
    localStorage.setItem("qg.ayah", JSON.stringify(1));
    render(<QuranGraph />);
    await screen.findByLabelText("السورة");
    // node/link counter starts before any expansion
    const counter = () => screen.getByText(/عقدة/).textContent;
    const before = counter();
    // "العالمين" appears in 1:1 and 2:1 → clicking it should add the sibling verse node.
    const tokens = screen.getAllByRole("button", { name: "العالمين" });
    fireEvent.click(tokens[0]);
    expect(counter()).not.toBe(before);
  });

  it("keeps a graph node selected after clicking it", async () => {
    localStorage.setItem("qg.surah", JSON.stringify(1));
    localStorage.setItem("qg.ayah", JSON.stringify(1));
    render(<QuranGraph />);
    await screen.findByLabelText("السورة");
    // The graph word node carries a descriptive aria-label ("كلمة <word>، وردت في
    // <count> آية…"); "العالمين" occurs twice.
    fireEvent.click(screen.getByLabelText(/كلمة العالمين، وردت في 2 آية/));
    // Selection panel (with its close button) appears and stays — the node is selected.
    expect(screen.getByLabelText("إغلاق")).toBeTruthy();
  });
});
