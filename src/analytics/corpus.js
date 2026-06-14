import { rootOf, wordGroupKey } from "../arabic-utils.js";
import { decodeMorph, morphAt, passesMorphFilter, morphFilterActive } from "../morphology.js";

/* ═══ Corpus-wide lexical exploration ═══
 *
 * The graph and labs are anchored on a verse/word/root/sūra. This is the bird's-eye
 * complement: rankings over the WHOLE Qurʾān.
 *   - rootFrequency: every root by true token frequency (هاپاكس → ubiquitous), the raw
 *     شكل of the lexicon — and the hapax legomena (roots occurring exactly once), a class
 *     of long-standing interest (الكلمات المفردة).
 *   - browseByMorph: a standalone catalogue for the morphology filter — "every Form VIII
 *     verb", "every passive", "every imperative" — grouped by lemma/root with counts, which
 *     the graph's filter can only PRUNE, never enumerate.
 * Pure; token-level counts. `rootOf` reads the installed root map at runtime.
 */

// Token-level root frequency, memoised per verseData (a full scan of ~78k tokens).
const freqCache = new WeakMap();
function rootCounts(verseData) {
  let c = freqCache.get(verseData);
  if (c) return c;
  c = new Map(); // root → { count, verses:Set }
  for (const vk in verseData) for (const w of verseData[vk].words || []) {
    const r = w.proot || rootOf(w.norm);
    if (!r) continue;
    let rec = c.get(r);
    if (!rec) c.set(r, (rec = { count: 0, verses: new Set() }));
    rec.count++;
    rec.verses.add(vk);
  }
  freqCache.set(verseData, c);
  return c;
}

/* Every root by true token frequency, most frequent first. Returns
 * [{ root, count, verses }] (verses = distinct verse count). */
export function rootFrequency(verseData) {
  const c = rootCounts(verseData);
  return [...c.entries()]
    .map(([root, r]) => ({ root, count: r.count, verses: r.verses.size }))
    .sort((a, b) => b.count - a.count || a.root.localeCompare(b.root));
}

/* The hapax legomena — roots occurring exactly ONCE in the whole Qurʾān — in muṣḥaf order
 * of their single occurrence. Returns [{ root, vk }]. */
export function hapaxRoots(verseData) {
  const c = rootCounts(verseData);
  const out = [];
  for (const [root, r] of c) if (r.count === 1) out.push({ root, vk: [...r.verses][0] });
  return out.sort((a, b) => { const [sa, aa] = a.vk.split(":").map(Number), [sb, ab] = b.vk.split(":").map(Number); return sa - sb || aa - ab; });
}

/* Corpus catalogue of every word whose morphology satisfies `filter`, grouped by the active
 * `mode` key (exact/lemma/root). Returns [{ key, label, count, verses, verseKeys }] sorted by
 * count desc — `verses` is the distinct-verse count, `verseKeys` the muṣḥaf-ordered list (so the
 * UI can show the āyāt). Needs the loaded morphology `M`; an inactive filter or missing M → []. */
export function browseByMorph(verseData, M, filter, mode) {
  if (!morphFilterActive(filter) || !M) return [];
  const groups = new Map(); // key → { label, count, verses:Set }
  for (const vk in verseData) {
    const rows = M.v?.[vk];
    if (!rows) continue;
    const words = verseData[vk].words || [];
    words.forEach((w, i) => {
      if (!passesMorphFilter(decodeMorph(rows[i], M), filter)) return;
      const key = wordGroupKey(w, mode);
      if (!key) return;
      let rec = groups.get(key);
      if (!rec) groups.set(key, (rec = { label: w.orig, count: 0, verses: new Set() }));
      rec.count++;
      rec.verses.add(vk);
    });
  }
  const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };
  return [...groups.entries()]
    .map(([key, r]) => ({ key, label: r.label, count: r.count, verses: r.verses.size, verseKeys: [...r.verses].sort(sortVk) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// Re-export for callers/tests that want the decoded record at a position.
export { morphAt };
