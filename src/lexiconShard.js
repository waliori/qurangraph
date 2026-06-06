/* Stable sharding for lexicon FULL articles.
 *
 * The full-text lexicons are huge (Lisān al-ʿArab alone is ~15 MB). Shipping each
 * as one JSON meant clicking "show more" on a single root pulled the entire file.
 * Instead the builder splits each into FULL_SHARDS buckets keyed by a stable hash
 * of the root, and the app fetches only the one bucket a root falls in (~a few
 * hundred KB at most). Builder and loader MUST agree on this function, hence one
 * shared module imported by both the Node build script and the browser app. */

export const FULL_SHARDS = 64;

// FNV-1a over the root's UTF-16 code units — deterministic, no deps, stable across
// Node and the browser (plain integer math; the >>> 0 keeps it unsigned 32-bit).
export function shardOf(root, shards = FULL_SHARDS) {
  let h = 0x811c9dc5;
  for (let i = 0; i < root.length; i++) {
    h ^= root.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % shards;
}
