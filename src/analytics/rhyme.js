import { norm } from "../arabic-utils.js";

/* ═══ Verse rhyme / cadence (الفاصلة) ═══
 *
 * Qur'anic verses close on a recurring final sound — the fāṣila: ـِين / ـُون (مُبِين،
 * الرَّحِيم، العَالَمِين), ـها, ـٰهَا, ـا … This is the central concern of the literary/
 * phonological study of the text, and the one structural feature of the āya (vs. the
 * word) the tool otherwise ignores. We derive a rhyme key from the verse's FINAL word's
 * consonantal skeleton: its last two letters, which capture the rhyme consonant (الرويّ)
 * together with its preceding long vowel (the ـِي of ـِين, the ـُو of ـُون). It is an
 * ENDING signature, not a claim of perfect rhyme equivalence (مُبِين and الرَّحِيم share a
 * cadence but differ in rawiy ن/م, so they fall in adjacent classes — ين vs يم).
 *
 * Pure, text-only — no morphology needed.
 */

/* The display form of a verse's final word (original spelling), or "". */
export function finalWord(verseText) {
  const toks = (verseText || "").trim().split(/\s+/).filter(Boolean);
  for (let i = toks.length - 1; i >= 0; i--) if (norm(toks[i]).length >= 1) return toks[i];
  return "";
}

/* Rhyme key for a verse: the last two letters of its final content word's skeleton
 * (one letter if that's all there is), or null. */
export function rhymeKey(verseText) {
  const toks = (verseText || "").trim().split(/\s+/).filter(Boolean);
  for (let i = toks.length - 1; i >= 0; i--) {
    const n = norm(toks[i]);
    if (n.length >= 2) return n.slice(-2);
    if (n.length === 1) return n;
  }
  return null;
}

/* The rhyme scheme of one sūrah. Returns
 *   { seq:[{ vk, a, key, final }], scheme:[{ key, count }], total, dominant }
 * `seq` is every āya in muṣḥaf order with its rhyme key + final word; `scheme` is the
 * distinct endings ranked by frequency; `dominant` is the most common ending (the
 * sūrah's prevailing fāṣila) or null. */
export function suraRhymeScheme(suraId, verseData) {
  const seq = [];
  for (const vk in verseData) {
    const v = verseData[vk];
    if (v.s !== suraId) continue;
    seq.push({ vk, a: v.a, key: rhymeKey(v.text), final: finalWord(v.text) });
  }
  seq.sort((x, y) => x.a - y.a);
  const tally = {};
  for (const r of seq) if (r.key) tally[r.key] = (tally[r.key] || 0) + 1;
  const scheme = Object.entries(tally).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { seq, scheme, total: seq.length, dominant: scheme[0]?.key || null };
}

/* Every verse in the corpus that ends on the same rhyme `key`, in muṣḥaf order,
 * excluding `excludeVk`. Returns [vk…]. */
export function rhymeMates(key, verseData, excludeVk) {
  if (!key) return [];
  const out = [];
  for (const vk in verseData) {
    if (vk === excludeVk) continue;
    if (rhymeKey(verseData[vk].text) === key) out.push(vk);
  }
  return out.sort((a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; });
}
