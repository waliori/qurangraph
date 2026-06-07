const cache = {};

// Resolve a /public asset against Vite's configured base so the app works
// whether served from the domain root or a sub-path (e.g. GitHub Pages project
// sites). BASE_URL always ends in "/"; strip any leading slash from `path`.
function asset(path) {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}

async function fetchJSON(path) {
  const url = asset(path);
  if (cache[url]) return cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
  const d = await r.json();
  cache[url] = d;
  return d;
}

export function loadHafsData() {
  return fetchJSON("data/quran-hafs.json");
}

// Build provenance manifest { builtAt, sources:[{ id, label, repo, ref, sha256, … }] }.
// Optional — resolves to null if the build didn't emit it (older builds / dev), so the
// caller can simply hide the section rather than error.
export function loadSources() {
  return fetchJSON("data/sources.json").catch(() => null);
}

// Precomputed normForm → root map (eager — needed for root-mode grouping).
export function loadRoots() {
  return fetchJSON("data/roots.json");
}

// Precomputed normForm → lemma map (lazy — only when lemma mode is first used).
export function loadLemmas() {
  return fetchJSON("data/lemmas.json");
}

// Columnar per-verse morphology { legend, lemmas, roots, v } (lazy — fetched the
// first time the morphology filter, lemma mode, or the inspector card needs it).
export function loadMorphology() {
  return fetchJSON("data/morphology.json");
}

// Lexicon manifest: [{ id, label, license, hasFull, fullShards, coverage }] — the swappable
// Arabic dictionaries (Maqāyīs / Mufradāt / Lisān …). Tiny; load to build the switcher.
export function loadLexiconManifest() {
  return fetchJSON("data/lexicons/index.json");
}

// A lexicon's concise root → { c, f } map (lazy; only the active lexicon is fetched).
export function loadLexicon(id) {
  return fetchJSON(`data/lexicons/${id}.json`);
}

// One shard of a lexicon's full articles ({ root → article }), fetched on demand
// when the user asks to read a root's complete entry. The shard a root falls in is
// computed by shardOf(); each shard is a small fraction of the whole lexicon, so
// "show more" pulls a few hundred KB at most instead of the multi-MB monolith.
export function loadLexiconFullShard(id, shard) {
  return fetchJSON(`data/lexicons/${id}-full/${shard}.json`);
}
