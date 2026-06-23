import { wordGroupKey } from "../arabic-utils.js";
import { association } from "./assoc.js";

export { association } from "./assoc.js";

/* ═══ Pure Qur'an-internal statistics ═══
 *
 * No semantic inference, no external data — just counts over the corpus index.
 *   - distributionBySura: how a word/lemma/root spreads across the 114 sūrahs.
 *   - collocations:       which other content words co-occur with it WITHIN a verse
 *                         (optionally a ±window of word positions), ranked.
 */

/* The active-mode key for a word object (exact uses the precision-aware surface;
 * root/lemma use the word's position-correct analysis when morphology is loaded). */
const keyOf = wordGroupKey;

/* [{ sura, name, count }] over every sūrah (zeros included) for `lookup`.
 *
 * `count` is TRUE TOKEN FREQUENCY — the number of times the term occurs, so a word
 * appearing 3× in one āyah counts 3, not 1. Counting needs the grouping `mode` to
 * recognise each occurrence (exact surface / lemma / root). When `mode` is omitted
 * we still count occurrences via the default exact key, so callers that don't pass a
 * mode get token frequency rather than the old (misleading) verse/document frequency. */
export function distributionBySura(lookup, index, verseData, surahList, mode) {
  const counts = {};
  for (const vk of index[lookup] || []) {
    const v = verseData[vk];
    if (!v || v.s == null) continue;
    // Tally every matching token in the verse, not just the verse once.
    let occ = 0;
    for (const w of v.words || []) if (keyOf(w, mode) === lookup) occ++;
    counts[v.s] = (counts[v.s] || 0) + (occ || 1); // ≥1: a verse in the index always has the term
  }
  return surahList.map((s) => ({ sura: s.id, name: s.name, count: counts[s.id] || 0 }));
}

/* `association(k, a, b, N)` (the standard 2×2 contingency measure over verses)
 * now lives in ./assoc.js so the runtime and the offline build scripts share one
 * definition. It returns { pmi, ll, logdice, sig } — PMI, signed Dunning G²,
 * frequency-stable Log-Dice, and a significance tier (0..3). Re-exported above. */

/* Token-frequency of every grouping key in the corpus, memoised per (verseData, mode):
 * key → number of TOKENS with that key, plus `_N` = total tokens. The token model for
 * windowed collocation needs these corpus-wide marginals. */
const tokFreqCache = new WeakMap();
function tokenFreq(verseData, mode) {
  let byMode = tokFreqCache.get(verseData);
  if (!byMode) tokFreqCache.set(verseData, (byMode = new Map()));
  const mk = mode || "exact";
  let m = byMode.get(mk);
  if (m) return m;
  m = new Map();
  let total = 0;
  for (const vk in verseData) for (const w of verseData[vk].words || []) {
    const k = keyOf(w, mode);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
    total++;
  }
  m.set("__N__", total);
  byMode.set(mk, m);
  return m;
}

/* Words that co-occur with `lookup`, ranked by association strength.
 * `window` limits to ±N word positions around an occurrence (default 99 = whole verse).
 * Stop words, and the term itself, are excluded. `opts.sort` ∈ "count"|"pmi"|"ll"|"logdice"
 * picks the ranking (default "count"). Each result carries pmi + ll + logdice + sig.
 *
 * Two statistically valid models, picked by window:
 *   - WHOLE-VERSE (window ≥ 99): the verse-document 2×2 table — k = verses where both
 *     occur, a/b = verses containing each, N = total verses. `count` is shared verses.
 *   - WINDOWED (window < 99): the TOKEN model — k = token-level co-occurrences inside the
 *     ±window, a/b = corpus token frequencies, N = total tokens. `count` is token-level
 *     windowed co-occurrences. `opts.asym` ∈ "sym"|"left"|"right" restricts the window side.
 * Both feed association() so PMI / Log-Dice / G² / significance are valid in either model
 * (no more null metrics in windowed mode). Returns [{ key, label, count, pmi, ll, logdice, sig }]. */
export function collocations(lookup, mode, index, verseData, stopSet, window = 99, opts = {}) {
  const wholeVerse = window >= 99;
  const isStop = (w, k) => k === lookup || (stopSet && (stopSet.has(w.norm) || stopSet.has(k)));
  const tally = {};   // key → count
  const labels = {};  // key → a representative surface form
  const note = (w, k) => { if (!labels[k]) labels[k] = w.orig; };

  if (wholeVerse) {
    for (const vk of index[lookup] || []) {
      const words = verseData[vk]?.words || [];
      if (!words.some((w) => keyOf(w, mode) === lookup)) continue;
      // Count each neighbour ONCE per verse (shared-verse count), so the figure equals
      // what opening the neighbour shows — not per-occurrence.
      const keysHere = new Set();
      for (const w of words) {
        const k = keyOf(w, mode);
        if (isStop(w, k)) continue;
        keysHere.add(k); note(w, k);
      }
      for (const k of keysHere) tally[k] = (tally[k] || 0) + 1;
    }
    const N = opts.N || Object.keys(verseData).length;
    const a = (index[lookup] || []).length; // verses containing the term
    return rankCollocations(tally, labels, (k) => association(tally[k], a, (index[k] || []).length, N), opts.sort);
  }

  // Windowed token model.
  const asym = opts.asym || "sym";
  for (const vk of index[lookup] || []) {
    const words = verseData[vk]?.words || [];
    words.forEach((w, h) => {
      if (keyOf(w, mode) !== lookup) return;
      const lo = asym === "right" ? h + 1 : Math.max(0, h - window);
      const hi = asym === "left" ? h - 1 : Math.min(words.length - 1, h + window);
      for (let j = lo; j <= hi; j++) {
        if (j === h) continue;
        const nw = words[j], k = keyOf(nw, mode);
        if (isStop(nw, k)) continue;
        tally[k] = (tally[k] || 0) + 1; note(nw, k); // token-level: each window slot counts
      }
    });
  }
  const tf = tokenFreq(verseData, mode);
  const Nt = tf.get("__N__") || 1;
  const fn = tf.get(lookup) || 1; // node token frequency
  return rankCollocations(tally, labels, (k) => association(tally[k], fn, tf.get(k) || 0, Nt), opts.sort);
}

/* Shared assembly + sort for both collocation models. `assoc(key)` returns the
 * { pmi, ll, logdice, sig } record for a neighbour key. */
function rankCollocations(tally, labels, assoc, sort = "count") {
  const out = Object.keys(tally).map((k) => ({ key: k, label: labels[k], count: tally[k], ...assoc(k) }));
  const cmp = sort === "pmi" ? (x, y) => y.pmi - x.pmi
    : sort === "ll" ? (x, y) => y.ll - x.ll
    : sort === "logdice" ? (x, y) => y.logdice - x.logdice
    : (x, y) => y.count - x.count;
  return out.sort((x, y) => cmp(x, y) || x.key.localeCompare(y.key));
}

/* Words that occur IMMEDIATELY before/after `lookup` across the whole corpus —
 * true positional adjacency (bigram frequency), unlike collocations() which is
 * whole-verse co-occurrence. For every occurrence of the term, the token at
 * position −1 is tallied as a "before" neighbour and the token at +1 as an
 * "after" neighbour, grouped by the active-mode key. Particles are KEPT here (the
 * immediate grammatical neighbour — a preposition, a conjunction — is precisely
 * the signal in an adjacency study, where in whole-verse collocation it is noise).
 * Self-adjacency (neighbour key === the term) is skipped. Counts are token-level:
 * each adjacency instance counts once, so a verse with the term twice contributes
 * up to two neighbours per side.
 *
 * `opts.crossVerse` extends adjacency ACROSS the āya boundary within a sūra: when the
 * term is the first word of a verse its "before" neighbour is the LAST word of the
 * previous verse (same sūra), and when it is the last word its "after" neighbour is the
 * FIRST word of the next verse — because the recited flow doesn't stop at the verse end.
 * Off by default (each āya is treated as a closed window).
 * Returns [{ key, label, before, after, total }] sorted by total desc (the caller
 * re-sorts/filters per side). */
export function directNeighbors(lookup, mode, index, verseData, opts = {}) {
  const before = {}, after = {}, labels = {};
  const cross = !!opts.crossVerse;
  const tally = (bag, w, k) => { bag[k] = (bag[k] || 0) + 1; if (!labels[k]) labels[k] = w.orig; };
  for (const vk of index[lookup] || []) {
    const v = verseData[vk];
    const words = v?.words || [];
    const prevWords = cross && v ? verseData[`${v.s}:${v.a - 1}`]?.words : null;
    const nextWords = cross && v ? verseData[`${v.s}:${v.a + 1}`]?.words : null;
    words.forEach((w, i) => {
      if (keyOf(w, mode) !== lookup) return;
      if (i > 0) { const p = words[i - 1], k = keyOf(p, mode); if (k !== lookup) tally(before, p, k); }
      else if (prevWords?.length) { const p = prevWords[prevWords.length - 1], k = keyOf(p, mode); if (k !== lookup) tally(before, p, k); }
      if (i < words.length - 1) { const nx = words[i + 1], k = keyOf(nx, mode); if (k !== lookup) tally(after, nx, k); }
      else if (nextWords?.length) { const nx = nextWords[0], k = keyOf(nx, mode); if (k !== lookup) tally(after, nx, k); }
    });
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .map((k) => { const b = before[k] || 0, a = after[k] || 0; return { key: k, label: labels[k], before: b, after: a, total: b + a }; })
    .sort((x, y) => y.total - x.total || x.key.localeCompare(y.key));
}

/* Split two collocation lists (each from collocations()) into the neighbours SHARED
 * by both terms vs. those distinct to each — the core of compare mode. A shared entry
 * carries BOTH terms' figures ({ key, label, a, b }, where a/b are the original
 * { count, pmi, ll } records); onlyA/onlyB are the plain records, order preserved
 * from the input (so the caller's sort still holds). */
export function mergeCollocations(aList, bList) {
  const byKeyB = new Map((bList || []).map((c) => [c.key, c]));
  const keysA = new Set((aList || []).map((c) => c.key));
  const shared = [], onlyA = [];
  for (const a of aList || []) {
    const b = byKeyB.get(a.key);
    if (b) shared.push({ key: a.key, label: a.label, a, b });
    else onlyA.push(a);
  }
  const onlyB = (bList || []).filter((c) => !keysA.has(c.key));
  return { shared, onlyA, onlyB };
}
