/* ═══ Lexical relations (runtime accessors) ═══
 *
 * Readers over the precomputed relations map (public/data/relations.json, built by
 * scripts/build-antithesis.js from the curated data/antonyms.json). Opposition only — the
 * authoritative opposites are human-curated; "candidates" are frame-discovered pairs kept
 * separate for review. Everything is evidenced (verses attached). No affinity axis.
 *
 * `data` is the loaded relations object { byRoot, catalogue, candidates } (or null/{} before load).
 */

/* A root's relations, ranked (curated opposites first, then candidates). */
export function relationsOf(root, data) {
  return (data && data.byRoot && data.byRoot[root]) || [];
}

/* Curated, authoritative opposites of a root. */
export function oppositesOf(root, data) {
  return relationsOf(root, data).filter((r) => r.polarity === "opposite");
}
/* Frame-discovered, un-curated candidate opposites of a root (for review). */
export function candidatesOf(root, data) {
  return relationsOf(root, data).filter((r) => r.polarity === "candidate");
}

/* The CURATED opposite pairs whose antithesis frame falls at `vk` (framed only — a real
 * construction at this verse, not mere co-occurrence). Returns [{ a, b, gloss, verses[]… }]. */
export function verseAntithesis(vk, data) {
  if (!data || !data.catalogue) return [];
  return data.catalogue.filter((c) => c.framed && c.verses && c.verses.includes(vk));
}

/* The curated opposites catalogue (authoritative). `opts.framedOnly` → only those with an
 * attested antithesis construction. Order as built (framed first, then by contrast). */
export function oppositesCatalogue(data, opts = {}) {
  let list = (data && data.catalogue) || [];
  if (opts.framedOnly) list = list.filter((c) => c.framed);
  return list;
}

/* The discovered candidate pairs (un-curated) — for the reviewer to promote into antonyms.json. */
export function candidatesCatalogue(data) {
  return (data && data.candidates) || [];
}
