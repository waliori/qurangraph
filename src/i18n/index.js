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
export function translate(lang, key, vars) {
  const table = STRINGS[lang] || STRINGS.ar;
  let s = table[key];
  if (s == null) s = STRINGS.ar[key];
  if (s == null) s = key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

const I18nContext = createContext({ lang: "ar", dir: "rtl", t: (k, v) => translate("ar", k, v), setLang: () => {} });

export function useI18n() { return useContext(I18nContext); }

export function I18nProvider({ children }) {
  const [lang, setLang] = usePersistedState("qg.lang", "ar", (v, f) => (v === "ar" || v === "en" ? v : f));
  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
  // Flip the document language + direction so the whole shell mirrors RTL↔LTR.
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);
  const value = useMemo(() => ({ lang, dir, t, setLang }), [lang, dir, t, setLang]);
  // createElement (not JSX) so this stays a plain .js module — no .jsx rename + import churn.
  return createElement(I18nContext.Provider, { value }, children);
}
