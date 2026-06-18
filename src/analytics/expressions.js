/* ═══ Multi-word expressions (التعابير) — in-browser analysis ═══
 *
 * The heavy mining is done offline (scripts/build-expressions.js → public/data/expressions.json):
 * government frames (head + governed ḥarf jarr), إضافة compounds, and curated/statistical idioms.
 * These helpers index that inventory and shape the views the UI draws — all pure, so testable:
 *   - indexExpressions : reverse indices (head→frames, root→frames/compounds) built once.
 *   - frameContrast    : a head's preposition CONTRAST (آمَنَ→بـ vs … vs bare) — the signature lens.
 *   - expressionsForRoot: every frame/compound a root takes part in (for the root lab cross-link).
 *   - occVerses        : group an occurrence list into verses + the word indices to highlight.
 *
 * Occurrence tuples store word INDICES (corpus word order = the app's space-split words):
 *   frame    [vk, headIdx, prepIdx]   compound [vk, wordIdx]   idiom [vk, startIdx]
 */

const headKeyOf = (f) => `${f.pos}|${f.head}`;

/* Build the reverse indices once from the loaded expressions object. */
export function indexExpressions(expr) {
  const byHead = new Map();     // "pos|lemma" → [frame…]
  const headByRoot = new Map(); // root → Set("pos|lemma")
  const compByRoot = new Map(); // root → [compound…]
  for (const f of expr?.frames || []) {
    const k = headKeyOf(f);
    if (!byHead.has(k)) byHead.set(k, []);
    byHead.get(k).push(f);
    if (f.root) { if (!headByRoot.has(f.root)) headByRoot.set(f.root, new Set()); headByRoot.get(f.root).add(k); }
  }
  for (const c of expr?.compounds || []) {
    for (const r of new Set(c.roots || [])) { if (!r) continue; if (!compByRoot.has(r)) compByRoot.set(r, []); compByRoot.get(r).push(c); }
  }
  return { byHead, headByRoot, compByRoot };
}

/* One head's governed-preposition contrast, strongest first, with the bare (un-governed)
 * residual so the reader sees how often the head takes each ḥarf vs none. Returns
 * { head, pos, root, total, governed, bare, preps:[{ prep, gloss, count, occ }] } or null. */
export function frameContrast(expr, idx, headKey) {
  const list = idx.byHead.get(headKey);
  if (!list || !list.length) return null;
  const total = expr.headTotals?.[headKey] || 0;
  const governed = list.reduce((s, f) => s + f.count, 0);
  const preps = list.map((f) => ({ prep: f.prep, disp: expr.prepDisp?.[f.prep] || f.prep, count: f.count, occ: f.occ }))
    .sort((a, b) => b.count - a.count);
  const [pos, head] = headKey.split("|");
  return { head, pos, root: list[0].root, total, governed, bare: Math.max(0, total - governed), preps };
}

/* The head rows for the explorer: every governing head with its preposition breakdown,
 * by total governed count. */
export function headRows(expr, idx) {
  return [...idx.byHead.keys()]
    .map((k) => frameContrast(expr, idx, k))
    .filter(Boolean)
    .sort((a, b) => b.governed - a.governed);
}

/* Every expression a root participates in — for the root lab's "Expressions" cross-link.
 * Returns { heads:[frameContrast…], compounds:[compound…] }. */
export function expressionsForRoot(expr, idx, root) {
  if (!root) return { heads: [], compounds: [] };
  const heads = [...(idx.headByRoot.get(root) || [])].map((k) => frameContrast(expr, idx, k)).filter(Boolean).sort((a, b) => b.governed - a.governed);
  const compounds = (idx.compByRoot.get(root) || []).slice().sort((a, b) => b.count - a.count);
  return { heads, compounds };
}

const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };

/* Group an occurrence list into verses with the word indices to highlight. `span` maps one
 * occurrence tuple → the array of word indices to mark (default: every index after the verse
 * key). Returns [{ vk, hi:[wordIdx…] }] in muṣḥaf order. */
export function occVerses(occ, verseData, span) {
  const m = new Map();
  for (const o of occ || []) {
    const vk = o[0];
    if (verseData && !verseData[vk]) continue;
    const idxs = span ? span(o) : o.slice(1);
    if (!m.has(vk)) m.set(vk, new Set());
    for (const i of idxs) m.get(vk).add(i);
  }
  return [...m.entries()].map(([vk, set]) => ({ vk, hi: [...set] })).sort((a, b) => sortVk(a.vk, b.vk));
}

/* Span helpers. Frames mark two non-adjacent words (head + preposition); compounds and idioms
 * mark a contiguous run of `len` words from the start index. */
export const FRAME_SPAN = (o) => [o[1], o[2]];
export const spanRun = (len) => (o) => Array.from({ length: len }, (_, j) => o[1] + j);
