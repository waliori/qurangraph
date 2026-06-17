/* ═══ Client-side RAG retriever (Layers 1 + 2a) ═══
 *
 * The assistant runs on a ~4k-token local model — far too small to be "fed everything".
 * Retrieval is what makes that window enough: given the user's question, pull the SMALL,
 * most-relevant slice of the corpus and stuff only that into the prompt. Pure data-in /
 * result-out (the caller loads the corpus via data-loader and memoizes the index); no
 * model and no network here — that keeps Layer 1 + 2a free, instant, and fully on-device.
 *
 *  Layer 1 — lexical: normalise the question's Arabic words (arabic-utils `norm`), resolve
 *    them to roots/lemmas via the same maps the app already ships, and gather the verses
 *    where those roots/lemmas occur. This is the BM25-style leg the Qurʾān-NLP literature
 *    pairs with dense retrieval, and it's the strongest signal for a Qurʾān↔Qurʾān tool.
 *  Layer 2a — semantic (free): expand each query root through the precomputed
 *    `semantic-neighbours.json` (distributional cosine by root) and through curated
 *    `relations.json` opposites, so verses sharing MEANING but not a letter surface too —
 *    the "unseen correlations" axis, with zero new dependency.
 *
 * The optional `semanticRefs` argument folds in dense/semantic hits from an EXTERNAL source
 * (e.g. a future server-side embedding search) so they rank alongside the lexical layers. The
 * in-browser embedding model was removed (too heavy for the device), so it's empty by default.
 */

import { norm, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "../arabic-utils.js";

// Normalised stop set: function words + omnipresent content words (الله/قال/كان) that would
// otherwise match nearly every verse and drown the ranking. Mirrors build-semantic.js.
const STOP = new Set([...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT].map((w) => norm(w)));

// Scoring weights — direct lexical hits outrank meaning-only neighbours, which outrank
// dense-embedding-only hits; multi-term verses accumulate naturally.
const W = { root: 3, lemma: 2, neighbour: 2, opposite: 1.5, dense: 1.2 };

const push = (map, key, ref) => { let a = map.get(key); if (!a) map.set(key, (a = [])); a.push(ref); };

/* Build the inverted indices once from the loaded corpus. Returns Maps:
 *   rootToRefs  : root  → [verseRef]   (unique per verse)
 *   lemmaToRefs : lemma → [verseRef]
 *   refText     : verseRef → text
 *   refRoots    : verseRef → Set(root)  (for fast "which query roots does this verse hold")
 * `hafs` is the quran-hafs array; rootMap/lemmaMap are normForm→root / normForm→lemma. */
export function buildRetrievalIndex({ hafs, rootMap = {}, lemmaMap = {} }) {
  const rootToRefs = new Map();
  const lemmaToRefs = new Map();
  const refText = new Map();
  const refRoots = new Map();
  for (const sura of hafs || []) {
    for (const v of sura.verses || []) {
      const ref = `${sura.id}:${v.id}`;
      refText.set(ref, v.text);
      const roots = new Set();
      const lemmas = new Set();
      for (const raw of String(v.text).split(/\s+/)) {
        const n = norm(raw);
        if (n.length < 2) continue;
        const r = rootMap[n]; if (r) roots.add(r);
        const lm = lemmaMap[n]; if (lm) lemmas.add(lm);
      }
      refRoots.set(ref, roots);
      for (const r of roots) push(rootToRefs, r, ref);
      for (const lm of lemmas) push(lemmaToRefs, lm, ref);
    }
  }
  return { rootToRefs, lemmaToRefs, refText, refRoots };
}

// Pull the meaningful query terms out of the question, resolved to root/lemma.
export function extractTerms(question, { rootMap = {}, lemmaMap = {} } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of String(question || "").split(/\s+/)) {
    const n = norm(raw);
    if (n.length < 2 || STOP.has(n) || seen.has(n)) continue;
    seen.add(n);
    out.push({ norm: n, root: rootMap[n] || null, lemma: lemmaMap[n] || null });
  }
  return out;
}

/* Run retrieval. Returns a structured result the serializer renders, or null when the
 * question yields nothing to ground on.
 *   question  : the user's text
 *   index     : buildRetrievalIndex() output
 *   data      : { rootMap, lemmaMap, semanticNeighbours, relations }
 *   opts      : { topVerses=10, maxNeighbours=6, semanticRefs=[] (dense hits from Layer 2b) }
 */
export function retrieve(question, index, data = {}, opts = {}) {
  if (!index) return null;
  const { rootMap = {}, lemmaMap = {}, semanticNeighbours = {}, relations = null } = data;
  const { topVerses = 10, maxNeighbours = 6, semanticRefs = [], seeds = null } = opts;

  const terms = extractTerms(question, { rootMap, lemmaMap });
  const queryRoots = new Set(terms.map((t) => t.root).filter(Boolean));
  const queryLemmas = new Set(terms.map((t) => t.lemma).filter(Boolean));

  // ref → { score, reasons:Set }
  const scores = new Map();
  const bump = (ref, w, reason) => {
    if (!index.refText.has(ref)) return;
    let e = scores.get(ref);
    if (!e) scores.set(ref, (e = { score: 0, reasons: new Set() }));
    e.score += w;
    if (reason) e.reasons.add(reason);
  };

  // ── Seeds from the attached context (selected word/root/verse/graph) ──
  // Crucial for questions with NO Arabic terms ("what can you say about this verse?"):
  // retrieve around what the user has on screen, not just the question string. Seed roots
  // expand through the same layers; seed verses are pinned in and their roots feed expansion.
  if (seeds) {
    for (const r of seeds.roots || []) queryRoots.add(r);
    for (const l of seeds.lemmas || []) queryLemmas.add(l);
    for (const ref of seeds.refs || []) {
      bump(ref, W.root, "attached");
      for (const r of index.refRoots.get(ref) || []) queryRoots.add(r);
    }
  }

  // ── Layer 1: direct root / lemma occurrences ──
  for (const r of queryRoots) for (const ref of index.rootToRefs.get(r) || []) bump(ref, W.root, `root ${r}`);
  for (const lm of queryLemmas) for (const ref of index.lemmaToRefs.get(lm) || []) bump(ref, W.lemma, `lemma ${lm}`);

  // ── Layer 2a: distributional semantic neighbours (meaning-by-context, by root) ──
  const related = [];
  for (const r of queryRoots) {
    const nbrs = (semanticNeighbours[r] || []).slice(0, maxNeighbours);
    for (const [nr, sim] of nbrs) {
      if (queryRoots.has(nr)) continue;
      related.push({ root: nr, via: r, sim });
      for (const ref of index.rootToRefs.get(nr) || []) bump(ref, W.neighbour * sim, `≈${nr} (via ${r})`);
    }
  }

  // ── Layer 2a: curated opposites / lexical relations ──
  const opposites = [];
  const byRoot = relations?.byRoot || {};
  for (const r of queryRoots) {
    for (const rel of byRoot[r] || []) {
      if (rel.polarity !== "opposite") continue; // curated antonyms only; skip "candidate"
      opposites.push({ root: r, other: rel.other, cat: rel.cat });
      for (const ref of (rel.verses || [])) bump(ref, W.opposite, `↔${rel.other}`);
      for (const ref of index.rootToRefs.get(rel.other) || []) bump(ref, W.opposite * 0.5, `↔${rel.other}`);
    }
  }

  // ── Optional external dense/semantic hits, folded in (refs + similarity); empty by default ──
  for (const hit of semanticRefs) {
    const ref = typeof hit === "string" ? hit : hit?.ref;
    const sim = typeof hit === "string" ? 1 : (hit?.sim ?? 1);
    if (ref) bump(ref, W.dense * sim, "~meaning");
  }

  if (scores.size === 0) return null;

  const verses = [...scores.entries()]
    .map(([ref, e]) => ({ ref, text: index.refText.get(ref), score: e.score, reasons: [...e.reasons] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topVerses);

  // Dedupe related/opposite lists for the summary header.
  const dedupe = (arr, key) => { const s = new Set(); return arr.filter((x) => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); };

  return {
    matched: terms.filter((t) => t.root || t.lemma),
    related: dedupe(related, (x) => x.root).sort((a, b) => b.sim - a.sim).slice(0, maxNeighbours),
    opposites: dedupe(opposites, (x) => x.other),
    verses,
  };
}

/* Derive retrieval seeds (roots / lemmas / verse refs) from the attached context chips
 * (buildAttachables shapes). Lets the assistant retrieve around what's on screen even when
 * the question carries no Arabic — the fix for "analyze this verse" returning nothing. */
export function extractSeeds(attachables = []) {
  const roots = new Set();
  const lemmas = new Set();
  const refs = new Set();
  for (const a of attachables) {
    const p = a?.payload || {};
    switch (a?.kind) {
      case "word": if (p.root) roots.add(p.root); if (p.lemma) lemmas.add(p.lemma); if (p.verseRef) refs.add(p.verseRef); break;
      case "verse": if (p.ref) refs.add(p.ref); for (const r of p.roots || []) roots.add(r); break;
      case "graph": if (p.centerRef) refs.add(p.centerRef); break;
      case "lexicon": if (p.root) roots.add(p.root); break;
      case "ws": { // payload is the workspace item { type, payload }
        const wp = p.payload || {};
        if (wp.root) roots.add(wp.root);
        if (p.type === "verse" && wp.surah && wp.ayah) refs.add(`${wp.surah}:${wp.ayah}`);
        break;
      }
      default: break;
    }
  }
  return { roots: [...roots], lemmas: [...lemmas], refs: [...refs] };
}
