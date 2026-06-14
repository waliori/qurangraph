import { norm } from "../arabic-utils.js";

/* ═══ Verse rhyme / cadence (الفاصلة) ═══
 *
 * Qurʾanic verses close on a recurring final sound — the fāṣila. The fāṣila is a
 * PAUSAL (waqf) phenomenon: at the stop, final short vowels and tanwīn drop, and ة is
 * pronounced ه. So the rhyme is read off the final word's *pausal* skeleton, NOT the
 * matching skeleton norm() builds — crucially we do NOT fold ى→ي here (the alif-maqsura
 * IS the rhyme-bearing long ā of هَوَىٰ / تَتْلَىٰ / ضُحَىٰ; folding it to ي would mis-class
 * those as a يـ rhyme). We expose two levels, mirroring how fawāṣil are actually classified:
 *
 *   - rhymeKey  : the rhyme ENDING (الحروف) — ridf + rawiy for a consonant close
 *                 (ـِين، ـُون، ـَد), the suffix for ـهَا / ـنَا, the bare ā for ـَىٰ. The
 *                 strict class: مُبِين (ين) and الرَّحِيم (يم) are distinct.
 *   - rawiyKey  : the rhyme CONSONANT alone (الرويّ) — the classical PRIMARY criterion.
 *                 Strips the trailing madd/wasl vowel to expose the rawiy, so أَحَد /
 *                 الصَّمَد / يُولَد all group under د and the looser "same rawiy" rhyme
 *                 family surfaces. ـَىٰ endings collapse to the ā class (ا).
 *
 * It is a signature, not a claim of perfect rhyme equivalence; pure, text-only.
 */

const MADD = "اوي"; // long-vowel / madd letters that act as ridf (before rawiy) or wasl (after)

/* The final word's PAUSAL consonantal skeleton: harakāt/marks/tatweel stripped, alif
 * family unified, ة→ه (pausal), hamza carriers folded — but ى kept distinct (final ā). */
function pausalSkeleton(word) {
  return (word || "")
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[ً-ٰٟۖ-ۭࣔ-ࣰ࣡-ࣲؗ-ؚۢ-ۦ۪ۨ-۬]/g, "")
    .replace(/ـ/g, "")
    .replace(/[ٱآأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^ء-ي]/g, "");
}

/* The display form of a verse's final word (original spelling), or "". */
export function finalWord(verseText) {
  const toks = (verseText || "").trim().split(/\s+/).filter(Boolean);
  for (let i = toks.length - 1; i >= 0; i--) if (norm(toks[i]).length >= 1) return toks[i];
  return "";
}

/* The pausal skeleton of a verse's final content word, or "". */
function finalSkeleton(verseText) {
  const toks = (verseText || "").trim().split(/\s+/).filter(Boolean);
  for (let i = toks.length - 1; i >= 0; i--) { const s = pausalSkeleton(toks[i]); if (s) return s; }
  return "";
}

/* Strict rhyme ending (ridf + rawiy / suffix / bare ā), or null. */
export function rhymeKey(verseText) {
  const sk = finalSkeleton(verseText);
  if (!sk) return null;
  const last = sk[sk.length - 1], prev = sk[sk.length - 2];
  if (last === "ى") return "ا";                                  // alif-maqsura ā rhyme (هوى، تتلى)
  if (last === "ا") return prev && !MADD.includes(prev) && prev !== "ى" ? prev + "ا" : "ا"; // ـها/ـنا vs bare ā
  if (last === "و" || last === "ي") return prev && !MADD.includes(prev) && prev !== "ى" ? prev + last : last; // madd close
  const ridf = MADD.includes(prev) ? prev : prev === "ى" ? "ا" : ""; // consonant close: include a ridf vowel
  return ridf + last;
}

/* Loose rhyme: the rawiy consonant alone (the classical primary criterion), or null. */
export function rawiyKey(verseText) {
  let sk = finalSkeleton(verseText);
  if (!sk) return null;
  if (sk[sk.length - 1] === "ى") return "ا";                     // ā rhyme family
  while (sk.length > 1 && MADD.includes(sk[sk.length - 1])) sk = sk.slice(0, -1); // drop trailing madd/wasl
  const r = sk[sk.length - 1];
  return r === "ى" ? "ا" : r;
}

/* The rhyme scheme of one sūrah. Returns
 *   { seq:[{ vk, a, key, rawiy, final }], scheme:[{ key, count }],
 *     rawiyScheme:[{ key, count }], total, dominant, dominantRawiy }
 * `seq` is every āya in muṣḥaf order with its rhyme key + rawiy + final word; `scheme`
 * ranks distinct strict endings, `rawiyScheme` ranks the rawiy consonants; `dominant`/
 * `dominantRawiy` are the prevailing fāṣila at each level (or null). */
export function suraRhymeScheme(suraId, verseData) {
  const seq = [];
  for (const vk in verseData) {
    const v = verseData[vk];
    if (v.s !== suraId) continue;
    seq.push({ vk, a: v.a, key: rhymeKey(v.text), rawiy: rawiyKey(v.text), final: finalWord(v.text) });
  }
  seq.sort((x, y) => x.a - y.a);
  const rank = (field) => {
    const tally = {};
    for (const r of seq) if (r[field]) tally[r[field]] = (tally[r[field]] || 0) + 1;
    return Object.entries(tally).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  };
  const scheme = rank("key"), rawiyScheme = rank("rawiy");
  return { seq, scheme, rawiyScheme, total: seq.length, dominant: scheme[0]?.key || null, dominantRawiy: rawiyScheme[0]?.key || null };
}

/* Every verse in the corpus that ends on the same rhyme, in muṣḥaf order, excluding
 * `excludeVk`. `opts.by` ∈ "key" (strict ending, default) | "rawiy" (loose, same rawiy
 * consonant). Returns [vk…]. */
export function rhymeMates(key, verseData, excludeVk, opts = {}) {
  if (!key) return [];
  const keyer = opts.by === "rawiy" ? rawiyKey : rhymeKey;
  const out = [];
  for (const vk in verseData) {
    if (vk === excludeVk) continue;
    if (keyer(verseData[vk].text) === key) out.push(vk);
  }
  return out.sort((a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; });
}
