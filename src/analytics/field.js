import { distributionBySura } from "./stats.js";

/* ═══ Semantic-field aggregation ═══
 *
 * Aggregates the corpus over a SET of roots (a user-built حقل دلالي) instead of one:
 *   - totalVerses : distinct verses touched by any root in the field
 *   - distribution: per-sūra verse counts, summed across the field's roots
 *   - perRoot     : each root's own verse count (so the field's makeup is visible)
 * Pure; reuses distributionBySura over r2v. `surahList` = [{ id, name }]. */
export function fieldStats(roots, r2v, verseData, surahList) {
  const list = (roots || []).filter((r) => r2v && r2v[r]);
  const bySura = new Map(); // sura id → count (verse-level, summed per root)
  const allVerses = new Set();
  const perRoot = [];
  for (const root of list) {
    const dist = distributionBySura(root, r2v, verseData, surahList, "root");
    let rootVerses = 0;
    for (const d of dist) if (d.count) { bySura.set(d.sura, (bySura.get(d.sura) || 0) + d.count); rootVerses += d.count; }
    for (const vk of r2v[root]) allVerses.add(vk);
    perRoot.push({ root, verses: (r2v[root] || []).length, count: rootVerses });
  }
  const distribution = surahList
    .map((s) => ({ sura: s.id, name: s.name, count: bySura.get(s.id) || 0 }))
    .filter((d) => d.count > 0);
  perRoot.sort((a, b) => b.verses - a.verses);
  return { rootCount: list.length, totalVerses: allVerses.size, distribution, perRoot };
}
