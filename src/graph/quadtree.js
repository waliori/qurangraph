/* ═══ Barnes-Hut quadtree (long-range repulsion) ═══
 *
 * Replaces the old grid+cutoff repulsion. That scheme ignored every pair farther
 * apart than ~547px, so two clusters beyond the cutoff exerted ZERO mutual force and
 * link springs could pull separate subtrees into overlapping knots — and its cell was
 * many node-widths wide, so each 3×3 scan still examined hundreds of candidates,
 * degrading toward O(n²) as density rose.
 *
 * Barnes-Hut sums the repulsion from EVERY other body with no distance cutoff: a
 * distant group of bodies is approximated by a single point at its centre of mass, so
 * the whole graph spreads apart correctly in O(n log n). Each body has unit mass (a
 * node "counts as 1"); the force is the same inverse-square law with the same softening
 * as before, so short-range settled spacing matches the old tuning while the far field
 * is now correct.
 *
 * Determinism: the tree is built in array order and traversed deterministically, so —
 * like the rest of the engine — the same graph always lays out identically.
 */

export const THETA = 0.9;          // opening angle: larger = faster, looser approximation
const THETA2 = THETA * THETA;
const MIN_SIZE = 1;                // below this, coincident bodies stop subdividing (no infinite recursion)

function makeNode(x, y, size) {
  return { x, y, size, cmx: 0, cmy: 0, count: 0, body: null, kids: null };
}

function placeInChild(node, b) {
  const half = node.size / 2;
  const right = b.x >= node.x + half ? 1 : 0;
  const bottom = b.y >= node.y + half ? 1 : 0;
  const q = bottom * 2 + right;
  let child = node.kids[q];
  if (!child) child = node.kids[q] = makeNode(node.x + right * half, node.y + bottom * half, half);
  insert(child, b);
}

function insert(node, b) {
  // Running centre of mass (every body is unit mass).
  node.cmx = (node.cmx * node.count + b.x) / (node.count + 1);
  node.cmy = (node.cmy * node.count + b.y) / (node.count + 1);
  node.count++;
  if (node.count === 1) { node.body = b; return; }      // first body → this node is its leaf
  // Coincident / sub-pixel cluster: stop subdividing and just accumulate (cm/count
  // already updated). A leaf with count > 1 is treated as a point cluster in force().
  if (node.size <= MIN_SIZE) { node.body = null; return; }
  if (node.kids === null) {
    node.kids = [null, null, null, null];
    const existing = node.body; node.body = null;
    if (existing) placeInChild(node, existing);
  }
  placeInChild(node, b);
}

/* Build a quadtree over `bodies` (each needs finite x/y). Returns the root, or null
 * when there's nothing to build. Non-finite bodies are skipped (the integrator repairs
 * them separately, but they must never corrupt the bounds). */
export function buildQuadtree(bodies) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of bodies) {
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    if (b.x < minX) minX = b.x;
    if (b.x > maxX) maxX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.y > maxY) maxY = b.y;
  }
  if (!Number.isFinite(minX)) return null;
  const size = Math.max(maxX - minX, maxY - minY, 1);
  const root = makeNode(minX, minY, size);
  for (const b of bodies) if (Number.isFinite(b.x) && Number.isFinite(b.y)) insert(root, b);
  return root;
}

/* Repulsion force on body `b` from the whole tree, as { fx, fy } (NOT yet scaled by
 * the per-iteration alpha — the caller multiplies). `strength` is the inverse-square
 * constant and `soft` the softening added to d² (matching the old rep = strength/(d²+soft)).
 * Iterative traversal (explicit stack) to avoid per-node call overhead on big graphs. */
export function repulsionForce(root, b, strength, soft) {
  let fx = 0, fy = 0;
  if (!root) return { fx, fy };
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || node.count === 0) continue;
    const dx = b.x - node.cmx, dy = b.y - node.cmy;
    const d2 = dx * dx + dy * dy;
    const leaf = node.kids === null;
    // Approximate when this is a leaf, OR the node subtends a small angle (size/d < θ).
    if (leaf || node.size * node.size < THETA2 * d2) {
      if (leaf && node.count === 1 && node.body === b) continue; // don't repel self
      if (d2 === 0) continue;                                    // coincident — no direction
      const d = Math.sqrt(d2);
      const mag = (strength * node.count) / (d2 + soft);
      fx += (dx / d) * mag;
      fy += (dy / d) * mag;
    } else {
      const k = node.kids;
      if (k[0]) stack.push(k[0]);
      if (k[1]) stack.push(k[1]);
      if (k[2]) stack.push(k[2]);
      if (k[3]) stack.push(k[3]);
    }
  }
  return { fx, fy };
}
