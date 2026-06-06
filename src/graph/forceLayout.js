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
 * Repulsion/collision use a uniform spatial-hash grid so the per-iteration cost
 * is ~O(n) for evenly-spread graphs instead of O(n²). The grid cell size equals
 * the interaction cutoff radius, so every pair within range lands in the same or
 * an adjacent cell — the set of pairs considered is identical to the old
 * all-pairs loop with its `d2 > CUTOFF` early-out, only without visiting the
 * far-apart pairs that were skipped anyway.
 */

const CUTOFF2 = 300000;                       // pairs farther than this are ignored
const CELL = Math.sqrt(CUTOFF2);              // grid cell size = cutoff radius
const PAD = 48;                               // extra collision gap reserving room for node labels

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // → [0, 1)
}

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
  // Visit each near pair once via a 3×3 neighbourhood of grid cells. Deterministic:
  // depends only on node coordinates and array order, never on Math.random.
  const grid = new Map();
  const cellKey = (cxi, cyi) => cxi * 73856093 + cyi; // pair → integer hash
  const rebuildGrid = () => {
    grid.clear();
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const k = cellKey(Math.floor(n.x / CELL), Math.floor(n.y / CELL));
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

    // Pairwise repulsion + collision, bucketed by spatial grid.
    rebuildGrid();
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      const gx = Math.floor(a.x / CELL), gy = Math.floor(a.y / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(cellKey(gx + ox, gy + oy));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue; // process each unordered pair once
            const b = nodes[j];
            let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 > CUTOFF2) continue;
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
            const rep = -55 * al / (d2 + 200);
            if (!a.fixed) { a.vx += dx / dist * rep; a.vy += dy / dist * rep; }
            if (!b.fixed) { b.vx -= dx / dist * rep; b.vy -= dy / dist * rep; }
          }
        }
      }
    }

    // Link springs
    for (const l of links) {
      const s = nm[l.source], t = nm[l.target];
      if (!s || !t) continue;
      let dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (dist - (l.dist || 110)) / dist * 0.06 * al;
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
      n.x = Math.max(-3 * W, Math.min(4 * W, n.x));
      n.y = Math.max(-3 * H, Math.min(4 * H, n.y));
    }
  }

  return nodes;
}
