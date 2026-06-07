import { describe, it, expect } from "vitest";
import { STRINGS } from "./strings.js";

/* The English locale is a complete mirror of the Arabic source: every key must exist
 * in both, in both directions. This guards against the class of bug where a new feature
 * adds a string in one language only (which silently falls back to Arabic at runtime). */
describe("i18n string tables", () => {
  const ar = Object.keys(STRINGS.ar);
  const en = Object.keys(STRINGS.en);

  it("has English for every Arabic key", () => {
    expect(ar.filter((k) => !(k in STRINGS.en))).toEqual([]);
  });

  it("has Arabic for every English key", () => {
    expect(en.filter((k) => !(k in STRINGS.ar))).toEqual([]);
  });

  it("has no empty values", () => {
    for (const lang of ["ar", "en"]) {
      for (const [k, v] of Object.entries(STRINGS[lang])) {
        expect(v, `${lang}:${k}`).toBeTruthy();
      }
    }
  });
});
