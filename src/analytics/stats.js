import { groupKey } from "../arabic-utils.js";

/* ═══ Pure Qur'an-internal statistics ═══
 *
 * No semantic inference, no external data — just counts over the corpus index.
 *   - distributionBySura: how a word/lemma/root spreads across the 114 sūrahs.
 *   - collocations:       which other content words co-occur with it WITHIN a verse
 *                         (optionally a ±window of word positions), ranked.
 */

/* The active-mode key for a word object (exact uses the precision-aware surface). */
function keyOf(w, mode) {
  return mode === "exact" ? (w.exact ?? w.norm) : groupKey(w.norm, mode);
}

/* [{ sura, name, count }] over every sūrah (zeros included) for `lookup`. */
export function distributionBySura(lookup, index, verseData, surahList) {
  const counts = {};
  for (const vk of index[lookup] || []) {
    const s = verseData[vk]?.s;
    if (s != null) counts[s] = (counts[s] || 0) + 1;
  }
  return surahList.map((s) => ({ sura: s.id, name: s.name, count: counts[s.id] || 0 }));
}

/* Words that co-occur with `lookup` inside the same verse, ranked by frequency.
 * `window` limits to ±N word positions around an occurrence (default = whole verse).
 * Stop words, and the term itself, are excluded. Returns [{ key, label, count }]. */
export function collocations(lookup, mode, index, verseData, stopSet, window = 99) {
  const tally = {};   // key → count
  const labels = {};  // key → a representative surface form
  for (const vk of index[lookup] || []) {
    const words = verseData[vk]?.words || [];
    const hits = [];
    words.forEach((w, i) => { if (keyOf(w, mode) === lookup) hits.push(i); });
    if (!hits.length) continue;
    const within = new Set();
    for (const h of hits) for (let j = Math.max(0, h - window); j <= Math.min(words.length - 1, h + window); j++) within.add(j);
    // Count each neighbour ONCE per verse (the number of shared verses), so the
    // count equals what opening the neighbour shows — not per-occurrence.
    const keysHere = new Set();
    for (const j of within) {
      const w = words[j];
      const k = keyOf(w, mode);
      if (k === lookup || (stopSet && stopSet.has(w.norm))) continue;
      keysHere.add(k);
      if (!labels[k]) labels[k] = w.orig;
    }
    for (const k of keysHere) tally[k] = (tally[k] || 0) + 1;
  }
  return Object.keys(tally)
    .map((k) => ({ key: k, label: labels[k], count: tally[k] }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
