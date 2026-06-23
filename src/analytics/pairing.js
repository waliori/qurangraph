/* ═══ Co-occurrence pairing matrix (مصفوفة الاقتران) ═══
 *
 * The jinn/ins argument is entirely a pairing claim: جنّ↔إنس and جِنّة↔ناس co-occur, while
 * جنّ↔جانّ NEVER do — and the EMPTY cell is the evidence. Single-term collocation can't show a
 * zero; this builds the full grid over a chosen set of terms so the blanks are visible.
 *
 * Each term is pre-resolved by the caller to its verse-key set ({ label, key, mode, keys:[vk…] }),
 * so this module is agnostic to how a root/lemma/word maps to verses (r2v/l2v/w2v live in the app).
 * Cell (row i, col j) = the verses where BOTH terms occur (set intersection), with the count and the
 * verse list kept so a click drills in. Supports an asymmetric grid (rows × cols, e.g. the
 * fire-side terms × the clay-side terms) or a symmetric square when only one axis is given.
 *
 * Pure. No text needed — only the verse-key sets.
 */

const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };

// Intersection of two verse-key lists, returned sorted in muṣḥaf order.
function intersect(a, b) {
  const small = a.length <= b.length ? a : b;
  const big = new Set(a.length <= b.length ? b : a);
  const out = [];
  for (const k of small) if (big.has(k)) out.push(k);
  return out.sort(sortVk);
}

/* Build the pairing matrix. `rowTerms` / `colTerms` are term descriptors with a `keys` array; when
 * `colTerms` is omitted the rows are paired against themselves (symmetric square). Returns
 *   { rows, cols, cells:[[{count, keys}]], rowTotals:[…], colTotals:[…], symmetric:bool }
 * where rows/cols are the descriptors (sans keys, plus their own `total`). The diagonal of a
 * symmetric grid is the term's own occurrence count. */
export function pairingMatrix(rowTerms, colTerms) {
  const rows = (rowTerms || []).filter((t) => t && Array.isArray(t.keys));
  const symmetric = !colTerms;
  const cols = symmetric ? rows : (colTerms || []).filter((t) => t && Array.isArray(t.keys));
  const cells = rows.map((r) =>
    cols.map((c) => {
      // own count on the symmetric diagonal; otherwise the co-occurrence intersection
      const keys = (symmetric && r === c) ? [...r.keys].sort(sortVk) : intersect(r.keys, c.keys);
      return { count: keys.length, keys };
    }));
  const strip = (t) => ({ label: t.label, key: t.key ?? null, mode: t.mode ?? null, total: t.keys.length });
  return {
    rows: rows.map(strip), cols: cols.map(strip), cells,
    rowTotals: rows.map((t) => t.keys.length), colTotals: cols.map((t) => t.keys.length), symmetric,
  };
}

/* Flatten to ranked pairs (for export / "the strongest and the empty cells"), skipping the
 * symmetric diagonal and de-duplicating mirror pairs. Returns [{ row, col, count, keys }] with the
 * EMPTY pairs kept (count 0) because absence is the finding. Sorted by count desc, then label. */
export function pairingPairs(matrix) {
  const out = [];
  const seen = new Set();
  matrix.rows.forEach((r, i) => {
    matrix.cols.forEach((c, j) => {
      if (matrix.symmetric && i === j) return;
      if (matrix.symmetric) { const key = i < j ? `${i}|${j}` : `${j}|${i}`; if (seen.has(key)) return; seen.add(key); }
      const cell = matrix.cells[i][j];
      out.push({ row: r.label, col: c.label, count: cell.count, keys: cell.keys });
    });
  });
  return out.sort((a, b) => b.count - a.count || a.row.localeCompare(b.row) || a.col.localeCompare(b.col));
}
