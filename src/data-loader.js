const cache = {};

async function fetchJSON(url) {
  if (cache[url]) return cache[url];
  const r = await fetch(url);
  const d = await r.json();
  cache[url] = d;
  return d;
}

export function loadHafsData() {
  return fetchJSON("/data/quran-hafs.json");
}

export function loadQiraatDiffs() {
  return fetchJSON("/data/qiraat-diffs.json");
}

export function loadNarrationText(key) {
  return fetchJSON(`/data/kfgqpc/${key}.json`);
}
