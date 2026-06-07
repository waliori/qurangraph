/* ═══ Shared force-model constants & helpers ═══
 *
 * The batch layout (forceLayout.js) and the live engine (simulation.js) implement
 * the SAME force model — parent gravity + grid repulsion/collision + link springs —
 * so a settled live layout matches the batch one. These constants and helpers are
 * the parts that must be identical between them; keeping them in one module removes
 * the old "MUST agree" hazard where the two files each declared their own copy and
 * could silently drift apart. The integration loops themselves stay in each file:
 * one iterates synchronously to rest, the other steps once per frame against a
 * decaying alpha (with selection-gather and user-pinning), so they aren't a single
 * shared function — but they pull their shared numbers and grid math from here.
 */

export const CUTOFF2 = 300000;             // pairs farther apart than this (squared) are ignored
export const CELL = Math.sqrt(CUTOFF2);    // spatial-hash grid cell size = interaction cutoff radius
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
