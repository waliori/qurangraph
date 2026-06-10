/* ═══ Shared-radical kinship (الاشتقاق الأكبر) ═══
 *
 * Ibn Jinnī's "grand derivation" (al-ishtiqāq al-akbar): roots built from the SAME
 * consonants in any order tend to share a core sense (the famous جبر/جرب/برج/بجر… and
 * قسو/قوس/سوق family discussions), and more loosely, roots sharing two of three
 * radicals cluster around a shared phonetic nucleus (قطع / قطف / قطم around ق-ط,
 * "severance"). This is a purely phonological relation computed over the Qur'an's OWN
 * root inventory — no external theory file, just combinatorics on the radicals — so it
 * stays inside the tool's data-derived, non-interpretive remit while surfacing a
 * connection the form-based graph can never show (these roots never share a word).
 *
 * Pure.
 */

const multiset = (root) => { const m = {}; for (const c of root) m[c] = (m[c] || 0) + 1; return m; };
const sortedLetters = (root) => root.split("").sort().join("");

/* Kin of `root` among `allRoots` (the corpus root inventory, e.g. Object.keys(r2v)).
 * Returns { anagrams, shared } where:
 *   - anagrams: same multiset of radicals, different order (التقاليب) — the strongest tie.
 *   - shared:   share ≥2 radicals (as a multiset) but are NOT anagrams.
 * Each item is { root, count, common } (common = shared-radical count). `countOf(root)`
 * supplies the occurrence count for ranking/display (pass a lookup over r2v); omit for 0.
 * anagrams rank by frequency; shared rank by #radicals shared, then frequency. */
export function radicalKin(root, allRoots, countOf) {
  if (!root || root.length < 2) return { anagrams: [], shared: [] };
  const targetSorted = sortedLetters(root);
  const tm = multiset(root);
  const sharedCount = (r) => { const m = multiset(r); let s = 0; for (const c in tm) s += Math.min(tm[c], m[c] || 0); return s; };
  const cnt = (r) => (countOf ? countOf(r) || 0 : 0);
  const anagrams = [], shared = [];
  for (const r of allRoots) {
    if (r === root || r.length < 2 || r.length > 4) continue;
    if (r.length === root.length && sortedLetters(r) === targetSorted) { anagrams.push({ root: r, count: cnt(r), common: r.length }); continue; }
    const common = sharedCount(r);
    if (common >= 2) shared.push({ root: r, count: cnt(r), common });
  }
  anagrams.sort((a, b) => b.count - a.count || a.root.localeCompare(b.root));
  shared.sort((a, b) => b.common - a.common || b.count - a.count || a.root.localeCompare(b.root));
  return { anagrams, shared };
}
