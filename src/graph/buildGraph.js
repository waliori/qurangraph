import { rootKey, rootOf, STOP } from "../arabic-utils.js";
import { fColor, dColor } from "../theme.js";

/* Unique, non-stop words of a verse, keyed by exact-norm or root. */
export function getUW(v, hideStop, mode) {
  const seen = new Set();
  return v.words
    .filter((w) => {
      const key = mode === "root" ? rootKey(w.norm) : w.norm;
      if (seen.has(key)) return false;
      seen.add(key);
      return !(hideStop && STOP.has(w.norm));
    })
    .map((w) => ({ ...w, lookup: mode === "root" ? rootKey(w.norm) : w.norm }));
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

/* The `lookup` key (exact norm or root) for a word, per search mode. */
function lookupOf(wordNorm, mode) {
  return mode === "root" ? rootKey(wordNorm) : wordNorm;
}

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
export function buildLazyGraph(centerKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, W = 900, H = 600) {
  const nodes = [], links = [], loopLinks = [], parentMap = {};
  const addedNodes = new Set(), visitedVerses = new Set();
  const cv = verseData[centerKey];
  if (!cv) return { nodes, links, loopLinks, parentMap };

  const cx = W / 2, cy = H / 2;
  const index = searchMode === "root" ? r2v : w2v;

  // Centre verse's own lookup keys — computed once, reused for ranking/sharing.
  const centerLookups = new Set(cv.words.map((w) => lookupOf(w.norm, searchMode)));
  const sharedOf = (v) => [
    ...new Set(
      v.words.filter((w) => centerLookups.has(lookupOf(w.norm, searchMode))).map((w) => w.orig)
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
      getUW(v, hideStop, searchMode).forEach((w) => {
        const wid = `w:${w.lookup}@${item.verseKey}`;
        if (addedNodes.has(wid)) return;
        const count = (index[w.lookup] || []).length;
        const expKey = `${w.lookup}@${item.verseKey}`;
        const isExp = expandedWords.has(expKey);
        const realRoot = searchMode === "root" ? rootOf(w.norm) : null;
        nodes.push({ id: wid, type: "word", wordNorm: w.norm, lookup: w.lookup, label: w.orig, count, r: Math.min(7 + Math.log2(count + 1) * 3, 20), color: fColor(count), depth: item.depth + 1, isExpanded: isExp, parentVerseKey: item.verseKey, rootLabel: realRoot, root: realRoot, ...place(item.depth + 1) });
        addedNodes.add(wid);
        parentMap[wid] = item.verseId;
        links.push({ source: item.verseId, target: wid, dist: 160 });
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

      ranked.forEach(({ vk, v, shared }) => {
        const vid = "v:" + vk;
        if (visitedVerses.has(vk)) {
          if (addedNodes.has(vid)) loopLinks.push({ source: item.wordId, target: vid });
          return;
        }
        visitedVerses.add(vk);
        const isVE = expandedVerses.has(vk);
        if (!addedNodes.has(vid)) {
          nodes.push({ id: vid, type: "verse", verseKey: vk, surahNum: v.s, ayahNum: v.a, label: `${v.sn} ${v.a}`, text: v.text, r: Math.min(7 + shared.length * 1.5, 18), color: dColor(item.depth), sharedWords: shared, sharedCount: shared.length, depth: item.depth, connectingWord: item.lookup, words: v.words, isExpanded: isVE, ...place(item.depth) });
          addedNodes.add(vid);
          parentMap[vid] = item.wordId;
        }
        links.push({ source: item.wordId, target: vid, dist: ring });
        if (isVE) queue.push({ type: "show-words", verseId: vid, verseKey: vk, depth: item.depth + 1 });
      });
    }
  }

  return { nodes, links, loopLinks, parentMap };
}
