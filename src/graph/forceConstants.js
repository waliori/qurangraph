/* ═══ Shared force-model constants & helpers ═══
 *
 * The batch layout (forceLayout.js) and the live engine (simulation.js) implement
 * the SAME force model — parent gravity + Barnes-Hut repulsion + grid collision +
 * link springs — so a settled live layout matches the batch one. These constants and
 * helpers are the parts that must be identical between them; keeping them in one module
 * removes the old "MUST agree" hazard where the two files each declared their own copy
 * and could silently drift apart. The integration loops themselves stay in each file:
 * one iterates synchronously to rest, the other steps once per frame against a decaying
 * alpha (with selection-gather and user-pinning), so they aren't a single shared
 * function — but they pull their shared numbers and grid math from here.
 *
 * Repulsion is long-range via a Barnes-Hut quadtree (quadtree.js); collision (local
 * overlap resolution) still uses a uniform grid, now sized to just cover the largest
 * possible colliding pair (≈ 2·maxR + PAD) so each 3×3 scan is genuinely O(1) per node.
 */

export const REP_STRENGTH = 55;            // inverse-square repulsion constant (force ≈ STRENGTH/(d²+SOFT))
export const REP_SOFT = 200;               // softening added to d² so close pairs don't blow up
export const COLLIDE_CELL = 110;           // collision grid cell — must exceed maxR(28)+maxR(20)+PAD(48)≈96
export const PAD = 48;                      // extra collision gap reserving room for node labels
export const DEFAULT_LINK_DIST = 130;      // link spring rest length when a link gives none

/* Integer key for the (cx, cy) grid cell — a cheap pair → int hash. */
export const cellKey = (cx, cy) => cx * 73856093 + cy;

/* Stable FNV-1a hash of a string → [0, 1). Deterministic seeding (never
 * Math.random) so the same graph always lays out identically. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
