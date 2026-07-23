import { useMemo } from "react";
import { buildVerseIndices, buildLemmaIndex, buildStopSet, orderedVerseKeys } from "../corpusIndices.js";
import { buildRomanIndex } from "../search.js";

/* ═══ Derived corpus indices (React binding) ═══
 *
 * The pure data layer the graph is built from, extracted out of QuranGraph so the
 * top-level component holds interaction state, not derivation logic (the first slice of
 * the R3.1 decomposition — see .claude/DEFERRED.md). Everything here is a memo over the
 * loaded corpus + a few preferences; none of it touches selection / hover / the
 * simulation.
 *
 * The derivation itself lives in ../corpusIndices.js so the HTTP API (server/) builds
 * byte-identical indices from the same code — this hook is just the memoised React
 * binding over it. See that module for the shape of every returned index.
 */
export function useCorpusIndices({ quranRaw, precision, morph, lemmaMap, hideStop, stopExtra, stopDisabled }) {
  const { w2v, r2v, verseData, surahList, searchAlias, searchAliasFuzzy, exDisplay } = useMemo(
    () => buildVerseIndices({ quranRaw, precision, morph }),
    [quranRaw, precision, morph],
  );

  // Romanization skeleton → exact norm keys, for Latin ("rahman", "ibrahim") search. Built once
  // over the corpus norms; null until the corpus loads so the toolbar skips the Latin path.
  const romanIndex = useMemo(() => (quranRaw ? buildRomanIndex(Object.keys(w2v)) : null), [quranRaw, w2v]);

  // Lemma → verses index, built only once lemmas are loaded (lemma mode); null until the
  // map arrives so the graph waits rather than indexing under bare surface forms.
  const l2v = useMemo(
    () => (quranRaw && lemmaMap ? buildLemmaIndex(verseData) : null),
    [quranRaw, verseData, lemmaMap],
  );

  // Mode → inverted index, for the compare modal's two free-form term pickers.
  const compareIndices = useMemo(() => ({ exact: w2v, root: r2v, lemma: l2v || {} }), [w2v, r2v, l2v]);

  // Every āya key in muṣḥaf order — the flat list the context reader scrolls through.
  const orderedKeys = useMemo(() => orderedVerseKeys(quranRaw), [quranRaw]);

  // Effective hidden set the graph actually applies.
  const stopSet = useMemo(
    () => buildStopSet({ hideStop, stopExtra, stopDisabled }),
    [hideStop, stopExtra, stopDisabled],
  );

  return { w2v, r2v, verseData, surahList, searchAlias, searchAliasFuzzy, l2v, compareIndices, orderedKeys, stopSet, romanIndex, exDisplay };
}
