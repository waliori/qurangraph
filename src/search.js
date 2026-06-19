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
 *   candidates  [{ lookup, label, mode, count }] distinct targets, most-frequent first
 */
// Strip a leading definite article (with optional و/ف/ب/ك/ل proclitics) off a normalised
// key, or null if it carries none. This is the targeted move that surfaces a word which
// ONLY occurs article-bound — ٱلْجِنّ (key الجن) → جن — from a bare query, WITHOUT the noise a
// blind substring match brings (it would also catch يخرجن, سجن … via an incidental جن
// bigram). Article-only keeps it to the real hiding case.
const ARTICLE = /^(?:و|ف)?(?:ب|ك|ل)?ال(.+)$/;
function deArticle(k) { const m = ARTICLE.exec(k); return m && m[1].length >= 2 ? m[1] : null; }

export function looseResolve(query, mode, precision, indices, searchAlias = {}, searchAliasFuzzy = {}) {
  const q = norm(query || "");
  if (q.length < 2) return { direct: null, candidates: [] };
  const idx = (indices && indices[mode]) || {};
  const QSall = looseKeys(query); // direct resolution: forgiving, incl. the hamza-dropped form
  const QS = strongKeys(query);   // suggestion expansion: strong keys only, so degraded keys don't leak

  // Resolve the typed word imlāʾī-tolerantly — strong alias first, then the fuzzy (hamza-dropped)
  // tier, so a query like يستهزئون still reaches the corpus form يستهزءون.
  const resolvedWord = QSall.map((k) => searchAlias[k] ?? searchAliasFuzzy[k]).find(Boolean) || null;
  const directKey = mode === "exact"
    ? (resolvedWord || (precision === "strict" ? normStrict(query) : q))
    : groupKey(resolvedWord || q, mode);
  const direct = idx[directKey] && idx[directKey].length
    ? { lookup: directKey, label: directKey, mode, count: idx[directKey].length }
    : null;

  // Distinct targets reachable from the query: a STRONG key matches if it begins with the
  // query, or does so once its definite article is stripped (so ٱلْجِنّ surfaces from جن). A
  // key that EQUALS the query (the word IS جن, like جِنّ/جَنَّ) is an "exact" hit and ranks
  // above one that merely starts with it (جناح, جند) — so the senses of the typed word lead.
  // Only strong keys are scanned, so a degraded key (جِئْنَا → "جنا") can't bridge into جن.
  const out = new Map();
  if (direct) out.set(directKey, { ...direct, exact: true });
  for (const k of Object.keys(searchAlias)) {
    const bare = deArticle(k);
    const exact = QS.some((x) => k === x || bare === x);
    if (!exact && !QS.some((x) => k.startsWith(x) || (bare && bare.startsWith(x)))) continue;
    const word = searchAlias[k];
    const target = mode === "exact" ? word : groupKey(word, mode);
    if (out.has(target)) { if (exact) out.get(target).exact = true; continue; }
    const arr = idx[target];
    if (!arr || !arr.length) continue;
    out.set(target, { lookup: target, label: target, mode, count: arr.length, exact });
  }
  const candidates = [...out.values()]
    .sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || b.count - a.count)
    .slice(0, 12);
  return { direct, candidates };
}
