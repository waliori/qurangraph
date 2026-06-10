import { rootOf } from "../arabic-utils.js";
import { morphAt } from "../morphology.js";
import { rhymeKey } from "./rhyme.js";

/* ═══ Āya-level analysis ═══
 *
 * The graph is word-centric; this is the verse-centric complement. Two views:
 *   - verseProfile: a structural/lexical fingerprint of one āya — length, distinct roots,
 *     part-of-speech mix, verb Forms present, rhyme ending, and the roots unique to it.
 *   - similarVerses: the āyāt lexically closest to it by SHARED ROOTS, weighted so that
 *     sharing a rare root counts far more than sharing a common one (idf). This is the
 *     "verses about the same thing" lens — the non-verbatim counterpart to mutashābihāt,
 *     surfacing kinship the phrase matcher (which needs exact runs) misses.
 *
 * Pure and Qur'an-internal. `rootOf` reads the installed root map at runtime; the
 * morphology object `M` is optional (the POS/Form breakdown is skipped without it).
 */

// Distinct real triliteral roots of a verse (position-correct when morphology is loaded),
// dropping unrooted tokens (particles, most proper nouns).
function verseRoots(words) {
  const set = new Set();
  for (const w of words) {
    const r = w.proot || rootOf(w.norm);
    if (r) set.add(r);
  }
  return set;
}

const POS_KEYS = ["noun", "verb", "particle", "pn", "pron", "adj", "actpcpl", "passpcpl"];

/* Structural + lexical fingerprint of `centerKey`. `r2v` (root → verses) supplies each
 * root's corpus frequency. Returns null if the verse is unknown. */
export function verseProfile(centerKey, verseData, r2v, M) {
  const v = verseData[centerKey];
  if (!v) return null;
  const words = v.words || [];
  const roots = verseRoots(words);
  const df = (r) => (r2v[r] || []).length;
  // Roots that occur ONLY in this verse (hapax at the root level) and the single rarest.
  const unique = [], rootFreq = [];
  for (const r of roots) { const f = df(r); rootFreq.push([r, f]); if (f <= 1) unique.push(r); }
  rootFreq.sort((a, b) => a[1] - b[1]);

  const pos = {}, forms = new Set();
  if (M) {
    words.forEach((w, i) => {
      const m = morphAt(M, centerKey, i);
      if (!m) return;
      if (m.pos) pos[m.pos] = (pos[m.pos] || 0) + 1;
      if (m.vf) forms.add(m.vf);
    });
  }
  return {
    ref: `${v.s}:${v.a}`, surahName: v.sn,
    wordCount: words.length,
    letterCount: words.reduce((s, w) => s + (w.norm ? w.norm.length : 0), 0),
    rootCount: roots.size,
    posBreakdown: POS_KEYS.filter((k) => pos[k]).map((k) => ({ pos: k, count: pos[k] })),
    forms: [...forms].sort((a, b) => a - b),
    rhyme: rhymeKey(v.text),
    uniqueRoots: unique,
    rarestRoots: rootFreq.slice(0, 5).map(([r, f]) => ({ root: r, freq: f })),
  };
}

/* The āyāt most lexically similar to `centerKey`, by idf-weighted shared-root cosine.
 * Returns [{ vk, score, shared:[root…] }] (score in (0,1]), highest first, ≤ topN.
 * Only verses sharing ≥1 root are considered (gathered via r2v). */
export function similarVerses(centerKey, verseData, r2v, opts = {}) {
  const topN = opts.topN || 30;
  const center = verseData[centerKey];
  if (!center) return [];
  const N = Object.keys(verseData).length || 1;
  const idf = (r) => Math.log(N / Math.max(1, (r2v[r] || []).length));
  const centerRoots = verseRoots(center.words);
  if (!centerRoots.size) return [];

  // idf-weighted vector + magnitude of the centre verse.
  let centerMag = 0;
  const cw = new Map();
  for (const r of centerRoots) { const w = idf(r); cw.set(r, w); centerMag += w * w; }
  centerMag = Math.sqrt(centerMag) || 1;

  // Accumulate dot products against every verse that shares a root.
  const acc = new Map(); // vk → { dot, shared:[] }
  for (const r of centerRoots) {
    const w = cw.get(r);
    for (const vk of r2v[r] || []) {
      if (vk === centerKey) continue;
      let a = acc.get(vk);
      if (!a) acc.set(vk, (a = { dot: 0, shared: [] }));
      a.dot += w * w; // both sides weight the root by idf(r) → contributes w·w
      a.shared.push(r);
    }
  }

  const out = [];
  for (const [vk, a] of acc) {
    const ov = verseData[vk];
    if (!ov) continue;
    let mag = 0;
    for (const r of verseRoots(ov.words)) { const w = idf(r); mag += w * w; }
    mag = Math.sqrt(mag) || 1;
    const score = a.dot / (centerMag * mag);
    out.push({ vk, score, shared: a.shared });
  }
  out.sort((x, y) => y.score - x.score || x.vk.localeCompare(y.vk));
  return out.slice(0, topN);
}
