/* ═══ Deterministic force-directed layout ═══
 *
 * Mutates the passed `nodes` in place (sets x/y) and returns them.
 *
 * Determinism: initial placement of an un-positioned node is derived from its
 * array index and a stable hash of its id — never Math.random — so the same
 * graph always lays out identically (reproducible views, testable output).
 *
 * Pinning: a node with `fixed: true` is never moved. If it already has x/y
 * (e.g. a user-dragged or previously-settled node passed back in) it keeps
 * them; only a fixed node *without* coordinates is snapped to the centre.
 * This lets callers pin already-placed nodes and let new ones settle around
 * them without disturbing the existing layout.
 */

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

  for (let it = 0; it < iters; it++) {
    const al = (1 - it / iters) * 0.85;

    // Gravity toward centre
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx += (cx - n.x) * 0.002 * al;
      n.vy += (cy - n.y) * 0.002 * al;
    }

    // Pairwise repulsion + collision
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 > 300000) continue;
        const dist = Math.sqrt(d2) || 1;
        if (dist < a.r + b.r + 22) {
          const f = (a.r + b.r + 22 - dist) / dist * 0.6 * al;
          if (!a.fixed) { a.vx -= dx * f; a.vy -= dy * f; }
          if (!b.fixed) { b.vx += dx * f; b.vy += dy * f; }
        }
        const rep = -55 * al / (d2 + 200);
        if (!a.fixed) { a.vx += dx / dist * rep; a.vy += dy / dist * rep; }
        if (!b.fixed) { b.vx -= dx / dist * rep; b.vy -= dy / dist * rep; }
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

    // Integrate
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx *= 0.65; n.vy *= 0.65;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(40, Math.min(W - 40, n.x));
      n.y = Math.max(40, Math.min(H - 40, n.y));
    }
  }

  return nodes;
}
