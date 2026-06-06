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

// Precomputed root → { c, f } Ibn Faris meanings (lazy — only when first shown).
export function loadRootMeanings() {
  return fetchJSON("data/root-meanings.json");
}

// Precomputed root → full Maqāyīs al-Lugha article (lazy — only fetched when the
// user asks to read the complete entry via "show more"). ~1.6MB, so kept out of
// the default meanings payload.
export function loadRootMeaningsFull() {
  return fetchJSON("data/root-meanings-full.json");
}

// Lexicon manifest: [{ id, label, license, hasFull, coverage }] — the swappable
// Arabic dictionaries (Maqāyīs / Mufradāt / Lisān …). Tiny; load to build the switcher.
export function loadLexiconManifest() {
  return fetchJSON("data/lexicons/index.json");
}

// A lexicon's concise root → { c, f } map (lazy; only the active lexicon is fetched).
export function loadLexicon(id) {
  return fetchJSON(`data/lexicons/${id}.json`);
}

// A lexicon's full root → article map (lazy; large, fetched on "show more").
export function loadLexiconFull(id) {
  return fetchJSON(`data/lexicons/${id}-full.json`);
}
