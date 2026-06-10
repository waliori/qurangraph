import { rootOf, norm, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "../arabic-utils.js";
import { association } from "./stats.js";
import { suraRhymeScheme } from "./rhyme.js";
import { findSharedPhrases } from "./phrases.js";

/* ═══ Sūra-level analysis ═══
 *
 * The altitude above words and verses. Four lenses, all Qur'an-internal and computed
 * from the corpus alone — built to serve the classical نظم / تلاحم (structural cohesion)
 * school directly:
 *   - surahKeyness:        the roots STATISTICALLY OVER-REPRESENTED in the sūra vs the
 *                          rest of the Qur'an (log-likelihood) — its distinctive
 *                          vocabulary, i.e. what it is "about".
 *   - surahCohesion:       how strongly each verse connects to the NEXT by shared roots —
 *                          dips mark topic shifts (the rukūʿ / maqāṭiʿ boundaries).
 *   - surahSelfSimilarity: the verse×verse shared-root matrix — symmetric bands reveal
 *                          ring composition (A-B-C-B'-A') and recurring panels.
 *   - surahBonds:          the الأواصر finder — Jawhar Dāwūd's method, automated: elements
 *                          (words / phrases) that are GLOBALLY RARE yet recur at DISTANT
 *                          points WITHIN this sūra, the lexical bonds that bind it.
 *
 * Pure. `rootOf` reads the installed root map at runtime.
 */

// Roots of function words / ubiquitous content words (الله، رب، قال…) — excluded from
// keyness "themes" so a sūra's distinctive vocabulary isn't headed by من→منن or الله.
// Lazy (rootOf needs the installed map) and memoised.
let STOP_ROOTS = null;
function stopRoots() {
  if (STOP_ROOTS) return STOP_ROOTS;
  STOP_ROOTS = new Set();
  for (const wrd of [...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT]) { const r = rootOf(norm(wrd)); if (r) STOP_ROOTS.add(r); }
  return STOP_ROOTS;
}

// Distinct real roots of a verse (position-correct when morphology is loaded).
function verseRoots(words) {
  const set = new Set();
  for (const w of words || []) { const r = w.proot || rootOf(w.norm); if (r) set.add(r); }
  return set;
}
// Cosine-like overlap of two root sets: |A∩B| / sqrt(|A|·|B|).
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const r of a) if (b.has(r)) inter++;
  return inter / Math.sqrt(a.size * b.size);
}
/* The roots two verses share (for the matrix/echo pair readout). */
export function sharedRoots(vkA, vkB, verseData) {
  const A = verseRoots(verseData[vkA]?.words || []);
  const B = verseRoots(verseData[vkB]?.words || []);
  return [...A].filter((r) => B.has(r));
}

function suraVerseKeys(surahId, verseData) {
  const keys = [];
  for (const vk in verseData) if (verseData[vk].s === surahId) keys.push(vk);
  return keys.sort((x, y) => verseData[x].a - verseData[y].a);
}

/* Light profile: counts, dominant rhyme, and refrains (verses repeated within the sūra). */
export function surahProfile(surahId, verseData) {
  const keys = suraVerseKeys(surahId, verseData);
  if (!keys.length) return null;
  let wordCount = 0; const allRoots = new Set();
  const byText = new Map(); // norm text → [ayah]
  for (const vk of keys) {
    const v = verseData[vk];
    wordCount += v.words.length;
    for (const r of verseRoots(v.words)) allRoots.add(r);
    const norm = v.words.map((w) => w.norm).join(" ");
    if (norm.split(" ").length >= 2) { const a = byText.get(norm) || []; a.push(v.a); byText.set(norm, a); }
  }
  const refrains = [...byText.entries()].filter(([, a]) => a.length >= 2)
    .map(([, ayat]) => ({ ayat, count: ayat.length, text: verseData[`${surahId}:${ayat[0]}`].words.map((w) => w.orig).join(" ") }))
    .sort((x, y) => y.count - x.count);
  const scheme = suraRhymeScheme(surahId, verseData);
  return { surahId, name: verseData[keys[0]].sn, verseCount: keys.length, wordCount, rootCount: allRoots.size, dominantRhyme: scheme.dominant, refrains };
}

/* Roots over-represented in the sūra vs the rest of the corpus, by signed log-likelihood.
 * Returns [{ root, inSura, total, keyness }] (keyness > 0 = over-represented), strongest
 * first, for roots occurring in ≥ minVerses sūra verses. Reuses the same G² as collocations. */
export function surahKeyness(surahId, verseData, r2v, opts = {}) {
  const minVerses = opts.minVerses || 2;
  const keys = suraVerseKeys(surahId, verseData);
  const N = Object.keys(verseData).length || 1;
  const suraN = keys.length;
  const inSura = new Map(); // root → # sūra verses containing it
  const suraSet = new Set(keys);
  for (const vk of keys) for (const r of verseRoots(verseData[vk].words)) inSura.set(r, (inSura.get(r) || 0) + 1);
  const stop = stopRoots();
  const out = [];
  for (const [root, a] of inSura) {
    if (a < minVerses || stop.has(root)) continue;
    const total = (r2v[root] || []).length;
    const { ll } = association(a, suraN, total, N); // a = both, suraN = term verses, total = neighbour verses
    if (ll > 0) out.push({ root, inSura: a, total, keyness: ll });
  }
  // Keep `suraSet` referenced so the unused-var lint stays quiet while documenting intent.
  void suraSet;
  return out.sort((x, y) => y.keyness - x.keyness);
}

/* Adjacent-verse cohesion: shared-root overlap between each consecutive pair.
 * Returns { seq:[{ a, b, shared:[root…], score }], mean } — low scores mark topic shifts. */
export function surahCohesion(surahId, verseData) {
  const keys = suraVerseKeys(surahId, verseData);
  const roots = keys.map((vk) => verseRoots(verseData[vk].words));
  const seq = [];
  for (let i = 0; i + 1 < keys.length; i++) {
    const shared = [...roots[i]].filter((r) => roots[i + 1].has(r));
    seq.push({ a: verseData[keys[i]].a, b: verseData[keys[i + 1]].a, shared, score: overlap(roots[i], roots[i + 1]) });
  }
  const mean = seq.length ? seq.reduce((s, x) => s + x.score, 0) / seq.length : 0;
  return { seq, mean };
}

/* Verse×verse self-similarity (shared-root overlap). Returns
 *   { ayat:[a…], size, matrix:number[][], echoes:[{ i, j, ai, aj, score, shared }] }
 * `matrix` drives the heatmap; `echoes` are the strongest OFF-diagonal pairs (|i−j| ≥ 2)
 * — the sūra's internal resonances (ring/panel structure). */
export function surahSelfSimilarity(surahId, verseData, opts = {}) {
  const keys = suraVerseKeys(surahId, verseData);
  const n = keys.length;
  const roots = keys.map((vk) => verseRoots(verseData[vk].words));
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  const echoes = [];
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = overlap(roots[i], roots[j]);
      matrix[i][j] = matrix[j][i] = s;
      if (j - i >= 2 && s > 0) echoes.push({ i, j, ai: verseData[keys[i]].a, aj: verseData[keys[j]].a, score: s, shared: [...roots[i]].filter((r) => roots[j].has(r)) });
    }
  }
  echoes.sort((x, y) => y.score - x.score);
  return { ayat: keys.map((vk) => verseData[vk].a), size: n, matrix, echoes: echoes.slice(0, opts.topEchoes || 40) };
}

/* ═══ الأواصر — intra-sūra rare lexical bonds (Jawhar Dāwūd's method) ═══
 *
 * Elements that are GLOBALLY RARE (occur in ≤ maxGlobal verses of the whole Qur'an) yet
 * appear ≥2× WITHIN this sūra at DISTANT positions (≥ minDist verses apart). These are the
 * bonds the school reads as binding the sūra. Two kinds:
 *   - wordBonds:   a rare surface word recurring in the sūra (تلكما، استفزاز، قرطاس…).
 *   - phraseBonds: a rare verbatim phrase recurring in the sūra (لقد كان، أولئك جزاؤهم…).
 * `w2v` is the exact-key → verses index; `seedIndex` the corpus phrase index; `stopSet`
 * hides function words. Each bond carries `global` (corpus verse count) and `span` (verse
 * distance) so the strongest (rarest, most distant) sort first.
 */
export function surahBonds(surahId, verseData, w2v, seedIndex, stopSet, opts = {}) {
  const maxGlobal = opts.maxGlobal || 3;
  const minDist = opts.minDist || 2;
  const keys = suraVerseKeys(surahId, verseData);
  const inSura = new Set(keys);

  // ── word bonds ──
  const seen = new Map(); // exact key → { label, ayat:Set }
  for (const vk of keys) {
    const a = verseData[vk].a;
    const here = new Set();
    for (const w of verseData[vk].words) {
      const k = w.exact ?? w.norm;
      if (!k || k.length < 2 || (stopSet && (stopSet.has(w.norm) || stopSet.has(k)))) continue;
      if (here.has(k)) continue; here.add(k);
      let rec = seen.get(k); if (!rec) seen.set(k, (rec = { label: w.orig, ayat: new Map() }));
      if (!rec.ayat.has(a)) rec.ayat.set(a, w.orig);
    }
  }
  const wordBonds = [];
  for (const [k, rec] of seen) {
    if (rec.ayat.size < 2) continue;
    const global = (w2v[k] || []).length;
    if (!global || global > maxGlobal) continue;
    const ayat = [...rec.ayat.keys()].sort((x, y) => x - y);
    const span = ayat[ayat.length - 1] - ayat[0];
    if (span < minDist) continue;
    wordBonds.push({ key: k, label: rec.label, global, ayat, span });
  }
  wordBonds.sort((x, y) => x.global - y.global || y.span - x.span || y.ayat.length - x.ayat.length);

  // ── phrase bonds ── (rare verbatim phrases whose occurrences all sit inside the sūra)
  const phraseMap = new Map(); // norm → { tokens, ayat:Set }
  if (seedIndex) {
    for (const vk of keys) {
      const ph = findSharedPhrases(vk, verseData, seedIndex, { minLen: 2 });
      for (const p of ph) {
        if (!p.verses.every((o) => inSura.has(o))) continue;       // bond = stays within the sūra
        if (p.verses.length + 1 > maxGlobal) continue;             // globally rare
        let rec = phraseMap.get(p.norm); if (!rec) phraseMap.set(p.norm, (rec = { tokens: p.tokens, ayat: new Set() }));
        rec.ayat.add(verseData[vk].a); for (const o of p.verses) rec.ayat.add(verseData[o].a);
      }
    }
  }
  const phraseBonds = [];
  for (const [norm, rec] of phraseMap) {
    const ayat = [...rec.ayat].sort((x, y) => x - y);
    if (ayat.length < 2) continue;
    const span = ayat[ayat.length - 1] - ayat[0];
    if (span < minDist) continue;
    phraseBonds.push({ norm, tokens: rec.tokens, len: rec.tokens.length, ayat, span });
  }
  phraseBonds.sort((x, y) => y.len - x.len || y.span - x.span);

  return { wordBonds, phraseBonds };
}
