const cache = {};

async function fetchJSON(url) {
  if (cache[url]) return cache[url];
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status} ${r.statusText}`);
  const d = await r.json();
  cache[url] = d;
  return d;
}

export function loadHafsData() {
  return fetchJSON("/data/quran-hafs.json");
}

// Precomputed normForm → root map (eager — needed for root-mode grouping).
export function loadRoots() {
  return fetchJSON("/data/roots.json");
}

// Precomputed root → { c, f } Ibn Faris meanings (lazy — only when first shown).
export function loadRootMeanings() {
  return fetchJSON("/data/root-meanings.json");
}
