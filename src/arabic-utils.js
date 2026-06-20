/* ═══ Arabic text normalization ═══
 *
 * Reduces a token to a consonantal "skeleton" for MATCHING (not display):
 *   - strips all diacritics / harakat / quranic annotation marks and tatweel
 *   - unifies the alif family (آ أ إ ٱ → ا) and hamza-carriers (ؤ → و, ئ → ي)
 *   - folds ة → ه and alif-maqsura ى → ي
 *   - drops anything outside the basic Arabic letter block
 *
 * The ة→ه, ى→ي and hamza folds are intentional: they let orthographic /
 * inflectional variants of the same word match (the display text always uses
 * the original `orig` token, so nothing is lost visually). This is a matching
 * heuristic, not a linguistic transliteration.
 *
 * Standalone hamza (ء) is deliberately NOT folded here, and the divergence from the
 * build-time root matcher matchNorm() (scripts/lib/parse.js — which folds the WHOLE
 * hamza/alif family to ا) is intentional, not an oversight:
 *   - norm() groups DISPLAYED corpus TOKENS. Erasing ء would merge distinct content
 *     words — ماء (water) → ما (what/not), سوء → سو, شيء → شي — so the consonant is
 *     kept to avoid silently collapsing different words. The carriers ؤ/ئ ARE folded
 *     because they spell the same و/ي consonant and so don't create such collisions.
 *   - matchNorm() aligns Qur'anic ROOTS onto classical-dictionary HEADERS, where one
 *     root is spelled with different hamza/alif conventions (سأل↔سال, سوأ↔سوء); there
 *     folding all hamza to ا is what makes headers line up, and roots are a closed,
 *     curated set, so the token over-merge risk doesn't apply.
 * Token grouping must be conservative about hamza; offline root alignment must be
 * aggressive — two different matching problems, hence two different rules.
 */
export function norm(w, { fold = true } = {}) {
  let s = (w || "")
    // NFKC first: fold presentation-form ligatures (ﻻ→لا) and isolated/medial letter
    // forms (U+FBxx/U+FExx) back to their base letters, so text pasted from a PDF or a
    // non-Arabic layout doesn't silently lose characters at the [^ء-ي] strip below.
    .normalize("NFKC")
    // Persian/Urdu keyboard look-alikes → Arabic equivalents. These code points sit
    // OUTSIDE the basic block, so without this they'd be deleted whole — typing مِیکَائِیل
    // on a Farsi layout (ی U+06CC, ک U+06A9) used to normalise to "مايل" and find nothing.
    .replace(/[یۍېے]/g, "ي") // Persian/Urdu yeh variants → Arabic yeh
    .replace(/[کڪ]/g, "ك")    // Persian/Sindhi kaf → Arabic kaf
    .replace(/[گڭ]/g, "ك")    // gaf / ng-kaf → kaf (closest Arabic consonant)
    .replace(/[ھہۀ]/g, "ه")   // heh look-alikes → Arabic heh
    // intentionally matches individual combining marks (harakat / annotation)
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[ً-ٰٟۖ-ۭࣔ-ࣰ࣡-ࣲؗ-ؚۢ-ۦ۪ۨ-۬]/g, "")
    .replace(/ـ/g, "")
    .replace(/[ٱآأإ]/g, "ا"); // alif family — always unified (orthographic, safe)
  if (fold) {
    // Aggressive orthographic folds: let inflectional / spelling variants match.
    // Off in "strict" precision so e.g. آية ≠ اية and صلوة ≠ صلوه stay distinct.
    // NB: standalone ء is intentionally left alone (see header) — folding it would
    // merge content words like ماء→ما; the hamza CARRIERS ؤ/ئ are safe to fold.
    s = s.replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  }
  return s.replace(/[^ء-ي]/g, "").trim();
}

/* Strict normalisation — same diacritic/tatweel/alif handling, WITHOUT the
 * ة→ه / ى→ي / hamza folds, so exact-mode matching can be made precise. */
export function normStrict(w) { return norm(w, { fold: false }); }

/* ═══ Triliteral roots (precomputed) ═══
 *
 * Roots are NOT guessed at runtime. They come from a precomputed
 * normForm → root map (`public/data/roots.json`), built offline from the
 * Quranic Arabic Corpus morphology (expert per-word tagging). The app installs
 * it once via `setRootMap` after the data loads.
 *
 *   - rootOf(n)   → the authoritative root, or null if the word has none
 *                   (particles, proper nouns — left ungrouped in root mode).
 *   - rootKey(n)  → root if known, else the word itself (the grouping key).
 *   - extractRoot → rootKey(norm(w)); kept so existing call sites work unchanged.
 */
let ROOT_MAP = {};
export function setRootMap(map) { ROOT_MAP = map || {}; }
export function rootOf(normForm) { return ROOT_MAP[normForm] || null; }
export function rootKey(normForm) { return ROOT_MAP[normForm] || normForm; }
export function extractRoot(w) { return rootKey(norm(w)); }

/* ═══ Lemmas (precomputed) ═══
 *
 * Parallel to roots, but the GROUPING level between exact surface form and root:
 * all inflections/clitic-variants of one lemma collapse together, while distinct
 * derivations of a shared root (غفر vs استغفر) stay apart. Built offline from the
 * Quranic Arabic Corpus LEM field (`public/data/lemmas.json`, normForm → bare
 * lemma), installed via setLemmaMap after the data loads.
 *   - lemmaOf(n)  → the lemma, or null if unknown (left ungrouped in lemma mode).
 *   - lemmaKey(n) → lemma if known, else the word itself (the grouping key).
 */
let LEMMA_MAP = {};
export function setLemmaMap(map) { LEMMA_MAP = map || {}; }
export function lemmaOf(normForm) { return LEMMA_MAP[normForm] || null; }
export function lemmaKey(normForm) { return LEMMA_MAP[normForm] || normForm; }

/* The grouping key for a normalised word under the active mode. Single source of
 * truth for the exact/lemma/root branch so call sites stop re-implementing it.
 * Operates on a bare string (no per-occurrence context) — so root/lemma grouping
 * here is the majority-voted reading. Prefer wordGroupKey() when a word OBJECT is
 * available, since it can use the position-correct (per-occurrence) analysis. */
export function groupKey(normForm, mode) {
  return mode === "root" ? rootKey(normForm) : mode === "lemma" ? lemmaKey(normForm) : normForm;
}

/* The grouping key for a word OBJECT under the active mode — the position-correct
 * version of groupKey(). When the corpus morphology is loaded, each word carries
 * its per-occurrence root (`proot`) / lemma (`plemma`), so a homograph (one surface
 * skeleton, two roots — e.g. قل = قول vs قلل) groups under THIS verse's actual
 * reading rather than the commoner one. Falls back to the voted maps (identical to
 * groupKey) when morphology hasn't loaded yet or the word has no analysis, so the
 * graph works immediately and upgrades to position-correct edges when it arrives. */
export function wordGroupKey(w, mode) {
  if (mode === "root") return w.proot || rootKey(w.norm);
  if (mode === "lemma") return w.plemma || lemmaKey(w.norm);
  return w.exact ?? w.norm;
}

/* ═══ Stop words (two visible, editable groups) ═══
 *
 * Two separate sets so the UI can treat them differently and the user can
 * re-enable any of them:
 *   - STOP_PARTICLES        — grammatical glue (prepositions, pronouns, relatives,
 *                             demonstratives, conjunction-laden clitics). Hiding
 *                             these almost always declutters without losing content.
 *   - STOP_CONTENT_DEFAULT  — high-frequency CONTENT words (الله, رب…, and the most
 *                             common verbs) that are hidden by default for legibility
 *                             but a researcher may well want to study, so they're a
 *                             distinct, re-enableable group.
 * `STOP` is the live effective set the graph reads; it starts as the union and can
 * be replaced at runtime via setStopSet() (composed from the user's edits).
 */
export const STOP_PARTICLES = new Set("في,من,على,الى,عن,ان,لا,ما,هو,لم,قد,بل,ثم,او,كل,هم,هن,هي,نحن,الذي,الذين,التي,ذلك,هذا,هذه,تلك,الا,اذا,اذ,حتى,لن,لو,مع,بين,عند,فيه,فيها,منه,منها,عليه,عليها,اليه,اليها,به,بها,له,لها,لهم,لكم,لنا,بكم,منكم,عليكم,فيهم,منهم,عليهم,وما,فما,بما,مما,عما,كما,لما,فلا,ولا,يا,ايها,انه,انها,انا,لك,ذا,اولئك,هولاء,كيف,اين,متى,هل,انما,ذلكم".split(","));
export const STOP_CONTENT_DEFAULT = new Set("الله,رب,ربك,ربكم,ربه,ربهم,قل,قال,قالوا,كان,كانوا,كانت".split(","));

export let STOP = new Set([...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT]);
export function setStopSet(set) { STOP = set instanceof Set ? set : new Set(set || []); }

/* ═══ Forgiving search keys ═══
 *
 * The corpus is Uthmani, so a long-ā may be a dagger alef (ٱلسَّلَٰم) or a waw+dagger
 * (ٱلصَّلَوٰة، ٱلرِّبَوٰا). norm() strips the dagger, which makes conventional spellings
 * (السلام، الصلاة، الربا) miss. `searchAlef` rewrites those to a plain alef instead, so a
 * word is also indexed under its imlāʾī (modern) form; `looseKeys` returns every forgiving
 * key for a word/query (the loose norm, the dagger/waw→alef form, and that form with
 * hamza-carriers dropped — so a query's seated hamza ـئـ still matches the corpus ـءـ).
 * Generic: derived purely from the given string, used both to index words and to resolve a
 * query. Shared by the corpus-index builder and the toolbar search. */
const DAGGER = "ٰ";
const HAMZA = /[ءئؤ]/g;
// The dagger alef rides on a SEAT — usually و (صَلَوٰة) but also the alif-maqṣūra ى, which
// the muṣḥaf uses for a medial long-ā: مِيكَىٰل, مُوسَىٰ, عِيسَىٰ. norm() folds ى→ي, so without
// collapsing the whole ىٰ seat to a single ا the word is keyed as ميكيل (mi-KI-l) and the
// conventional alif spelling ميكال can never line up. Both seats fold here; bare daggers too.
export const searchAlef = (raw) =>
  norm((raw || "").normalize("NFKC").replace(new RegExp("[وى]" + DAGGER, "g"), "ا").replace(new RegExp(DAGGER, "g"), "ا")).replace(/ا{2,}/g, "ا");
// HAMZA-SEAT key: unify every hamza form (ء ؤ ئ) to a bare ء IN PLACE, length-preserving.
// Unlike the hamza-DROP fuzzy key (which deletes the consonant and so leaks جِئْنَا→جنا into a
// جن search), this only merges words that differ SOLELY by hamza seat: a carrier query
// (رؤيا، يستهزئون) meets the corpus bare-ء form (رءيا، يستهزءون) without changing length, so it
// is safe to index AND to suggest. norm() keeps ء, so ماء stays ماء (never merges into ما).
export const hamzaSeatKey = (raw) => searchAlef((raw || "").replace(/[ؤئ]/g, "ء"));
// STRONG keys: the loose norm + the dagger/seat→alef (imlāʾī) form + the hamza-seat-unified
// form. All real, length-stable spellings — safe to index a word under AND to expand a search.
export const strongKeys = (raw) =>
  [...new Set([norm(raw), searchAlef(raw), hamzaSeatKey(raw)].filter((k) => k && k.length >= 2))];
// ALL keys, strong PLUS the hamza-carrier-dropped form. The dropped-hamza key lets a query
// whose seat differs (ـئـ vs ـءـ) still RESOLVE to the corpus word — but it's a degraded form
// (جِئْنَا → "جنا") that collides with unrelated stems as a prefix, so it must be used only for
// direct resolution, never to seed suggestions. `fuzzyKeys` is exactly that residual set.
export const looseKeys = (raw) =>
  [...new Set([norm(raw), searchAlef(raw), searchAlef(raw.replace(HAMZA, ""))].filter((k) => k && k.length >= 2))];
export const fuzzyKeys = (raw) => {
  const strong = new Set(strongKeys(raw));
  return looseKeys(raw).filter((k) => !strong.has(k));
};
