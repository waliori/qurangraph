import { describe, it, expect } from "vitest";
import { decodeState } from "../src/hooks/useUrlState.js";
import { appUrl, verseLink, viewLink, termLinks, verseLinks, surahLinks, compareLink, pairingLink } from "./links.js";

/* The whole point of the `ui…` links is that the APP can read them back. So every test
 * here round-trips through the app's own decoder rather than asserting on URL strings —
 * if encodeState/decodeState ever change shape, these fail instead of silently shipping
 * links that open a blank graph. */
const decode = (url) => decodeState(new URL(url).hash);

describe("UI deep links", () => {
  it("centres the graph on the verse", () => {
    const s = decode(verseLink("2:255", "root"));
    expect(s.surah).toBe(2);
    expect(s.ayah).toBe(255);
    expect(s.mode).toBe("root");
  });

  it("carries an analysis view the app can reopen", () => {
    const s = decode(viewLink({ t: "occ", k: "كتب", l: "كتب", m: "root" }, "2:2", "root"));
    expect(s.view).toEqual({ t: "occ", k: "كتب", l: "كتب", m: "root" });
    expect(s.surah).toBe(2);
    expect(s.ayah).toBe(2);
  });

  it("gives a root every lens, and anchors them all on the same āya", () => {
    const l = termLinks({ key: "كتب", label: "كتب", mode: "root" }, "2:2");
    expect(Object.keys(l)).toEqual(expect.arrayContaining([
      "ui", "ui_occurrences", "ui_distribution", "ui_graph", "ui_root_lab", "ui_expressions", "ui_construction",
    ]));
    expect(decode(l.ui_distribution).view.t).toBe("dist");
    expect(decode(l.ui_root_lab).view).toEqual({ t: "lab", r: "كتب", l: "كتب" });
    expect(decode(l.ui_graph).view).toBe(null);
    for (const url of Object.values(l)) {
      const s = decode(url);
      expect([s.surah, s.ayah]).toEqual([2, 2]);
    }
  });

  it("omits the root-only lenses for an exact term", () => {
    const l = termLinks({ key: "الصلاة", label: "ٱلصَّلَوٰة", mode: "exact" }, "2:3");
    expect(l.ui_root_lab).toBeUndefined();
    expect(decode(l.ui).view.m).toBe("exact");
  });

  it("compact mode emits only the headline link", () => {
    const l = termLinks({ key: "كتب", label: "كتب", mode: "root" }, "2:2", true);
    expect(Object.keys(l)).toEqual(["ui"]);
    expect(decode(l.ui).view.t).toBe("occ");
  });

  it("gives a verse each of its labs", () => {
    const l = verseLinks("112:1");
    expect(decode(l.ui_aya_lab).view).toEqual({ t: "aya", c: "112:1" });
    expect(decode(l.ui_context).view).toEqual({ t: "ctx", c: "112:1" });
    expect(decode(l.ui_phrases).view).toEqual({ t: "phrase", c: "112:1" });
    expect(decode(l.ui_rhyme).view).toEqual({ t: "rhyme", c: "112:1" });
    expect(decode(l.ui_surah_lab).view).toEqual({ t: "surah", s: 112 });
  });

  it("builds sūra, compare and pairing views", () => {
    expect(decode(surahLinks(36).ui).view).toEqual({ t: "surah", s: 36 });

    const cmp = decode(compareLink({ key: "علم", label: "علم", mode: "root" }, { key: "جهل", label: "جهل", mode: "root" }, "2:31")).view;
    expect(cmp.t).toBe("cmp");
    expect(cmp.a).toEqual({ k: "علم", l: "علم", m: "root" });
    expect(cmp.b).toEqual({ k: "جهل", l: "جهل", m: "root" });

    const pr = decode(pairingLink(
      [{ key: "نور", label: "نور", mode: "root" }],
      [{ key: "ظلم", label: "ظلم", mode: "root" }],
      "24:35",
    )).view;
    expect(pr.t).toBe("pairing");
    expect(pr.r).toEqual([{ k: "نور", l: "نور", m: "root" }]);
    expect(pr.c).toEqual([{ k: "ظلم", l: "ظلم", m: "root" }]);
  });

  it("puts the state in the fragment, so it never reaches a server log", () => {
    const url = new URL(appUrl({ surah: 2, ayah: 255 }));
    expect(url.search).toBe("");
    expect(url.hash.startsWith("#s=")).toBe(true);
  });

  it("returns nothing rather than a broken link for junk input", () => {
    expect(termLinks(null, "2:2")).toEqual({});
    expect(verseLinks("not-a-key")).toEqual({});
    expect(verseLink("")).toBe(null);
  });
});
