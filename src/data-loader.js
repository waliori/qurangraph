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

// Precomputed root → { c, f } Ibn Faris meanings (lazy — only when first shown).
export function loadRootMeanings() {
  return fetchJSON("data/root-meanings.json");
}
