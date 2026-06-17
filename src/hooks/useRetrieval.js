import { useCallback, useMemo, useRef } from "react";
import { loadHafsData, loadRoots, loadLemmas, loadSemanticNeighbors, loadRelations } from "../data-loader.js";
import { buildRetrievalIndex, retrieve } from "../ai/retrieve.js";
import { verifyAnswer } from "../ai/verify.js";

/* ═══ RAG retrieval hook ═══
 *
 * Lazily loads the corpus maps the retriever needs (the same JSON the rest of the app
 * already fetches and caches), builds the inverted index ONCE, and exposes `run(question)`.
 * Layers 1 + 2a are pure and synchronous over that index; the optional deep layer (2b) pulls
 * in the embedding model only when `deep` is requested, and degrades to lexical-only if the
 * precomputed vectors aren't present. Nothing here touches the network until the assistant is
 * actually used to ask a question.
 */
export function useRetrieval() {
  const ref = useRef(null); // memoized { index, data }

  const ensure = useCallback(async () => {
    if (ref.current) return ref.current;
    const [hafs, rootMap, lemmaMap, semanticNeighbours, relations] = await Promise.all([
      loadHafsData(), loadRoots(), loadLemmas(), loadSemanticNeighbors(), loadRelations(),
    ]);
    const index = buildRetrievalIndex({ hafs, rootMap, lemmaMap });
    ref.current = { index, data: { rootMap, lemmaMap, semanticNeighbours: semanticNeighbours || {}, relations } };
    return ref.current;
  }, []);

  const run = useCallback(async (question, { topVerses = 8, seeds = null } = {}) => {
    const { index, data } = await ensure();
    return retrieve(question, index, data, { topVerses, seeds });
  }, [ensure]);

  // Fact-check an assistant answer against ground-truth verse text. `allowedRefs` (optional)
  // is the set of references that were actually in the context this turn.
  const verify = useCallback(async (text, allowedRefs = null) => {
    const { index } = await ensure();
    return verifyAnswer(text, { refText: index.refText, allowedRefs });
  }, [ensure]);

  // STABLE identity — consumers put this in effect deps (the verify-after-answer effect in
  // AssistantPanel). A fresh object each render made that effect re-run on every render, which
  // turned a non-null verifyResult into an infinite re-render loop (100% CPU → frozen UI).
  return useMemo(() => ({ run, verify }), [run, verify]);
}
