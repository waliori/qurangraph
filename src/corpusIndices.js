/* ═══ Derived corpus indices (pure) ═══
 *
 * The data layer the graph, the analytics and the HTTP API are all built on, extracted
 * out of useCorpusIndices so it has exactly ONE definition. The React hook wraps these
 * in useMemo; the API server (server/corpus.js) calls them directly at boot. Nothing
 * here touches React, the DOM or the network — it's plain functions over the loaded
 * corpus JSON, so a verse's words key the same way in the browser and on the server.
 *
 *   verseData  — { "s:a": { text, s, a, sn, words[] } }, the spine. Each word is
 *                { orig, norm, exact, proot, plemma } (proot/plemma position-correct
 *                once morphology is loaded).
 *   w2v / r2v  — inverted indices: exact surface form / root → verse keys.
 *   l2v        — lemma → verse keys (needs the lemma map).
 *   surahList  — [{ id, name, count }].
 *   searchAlias— forgiving-key → canonical exact key, for imlāʾī-tolerant search.
 *   exDisplay  — exact key → its prettiest (most frequent) vocalized surface form.
 */

import { norm, normStrict, wordGroupKey, strongKeys, fuzzyKeys, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "./arabic-utils.js";
import { verseGroupingKeys } from "./morphology.js";

/* Build the verse spine + the exact/root inverted indices.
 * `precision` is "loose" | "strict" (exact-mode keys only); `morph` is the loaded
 * morphology object or null (position-correct root/lemma once it arrives). */
export function buildVerseIndices({ quranRaw, precision = "loose", morph = null } = {}) {
  if (!quranRaw) return { w2v: {}, r2v: {}, verseData: {}, surahList: [], searchAlias: {}, searchAliasFuzzy: {}, exDisplay: {} };
  const strict = precision === "strict";
  const w2v = {}, r2v = {}, vd = {}, sl = [];
  // exact key → its prettiest (most frequent) vocalized surface form, so the toolbar can show
  // مِيكَال / ٱلصَّلَاة in suggestions instead of the bare consonantal skeleton وميكيل / الصلاه.
  const disp = new Map();
  // imlāʾī-tolerant alias → canonical exact key, for forgiving search. Two tiers: `searchAlias`
  // holds STRONG keys (real spellings) used for resolution AND prefix suggestions; `searchAliasFuzzy`
  // holds only the degraded hamza-dropped keys — used to RESOLVE a hamza-variant query but kept out
  // of suggestion expansion, so e.g. جِئْنَا's "جنا" key never leaks into a search for جن.
  const searchAlias = {}, searchAliasFuzzy = {};
  for (const s of quranRaw) {
    sl.push({ id: s.id, name: s.name, count: s.total_verses });
    for (const v of s.verses) {
      const vk = `${s.id}:${v.id}`;
      // Per-occurrence (position-correct) root/lemma for each word, aligned 1:1
      // with the words we push below — present only once morphology has loaded.
      // Per-occurrence keys, but only trust them if the morphology row count matches
      // this verse's kept-word count. A length mismatch means the tuple array is
      // misaligned with our words (a builder/data drift) — using it would mislabel
      // homographs, so fall back to the voted roots (gk = null) for the whole verse.
      const gkRaw = morph ? verseGroupingKeys(morph, vk) : null;
      const keptCount = v.text.split(/\s+/).reduce((c, raw) => c + (norm(raw).length >= 2 ? 1 : 0), 0);
      const gk = gkRaw && gkRaw.length === keptCount ? gkRaw : null;
      const words = [];
      const seenN = new Set(), seenR = new Set();
      let wi = 0; // index among kept words — matches the morphology tuple order
      for (const raw of v.text.split(/\s+/)) {
        const n = norm(raw); // loose — keys the root/lemma maps (always built loose)
        if (n.length < 2) continue;
        // Exact-mode key honours precision; root/lemma stay loose so their maps hit.
        const ex = strict ? normStrict(raw) : n;
        const w = { orig: raw, norm: n, exact: ex, proot: gk?.[wi]?.proot, plemma: gk?.[wi]?.plemma };
        words.push(w);
        wi++;
        // Track the most frequent original spelling per exact key (for vocalized suggestion labels).
        let dm = disp.get(ex); if (!dm) disp.set(ex, (dm = new Map()));
        dm.set(raw, (dm.get(raw) || 0) + 1);
        if (!seenN.has(ex)) { seenN.add(ex); (w2v[ex] ||= []).push(vk); }
        // Index under the strong keys (loose norm + imlāʾī) for resolution & suggestions, and
        // under the degraded hamza-dropped keys in the fuzzy tier for resolution only — so a
        // conventional query (السلام، الصلاة، الربا، يستهزئون) still resolves to the Uthmani form.
        for (const k of strongKeys(raw)) if (searchAlias[k] === undefined) searchAlias[k] = ex;
        for (const k of fuzzyKeys(raw)) if (searchAlias[k] === undefined && searchAliasFuzzy[k] === undefined) searchAliasFuzzy[k] = ex;
        // Index by the position-correct root (homographs split to their real root);
        // falls back to the voted root until morphology arrives.
        const root = wordGroupKey(w, "root");
        if (!seenR.has(root)) { seenR.add(root); (r2v[root] ||= []).push(vk); }
      }
      vd[vk] = { text: v.text, s: s.id, a: v.id, sn: s.name, words };
    }
  }
  // Reduce each exact key's spelling tally to the single most common surface form.
  const exDisplay = {};
  for (const [ex, dm] of disp) {
    let bestForm = ex, bestN = -1;
    for (const [form, n] of dm) if (n > bestN) { bestN = n; bestForm = form; }
    exDisplay[ex] = bestForm;
  }
  return { w2v, r2v, verseData: vd, surahList: sl, searchAlias, searchAliasFuzzy, exDisplay };
}

/* Lemma → verses index. Mirrors the r2v block but keyed by lemma; needs the lemma map
 * to have been installed (setLemmaMap) or morphology loaded for position-correct keys. */
export function buildLemmaIndex(verseData) {
  const idx = {};
  for (const vk in verseData) {
    const seen = new Set();
    for (const w of verseData[vk].words) {
      const lk = wordGroupKey(w, "lemma"); // position-correct when morphology is loaded
      if (!seen.has(lk)) { seen.add(lk); (idx[lk] ||= []).push(vk); }
    }
  }
  return idx;
}

/* Every āya key in muṣḥaf order — the flat list the context reader scrolls through. */
export function orderedVerseKeys(quranRaw) {
  if (!quranRaw) return [];
  const ks = [];
  for (const s of quranRaw) for (const v of s.verses) ks.push(`${s.id}:${v.id}`);
  return ks;
}

/* The effective hidden-word set. The grammatical particles are governed by the master
 * "إخفاء حروف المعاني" toggle; content defaults and the user's own added words ALWAYS
 * apply (so editing always affects the graph), minus any they re-enabled. */
export function buildStopSet({ hideStop = true, stopExtra = [], stopDisabled = [] } = {}) {
  const disabled = new Set(stopDisabled);
  const s = new Set();
  if (hideStop) for (const w of STOP_PARTICLES) if (!disabled.has(w)) s.add(w);
  for (const w of STOP_CONTENT_DEFAULT) if (!disabled.has(w)) s.add(w);
  for (const w of stopExtra) if (!disabled.has(w)) s.add(norm(w));
  return s;
}
