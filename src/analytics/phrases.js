import { STOP_PARTICLES } from "../arabic-utils.js";

/* ═══ Shared multi-word phrases (المتشابهات اللفظية) ═══
 *
 * The graph links the Qur'an word-by-word, but the most-studied form of internal
 * resonance is the recurring *phrase* — the near-identical verses and formulae
 * (فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ ، وَيْلٌ يَوْمَئِذٍ لِّلْمُكَذِّبِينَ …).
 * For one centre verse this finds the runs of words it shares with other verses and the
 * verses that carry each.
 *
 * Two things matter for completeness, both handled here:
 *   - SUB-PHRASES. A long run shared with one verse usually contains a shorter run shared
 *     with many. We emit a run at EVERY length, then keep one only if it is shared more
 *     widely than every longer run that contains it (so the widely-recurring core surfaces
 *     instead of being swallowed by its rare maximal extension). Identical runs found at
 *     different positions are de-duplicated.
 *   - PARTICLES. With `ignoreParticles`, the function words (حروف المعاني: وما، فلا، من، …)
 *     are dropped before matching, so verses that differ only by an inserted/removed حرف
 *     still align on their shared content skeleton.
 *
 * Matching is on the loose consonantal skeleton (w.norm); original spelling (w.orig) is
 * kept for display.
 */

const SEED_LEN = 2; // shortest run considered/indexed (a 2-word seed)

/* A verse's token view: [{ k, i }] — match key `k` (skeleton) and original word index `i`.
 * With `ignoreParticles`, function words are omitted (but their original index is not, so
 * a phrase can still be located/highlighted in the full verse). */
export function tokenView(words, ignoreParticles) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (ignoreParticles && STOP_PARTICLES.has(words[i].norm)) continue;
    out.push({ k: words[i].norm, i });
  }
  return out;
}

/* Map "k k …" seed → [{ vk, pos }] (pos = index into that verse's token view) over the
 * whole corpus. Built once per (verseData, options) and reused for all centre verses. */
export function buildSeedIndex(verseData, opts = {}) {
  const seedLen = opts.seedLen || SEED_LEN;
  const ignoreParticles = !!opts.ignoreParticles;
  const idx = new Map();
  for (const vk in verseData) {
    const view = tokenView(verseData[vk].words, ignoreParticles);
    for (let i = 0; i + seedLen <= view.length; i++) {
      let key = view[i].k;
      for (let j = 1; j < seedLen; j++) key += " " + view[i + j].k;
      let arr = idx.get(key);
      if (!arr) idx.set(key, (arr = []));
      arr.push({ vk, pos: i });
    }
  }
  return idx;
}

/* Phrases the centre verse shares with OTHER verses.
 * Returns [{ tokens:[orig…], norm, len, verses:[vk…], origIdx:[centreWordIndex…] }],
 * longest first then most widely shared. `origIdx` are the centre verse's original word
 * indices of the run (contiguous unless particles were skipped). Options:
 *   { seedLen=2, minLen=seedLen, ignoreParticles=false } — seedLen MUST match the index. */
export function findSharedPhrases(centerKey, verseData, seedIndex, opts = {}) {
  const seedLen = opts.seedLen || SEED_LEN;
  const minLen = Math.max(seedLen, opts.minLen || seedLen);
  const ignoreParticles = !!opts.ignoreParticles;
  const cv = verseData[centerKey];
  if (!cv || !seedIndex) return [];
  const cView = tokenView(cv.words, ignoreParticles);
  const n = cView.length;
  if (n < seedLen) return [];

  // Lazily cache other verses' token views (each candidate is extended against the centre).
  const viewCache = new Map();
  const getView = (vk) => { let v = viewCache.get(vk); if (!v) viewCache.set(vk, (v = tokenView(verseData[vk].words, ignoreParticles))); return v; };

  // norm key of a run → the best (most-shared) record found for it.
  const byPhrase = new Map();
  for (let i = 0; i + seedLen <= n; i++) {
    let seed = cView[i].k;
    for (let j = 1; j < seedLen; j++) seed += " " + cView[i + j].k;
    const cands = seedIndex.get(seed);
    if (!cands) continue;
    // Longest match length from this start, per candidate verse.
    const lenByVk = new Map();
    let maxL = seedLen;
    for (const c of cands) {
      if (c.vk === centerKey) continue; // cross-verse only
      const o = getView(c.vk);
      let len = seedLen;
      while (i + len < n && c.pos + len < o.length && o[c.pos + len].k === cView[i + len].k) len++;
      if (len > (lenByVk.get(c.vk) || 0)) lenByVk.set(c.vk, len);
      if (len > maxL) maxL = len;
    }
    if (!lenByVk.size) continue;
    // Emit the run at every length ≥ minLen: the verses sharing length-L are those whose
    // match reaches ≥ L. De-dupe by run text, keeping the widest (most verses).
    for (let L = minLen; L <= maxL; L++) {
      const verses = [];
      for (const [vk, ml] of lenByVk) if (ml >= L) verses.push(vk);
      if (!verses.length) continue;
      let pkey = cView[i].k;
      for (let j = 1; j < L; j++) pkey += " " + cView[i + j].k;
      const prev = byPhrase.get(pkey);
      if (!prev || verses.length > prev.verses.length) {
        byPhrase.set(pkey, { i, len: L, verses });
      }
    }
  }

  // Materialise + sort the run records (muṣḥaf order on each verse list).
  const sortVk = (a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; };
  const list = [...byPhrase.entries()].map(([norm, r]) => {
    const idxs = [];
    for (let j = 0; j < r.len; j++) idxs.push(cView[r.i + j].i);
    return { norm, len: r.len, verses: r.verses.slice().sort(sortVk), origIdx: idxs,
      tokens: idxs.map((oi) => cv.words[oi].orig) };
  });

  // Keep a run only if no LONGER run that contains it is shared by as many verses — i.e.
  // drop sub-runs that carry no wider resonance than a phrase they sit inside.
  const padded = list.map((p) => " " + p.norm + " ");
  const kept = list.filter((p, pi) =>
    !list.some((q, qi) => qi !== pi && q.len > p.len && q.verses.length >= p.verses.length && padded[qi].includes(" " + p.norm + " ")));

  return kept.sort((a, b) => b.len - a.len || b.verses.length - a.verses.length || a.norm.localeCompare(b.norm));
}
