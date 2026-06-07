/* ═══ Deterministic force-directed layout ═══
 *
 * Mutates the passed `nodes` in place (sets x/y) and returns them.
 *
 * Determinism: initial placement of an un-positioned node is derived from its
 * array index and a stable hash of its id — never Math.random — so the same
 * graph always lays out identically (reproducible views, testable output).
 * (In practice the graph builder seeds coordinates first, so this branch only
 * runs for nodes handed in without x/y, e.g. in unit tests.)
 *
 * Pinning: a node with `fixed: true` is never moved. If it already has x/y
 * (e.g. a user-dragged or previously-settled node passed back in) it keeps
 * them; only a fixed node *without* coordinates is snapped to the centre.
 * This lets callers pin already-placed nodes and let new ones settle around
 * them without disturbing the existing layout.
 *
 * Repulsion is long-range via a Barnes-Hut quadtree (quadtree.js): every body feels
 * every other (distant groups approximated by their centre of mass) in O(n log n),
 * with no distance cutoff — so far-apart clusters still repel and don't overlap.
 * Collision (local overlap resolution) keeps a uniform grid, sized so a 3×3 scan
 * around a cell covers any colliding pair, which is genuinely O(n).
 *
 * Shared force constants (REP_STRENGTH / REP_SOFT / COLLIDE_CELL / PAD /
 * DEFAULT_LINK_DIST) and the grid / hash helpers live in forceConstants.js, so this
 * batch layout and the live engine in simulation.js can never drift apart.
 */

import { REP_STRENGTH, REP_SOFT, COLLIDE_CELL, PAD, DEFAULT_LINK_DIST, cellKey, hash } from "./forceConstants.js";
import { buildQuadtree, repulsionForce } from "./quadtree.js";

export function forceLayout(nodes, links, W, H, iters = 160) {
  const cx = W / 2, cy = H / 2;
  const nm = {};

  // Each node's parent (the source of the link pointing at it). Used to make
  // children orbit their parent — so a word's many verses cluster tightly
  // AROUND the word instead of streaming back toward the global centre in a
  // long column. The chain of parents ends at the pinned centre, so every
  // subtree stays anchored and finite.
  const parentOf = {};
  for (const l of links) if (parentOf[l.target] === undefined) parentOf[l.target] = l.source;

  nodes.forEach((n, i) => {
    nm[n.id] = n;
    if (n.x === undefined || n.y === undefined) {
      if (n.fixed) {
        n.x = cx; n.y = cy;
      } else {
        const jitter = hash(n.id);
        const a = (i / nodes.length) * Math.PI * 2 + (n.depth || 1) * 0.3 + jitter * 0.5;
        const r = 110 + (n.depth || 1) * 100 + jitter * 30;
        n.x = cx + Math.cos(a) * r;
        n.y = cy + Math.sin(a) * r;
      }
    }
    n.vx = 0; n.vy = 0;
  });

  const N = nodes.length;
  // Collision grid: visit each near pair once via a 3×3 neighbourhood of cells, sized
  // so any colliding pair lands in the same or an adjacent cell. Deterministic:
  // depends only on node coordinates and array order, never on Math.random.
  const grid = new Map();
  const rebuildGrid = () => {
    grid.clear();
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const k = cellKey(Math.floor(n.x / COLLIDE_CELL), Math.floor(n.y / COLLIDE_CELL));
      const bucket = grid.get(k);
      if (bucket) bucket.push(i); else grid.set(k, [i]);
    }
  };

  for (let it = 0; it < iters; it++) {
    const al = (1 - it / iters) * 0.85;

    // Gravity: a node with a parent orbits ONLY that parent — no pull toward the
    // global centre. A global pull would bias every child toward the centre side
    // of its parent and, with sibling repulsion, collapse a large fan-out into a
    // vertical column whenever the parent sits off-centre. Pure parent-anchoring
    // lets children spread symmetrically into a radial burst around the word.
    // The parent chain ends at the pinned centre, so subtrees stay anchored.
    for (const n of nodes) {
      if (n.fixed) continue;
      const p = parentOf[n.id] !== undefined ? nm[parentOf[n.id]] : null;
      if (p) {
        n.vx += (p.x - n.x) * 0.016 * al;
        n.vy += (p.y - n.y) * 0.016 * al;
      } else {
        n.vx += (cx - n.x) * 0.002 * al;
        n.vy += (cy - n.y) * 0.002 * al;
      }
    }

    // Long-range repulsion via Barnes-Hut: every node is pushed away from every other
    // (distant groups summed at their centre of mass), so separate subtrees never
    // overlap regardless of distance — the old grid cutoff zeroed this far field.
    const tree = buildQuadtree(nodes);
    for (const n of nodes) {
      if (n.fixed) continue;
      const { fx, fy } = repulsionForce(tree, n, REP_STRENGTH, REP_SOFT);
      n.vx += fx * al; n.vy += fy * al;
    }

    // Collision: short-range overlap resolution, bucketed by the (small) grid.
    rebuildGrid();
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      const gx = Math.floor(a.x / COLLIDE_CELL), gy = Math.floor(a.y / COLLIDE_CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(cellKey(gx + ox, gy + oy));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue; // process each unordered pair once
            const b = nodes[j];
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            const dist = Math.sqrt(d2) || 1;
            // Min gap is generous (not just r+r): every node carries a text label
            // (~60-80px wide for an āyah ref) drawn beside it, so a radius-only
            // collision still let labels overlap badly. PAD reserves room for the
            // label, so a freshly-expanded fan settles into a readable disk.
            if (dist < a.r + b.r + PAD) {
              const f = (a.r + b.r + PAD - dist) / dist * 0.6 * al;
              if (!a.fixed) { a.vx -= dx * f; a.vy -= dy * f; }
              if (!b.fixed) { b.vx += dx * f; b.vy += dy * f; }
            }
          }
        }
      }
    }

    // Link springs
    for (const l of links) {
      const s = nm[l.source], t = nm[l.target];
      if (!s || !t) continue;
      let dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Falsy-zero trap: a 0-length spring is nonsensical, so only a finite
      // positive dist counts as intentional; else the shared default applies.
      const rest = Number.isFinite(l.dist) && l.dist > 0 ? l.dist : DEFAULT_LINK_DIST;
      const f = (dist - rest) / dist * 0.06 * al;
      if (!s.fixed) { s.vx += dx * f; s.vy += dy * f; }
      if (!t.fixed) { t.vx -= dx * f; t.vy -= dy * f; }
    }

    // Integrate. No hard rectangle: confining nodes to the W×H canvas is what
    // forced a large fan-out to pile up along an edge into a column. Clusters
    // now spread freely (pan/zoom reaches them); a very generous guard only
    // stops a pathological NaN/runaway from escaping to infinity.
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx *= 0.65; n.vy *= 0.65;
      n.x += n.vx; n.y += n.vy;
      // Explicit NaN/Inf repair: the clamp below CANNOT sanitize a non-finite
      // value (Math.max(lo, Math.min(hi, NaN)) === NaN), so one NaN node would
      // poison every neighbour on the next iteration. Zero the offending velocity
      // and, if a coordinate went non-finite, snap it back to the last finite
      // value or the canvas centre. The layout must never propagate NaN.
      if (!Number.isFinite(n.vx)) n.vx = 0;
      if (!Number.isFinite(n.vy)) n.vy = 0;
      if (!Number.isFinite(n.x)) { n.x = Number.isFinite(n._lastX) ? n._lastX : cx; n.vx = 0; }
      if (!Number.isFinite(n.y)) { n.y = Number.isFinite(n._lastY) ? n._lastY : cy; n.vy = 0; }
      n.x = Math.max(-3 * W, Math.min(4 * W, n.x));
      n.y = Math.max(-3 * H, Math.min(4 * H, n.y));
      n._lastX = n.x; n._lastY = n.y; // remembered finite fallback for the next iter
    }
  }

  return nodes;
}
