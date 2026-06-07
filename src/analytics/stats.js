import { wordGroupKey } from "../arabic-utils.js";

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

/* [{ sura, name, count }] over every sūrah (zeros included) for `lookup`. */
export function distributionBySura(lookup, index, verseData, surahList) {
  const counts = {};
  for (const vk of index[lookup] || []) {
    const s = verseData[vk]?.s;
    if (s != null) counts[s] = (counts[s] || 0) + 1;
  }
  return surahList.map((s) => ({ sura: s.id, name: s.name, count: counts[s.id] || 0 }));
}

/* Association strength of a co-occurrence, on the standard 2×2 contingency table
 * over verses (the "documents"):
 *   k  = verses where BOTH term and neighbour occur
 *   a  = verses with the term, b = verses with the neighbour, N = total verses
 * Returns { pmi, ll } where:
 *   - pmi : pointwise mutual information, log2( k·N / (a·b) ) — how much more often
 *           the two co-occur than chance would predict (0 = independent, >0 = drawn
 *           together, <0 = repelled). Intuitive but unstable for rare pairs.
 *   - ll  : Dunning's log-likelihood ratio G² — a significance score that does NOT
 *           over-reward rare hapax pairs the way PMI does; SIGNED (negative when the
 *           pair co-occurs LESS than expected) so attraction/avoidance are distinct.
 * This turns "raw co-occurrence count" into a real corpus-linguistic measure. */
export function association(k, a, b, N) {
  if (!k || !a || !b || !N) return { pmi: 0, ll: 0 };
  const pmi = Math.log2((k * N) / (a * b));
  // Observed 2×2 cells (term × neighbour): both / term-only / neigh-only / neither.
  const o11 = k, o12 = a - k, o21 = b - k, o22 = N - a - b + k;
  // Expected cells under independence.
  const e11 = (a * b) / N, e12 = (a * (N - b)) / N, e21 = ((N - a) * b) / N, e22 = ((N - a) * (N - b)) / N;
  const term = (o, e) => (o > 0 && e > 0 ? o * Math.log(o / e) : 0);
  let g2 = 2 * (term(o11, e11) + term(o12, e12) + term(o21, e21) + term(o22, e22));
  if (!Number.isFinite(g2) || g2 < 0) g2 = 0;
  const ll = o11 >= e11 ? g2 : -g2; // sign by attraction vs. avoidance
  return { pmi, ll };
}

/* Words that co-occur with `lookup` inside the same verse.
 * `window` limits to ±N word positions around an occurrence (default = whole verse).
 * Stop words, and the term itself, are excluded. `opts.N` is the corpus verse count
 * (for significance; defaults to verseData size) and `opts.sort` ∈ "count"|"pmi"|"ll"
 * picks the ranking (default "count"). Each result also carries pmi + ll so the UI
 * can show significance regardless of sort.
 * Returns [{ key, label, count, pmi, ll }]. */
export function collocations(lookup, mode, index, verseData, stopSet, window = 99, opts = {}) {
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
      // Drop a neighbour if EITHER its surface form or its grouping key is a stop
      // word — matching getUW() in the graph, so a particle hidden by its root/lemma
      // key (not just its surface) doesn't leak into the collocation list.
      if (k === lookup || (stopSet && (stopSet.has(w.norm) || stopSet.has(k)))) continue;
      keysHere.add(k);
      if (!labels[k]) labels[k] = w.orig;
    }
    for (const k of keysHere) tally[k] = (tally[k] || 0) + 1;
  }
  const N = opts.N || Object.keys(verseData).length;
  const a = (index[lookup] || []).length; // verses containing the term
  const sort = opts.sort || "count";
  const out = Object.keys(tally).map((k) => {
    const b = (index[k] || []).length; // verses containing the neighbour
    const { pmi, ll } = association(tally[k], a, b, N);
    return { key: k, label: labels[k], count: tally[k], pmi, ll };
  });
  const cmp = sort === "pmi" ? (x, y) => y.pmi - x.pmi
    : sort === "ll" ? (x, y) => y.ll - x.ll
    : (x, y) => y.count - x.count;
  return out.sort((x, y) => cmp(x, y) || x.key.localeCompare(y.key));
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
