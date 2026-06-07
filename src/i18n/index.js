import { createContext, createElement, useCallback, useContext, useEffect, useMemo } from "react";
import { STRINGS } from "./strings.js";
import { usePersistedState } from "../hooks/usePersistedState.js";

/* ═══ Lightweight i18n ═══
 *
 * A flat string table (ar / en) + a `t(key, vars)` lookup with `{var}` interpolation.
 * Arabic is the source language and the fallback: an unknown key, or a key missing in
 * the active language, falls back to Arabic, then to the raw key. The DEFAULT context
 * value resolves Arabic too — so a component rendered WITHOUT the provider (e.g. in a
 * unit test) still shows Arabic, and the toggle is purely additive. The Qur'anic text,
 * morphology data and lexicon glosses are never translated — only the app chrome is.
 */
// Western → Arabic-Indic digits (٠١٢…). `on` is the toggle so the caller decides (the
// provider derives it from language + the user's numeral preference); a bare number in
// RTL Arabic chrome usually reads ١٢٣, but some users prefer Western 123 even in Arabic.
const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicDigits(value, on) {
  const s = String(value);
  return on ? s.replace(/[0-9]/g, (d) => AR_DIGITS[+d]) : s;
}
// Back-compat helper (language-driven): Arabic-Indic when the language is Arabic.
export function localizeDigits(lang, value) { return toArabicDigits(value, lang === "ar"); }

// CLDR plural category for a count. Arabic has six (zero/one/two/few/many/other); English
// has two (one/other). Used to pick `${key}.${category}` so counted nouns agree (آية /
// آيتان / آيات / …) instead of always showing the singular.
export function plural(lang, n) {
  n = Math.abs(Number(n));
  if (lang !== "ar") return n === 1 ? "one" : "other";
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  const m = n % 100;
  if (m >= 3 && m <= 10) return "few";
  if (m >= 11 && m <= 99) return "many";
  return "other";
}

// `arabicDigits` defaults to language-driven (Arabic → Arabic-Indic) so direct callers
// (ErrorBoundary, tests) keep working; the provider passes the user's effective choice.
export function translate(lang, key, vars, arabicDigits = lang === "ar") {
  const table = STRINGS[lang] || STRINGS.ar;
  let s = table[key];
  if (s == null) s = STRINGS.ar[key];
  if (s == null) s = key;
  // Interpolated values are display text (counts, labels, refs) → localise their digits.
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(toArabicDigits(vars[k], arabicDigits));
  return s;
}

const I18nContext = createContext({
  lang: "ar", dir: "rtl",
  t: (k, v) => translate("ar", k, v),
  tn: (k, n, v) => translate("ar", `${k}.${plural("ar", n)}`, { n, ...v }),
  fmtNum: (v) => toArabicDigits(v, true),
  numerals: "auto", setNumerals: () => {},
  setLang: () => {},
});

export function useI18n() { return useContext(I18nContext); }

export function I18nProvider({ children }) {
  const [lang, setLang] = usePersistedState("qg.lang", "ar", (v, f) => (v === "ar" || v === "en" ? v : f));
  const dir = lang === "ar" ? "rtl" : "ltr";
  // Numeral system: "auto" follows the language (Arabic→Arabic-Indic, English→Western);
  // "arabic"/"western" force it. The choice only differs in Arabic (English is always
  // Western). Persisted so it survives reloads.
  const [numerals, setNumerals] = usePersistedState("qg.numerals", "auto",
    (v, f) => (v === "auto" || v === "arabic" || v === "western" ? v : f));
  const arabicDigits = numerals === "arabic" ? true : numerals === "western" ? false : lang === "ar";
  const t = useCallback((key, vars) => translate(lang, key, vars, arabicDigits), [lang, arabicDigits]);
  // Plural-aware lookup: picks `${key}.${category}` for the count and passes {n} through.
  const tn = useCallback((key, n, vars) => translate(lang, `${key}.${plural(lang, n)}`, { n, ...vars }, arabicDigits), [lang, arabicDigits]);
  // Format a bare number for the active numeral system.
  const fmtNum = useCallback((v) => toArabicDigits(v, arabicDigits), [arabicDigits]);
  // Flip the document language + direction so the whole shell mirrors RTL↔LTR.
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);
  const value = useMemo(() => ({ lang, dir, t, tn, fmtNum, numerals, setNumerals, setLang }),
    [lang, dir, t, tn, fmtNum, numerals, setNumerals, setLang]);
  // createElement (not JSX) so this stays a plain .js module — no .jsx rename + import churn.
  return createElement(I18nContext.Provider, { value }, children);
}
