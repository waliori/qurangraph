import { describe, it, expect } from "vitest";
import {
  morphLine, serializeWord, serializeVerse, serializeGraph, serializeLexicon,
  serializeWsItem, serializeRetrieved, renderAttachable, assembleContext, estimateTokens,
  compactObject,
} from "./contextSerializers.js";

describe("compactObject", () => {
  it("renders nested analytics as readable, labelled lines", () => {
    const txt = compactObject({ root: "كتب", occurrences: 319, derivations: [{ lemma: "كِتَاب", count: 230 }, { lemma: "كَتَبَ", count: 12 }] });
    expect(txt).toContain("root: كتب");
    expect(txt).toContain("occurrences: 319");
    expect(txt).toContain("derivations: (2)");
    expect(txt).toContain("lemma=كِتَاب, count=230");
  });

  it("caps long arrays with a +N note", () => {
    const txt = compactObject({ xs: Array.from({ length: 30 }, (_, i) => i) }, { maxArray: 5 });
    expect(txt).toContain("… (+25)");
    expect(txt).not.toContain("• 6");
  });

  it("collapses pair arrays (root, similarity) to one line each", () => {
    const txt = compactObject({ neighbours: [["خشع", 0.82], ["ركع", 0.71]] });
    expect(txt).toContain("• خشع · 0.82");
  });

  it("drops null/empty fields and bounds total length", () => {
    expect(compactObject({ a: null, b: "", c: "keep" })).toBe("c=keep");
    expect(compactObject({ big: "x".repeat(5000) }, { maxChars: 100 }).length).toBeLessThanOrEqual(102);
  });
});

describe("morphLine", () => {
  it("renders compact tag=value pairs and roman verb form", () => {
    const line = morphLine({ pos: "verb", root: "سمو", lemma: "سَمَا", vf: 2, aspect: "perf", voice: "act", number: "p", gcase: "nom", precise: true });
    expect(line).toContain("pos=verb");
    expect(line).toContain("root=سمو");
    expect(line).toContain("form=II");
    expect(line).toContain("voice=act");
  });
  it("flags an uncertain reading and is empty for null", () => {
    expect(morphLine({ pos: "noun", precise: false })).toContain("(uncertain)");
    expect(morphLine(null)).toBe("");
  });
});

describe("serializeRetrieved", () => {
  const r = {
    matched: [{ norm: "الحياة", root: "حيي" }],
    related: [{ root: "دنو", via: "حيي", sim: 0.5 }],
    opposites: [{ root: "حيي", other: "موت" }],
    verses: [{ ref: "1:1", text: "الحياة والموت", reasons: ["root حيي", "↔موت"] }],
  };
  it("renders matched roots, related/opposite headers and verses with evidence tags", () => {
    const s = serializeRetrieved(r);
    expect(s).toContain("الحياة→حيي");
    expect(s).toContain("دنو≈حيي");
    expect(s).toContain("حيي↔موت");
    expect(s).toContain("1:1: الحياة والموت");
    expect(s).toContain("[root حيي, ↔موت]");
  });
  it("dispatches through renderAttachable and is empty for nothing", () => {
    expect(renderAttachable({ kind: "retrieved", payload: r })).toContain("1:1");
    expect(serializeRetrieved(null)).toBe("");
    expect(serializeRetrieved({ verses: [], matched: [] })).toBe("");
  });
});

describe("serializeWord", () => {
  it("includes label, root, lemma, count, morphology and verse text", () => {
    const s = serializeWord({
      label: "ٱلسَّمَٰوَٰت", lookup: "السموات", mode: "root", root: "سمو", lemma: "السموة", count: 14,
      verseRef: "2:255", verseText: "ٱللَّهُ لَا إِلَٰهَ إِلَّا هُوَ", morph: { pos: "noun", root: "سمو", number: "p" },
    });
    expect(s).toContain("WORD: ٱلسَّمَٰوَٰت");
    expect(s).toContain("root: سمو");
    expect(s).toContain("14 verse");
    expect(s).toContain("2:255");
    expect(s).toContain("pos=noun");
  });
});

describe("serializeVerse / serializeLexicon", () => {
  it("verse carries ref + text", () => {
    const s = serializeVerse({ ref: "1:1", surahName: "الفاتحة", text: "بِسْمِ ٱللَّهِ" });
    expect(s).toContain("VERSE 1:1");
    expect(s).toContain("الفاتحة");
    expect(s).toContain("بِسْمِ");
  });
  it("lexicon prefers full text and shows citation", () => {
    const s = serializeLexicon({ root: "سمو", lexLabel: "مقاييس اللغة", concise: "العلو", full: "العلو والارتفاع", cite: { vol: 3, page: 142 } });
    expect(s).toContain("root سمو");
    expect(s).toContain("العلو والارتفاع");
    expect(s).toContain("vol 3");
  });
});

describe("serializeGraph", () => {
  it("summarizes centre + expanded words with capped verse refs", () => {
    const s = serializeGraph({
      centerRef: "2:255", surahName: "البقرة", centerText: "…", mode: "root",
      expanded: [{ label: "سمو", count: 14, verses: ["2:255", "7:54", "13:2"] }], omitted: 5,
    });
    expect(s).toContain("GRAPH centred on 2:255");
    expect(s).toContain("سمو ×14");
    expect(s).toContain("5 link");
  });
  it("notes when nothing is expanded", () => {
    expect(serializeGraph({ centerRef: "1:1", mode: "exact", expanded: [] })).toContain("no words expanded");
  });
});

describe("serializeWsItem", () => {
  const verseData = { "2:255": { text: "ٱللَّهُ لَا إِلَٰهَ", s: 2, a: 255, sn: "البقرة" } };
  it("enriches a saved verse with its text", () => {
    const s = serializeWsItem({ type: "verse", title: "Kursi", payload: { surah: 2, ayah: 255, label: "البقرة 255" } }, { verseData });
    expect(s).toContain("SAVED (verse)");
    expect(s).toContain("ٱللَّهُ");
  });
  it("summarizes a compare item by reference", () => {
    const s = serializeWsItem({ type: "compare", payload: { A: { label: "سمو", mode: "root" }, B: { label: "أرض", mode: "root" } } });
    expect(s).toContain("سمو");
    expect(s).toContain("أرض");
  });
});

describe("assembleContext", () => {
  it("joins selected attachables and reports an estimate", () => {
    const atts = [
      { id: "a", kind: "verse", payload: { ref: "1:1", text: "بِسْمِ ٱللَّهِ" } },
      { id: "b", kind: "lexicon", payload: { root: "سمو", lexLabel: "L", concise: "العلو" } },
    ];
    const r = assembleContext(atts, {}, { maxChars: 6000 });
    expect(r.text).toContain("VERSE 1:1");
    expect(r.text).toContain("root سمو");
    expect(r.chars).toBeGreaterThan(0);
    expect(r.dropped).toBe(0);
  });
  it("drops overflow beyond the char budget but keeps at least one", () => {
    const big = "x".repeat(500);
    const atts = Array.from({ length: 10 }, (_, i) => ({ id: "v" + i, kind: "verse", payload: { ref: `1:${i}`, text: big } }));
    const r = assembleContext(atts, {}, { maxChars: 1200 });
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.text.length).toBeLessThanOrEqual(1200);
  });
  it("renderAttachable dispatches by kind", () => {
    expect(renderAttachable({ kind: "verse", payload: { ref: "1:1", text: "t" } })).toContain("VERSE 1:1");
    expect(estimateTokens(30)).toBe(10);
  });
});
