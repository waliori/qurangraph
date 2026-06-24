import { useMemo, useState } from "react";
import { useI18n } from "../i18n/index.js";

/* ═══ Sūra + āya filter for cross-sūra verse lists ═══
 *
 * Any dialog that lists verses from different sūras (occurrences, search results, shared
 * phrases, pairing cells …) gets a real filter, not just a jump box: a sūra dropdown
 * (only the sūras actually present, with per-sūra counts) plus an āya box that accepts a
 * single number or a range ("5", "1-10"). Both are optional and combine.
 *
 * `filterVerseKeys` is the pure core (unit-tested); `useVerseFilter` wraps it with state
 * and the control bar a modal can drop in.
 */
export function filterVerseKeys(keys, { surah, aya }) {
  let lo = null, hi = null;
  if (aya) {
    const m = String(aya).trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (m) { lo = +m[1]; hi = m[2] ? +m[2] : +m[1]; if (lo > hi) [lo, hi] = [hi, lo]; }
  }
  if (!surah && lo == null) return keys;
  return keys.filter((k) => {
    const c = k.indexOf(":");
    const s = +k.slice(0, c), a = +k.slice(c + 1);
    if (surah && s !== surah) return false;
    if (lo != null && (a < lo || a > hi)) return false;
    return true;
  });
}

// Show the filter once a list is worth filtering (spans >1 sūra, or is long).
const MIN_TO_FILTER = 12;

export function useVerseFilter(keys, verseData) {
  const { t, fmtNum } = useI18n();
  const [surah, setSurah] = useState(0); // 0 = all
  const [aya, setAya] = useState("");

  // Sūras present in the list, with a name + count (one pass).
  const surahs = useMemo(() => {
    const m = new Map();
    for (const k of keys) {
      const s = +k.slice(0, k.indexOf(":"));
      const e = m.get(s);
      if (e) e.count++; else m.set(s, { id: s, count: 1, name: verseData?.[k]?.sn || String(s) });
    }
    return [...m.values()].sort((a, b) => a.id - b.id);
  }, [keys, verseData]);

  // Effective sūra: ignore a stale selection that's no longer in the (new) list — derived
  // during render, so no reset effect (and the <select> always shows a valid option).
  const effSurah = surah !== 0 && surahs.some((s) => s.id === surah) ? surah : 0;
  const filtered = useMemo(() => filterVerseKeys(keys, { surah: effSurah, aya }), [keys, effSurah, aya]);
  // A set of the matching keys, for callers whose list items aren't bare keys (objects with .vk).
  const matchSet = useMemo(() => new Set(filtered), [filtered]);

  const active = effSurah !== 0 || aya.trim() !== "";
  // Show whenever the list spans more than one sūra (the whole point of the filter), or is
  // long enough that an āya filter helps even within a single sūra.
  const show = surahs.length > 1 || keys.length >= MIN_TO_FILTER;
  const controls = !show ? null : (
    <div className="ag-vfilter">
      <label className="ag-vfilter-field">
        <span className="ag-vfilter-lab">{t("common.filter.surah")}</span>
        <select value={effSurah} onChange={(e) => setSurah(+e.target.value)} aria-label={t("common.filter.surah")}>
          <option value={0}>{t("common.filter.allSurahs")}</option>
          {surahs.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name} ({fmtNum(s.count)})</option>)}
        </select>
      </label>
      <label className="ag-vfilter-field ag-vfilter-aya">
        <span className="ag-vfilter-lab">{t("common.filter.aya")}</span>
        <input type="text" inputMode="numeric" value={aya} placeholder={t("common.filter.ayaPh")}
          aria-label={t("common.filter.aya")} onChange={(e) => setAya(e.target.value)} />
      </label>
      {active && (
        <button type="button" className="ag-btn ag-btn-xs" onClick={() => { setSurah(0); setAya(""); }}>
          {t("common.filter.clear")}
        </button>
      )}
      <span className="ag-vfilter-count">{active ? t("common.filter.showing", { n: fmtNum(filtered.length), total: fmtNum(keys.length) }) : t("common.filter.total", { total: fmtNum(keys.length) })}</span>
    </div>
  );

  return { filtered, matchSet, controls, filterKey: `${effSurah}:${aya}` };
}
