import { useMemo } from "react";
import { norm, normStrict, wordGroupKey, strongKeys, fuzzyKeys, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "../arabic-utils.js";
import { buildRomanIndex } from "../search.js";
import { verseGroupingKeys } from "../morphology.js";

/* ═══ Derived corpus indices ═══
 *
 * The pure data layer the graph is built from, extracted out of QuranGraph so the
 * top-level component holds interaction state, not derivation logic (the first slice of
 * the R3.1 decomposition — see .claude/DEFERRED.md). Everything here is a memo over the
 * loaded corpus + a few preferences; none of it touches selection / hover / the
 * simulation, so it lifts out cleanly and could be unit-tested in isolation.
 *
 * Returns:
 *   verseData  — { "s:a": { text, s, a, sn, words[] } }, the spine. Each word is
 *                { orig, norm, exact, proot, plemma } (proot/plemma position-correct
 *                once morphology loads).
 *   w2v / r2v  — inverted indices: exact surface form / root → verse keys.
 *   l2v        — lemma → verse keys (null until the lemma map loads).
 *   surahList  — [{ id, name, count }] for the pickers.
 *   searchAlias— forgiving-key → canonical exact key, for imlāʾī-tolerant search.
 *   compareIndices — { exact, root, lemma } bundle for the compare modal's pickers.
 *   orderedKeys— every "s:a" in muṣḥaf order (the context reader's spine).
 *   stopSet    — the effective hidden-word set the graph applies.
 */
export function useCorpusIndices({ quranRaw, precision, morph, lemmaMap, hideStop, stopExtra, stopDisabled }) {
  const { w2v, r2v, verseData, surahList, searchAlias, searchAliasFuzzy, exDisplay } = useMemo(() => {
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
  }, [quranRaw, precision, morph]);

  // Romanization skeleton → exact norm keys, for Latin ("rahman", "ibrahim") search. Built once
  // over the corpus norms; null until the corpus loads so the toolbar skips the Latin path.
  const romanIndex = useMemo(() => (quranRaw ? buildRomanIndex(Object.keys(w2v)) : null), [quranRaw, w2v]);

  // Lemma → verses index, built only once lemmas are loaded (lemma mode). Mirrors
  // the r2v block but keyed by lemma; null until the map arrives so the graph waits.
  const l2v = useMemo(() => {
    if (!quranRaw || !lemmaMap) return null;
    const idx = {};
    for (const vk in verseData) {
      const seen = new Set();
      for (const w of verseData[vk].words) {
        const lk = wordGroupKey(w, "lemma"); // position-correct when morphology is loaded
        if (!seen.has(lk)) { seen.add(lk); (idx[lk] ||= []).push(vk); }
      }
    }
    return idx;
  }, [quranRaw, verseData, lemmaMap]);

  // Mode → inverted index, for the compare modal's two free-form term pickers.
  const compareIndices = useMemo(() => ({ exact: w2v, root: r2v, lemma: l2v || {} }), [w2v, r2v, l2v]);

  // Every āya key in muṣḥaf order — the flat list the context reader scrolls through.
  const orderedKeys = useMemo(() => {
    if (!quranRaw) return [];
    const ks = [];
    for (const s of quranRaw) for (const v of s.verses) ks.push(`${s.id}:${v.id}`);
    return ks;
  }, [quranRaw]);

  // Effective hidden set the graph actually applies. The grammatical particles are
  // governed by the master "إخفاء حروف المعاني" toggle; content defaults and the
  // user's own added words ALWAYS apply (so editing always affects the graph),
  // minus any the user re-enabled.
  const stopSet = useMemo(() => {
    const disabled = new Set(stopDisabled);
    const s = new Set();
    if (hideStop) for (const w of STOP_PARTICLES) if (!disabled.has(w)) s.add(w);
    for (const w of STOP_CONTENT_DEFAULT) if (!disabled.has(w)) s.add(w);
    for (const w of stopExtra) if (!disabled.has(w)) s.add(norm(w));
    return s;
  }, [hideStop, stopExtra, stopDisabled]);

  return { w2v, r2v, verseData, surahList, searchAlias, searchAliasFuzzy, l2v, compareIndices, orderedKeys, stopSet, romanIndex, exDisplay };
}
