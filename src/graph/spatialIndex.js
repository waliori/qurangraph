/* ═══ Uniform-grid spatial index (hit-testing) ═══
 *
 * The SVG renderer gets click/hover for free from per-node DOM elements. The Canvas
 * renderer has none, so it hit-tests in JS: bucket nodes into a coarse grid by their
 * world position, then a pointer test only checks the 3×3 cells around the cursor
 * instead of every node — O(1)-ish even on a graph of thousands. Pure + framework-
 * free, so it's unit-testable. Reuses cellKey() from the force model (same pair-hash).
 */
import { cellKey } from "./forceConstants.js";

// Grid cell size. Must exceed the largest node radius (+slack) so a node overlapping
// the cursor always sits in the searched 3×3 neighbourhood. Centre node r≈28.
export const HIT_CELL = 80;

function nodePos(n, positions) {
  const p = positions?.[n.id];
  return p && Number.isFinite(p.x) ? p : n;
}

/* Bucket nodes by their (live) position. positions = { id:{x,y} }; falls back to a
 * node's own x/y (its build-time seed) when it has no live position yet. */
export function buildSpatialIndex(nodes, positions, cell = HIT_CELL) {
  const grid = new Map();
  for (const n of nodes || []) {
    const p = nodePos(n, positions);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const k = cellKey(Math.floor(p.x / cell), Math.floor(p.y / cell));
    const arr = grid.get(k);
    if (arr) arr.push(n); else grid.set(k, [n]);
  }
  return { grid, cell };
}

/* Nearest node whose disc (r + slack) covers world point (x,y), or null. Searches
 * only the 3×3 cells around the point. `positions` resolves live coordinates. */
export function hitTest(index, positions, x, y, slack = 4) {
  if (!index || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const { grid, cell } = index;
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  let best = null, bestD = Infinity;
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const arr = grid.get(cellKey(gx + ox, gy + oy));
      if (!arr) continue;
      for (const n of arr) {
        const p = nodePos(n, positions);
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
        if (d <= (n.r || 8) + slack && d < bestD) { bestD = d; best = n; }
      }
    }
  }
  return best;
}
