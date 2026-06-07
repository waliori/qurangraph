import { describe, it, expect } from "vitest";
import { plural, localizeDigits, translate } from "./index.js";

describe("i18n plural + digits", () => {
  it("returns CLDR Arabic plural categories", () => {
    expect(plural("ar", 0)).toBe("zero");
    expect(plural("ar", 1)).toBe("one");
    expect(plural("ar", 2)).toBe("two");
    expect(plural("ar", 3)).toBe("few");
    expect(plural("ar", 10)).toBe("few");
    expect(plural("ar", 11)).toBe("many");
    expect(plural("ar", 99)).toBe("many");
    expect(plural("ar", 100)).toBe("other");
    expect(plural("ar", 228)).toBe("many"); // 228 % 100 = 28 → many
  });

  it("returns English one/other", () => {
    expect(plural("en", 1)).toBe("one");
    expect(plural("en", 2)).toBe("other");
    expect(plural("en", 0)).toBe("other");
  });

  it("localizes digits to Arabic-Indic only for ar", () => {
    expect(localizeDigits("ar", 2025)).toBe("٢٠٢٥");
    expect(localizeDigits("ar", "2:255")).toBe("٢:٢٥٥");
    expect(localizeDigits("en", 2025)).toBe("2025");
  });

  it("interpolates with localized digits via translate", () => {
    // occ.versesCount.few = "{n} آيات"; n=3 → Arabic-Indic ٣
    expect(translate("ar", "occ.versesCount.few", { n: 3 })).toBe("٣ آيات");
    expect(translate("en", "occ.versesCount.other", { n: 5 })).toBe("5 verses");
  });

  it("honors the arabicDigits override (user can force Western digits in Arabic)", () => {
    // 4th arg false → keep Western digits even though the language is Arabic.
    expect(translate("ar", "occ.versesCount.few", { n: 3 }, false)).toBe("3 آيات");
    // ...and force Arabic-Indic even in English.
    expect(translate("en", "occ.versesCount.other", { n: 5 }, true)).toBe("٥ verses");
  });
});
