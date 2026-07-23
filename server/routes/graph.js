/* ═══ Graph route ═══
 *
 * The network the app draws, as data. Same builder (src/graph/buildLazyGraph), same
 * arguments the UI passes, so the nodes and links returned here are the ones on screen —
 * and the `ui` link reproduces the exact same graph in the browser, expansions included.
 *
 * Positions are omitted: layout is a force simulation the client runs, and a server-side
 * snapshot of it would be noise. Callers who want the picture follow the link.
 */

import { notFound, badRequest, qInt, qEnum } from "../http.js";
import { verseLinks, appUrl } from "../links.js";
import { MODES } from "../terms.js";
import { buildLazyGraph } from "../../src/graph/buildGraph.js";
import { parseVerseKey } from "./corpus.js";
import { P } from "../params.js";

export function register(router, ctx) {
  const { corpus: C } = ctx;

  router.add("/graph", ({ V, query }) => {
    const centre = parseVerseKey(query.get("verse") || `${query.get("surah") || 2}:${query.get("ayah") || 255}`);
    if (!V.verseData[centre]) throw notFound(`No āya ${centre}.`);
    const mode = qEnum(query, "mode", MODES, "exact");
    const maxBranch = qInt(query, "max_branch", { min: 1, max: 60, def: 10 });
    const hideStop = query.get("hide_stopwords") !== "false";

    const list = (name) => (query.get(name) || "").split(",").map((s) => s.trim()).filter(Boolean);
    const expandedWords = new Set(list("expand_words"));
    const expandedVerses = new Set(list("expand_verses"));
    for (const vk of expandedVerses) if (!V.verseData[vk]) throw badRequest(`expand_verses contains an unknown āya: ${vk}`);

    const g = buildLazyGraph(
      centre, V.verseData, V.w2v, V.r2v, expandedWords, expandedVerses,
      hideStop, maxBranch, mode, 900, 600,
      { stopSet: V.stopSet, M: C.morph, l2v: V.l2v },
    );

    const state = {
      surah: V.verseData[centre].s, ayah: V.verseData[centre].a, mode,
      maxBranch, hideStop,
      expandedWords: [...expandedWords], expandedVerses: [...expandedVerses],
    };

    return {
      data: {
        centre: { verse_key: centre, text: V.verseData[centre].text },
        mode,
        nodes: (g.nodes || []).map((n) => trim({
          id: n.id, type: n.type, label: n.label,
          verse_key: n.verseKey, text: n.text,
          lookup: n.lookup, occurrences: n.count,
          root: n.root, lemma: n.lemma,
          shared_words: n.sharedWords, connecting_word: n.connectingWord,
          depth: n.depth, expanded: n.isExpanded || undefined,
          links: n.verseKey ? verseLinks(n.verseKey, mode) : undefined,
        })),
        links: (g.links || []).map((l) => ({ source: l.source, target: l.target, weight: l.weight })),
        loop_links: (g.loopLinks || []).map((l) => ({ source: l.source, target: l.target, weight: l.weight })),
        counts: { nodes: (g.nodes || []).length, links: (g.links || []).length, omitted: g.omitted, truncated: g.truncated },
      },
      links: { ui: appUrl(state), ...verseLinks(centre, mode) },
    };
  }, {
    summary: "The word/verse network around an āya — the graph the app draws, as JSON.",
    description: "Built by the app's own graph builder, so these are the nodes and edges on screen. "
      + "Edge weight is rarity: a rarer shared word makes a stronger link. Positions are omitted — "
      + "layout is a force simulation the client runs — so follow `links.ui` for the picture. "
      + "`expand_words` takes `lookup@verseKey` pairs, the same identity the app uses.",
    tags: ["graph"],
    params: [P.graphVerse, P.mode, P.precision, P.maxBranch, P.hideStop, P.expandWords, P.expandVerses],
    response: "GraphResponse",
    examples: [
      { label: "Āyat al-Kursī, root mode", path: "/graph?verse=2:255&mode=root&max_branch=5" },
      { label: "…with one word expanded", path: "/graph?verse=2:255&mode=root&max_branch=3&expand_words=الكتب@2:255" },
      { label: "Al-Ikhlāṣ", path: "/graph?verse=112:1&mode=root" },
    ],
  });
}

function trim(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
