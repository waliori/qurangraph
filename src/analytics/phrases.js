/* ═══ Shared multi-word phrases (المتشابهات اللفظية) ═══
 *
 * The graph links the Qur'an word-by-word, but the most-studied form of internal
 * resonance is the recurring *phrase* — the near-identical verses and formulae
 * (فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ ، وَيْلٌ يَوْمَئِذٍ لِّلْمُكَذِّبِينَ …).
 * This module finds, for one centre verse, every MAXIMAL contiguous run of words
 * that also occurs verbatim in another verse, and the verses that share it.
 *
 * Matching is on the loose consonantal skeleton (w.norm) of the verse's word
 * sequence — INCLUDING particles/stop words, since a phrase is a literal run, not
 * a bag of content words. Original spelling (w.orig) is kept for display.
 *
 * Algorithm: build a trigram seed index over the corpus once, then for the centre
 * verse seed-and-extend at every position (classic maximal-repeat finding). O(n·k)
 * for the centre verse, where k = average trigram frequency.
 */

const SEED_LEN = 3; // shortest phrase reported (a 3-word run); also the seed length

/* Map "norm norm norm" trigram → [{ vk, pos }] over every verse. Built once and
 * reused for all centre verses (rebuild only when verseData identity changes). */
export function buildSeedIndex(verseData, seedLen = SEED_LEN) {
  const idx = new Map();
  for (const vk in verseData) {
    const ws = verseData[vk].words;
    for (let i = 0; i + seedLen <= ws.length; i++) {
      let key = ws[i].norm;
      for (let j = 1; j < seedLen; j++) key += " " + ws[i + j].norm;
      let arr = idx.get(key);
      if (!arr) idx.set(key, (arr = []));
      arr.push({ vk, pos: i });
    }
  }
  return idx;
}

/* Maximal phrases the centre verse shares with OTHER verses.
 * Returns [{ tokens:[orig…], norm, len, verses:[vk…] }], longest first.
 * `verses` are the OTHER āyāt that contain the full run, in muṣḥaf order. */
export function findSharedPhrases(centerKey, verseData, seedIndex, opts = {}) {
  const seedLen = opts.seedLen || SEED_LEN;
  const cv = verseData[centerKey];
  if (!cv || !seedIndex) return [];
  const ws = cv.words, n = ws.length;
  if (n < seedLen) return [];

  // Pass 1: at each start i, find the longest run also present in another verse,
  // and the matched length each candidate verse reaches (so we can list the verses
  // that contain the FULL maximal run, not merely the seed).
  const bestLen = new Array(n).fill(0);
  const vkLen = new Array(n); // i → Map(vk → longest matched length from i)
  for (let i = 0; i + seedLen <= n; i++) {
    let key = ws[i].norm;
    for (let j = 1; j < seedLen; j++) key += " " + ws[i + j].norm;
    const cands = seedIndex.get(key);
    if (!cands) continue;
    const m = new Map();
    let best = 0;
    for (const c of cands) {
      if (c.vk === centerKey) continue; // cross-verse only — ignore self & internal repeats
      const o = verseData[c.vk].words;
      let len = seedLen;
      while (i + len < n && c.pos + len < o.length && o[c.pos + len].norm === ws[i + len].norm) len++;
      if (len > (m.get(c.vk) || 0)) m.set(c.vk, len);
      if (len > best) best = len;
    }
    if (best >= seedLen) { bestLen[i] = best; vkLen[i] = m; }
  }

  // Pass 2: drop runs that are just the rolling suffix of a longer run starting one
  // position earlier (center[i..] ⊂ center[i-1..]) — keep only left-maximal phrases.
  const out = [];
  for (let i = 0; i + seedLen <= n; i++) {
    const L = bestLen[i];
    if (L < seedLen) continue;
    if (i > 0 && bestLen[i - 1] - 1 === L) continue; // contained suffix of the previous run
    const verses = [...vkLen[i].entries()].filter(([, len]) => len >= L).map(([vk]) => vk)
      .sort((a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; });
    if (!verses.length) continue;
    const slice = ws.slice(i, i + L);
    out.push({ tokens: slice.map((w) => w.orig), norm: slice.map((w) => w.norm).join(" "), len: L, verses });
  }
  // Longest phrases first, then the ones shared most widely.
  return out.sort((a, b) => b.len - a.len || b.verses.length - a.verses.length);
}
