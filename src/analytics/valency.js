/* ═══ Verb valency profile (التعدية واللزوم) ═══
 *
 * Consolidates a verb root's argument structure from the already-mined expressions:
 *   - governed prepositions (حروف الجرّ) it takes, with frequencies — آمَنَ بـ، كَفَرَ بـ،
 *     تَوَكَّلَ على — i.e. how the verb reaches its complement (تعدية بحرف);
 *   - direct nominal collocates (its objects/co-arguments), a proxy for direct transitivity.
 * Pure: it just reshapes `expressionsForRoot(...)`'s output ({ heads, collocations }), so it
 * needs no data the expressions lens doesn't already load. Returns null for a non-verb/empty
 * root. The reading (transitive vs. preposition-governing) is the reader's; this is the evidence. */
export function valencyProfile(rootView) {
  if (!rootView || (!rootView.heads?.length && !rootView.collocations?.length)) return null;
  // Aggregate governed prepositions across all verb-form heads of the root.
  const prepTally = new Map(); // prep → count
  let governed = 0, bare = 0;
  for (const h of rootView.heads || []) {
    bare += h.bare || 0;
    for (const p of h.preps || []) { prepTally.set(p.prep, (prepTally.get(p.prep) || 0) + p.count); governed += p.count; }
  }
  const preps = [...prepTally.entries()].map(([prep, count]) => ({ prep, count })).sort((a, b) => b.count - a.count || a.prep.localeCompare(b.prep));
  const objects = (rootView.collocations || []).map((c) => ({ noun: c.noun, count: c.count })).sort((a, b) => b.count - a.count);
  const objectTotal = objects.reduce((s, o) => s + o.count, 0);
  return { preps, governed, bare, objects, objectTotal };
}
