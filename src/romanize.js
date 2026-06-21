/* ═══ Romanized (Latin) search ═══
 *
 * Lets a user who can't type Arabic search by sound — "rahman", "ibrahim", "musa",
 * "bismillah" — and reach the Arabic word. Romanization is inherently lossy (Arabic
 * doesn't write short vowels; emphatic/plain consonants collapse to one Latin letter;
 * long vowels and semi-vowels blur), so the strategy is NOT exact matching but a forgiving
 * SKELETON both sides reduce to, then prefix + bounded-edit matching ranked by frequency.
 *
 * The skeleton keeps the hard consonants (emphatics folded onto their plain partner — ص/س→s,
 * ط/ت→t, ق/ك→k …) and DROPS short vowels (Arabic never writes them) plus the gutturals ع/ء
 * and bare alif. A word-INITIAL و/ي is a real consonant (w/y) and kept; a medial one is a
 * long vowel and dropped — so يوسف→"ysf" but موسى→"ms". (Input is the consonantal norm, where
 * a tāʾ marbūṭa has already folded to ه→"h", so "salah" matches صلاة directly and the t-spelling
 * "salat" lands one bounded edit away.) Measured against the muṣḥaf, this resolves the
 * overwhelming majority of common names/words in the top few hits.
 */

// Arabic consonant → canonical sound letter (emphatics folded onto their plain partner).
const C = {
  "ب": "b", "ت": "t", "ث": "t", "ج": "j", "ح": "h", "خ": "k", "د": "d", "ذ": "d",
  "ر": "r", "ز": "z", "س": "s", "ش": "s", "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
  "غ": "g", "ف": "f", "ق": "k", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "h",
};
const dedupe = (s) => s.replace(/(.)\1+/g, "$1"); // shadda / doubled letter → one

/* Arabic consonantal norm → canonical Latin skeleton. Returns an array (length 1) so callers
 * iterate uniformly. */
export function arabicSkeletons(normWord) {
  const n = normWord || "";
  let s = "";
  for (let i = 0; i < n.length; i++) {
    const c = n[i];
    if (C[c]) s += C[c];
    else if ((c === "و" || c === "ي") && i === 0) s += c === "و" ? "w" : "y"; // initial = consonant
    // everything else (ا ى ع ء, medial و/ي) carries no skeleton signal → dropped
  }
  return [dedupe(s)];
}

/* A Latin query → the same canonical skeleton. Folds the digraphs people actually type
 * (th, kh, sh, dh, gh, ph, ee, oo, ou …), drops short vowels and apostrophes, and maps
 * the consonants onto the same alphabet (c/q/x→k, p→b, v→f). "Rahman"→"rhmn", "Yusuf"→"ysf". */
export function latinSkeleton(query) {
  let s = (query || "").toLowerCase().trim()
    .replace(/['`’ʾʿ-]/g, "")
    .replace(/th/g, "t").replace(/dh/g, "d").replace(/kh/g, "k").replace(/sh/g, "s")
    .replace(/gh/g, "g").replace(/ph/g, "f").replace(/ck/g, "k").replace(/ch/g, "s")
    .replace(/ee/g, "y").replace(/oo/g, "w").replace(/ou/g, "w").replace(/ai/g, "y").replace(/au/g, "w");
  let out = "";
  for (const ch of s) {
    if ("aeiou".includes(ch)) continue;
    else if (ch === "c" || ch === "q" || ch === "x") out += "k";
    else if (ch === "p") out += "b";
    else if (ch === "v") out += "f";
    else if (/[a-z]/.test(ch)) out += ch;
  }
  return dedupe(out);
}

// A query worth romanizing: contains a Latin letter and NO Arabic — never romanize Arabic
// input (it would strip to nothing). The Arabic block test keeps mixed input on the Arabic path.
export const isLatinQuery = (q) => /[a-z]/i.test(q || "") && !/[؀-ۿ]/.test(q || "");
