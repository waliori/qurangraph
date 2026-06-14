import { norm } from "../arabic-utils.js";

/* ═══ Letters & the disjoined openings (الحروف المقطّعة / فواتح السور) ═══
 *
 * Twenty-nine sūras open on disjoined letters (الٓمٓ، حمٓ، يسٓ، قٓ، نٓ…). A long-noted,
 * purely countable observation — no interpretation — is that those very letters tend to be
 * OVER-REPRESENTED in the sūra they open (the ق of Qāf, the ḥā/mīm of the Ḥawāmīm). This
 * module flags the openings and measures that, by comparing each opening letter's share of
 * the sūra's letters against its share across the whole Qurʾān. Counting is on the matching
 * skeleton (norm: harakāt stripped, ة→ه, ى→ي) so it is consistent with the rest of the tool.
 */

// The disjoined-letter openings, per sūra, as their individual letters (الٓمٓ → ا ل م).
export const MUQATTAAT = {
  2: ["ا", "ل", "م"], 3: ["ا", "ل", "م"], 7: ["ا", "ل", "م", "ص"], 10: ["ا", "ل", "ر"],
  11: ["ا", "ل", "ر"], 12: ["ا", "ل", "ر"], 13: ["ا", "ل", "م", "ر"], 14: ["ا", "ل", "ر"],
  15: ["ا", "ل", "ر"], 19: ["ك", "ه", "ي", "ع", "ص"], 20: ["ط", "ه"], 26: ["ط", "س", "م"],
  27: ["ط", "س"], 28: ["ط", "س", "م"], 29: ["ا", "ل", "م"], 30: ["ا", "ل", "م"],
  31: ["ا", "ل", "م"], 32: ["ا", "ل", "م"], 36: ["ي", "س"], 38: ["ص"], 40: ["ح", "م"],
  41: ["ح", "م"], 42: ["ح", "م", "ع", "س", "ق"], 43: ["ح", "م"], 44: ["ح", "م"],
  45: ["ح", "م"], 46: ["ح", "م"], 50: ["ق"], 68: ["ن"],
};

/* The disjoined-letter opening of a sūra (array of distinct letters in order), or null. */
export function muqattaatOf(suraId) {
  const m = MUQATTAAT[suraId];
  return m ? [...new Set(m)] : null;
}

// Letter counts over a list of words' skeletons → { letter: count, _total }.
function tallyLetters(words) {
  const counts = {};
  let total = 0;
  for (const w of words || []) {
    const s = w.norm || norm(w.orig || "");
    for (const ch of s) { counts[ch] = (counts[ch] || 0) + 1; total++; }
  }
  counts._total = total;
  return counts;
}

// Corpus-wide letter counts, memoised per verseData object (recomputing over ~78k tokens
// on every modal open would be wasteful; the map is stable for the app's lifetime).
const corpusCache = new WeakMap();
function corpusLetters(verseData) {
  let c = corpusCache.get(verseData);
  if (c) return c;
  c = {};
  let total = 0;
  for (const vk in verseData) for (const w of verseData[vk].words || []) {
    const s = w.norm || "";
    for (const ch of s) { c[ch] = (c[ch] || 0) + 1; total++; }
  }
  c._total = total;
  corpusCache.set(verseData, c);
  return c;
}

/* Letter profile of a sūra. Returns
 *   { isMuqattaat, opening:[letter…]|null, total,
 *     muqattaat:[{ letter, count, share, corpusShare, ratio }],  // for the opening letters
 *     top:[{ letter, count, share }] }                            // most frequent letters
 * `share` = letter's fraction of the sūra's letters; `ratio` = share / corpusShare (>1 means
 * over-represented vs the whole Qurʾān — the disjoined-letter observation, quantified). */
export function surahLetterProfile(suraId, verseData, opts = {}) {
  const words = [];
  for (const vk in verseData) if (verseData[vk].s === suraId) words.push(...(verseData[vk].words || []));
  const counts = tallyLetters(words);
  const total = counts._total || 1;
  const corpus = corpusLetters(verseData);
  const cTotal = corpus._total || 1;
  const opening = muqattaatOf(suraId);
  const stat = (letter) => {
    const count = counts[letter] || 0;
    const share = count / total;
    const corpusShare = (corpus[letter] || 0) / cTotal;
    return { letter, count, share, corpusShare, ratio: corpusShare ? share / corpusShare : 0 };
  };
  const muqattaat = opening ? opening.map(stat).sort((a, b) => b.ratio - a.ratio) : [];
  const top = Object.keys(counts).filter((k) => k !== "_total")
    .map((letter) => ({ letter, count: counts[letter], share: counts[letter] / total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, opts.topN || 10);
  return { isMuqattaat: !!opening, opening, total, muqattaat, top };
}
