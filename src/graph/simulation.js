/* ═══ Live, decaying force simulation ═══
 *
 * Where forceLayout() settles a graph in one synchronous batch, this engine
 * steps ONE iteration per animation frame against a global `alpha` energy that
 * decays toward zero — so an interaction (drag, expand, select) visibly settles
 * instead of snapping. Idle (alpha≈0) it does nothing, so there's no background
 * cost once the graph comes to rest.
 *
 * The force model is the same as forceLayout (parent gravity + grid
 * repulsion/collision + link springs) so a settled live layout looks like the
 * batch one. Two extra pulls make the graph feel alive:
 *   • selection gather — when a node is selected, the nodes linked to it (its
 *                     direct children + any āyah it shares via a loop link) let go
 *                     of their usual parent and orbit the SELECTION alone. So a
 *                     shared āyah doesn't hover between two words — it travels all
 *                     the way over and re-gathers around whichever word is
 *                     selected, then back again when the other is selected.
 *
 * Determinism: no Math.random anywhere. New bodies are seeded from the x/y the
 * caller hands in (the component pre-seeds them in a phyllotaxis disk around the
 * parent). Pinned (dragged) and fixed (centre / dropped) bodies are never moved.
 */

const CUTOFF2 = 300000;            // pairs farther than this are ignored
const CELL = Math.sqrt(CUTOFF2);   // grid cell size = cutoff radius
const PAD = 48;                    // extra collision gap reserving room for labels

export function createSimulation(W = 1600, H = 1100) {
  const cx = W / 2, cy = H / 2;
  let bodies = [];                 // [{id,x,y,vx,vy,r,fixed,pinned}]
  let map = {};                    // id → body
  let parentId = {};               // id → primary-link source
  let links = [];                  // [{s,t,dist}]
  let alpha = 0;
  let selectedId = null;
  let gather = new Set();          // ids pulled toward the selection
  const userFixed = new Set();     // ids dropped by the user — stay put until reset

  const grid = new Map();
  const cellKey = (a, b) => a * 73856093 + b;

  /* Rebuild bodies from the current node set. Surviving nodes keep their live
   * position/velocity; new nodes take the seed coords on the node object; removed
   * nodes drop out. */
  function sync(nodes, lnks) {
    parentId = {};
    for (const l of lnks) if (parentId[l.target] === undefined) parentId[l.target] = l.source;
    links = lnks.map((l) => ({ s: l.source, t: l.target, dist: l.dist || 130 }));
    const next = [], nmap = {};
    for (const n of nodes) {
      let b = map[n.id];
      if (!b) b = { id: n.id, x: n.x ?? cx, y: n.y ?? cy, vx: 0, vy: 0 };
      b.r = n.r || 8;
      b.fixed = !!n.fixed || userFixed.has(n.id);
      b.pinned = b.pinned && !b.fixed;
      if (n.fixed) { b.x = n.x; b.y = n.y; b.vx = 0; b.vy = 0; }
      next.push(b); nmap[n.id] = b;
    }
    // Forget stickiness for nodes that no longer exist.
    for (const id of [...userFixed]) if (!nmap[id]) userFixed.delete(id);
    bodies = next; map = nmap;
  }

  function reheat(a = 1) { if (a > alpha) alpha = a; }
  // Force bodies (existing AND new) to explicit positions — used to restore a shared
  // arrangement, where sync() alone would leave already-placed nodes where they are.
  function place(map2) { for (const b of bodies) { const p = map2[b.id]; if (p && Number.isFinite(p.x)) { b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; } } }
  function setSelected(id, set) { selectedId = id || null; gather = set || new Set(); }
  function pin(id, x, y) { const b = map[id]; if (b) { b.pinned = true; b.x = x; b.y = y; b.vx = 0; b.vy = 0; } }
  function unpin(id) { const b = map[id]; if (b) b.pinned = false; }
  function stick(id) { const b = map[id]; if (b) { b.pinned = false; b.fixed = true; b.vx = 0; b.vy = 0; userFixed.add(id); } }
  // Drop every user-pin immediately: release the bodies the user stuck (the centre
  // and other structurally-fixed nodes are not in userFixed, so they stay put).
  function clearSticky() {
    for (const id of userFixed) { const b = map[id]; if (b) b.fixed = false; }
    userFixed.clear();
    for (const b of bodies) if (b.pinned) b.pinned = false;
  }

  function step() {
    if (alpha < 0.006) return false;
    const al = alpha * 0.85;
    const N = bodies.length;

    // A node linked to the selection orbits the SELECTION alone (it drops its
    // parent anchor) so a shared āyah travels all the way across. But it's pulled
    // to a target RADIUS around the selection — sized like the expansion ring so
    // the cluster stays a roomy, label-legible disk instead of collapsing onto the
    // centre. Everything else orbits its own parent.
    const R = selectedId ? Math.max(150, 36 * Math.sqrt(gather.size)) : 0;
    for (const b of bodies) {
      if (b.fixed || b.pinned) continue;
      if (selectedId && gather.has(b.id)) {
        const s = map[selectedId];
        if (s) {
          const dx = b.x - s.x, dy = b.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (R - d) / d * 0.08 * al; // spring toward the ring at radius R
          b.vx += dx * f; b.vy += dy * f;
        }
        continue;
      }
      const p = parentId[b.id] !== undefined ? map[parentId[b.id]] : null;
      if (p) { b.vx += (p.x - b.x) * 0.016 * al; b.vy += (p.y - b.y) * 0.016 * al; }
      else { b.vx += (cx - b.x) * 0.002 * al; b.vy += (cy - b.y) * 0.002 * al; }
    }

    // Repulsion + collision, bucketed by a uniform spatial grid (≈O(n)).
    grid.clear();
    for (let i = 0; i < N; i++) {
      const b = bodies[i];
      const k = cellKey(Math.floor(b.x / CELL), Math.floor(b.y / CELL));
      const bk = grid.get(k);
      if (bk) bk.push(i); else grid.set(k, [i]);
    }
    for (let i = 0; i < N; i++) {
      const a = bodies[i];
      const gx = Math.floor(a.x / CELL), gy = Math.floor(a.y / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bk = grid.get(cellKey(gx + ox, gy + oy));
          if (!bk) continue;
          for (const j of bk) {
            if (j <= i) continue;
            const b = bodies[j];
            let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 > CUTOFF2) continue;
            const dist = Math.sqrt(d2) || 1;
            const aMov = !a.fixed && !a.pinned, bMov = !b.fixed && !b.pinned;
            if (dist < a.r + b.r + PAD) {
              const f = (a.r + b.r + PAD - dist) / dist * 0.6 * al;
              if (aMov) { a.vx -= dx * f; a.vy -= dy * f; }
              if (bMov) { b.vx += dx * f; b.vy += dy * f; }
            }
            const rep = -55 * al / (d2 + 200);
            if (aMov) { a.vx += dx / dist * rep; a.vy += dy / dist * rep; }
            if (bMov) { b.vx -= dx / dist * rep; b.vy -= dy / dist * rep; }
          }
        }
      }
    }

    // Link springs. A gathered node's springs are suppressed while it's gathering
    // so its old parent link can't reel it back — the gather pull alone places it,
    // forming a clean ring around the selection at collision spacing.
    for (const l of links) {
      if (selectedId && (gather.has(l.s) || gather.has(l.t))) continue;
      const s = map[l.s], t = map[l.t];
      if (!s || !t) continue;
      let dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (dist - l.dist) / dist * 0.06 * al;
      if (!s.fixed && !s.pinned) { s.vx += dx * f; s.vy += dy * f; }
      if (!t.fixed && !t.pinned) { t.vx -= dx * f; t.vy -= dy * f; }
    }

    // Integrate (pinned/fixed bodies hold their position).
    for (const b of bodies) {
      if (b.fixed || b.pinned) continue;
      b.vx *= 0.65; b.vy *= 0.65;
      b.x += b.vx; b.y += b.vy;
      b.x = Math.max(-3 * W, Math.min(4 * W, b.x));
      b.y = Math.max(-3 * H, Math.min(4 * H, b.y));
    }
    alpha *= 0.94;
    return true;
  }

  function getPositions() {
    const o = {};
    for (const b of bodies) o[b.id] = { x: b.x, y: b.y };
    return o;
  }

  return {
    sync, reheat, place, setSelected, pin, unpin, stick, clearSticky, step, getPositions,
    get alpha() { return alpha; },
  };
}
