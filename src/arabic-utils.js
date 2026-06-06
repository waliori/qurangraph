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
 */
export function norm(w) {
  return w
    // intentionally matches individual combining marks (harakat / annotation)
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[ً-ٰٟۖ-ۭࣔ-ࣰ࣡-ࣲؗ-ؚۢ-ۦ۪ۨ-۬]/g, "")
    .replace(/ـ/g, "")
    .replace(/[ٱآأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^ء-ي]/g, "")
    .trim();
}

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

export const STOP = new Set("في,من,على,الى,عن,ان,لا,ما,هو,لم,قد,بل,ثم,او,كل,هم,هن,هي,نحن,الذي,الذين,التي,ذلك,هذا,هذه,تلك,الا,اذا,اذ,حتى,لن,لو,مع,بين,عند,فيه,فيها,منه,منها,عليه,عليها,اليه,اليها,به,بها,له,لها,لهم,لكم,لنا,بكم,منكم,عليكم,فيهم,منهم,عليهم,وما,فما,بما,مما,عما,كما,لما,فلا,ولا,يا,قل,قالوا,قال,كان,كانوا,كانت,ايها,انه,انها,انا,لك,ذا,اولئك,هولاء,كيف,اين,متى,هل,الله,رب,ربك,ربكم,ربه,ربهم,انما,عليكم,ذلكم,الذين".split(","));
