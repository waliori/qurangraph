import { rootOf, lemmaOf, wordGroupKey, STOP } from "../arabic-utils.js";
import { decodeMorph, passesMorphFilter, morphFilterActive } from "../morphology.js";
import { fColor, dColor, rarityWeight } from "../theme.js";

/* Unique, non-stop words of a verse, keyed by the active mode (exact|lemma|root).
 * `opts.morphRows` (a verse's morphology tuple array, index-aligned to v.words) +
 * `opts.M` + `opts.morphFilter` optionally drop words failing the morphology
 * filter. Each returned word carries its original index `idx` in v.words so the
 * inspector can look up its per-token morphology. */
export function getUW(v, hideStop, mode, opts = {}) {
  const { morphRows, M, morphFilter, stopSet } = opts;
  const stop = stopSet || STOP;
  // An explicit stopSet (composed by the app from the user's edits) ALWAYS applies,
  // so hiding/adding a word takes effect regardless of the master "hide particles"
  // toggle. Without one (tests), fall back to honouring hideStop over module STOP.
  const applyStop = stopSet ? true : hideStop;
  const filtering = M && morphFilterActive(morphFilter);
  const seen = new Set();
  const out = [];
  v.words.forEach((w, idx) => {
    if (filtering && !passesMorphFilter(morphRows ? decodeMorph(morphRows[idx], M) : null, morphFilter)) return;
    // Exact mode keys on the precision-aware surface form (w.exact); root/lemma use
    // the word's position-correct analysis when morphology is loaded, else the voted
    // maps. w.exact falls back to w.norm for callers/tests that omit it.
    const key = wordGroupKey(w, mode);
    // Hide if the word's surface form OR its grouping key is in the stop set — so a
    // hidden word works whether you typed the surface form or (in root/lemma mode)
    // the node's root/lemma key.
    if (applyStop && (stop.has(w.norm) || stop.has(key))) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...w, idx, lookup: key });
  });
  return out;
}

/* source → [targets] adjacency map. Build once per graph and reuse across the
 * many descendant/drag/highlight queries instead of re-scanning links each time. */
export function buildChildMap(links) {
  const children = {};
  for (const l of links) (children[l.source] ||= []).push(l.target);
  return children;
}

/* All nodes reachable from `nid` following links downward (inclusive).
 * `linksOrMap` may be the raw links array or a prebuilt `buildChildMap` result. */
export function getDescendants(nid, linksOrMap) {
  const children = Array.isArray(linksOrMap) ? buildChildMap(linksOrMap) : linksOrMap;
  const out = new Set();
  const q = [nid];
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    if (out.has(c)) continue;
    out.add(c);
    for (const x of children[c] || []) if (!out.has(x)) q.push(x);
  }
  return out;
}

/* Walk parent pointers from a node up to the centre. */
export function getPathToCenter(nid, parentMap) {
  const path = new Set();
  let c = nid, guard = 200;
  while (c && guard-- > 0) { path.add(c); c = parentMap[c]; }
  return path;
}

/* The `lookup` key for a word object, per search mode — thin alias over the shared
 * wordGroupKey() (exact → precision-aware surface; root/lemma → position-correct
 * analysis when loaded, else the voted maps). Kept for readability at call sites. */
const wordKey = wordGroupKey;

/* ═══ Lazy graph builder ═══
 *
 * Expands outward from a centre verse: verse → its words → other verses that
 * share each word/root → … driven by the `expandedWords` / `expandedVerses`
 * sets. Child verses for a word are ranked by how many words they share with
 * the centre verse (most-related first) and capped at `maxBranch`, rather than
 * taken in mushaf order.
 *
 * W/H seed deterministic initial coordinates so the first paint is never NaN;
 * the force layout refines them afterwards.
 */
export function buildLazyGraph(centerKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, W = 900, H = 600, opts = {}) {
  const { l2v, M, morphFilter, rareOnly = false, rareMax = 100, stopSet } = opts;
  const nodes = [], links = [], loopLinks = [], parentMap = {};
  const addedNodes = new Set(), visitedVerses = new Set();
  const cv = verseData[centerKey];
  if (!cv) return { nodes, links, loopLinks, parentMap };

  const cx = W / 2, cy = H / 2;
  // Lemma mode REQUIRES its index; never silently fall back to the exact (w2v)
  // index, which would present surface-form matches as if they were lemma matches.
  // The caller gates the build until l2v is ready, but `|| {}` keeps this pure even
  // if it isn't (an empty index just yields a lone centre node, not wrong links).
  const index = searchMode === "root" ? r2v : searchMode === "lemma" ? (l2v || {}) : w2v;
  // Per-verse morphology row arrays for the active filter (index-aligned to words).
  const morphOpts = (verseKey) => ({ morphRows: M?.v?.[verseKey], M, morphFilter, stopSet });

  // Centre verse's own lookup keys — computed once, reused for ranking/sharing.
  const centerLookups = new Set(cv.words.map((w) => wordKey(w, searchMode)));
  const sharedOf = (v) => [
    ...new Set(
      v.words.filter((w) => centerLookups.has(wordKey(w, searchMode))).map((w) => w.orig)
    ),
  ];

  let seed = 0;
  const place = (depth, fixed) => {
    if (fixed) return { x: cx, y: cy };
    const a = seed * 2.399963; // golden-angle spread, deterministic
    const r = 150 + depth * 130;
    seed++;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  };

  const centerId = "v:" + centerKey;
  nodes.push({ id: centerId, type: "center", verseKey: centerKey, label: `${cv.sn} ${cv.a}`, text: cv.text, r: 28, color: "#fbbf24", fixed: true, depth: 0, words: cv.words, ...place(0, true) });
  addedNodes.add(centerId);
  visitedVerses.add(centerKey);

  const queue = [{ type: "show-words", verseId: centerId, verseKey: centerKey, depth: 0 }];
  expandedVerses.forEach((vk) => { if (vk !== centerKey) queue.push({ type: "show-words", verseId: "v:" + vk, verseKey: vk, depth: -1 }); });

  let safety = 5000;
  while (queue.length > 0 && safety-- > 0) {
    const item = queue.shift();

    if (item.type === "show-words") {
      const v = verseData[item.verseKey];
      if (!v) continue;
      getUW(v, hideStop, searchMode, morphOpts(item.verseKey)).forEach((w) => {
        const wid = `w:${w.lookup}@${item.verseKey}`;
        if (addedNodes.has(wid)) return;
        const count = (index[w.lookup] || []).length;
        // Rare-links mode: hide hub words so only distinctive shared vocabulary shows.
        if (rareOnly && count > rareMax) return;
        const expKey = `${w.lookup}@${item.verseKey}`;
        const isExp = expandedWords.has(expKey);
        // Prefer this occurrence's position-correct root/lemma (from morphology) so
        // the node label, lexicon gloss and grouping all agree; fall back to the
        // voted maps when morphology hasn't loaded for this word.
        const realRoot = w.proot || rootOf(w.norm);   // always derivable — shown as context in any mode
        const realLemma = w.plemma || lemmaOf(w.norm);
        // The label under the node: the root in root/lemma mode (the grouping/context).
        const rootLabel = searchMode === "exact" ? null : realRoot;
        // Coverage: in root/lemma mode a word with no precomputed root/lemma is
        // ungrouped — distinguish "no data" from "no link" with a marker (Phase 10).
        const uncovered = (searchMode === "root" && !realRoot) || (searchMode === "lemma" && !realLemma);
        nodes.push({ id: wid, type: "word", wordNorm: w.norm, lookup: w.lookup, label: w.orig, count, r: Math.min(7 + Math.log2(count + 1) * 3, 20), color: fColor(count), depth: item.depth + 1, isExpanded: isExp, parentVerseKey: item.verseKey, wordIndex: w.idx, rootLabel, root: realRoot, lemma: realLemma, hasRoot: !!realRoot, hasLemma: !!realLemma, uncovered, ...place(item.depth + 1) });
        addedNodes.add(wid);
        parentMap[wid] = item.verseId;
        // Weight the verse→word link by the WORD's rarity too (it's the word this
        // link runs through), so the rarity edge encoding shows on these links — not
        // only on the deeper word→verse ones.
        links.push({ source: item.verseId, target: wid, dist: 160, weight: rarityWeight(count) });
        if (isExp) queue.push({ type: "show-verses", wordId: wid, lookup: w.lookup, fromVerseKey: item.verseKey, depth: item.depth + 1 });
      });
    } else if (item.type === "show-verses") {
      // Rank candidate verses by shared-word count with the centre, most first.
      const ranked = (index[item.lookup] || [])
        .filter((vk) => vk !== item.fromVerseKey)
        .map((vk) => {
          const v = verseData[vk];
          return v ? { vk, v, shared: sharedOf(v) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.shared.length - a.shared.length || a.vk.localeCompare(b.vk))
        .slice(0, maxBranch);

      // Spring length for this word's verse fan-out. A fixed distance seats every
      // verse on one ring around the word — fine for 3 verses, hopeless for 100
      // (they'd overlap into an unreadable knot). Scaling with √count makes the
      // target radius track the area the verses need, so the force pass spreads
      // them into a roomy disk whose labels stay legible. √ (not linear) keeps a
      // big fan-out compact rather than flinging it to the edge of the canvas.
      const ring = Math.max(150, Math.round(36 * Math.sqrt(ranked.length)));
      // Rarity of every link through this word: rarer connecting word = stronger signal.
      const weight = rarityWeight((index[item.lookup] || []).length);

      ranked.forEach(({ vk, v, shared }) => {
        const vid = "v:" + vk;
        if (visitedVerses.has(vk)) {
          if (addedNodes.has(vid)) loopLinks.push({ source: item.wordId, target: vid, weight });
          return;
        }
        visitedVerses.add(vk);
        const isVE = expandedVerses.has(vk);
        if (!addedNodes.has(vid)) {
          nodes.push({ id: vid, type: "verse", verseKey: vk, surahNum: v.s, ayahNum: v.a, label: `${v.sn} ${v.a}`, text: v.text, r: Math.min(7 + shared.length * 1.5, 18), color: dColor(item.depth), sharedWords: shared, sharedCount: shared.length, depth: item.depth, connectingWord: item.lookup, words: v.words, isExpanded: isVE, ...place(item.depth) });
          addedNodes.add(vid);
          parentMap[vid] = item.wordId;
        }
        links.push({ source: item.wordId, target: vid, dist: ring, weight });
        if (isVE) queue.push({ type: "show-words", verseId: vid, verseKey: vk, depth: item.depth + 1 });
      });
    }
  }

  return { nodes, links, loopLinks, parentMap };
}
