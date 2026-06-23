import { describe, it, expect } from "vitest";
import { rhymeKey, rawiyKey, finalWord, suraRhymeScheme, rhymeMates, finalProsody, classifyFawasil } from "./rhyme.js";

describe("rhymeKey / finalWord", () => {
  it("captures ridf + rawiy for a consonant close", () => {
    expect(rhymeKey("ذلك الكتاب لا ريب فيه هدى للمتقين")).toBe("ين"); // للمتقين → …ين
    expect(rhymeKey("الحمد لله رب العالمين")).toBe("ين");
    expect(rhymeKey("بسم الله الرحمن الرحيم")).toBe("يم"); // الرحيم → يم (distinct rawiy م)
  });
  it("reads the alif-maqsura as a long-ā rhyme, not a يـ rhyme (pausal, no ى→ي fold)", () => {
    expect(rhymeKey("والنجم اذا هوى")).toBe("ا");   // هوى → ā
    expect(rhymeKey("وما ينطق عن الهوى")).toBe("ا"); // الهوى → ā
    expect(rhymeKey("علمه شديد القوى")).toBe("ا");   // القوى → ā — all three rhyme
  });
  it("keeps a consonant+ā suffix (ـها) distinct from a bare ā", () => {
    expect(rhymeKey("والشمس وضحاها")).toBe("ها"); // ضحاها → ـها (rawiy ه)
    expect(rhymeKey("والقمر اذا تلاها")).toBe("ها");
  });
  it("returns the original final word for display", () => {
    expect(finalWord("الحمد لله رب العالمين")).toBe("العالمين");
  });
  it("returns null on empty input", () => {
    expect(rhymeKey("")).toBeNull();
  });
});

describe("rawiyKey (loose, classical الروي)", () => {
  it("groups by the rhyme consonant across differing ridf vowels", () => {
    // قل هو الله احد · الله الصمد · لم يلد ولم يولد — all rawiy د though endings differ.
    expect(rawiyKey("قل هو الله احد")).toBe("د");
    expect(rawiyKey("الله الصمد")).toBe("د");
    expect(rawiyKey("لم يلد ولم يولد")).toBe("د");
  });
  it("exposes the rawiy under a ـها suffix and collapses ـى to the ā class", () => {
    expect(rawiyKey("والشمس وضحاها")).toBe("ه"); // strip wasl ا → rawiy ه
    expect(rawiyKey("والنجم اذا هوى")).toBe("ا");  // ā class
  });
});

describe("suraRhymeScheme", () => {
  const verseData = {
    "1:1": { s: 1, a: 1, text: "بسم الله الرحمن الرحيم" },
    "1:2": { s: 1, a: 2, text: "الحمد لله رب العالمين" },
    "1:3": { s: 1, a: 3, text: "الرحمن الرحيم" },
    "2:1": { s: 2, a: 1, text: "الم" },
  };
  it("orders verses by āya and tallies the dominant ending", () => {
    const { seq, scheme, total, dominant } = suraRhymeScheme(1, verseData);
    expect(total).toBe(3);
    expect(seq.map((r) => r.a)).toEqual([1, 2, 3]);
    expect(seq[0].key).toBe("يم"); // الرحيم
    expect(seq[1].key).toBe("ين"); // العالمين
    expect(dominant).toBe("يم"); // يم appears twice (1:1, 1:3) vs ين once
    expect(scheme.find((s) => s.key === "يم").count).toBe(2);
  });
});

describe("finalProsody", () => {
  it("reports CV pattern and the ridf (radf) before a consonant rawiy", () => {
    const p = finalProsody("الحمد لله رب العالمين"); // العالمين skeleton ا ل ع ا ل م ي ن
    expect(p.cv).toBe("VCCVCCVC");
    expect(p.radf).toBe(true);  // long ي directly before rawiy ن
    expect(p.tasis).toBe(false);
  });
  it("flags taʾsīs — an alif one consonant before the rawiy", () => {
    // قادر skeleton قادر → C ا C C? actually ق ا د ر: alif at -3, د at -2, ر rawiy → taʾsīs
    const p = finalProsody("ان الله على كل شيء قادر");
    expect(p.tasis).toBe(true);
  });
  it("returns null on empty input", () => { expect(finalProsody("")).toBeNull(); });
});

describe("classifyFawasil", () => {
  const verseData = {
    "1:1": { s: 1, a: 1, text: "بسم الله الرحمن الرحيم" },   // rawiy م
    "1:2": { s: 1, a: 2, text: "الرحمن الرحيم" },            // rawiy م → mutamāthil
    "1:3": { s: 1, a: 3, text: "مالك يوم الدين" },           // rawiy ن → ن,م same labial/… group? ن is in ضلنر, م in فبمو → mukhtalif
  };
  it("classifies adjacent endings and tracks the longest same-rhyme run", () => {
    const r = classifyFawasil(1, verseData);
    expect(r.total).toBe(3);
    expect(r.pairs[0].type).toBe("mutamathil"); // م = م
    expect(r.counts.mutamathil).toBe(1);
    expect(r.dominantRun).toBe(2); // 1:1–1:2 unbroken
  });
});

describe("rhymeMates", () => {
  const verseData = {
    "1:1": { s: 1, a: 1, text: "بسم الله الرحمن الرحيم" },
    "1:3": { s: 1, a: 3, text: "الرحمن الرحيم" },
    "2:2": { s: 2, a: 2, text: "ذلك الكتاب لا ريب فيه هدى للمتقين" },
  };
  it("finds verses sharing the ending, in muṣḥaf order, excluding self", () => {
    expect(rhymeMates("يم", verseData, "1:1")).toEqual(["1:3"]);
    expect(rhymeMates("ين", verseData, null)).toEqual(["2:2"]);
  });
});
