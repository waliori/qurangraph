import { norm, normStrict, groupKey, looseKeys, strongKeys } from "./arabic-utils.js";

/* ═══ Forgiving term resolution ═══
 *
 * Resolve a typed query to the term(s) it could mean, against an inverted index. The
 * naive resolver (norm(query) → look it up) silently lands on whatever shares the
 * consonantal skeleton — so typing جِنّ (jinn) in Word mode hits the bare token جن, which
 * in the muṣḥaf is only the VERB جَنَّ (6:76); the noun jinn is never bare, it's ٱلْجِنّ /
 * جِنّة. The user gets the wrong word with no hint.
 *
 * `looseResolve` instead returns the DISTINCT targets the query could mean (imlāʾī-tolerant,
 * by prefix and — crucially — substring of the forgiving keys, so a word that only occurs
 * with a prefix surfaces from a bare query). The caller auto-selects a lone match and offers
 * a chooser when several remain. Mirrors the toolbar search's resolution, made reusable.
 *
 * Candidates carry a `tier` so the caller can rank consistently across modes:
 *   3 exact   — a key (or its de-affixed stem) EQUALS the query
 *   2 prefix  — a key/stem STARTS WITH the query
 *   1 infix   — a key/stem CONTAINS the query (query ≥ 3 chars; keeps short bigram noise out)
 *   0 fuzzy   — within a bounded edit distance, used ONLY when nothing else matched
 *
 *   query      raw typed string
 *   mode       "exact" | "lemma" | "root"
 *   precision  "loose" | "strict" (only affects the exact-mode direct key)
 *   indices    { exact: w2v, root: r2v, lemma: l2v } — the active inverted indices
 *   searchAlias strong forgiving-key → canonical exact key (built by useCorpusIndices)
 *   searchAliasFuzzy degraded (hamza-dropped) keys → exact key — used ONLY to resolve a
 *               hamza-variant query, never to expand suggestions (else جِئْنَا's "جنا" leaks into a جن search)
 *
 * → { direct, candidates }
 *   direct      the imlāʾī-tolerant exact/group key if it has occurrences, else null
 *   candidates  [{ lookup, label, mode, count, exact, tier, dist? }] distinct targets, best-first
 */
// Arabic glues proclitics onto a word, so a name/word that only ever appears affixed is
// unreachable from its bare form: جبريل never occurs alone — only وَجِبْرِيل / لِجِبْرِيل — so a
// bare search misses it. `deAffix` peels the leading proclitic cluster — conjunction (و/ف),
// preposition (ب/ك/ل/س), and/or the article ال — returning every bare stem the key reduces to,
// so a query matches a word through its affixes (ٱلْجِنّ→جن, وَجِبْرِيل→جبريل, وَبِالْحَقّ→الحق→حق).
// Peels up to THREE leading proclitic letters so a full stack resolves — وَلِلْكَافِرِين (و + لِ +
// the article's lām with elided alif = و ل ل) → كفرين — which a 2-deep peel missed. Measured against
// the corpus, the 3rd level adds ONLY genuine 3-stacks (وللـ/فللـ) with no extra noise on common
// stems. WITHOUT the noise a blind substring match brings (which would catch سجن via a جن bigram);
// stems are kept ≥2 chars.
const PROCLITIC = new Set(["و", "ف", "ب", "ك", "ل", "س"]);
function deAffix(k) {
  const stems = [];
  const peelArticle = (s) => { if (s.startsWith("ال") && s.length >= 4) stems.push(s.slice(2)); };
  let s = k;
  for (let n = 0; n < 3 && s.length > 2 && PROCLITIC.has(s[0]); n++) { s = s.slice(1); if (s.length >= 2) stems.push(s); peelArticle(s); }
  peelArticle(k); // a bare article with no leading proclitic (الجن → جن)
  return stems;
}

/* Known-name variant table: the CONVENTIONAL spelling of a proper noun (left, by its
 * loose norm) → the imlāʾī skeleton it occurs under in the muṣḥaf (right). Some Qur'anic
 * names are spelled with extra letters in modern usage — ميكائيل for the muṣḥaf's مِيكَىٰل,
 * جبرائيل for جِبْرِيل, داوود for دَاوُد — so their skeletons don't overlap and no amount of
 * orthographic folding bridges them. Keyed by norm() so the user's diacritics/hamza-seat
 * don't matter.
 *
 * This is the COMPLETE set, derived not guessed: every proper noun (POS=PN) in the corpus
 * morphology was enumerated (103 lemmas) and its conventional spelling run through the
 * resolver. All but these three already resolve via the Phase-A orthographic folds (dagger /
 * alif-maqṣūra / hamza-seat / Persian look-alikes); only names whose modern form ADDS or
 * DROPS skeletal letters need a hand bridge. Add a row if a new well-known spelling surfaces. */
export const NAME_VARIANTS = {
  [norm("ميكائيل")]: "ميكال",   // Michael — muṣḥaf مِيكَىٰل
  [norm("ميكائل")]: "ميكال",
  [norm("ميكايل")]: "ميكال",
  [norm("جبرائيل")]: "جبريل",   // Gabriel — muṣḥaf جِبْرِيل / جِبْرِيلَ
  [norm("جبرئيل")]: "جبريل",
  [norm("غابرييل")]: "جبريل",
  [norm("داوود")]: "داود",      // David — muṣḥaf دَاوُد (single wāw); modern doubles it
};

// Trailing taa-marbuta (ة, folded to ه by norm) and a final OPEN taa (ت) are routinely
// confused — رحمة written رحمت, التوراة typed التورات. Corpus tokens already key under ه
// (the ة fold); this expands a QUERY key so a final ة/ت also tries the ه form. Query-side
// only, so corpus words with a root-final ت (بيت، آت) are never merged.
const taaVariants = (keys) => keys.flatMap((k) => (/[ةت]$/.test(k) ? [k.replace(/[ةت]$/, "ه")] : []));

// Bounded Levenshtein: the true edit distance if it is ≤ max, else max+1. Prunes a whole
// row once every cell exceeds the budget, so it stays cheap on the thousands of keys it is
// swept over — and it is only ever called as the last-resort fuzzy fallback (nothing else hit).
function editLE(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[lb];
}

export function looseResolve(query, mode, precision, indices, searchAlias = {}, searchAliasFuzzy = {}) {
  const q = norm(query || "");
  if (q.length < 2) return { direct: null, candidates: [] };
  const idx = (indices && indices[mode]) || {};
  // Direct resolution: forgiving keys incl. the hamza-dropped form, the taa-folded variant,
  // and any curated name bridge — so a conventional query reaches its Uthmani form.
  const nameAlt = NAME_VARIANTS[q] ? [NAME_VARIANTS[q]] : [];
  const lk = looseKeys(query), sk = strongKeys(query);
  const QSall = [...new Set([...lk, ...taaVariants(lk), ...nameAlt])];
  // Suggestion expansion: strong keys only (no degraded hamza-drop), plus taa/name variants.
  const QS = [...new Set([...sk, ...taaVariants(sk), ...nameAlt])];

  // Resolve the typed word imlāʾī-tolerantly — strong alias first, then the fuzzy (hamza-dropped)
  // tier, so a query like يستهزئون still reaches the corpus form يستهزءون.
  const resolvedWord = QSall.map((k) => searchAlias[k] ?? searchAliasFuzzy[k]).find(Boolean) || null;
  const directKey = mode === "exact"
    ? (resolvedWord || (precision === "strict" ? normStrict(query) : q))
    : groupKey(resolvedWord || q, mode);
  const direct = idx[directKey] && idx[directKey].length
    ? { lookup: directKey, label: directKey, mode, count: idx[directKey].length }
    : null;

  // Distinct targets reachable from the query, tiered: a STRONG key matches if it (or a stem
  // exposed by peeling its proclitics/article) EQUALS the query (exact), STARTS WITH it (prefix),
  // or — for a query ≥3 chars — CONTAINS it (infix). The senses of the typed word (exact) lead,
  // then prefixes, then infixes; within a tier, by frequency. Only strong keys are scanned, so a
  // degraded key (جِئْنَا → "جنا") can't bridge into جن.
  const qInfix = QS.filter((x) => x.length >= 3);
  const out = new Map();
  const consider = (target, tier, count, dist) => {
    const prev = out.get(target);
    if (!prev) { out.set(target, { lookup: target, label: target, mode, count, exact: tier === 3, tier, dist }); return; }
    if (tier > prev.tier) { prev.tier = tier; prev.exact = tier === 3; prev.dist = dist; }
  };
  if (direct) consider(directKey, 3, direct.count, undefined);
  for (const k of Object.keys(searchAlias)) {
    const stems = deAffix(k);
    let tier = 0;
    if (QS.some((x) => k === x || stems.includes(x))) tier = 3;
    else if (QS.some((x) => k.startsWith(x) || stems.some((b) => b.startsWith(x)))) tier = 2;
    else if (qInfix.some((x) => k.includes(x) || stems.some((b) => b.includes(x)))) tier = 1;
    if (!tier) continue;
    const word = searchAlias[k];
    const target = mode === "exact" ? word : groupKey(word, mode);
    const arr = idx[target];
    if (!arr || !arr.length) continue;
    consider(target, tier, arr.length, undefined);
  }

  // Last resort: nothing matched, so the query is likely a typo. Sweep the alias keys for a
  // bounded edit-distance hit (≤1 for short queries, ≤2 for longer) and offer the nearest as a
  // tier-0 candidate. Gated to the empty case so the cost is paid only when there's no answer.
  if (out.size === 0) {
    const maxD = q.length <= 4 ? 1 : 2;
    for (const k of Object.keys(searchAlias)) {
      let d = maxD + 1;
      for (const x of QS) if (Math.abs(k.length - x.length) <= maxD) d = Math.min(d, editLE(k, x, maxD));
      if (d > maxD) for (const b of deAffix(k)) for (const x of QS) if (Math.abs(b.length - x.length) <= maxD) d = Math.min(d, editLE(b, x, maxD));
      if (d > maxD) continue;
      const target = mode === "exact" ? searchAlias[k] : groupKey(searchAlias[k], mode);
      const arr = idx[target];
      if (!arr || !arr.length) continue;
      const prev = out.get(target);
      if (!prev) out.set(target, { lookup: target, label: target, mode, count: arr.length, exact: false, tier: 0, dist: d });
      else if (d < (prev.dist ?? Infinity)) prev.dist = d;
    }
  }

  const candidates = [...out.values()]
    .sort((a, b) => b.tier - a.tier || (a.dist ?? 0) - (b.dist ?? 0) || b.count - a.count)
    .slice(0, 12);
  return { direct, candidates };
}

/* ═══ Multi-word (phrase / compound-name) resolution ═══
 *
 * The toolbar resolves a single term; a space-separated query (ذو القرنين, حبل الله) is a
 * different question — "which āyāt contain ALL of these?". Resolve each token to its best
 * verse set (preferring the exact surface index, then lemma, then root), intersect, and return
 * the co-occurrence verse keys. Returns null unless every token resolves and the sets overlap,
 * so the caller can fall back to single-term behaviour cleanly. Pure + index-only, so it unit-tests.
 */
export function resolvePhrase(query, indices, searchAlias = {}, searchAliasFuzzy = {}) {
  const parts = (query || "").trim().split(/\s+/).filter((p) => norm(p).length >= 2);
  if (parts.length < 2) return null;
  let acc = null;
  for (const p of parts) {
    let set = null;
    for (const mode of ["exact", "lemma", "root"]) {
      const { direct, candidates } = looseResolve(p, mode, "loose", indices, searchAlias, searchAliasFuzzy);
      // Union EVERY surface form of the token, not just the top one — حبل occurs only as
      // بِحَبْل, so the phrase حبل الله needs بحبل's verses too. Prefer the exact-tier forms
      // (the word in any proclitic dress); fall back to the single best candidate otherwise.
      const exactPicks = candidates.filter((c) => c.tier === 3);
      const lookups = (exactPicks.length ? exactPicks : candidates.slice(0, 1)).map((c) => c.lookup);
      if (direct) lookups.push(direct.lookup);
      const u = new Set();
      for (const lp of lookups) for (const vk of (indices[mode] || {})[lp] || []) u.add(vk);
      if (u.size) { set = u; break; }
    }
    if (!set) return null; // a token that resolves to nothing → no phrase
    acc = acc ? new Set([...acc].filter((k) => set.has(k))) : set;
    if (!acc.size) return null;
  }
  return acc && acc.size ? { keys: [...acc] } : null;
}
