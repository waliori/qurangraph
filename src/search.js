import { norm, normStrict, groupKey, looseKeys, strongKeys, STOP_PARTICLES } from "./arabic-utils.js";
import { arabicSkeletons, latinSkeleton, isLatinQuery } from "./romanize.js";

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
export function deAffix(k) {
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
 * different question — "which āyāt contain ALL of these?". Resolve each token to its best verse
 * set (preferring the exact surface index, then lemma, then root) and intersect → co-occurrence
 * verses. When `verseData` is supplied, also detect verses where the tokens occur CONTIGUOUSLY in
 * order (a true phrase: ٱلْحَمْدُ لِلَّه adjacent, not just both present), returned separately so the
 * caller can lead with exact-phrase matches. Returns null unless every token resolves and the sets
 * overlap, so single-term fallback stays clean. Pure → unit-tests.
 *
 * → { keys: [co-occurrence verses], adjacent: [contiguous-phrase verses ⊆ keys] }
 */
export function resolvePhrase(query, indices, searchAlias = {}, searchAliasFuzzy = {}, verseData = null) {
  const parts = (query || "").trim().split(/\s+/).filter((p) => norm(p).length >= 2);
  if (parts.length < 2) return null;
  const tokens = []; // per token: { verses: Set, forms: Set<normKey> } (forms only for exact-mode adjacency)
  for (const p of parts) {
    let resolved = null;
    for (const mode of ["exact", "lemma", "root"]) {
      const { direct, candidates } = looseResolve(p, mode, "loose", indices, searchAlias, searchAliasFuzzy);
      // Union EVERY surface form of the token, not just the top one — حبل occurs only as
      // بِحَبْل, so the phrase حبل الله needs بحبل's verses too. Prefer the exact-tier forms
      // (the word in any proclitic dress); fall back to the single best candidate otherwise.
      const exactPicks = candidates.filter((c) => c.tier === 3);
      const lookups = (exactPicks.length ? exactPicks : candidates.slice(0, 1)).map((c) => c.lookup);
      if (direct) lookups.push(direct.lookup);
      const verses = new Set(), forms = new Set();
      for (const lp of lookups) { for (const vk of (indices[mode] || {})[lp] || []) verses.add(vk); if (mode === "exact") forms.add(lp); }
      if (verses.size) { resolved = { verses, forms }; break; }
    }
    if (!resolved) return null; // a token that resolves to nothing → no phrase
    tokens.push(resolved);
  }
  let acc = tokens[0].verses;
  for (let i = 1; i < tokens.length; i++) acc = new Set([...acc].filter((k) => tokens[i].verses.has(k)));
  if (!acc.size) return null;

  // Contiguity: scan each co-occurrence verse for a run where word i+j matches token j's surface
  // forms (directly, or once either side is de-affixed — so بِحَبْلِ ٱللَّه counts as adjacent).
  const adjacent = [];
  if (verseData && tokens.every((t) => t.forms.size)) {
    const matches = (wn, forms) => forms.has(wn) || deAffix(wn).some((s) => forms.has(s)) || [...forms].some((f) => deAffix(f).includes(wn));
    for (const vk of acc) {
      const words = verseData[vk]?.words;
      if (!words) continue;
      for (let i = 0; i + tokens.length <= words.length; i++) {
        if (tokens.every((t, j) => matches(words[i + j].norm, t.forms))) { adjacent.push(vk); break; }
      }
    }
  }
  return { keys: [...acc], adjacent };
}

/* ═══ Full-text verse search (any subphrase, any order, broad orthography) ═══
 *
 * A reader typing a fragment of a long verse — مِنْ أَهْلِ ٱلْقُرَىٰ , وَمَآ ءَاتَىٰكُمُ ٱلرَّسُولُ — wants
 * EVERY āya those words land in, ranked, regardless of order, and tolerant of spelling: آتاكم for the
 * muṣḥaf's ءَاتَىٰكُمُ, الربا for ٱلرِّبَوٰا, موسى/موسا, hamza seats, the article and proclitics. Term
 * resolution (looseResolve) is the wrong tool here — it disambiguates ONE word and would lock آتاكم
 * onto the unrelated أتى. So this matches on an aggressive full-text skeleton instead.
 *
 * `ftKey` is that skeleton: searchAlef (dagger-alef / ـوٰ / ـىٰ → ا, alif family unified, collapse) PLUS
 * dropping the standalone hamza ء — so آتاكم and ءَاتَىٰكُمُ both reduce to «اتاكم». `buildContentIndex`
 * makes the inverted index ONCE (ftKey + de-affixed stems → verses, and each verse's word-skeleton row
 * for adjacency). `verseSearch` then gathers verses by token, keeps those holding ALL the tokens (any
 * order; relaxes to "all but one" only if a ≥3-word query finds none), and ranks:
 *   contiguous phrase  ›  same order with gaps  ›  all present, any order.
 * Returns ALL matches best-first, so the caller can lead with the top few and offer "see all N". Pure.
 */
const mushafCmp = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };
// One orthography can't be reduced to a single skeleton: the muṣḥaf writes a long-ā sometimes WITH
// a seat that modern spelling keeps as a letter (ٱلصَّلَوٰة → الصلاة, ٱلْقُرَىٰ → القرى) and sometimes with
// a bare dagger that modern spelling OMITS (ٱلرَّحْمَٰن → الرحمن, not الرحمان). So a word is reduced to a
// SET of skeleton variants and matched on intersection — the standard inverted-index trick:
//   1) norm()                                  — strips the dagger, folds ى→ي  (gives الرحمن, القري)
//   2) seats → ا  ([وى]ٰ and bare ٰ → ا)         — gives الصلاة, الربا, الرحمان
//   3) (2) plus alif-maqṣūra ى → ا              — gives القرا, موسا  (meets a typed القرى/موسى)
// each also in a hamza-dropped form, so آتاكم ≈ ءَاتَىٰكُمُ. Any shared variant = a match.
export function ftKeys(raw) {
  const s = (raw || "").normalize("NFKC");
  const seat = s.replace(/[وى]ٰ/g, "ا").replace(/ٰ/g, "ا");
  const base = [norm(s), norm(seat).replace(/ا{2,}/g, "ا"), norm(seat.replace(/ى/g, "ا")).replace(/ا{2,}/g, "ا")];
  const out = new Set();
  for (const k of base) { if (k.length >= 2) { out.add(k); const h = k.replace(/ء/g, ""); if (h.length >= 2) out.add(h); } }
  // Fused vocative يَٰ (yā + dagger): the muṣḥaf glues the call onto its noun — يَٰٓأَيُّهَا, يَٰقَوْمِ,
  // يَٰمُوسَىٰ. Also index the noun WITHOUT the particle so a split query (يا أيها / يا قوم) still hits.
  // Gated on the dagger ٰ so an ordinary ي-initial word (يَعْلَمُونَ) is never peeled.
  const voc = s.match(/^ي([ؐ-ًؚ-ٟۖ-ٰۭ]+)/);
  if (voc && voc[1].includes("ٰ")) for (const k of ftKeys(s.slice(voc[0].length))) out.add(k);
  return out;
}
// A word's full key set for indexing/adjacency: every skeleton variant PLUS its de-affixed stems
// (so a bare query رسول reaches the affixed ٱلرَّسُول, and بِحَبْل reaches حبل).
function ftVariants(raw) {
  const out = new Set();
  for (const k of ftKeys(raw)) { out.add(k); for (const stem of deAffix(k)) if (stem.length >= 2) out.add(stem); }
  return [...out];
}

/* Build the full-text content index over verseData. Returns { inv, rows }:
 *   inv  : Map variant → vk[]          — which āyāt contain a word reducing to this skeleton variant
 *   rows : Map vk → string[][]         — per kept word, its variant list (for adjacency / order)
 * Built once (memoised by the caller) so per-keystroke search is just lookups + a bounded scan. */
export function buildContentIndex(verseData) {
  const inv = new Map(), rows = new Map();
  for (const vk in verseData) {
    const words = verseData[vk].words || [];
    const row = new Array(words.length);
    const seen = new Set(); // a verse is listed once per variant
    for (let i = 0; i < words.length; i++) {
      const vs = ftVariants(words[i].orig);
      row[i] = vs;
      for (const v of vs) { if (seen.has(v)) continue; seen.add(v); let arr = inv.get(v); if (!arr) inv.set(v, (arr = [])); arr.push(vk); }
    }
    rows.set(vk, row);
  }
  return { inv, rows };
}

export function verseSearch(query, contentIndex, { limit = 200 } = {}) {
  if (!contentIndex) return [];
  const tokens = (query || "").trim().split(/\s+/).map((p) => new Set(ftVariants(p))).filter((set) => set.size);
  if (tokens.length < 2) return [];
  const total = tokens.length;
  // Per-verse: which tokens it contains (any order). Track each token's document frequency too.
  const hit = new Map(); // vk → Set(tokenIdx)
  const df = new Array(total).fill(0); // tokenIdx → #distinct verses it occurs in
  tokens.forEach((set, ti) => {
    const once = new Set();
    for (const k of set) for (const vk of contentIndex.inv.get(k) || []) {
      if (once.has(vk)) continue; once.add(vk);
      let s = hit.get(vk); if (!s) hit.set(vk, (s = new Set())); s.add(ti);
    }
    df[ti] = once.size;
  });
  // Keep verses with ALL tokens. Fallbacks when none: a ≥3-word query relaxes to "all but one"
  // (near-phrase); a 2-word query relaxes to a single DISTINCTIVE token (df ≤ RARE) so a citation
  // form whose partner declines/doesn't co-occur still surfaces (ذو القرنين → the ذِى/ذَا verses)
  // without flooding on a common word.
  const RARE = 60;
  let cands = [...hit.entries()].filter(([, s]) => s.size === total).map(([vk, s]) => ({ vk, m: s.size }));
  if (!cands.length && total >= 3) cands = [...hit.entries()].filter(([, s]) => s.size >= total - 1).map(([vk, s]) => ({ vk, m: s.size }));
  if (!cands.length && total === 2) {
    // Relax to the SINGLE rarest present token (not any token under the threshold) — so ذو القرنين
    // yields the القرنين verses, not the far more common ذو ones, and there's no common-word flood.
    let rare = -1;
    for (let ti = 0; ti < total; ti++) if (df[ti] > 0 && (rare < 0 || df[ti] < df[rare])) rare = ti;
    if (rare >= 0 && df[rare] <= RARE) cands = [...hit.entries()].filter(([, s]) => s.has(rare)).map(([vk, s]) => ({ vk, m: s.size }));
  }
  if (!cands.length) return [];

  const wMatch = (wordVariants, tokenSet) => wordVariants.some((v) => tokenSet.has(v));
  const scored = cands.map(({ vk, m }) => {
    const row = contentIndex.rows.get(vk) || [];
    let run = 0; // longest consecutive run of tokens (from token 0) over consecutive words = phrase
    for (let i = 0; i < row.length; i++) { let r = 0; while (r < total && i + r < row.length && wMatch(row[i + r], tokens[r])) r++; if (r > run) run = r; }
    let ti = 0; for (let i = 0; i < row.length && ti < total; i++) if (wMatch(row[i], tokens[ti])) ti++; // ordered subsequence
    // Word positions any query token matches — for highlighting the hits in the results list.
    const pos = [];
    for (let i = 0; i < row.length; i++) for (let k = 0; k < total; k++) if (wMatch(row[i], tokens[k])) { pos.push(i); break; }
    const score = run * 10000 + (ti === total ? 1000 : 0) + m * 10;
    return { vk, score, run, matched: m, total, contiguous: run === total, pos };
  });
  return scored.sort((a, b) => b.score - a.score || mushafCmp(a.vk, b.vk)).slice(0, limit);
}

/* ═══ Romanized (Latin) search ═══
 *
 * buildRomanIndex maps every romanization SKELETON → the set of exact norm keys that reduce
 * to it. A word is indexed under its own skeleton AND those of its de-affixed stems, so a
 * bare Latin query reaches a word that only ever occurs with a proclitic (الشيطن from
 * "shaytan", لجبريل from "jibril"). Built once over the corpus norms by useCorpusIndices.
 */
export function buildRomanIndex(normKeys) {
  const index = new Map();
  for (const n of normKeys) {
    const forms = new Set([n, ...deAffix(n)]);
    for (const form of forms) for (const sk of arabicSkeletons(form)) {
      if (sk.length < 2) continue;
      let set = index.get(sk);
      if (!set) index.set(sk, (set = new Set()));
      set.add(n);
    }
  }
  return index;
}

// A word is "particle-ish" (rarely a search target, so demoted in romanized ranking) if it
// IS a stop particle or de-affixes to one. The length≥3 guard stops a content word from being
// mistaken for a particle by an over-eager peel — الله must not look like ٱل+له (له is a
// particle), so its 2-letter stem is ignored while والذين → الذين (5 letters) is still caught.
const particleish = (n) => STOP_PARTICLES.has(n) || deAffix(n).some((s) => s.length >= 3 && STOP_PARTICLES.has(s));

/* Resolve a Latin query to Arabic exact norm-key candidates via the romanization index.
 * Skeleton-exact (tier 3) ranks above prefix (2) above bounded-edit (1); within a tier,
 * content words rank above particles, then by corpus frequency. `freq` is norm → occurrence
 * count (pass the w2v index; its array lengths are the counts). Returns [] for Arabic input. */
export function romanResolve(query, romanIndex, freq = {}) {
  if (!isLatinQuery(query)) return [];
  const q = latinSkeleton(query);
  if (q.length < 2 || !romanIndex) return [];
  const maxD = q.length <= 4 ? 1 : 2;
  const best = new Map(); // normKey → { tier, dist }
  const consider = (n, tier, dist) => {
    const prev = best.get(n);
    if (!prev || tier > prev.tier || (tier === prev.tier && dist < prev.dist)) best.set(n, { tier, dist });
  };
  for (const [sk, set] of romanIndex) {
    let tier = 0, dist = 0;
    if (sk === q) tier = 3;
    else if (sk.startsWith(q) && sk.length - q.length <= 3) tier = 2;
    else { const d = editLE(sk, q, maxD); if (d <= maxD) { tier = 1; dist = d; } }
    if (tier) for (const n of set) consider(n, tier, dist);
  }
  const cnt = (n) => (freq[n] ? freq[n].length : 0);
  return [...best.entries()]
    .map(([lookup, m]) => ({ lookup, label: lookup, mode: "exact", count: cnt(lookup), tier: m.tier, dist: m.dist, roman: true }))
    .sort((a, b) => b.tier - a.tier || a.dist - b.dist || (particleish(a.lookup) ? 1 : 0) - (particleish(b.lookup) ? 1 : 0) || b.count - a.count)
    .slice(0, 8);
}
