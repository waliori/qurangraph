import { morphAt, passesMorphFilter, morphFilterActive } from "../morphology.js";
import { wordGroupKey, norm } from "../arabic-utils.js";

/* ═══ Construction query (الاستعلام التركيبي) ═══
 *
 * The single move the form-based concordance can't do: pin a root/lemma down to ONE exact
 * construction and read just those tokens. The motivating case is أشرك (Form IV) + بـ —
 * distinguished from أشرك مع, from the nominal شركاء, and from the passive أن يُشرَك بـ. So a
 * query crosses four facets on each HEAD occurrence:
 *
 *   1. head morphology   — Form (وزن) / voice (مبني للمعلوم↔مجهول) / pos / case, via the
 *                          loaded morphology M (reuses passesMorphFilter).
 *   2. governed particle — a ḥarf jarr the head governs (بـ، لـ، على…). Sourced AUTHORITATIVELY
 *                          from the offline-mined frames (expr.frames: [vk, headIdx, prepIdx],
 *                          prepIdx = the cliticised governed word بالله). Particles that are NOT
 *                          ḥarf jarr frames (مع، a ظرف) are caught by a standalone-particle scan.
 *   3. object definiteness — is the governed/next nominal نكرة (شيئًا) or معرفة (الله)? A heuristic
 *                          read off the surface article + the morphology (proper noun = definite).
 *   4. presence/absence  — require the construction, or require its ABSENCE (the bare head).
 *
 * Every record is one head TOKEN (a verse with the head twice yields two), each carrying the word
 * indices to highlight and a small KWIC window — so the result is a taggable, savable concordance,
 * not a verse set. Heuristics (definiteness, standalone particle) are flagged so the reader judges.
 * Pure: M and expr are injected; no globals beyond the root/lemma maps wordGroupKey already uses.
 */

// Genuine proclitic prepositions — when a particle is cliticised onto its object (بالله) the frame
// build indexes the OBJECT word as the prep position, so the governed nominal IS that same word.
const PROCLITIC_PREP = new Set(["ب", "ل", "ك"]);
// The article, optionally behind a proclitic (وبال…, فلل…) — the definiteness signal.
const PROCLITICS = "وفبكلس";

/* Build `${vk}|${headIdx}` → [{ prep, idx }] from the mined frames, so a governed preposition is
 * read off the authoritative inventory rather than re-detected. `idx` is the governed word. */
export function frameOccIndex(expr) {
  const m = new Map();
  for (const f of expr?.frames || []) {
    for (const o of f.occ || []) {
      const k = `${o[0]}|${o[1]}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ prep: f.prep, idx: o[2] });
    }
  }
  return m;
}

/* Strip leading proclitics (و ف ب ك ل س) then test for the article — the definiteness heuristic.
 * Returns true (معرفة: article / proper noun / pronoun-bearing), false (نكرة), or null (unknown). */
export function definiteOf(word, m) {
  if (!word) return null;
  if (m?.pos === "pron") return true;
  if (m?.pos === "pn") return true; // proper noun — inherently definite (الله، موسى)
  let s = norm(word.orig || word.norm || "");
  // peel up to two proclitics so وبالله / فللناس still expose the article
  for (let n = 0; n < 2 && s.length && PROCLITICS.includes(s[0]); n++) s = s.slice(1);
  if (s.startsWith("ال")) return true;          // definite article
  // tanwīn is stripped by norm(); fall back to the morphology case+indefinite cue we do have:
  // a noun with a case but no article and no pn/pron reads as نكرة.
  if (m && (m.pos === "noun" || m.pos === "adj") && m.gcase) return false;
  return s.startsWith("ال") ? true : false;
}

/* First standalone particle word (its own token, e.g. مع، على) whose skeleton ∈ `set`, scanning
 * `span` words forward from `i`. Returns its index or -1. Standalone = not a clitic on a nominal. */
function standaloneAfter(words, i, set, span) {
  for (let j = i + 1; j <= i + span && j < words.length; j++) {
    if (set.has(norm(words[j].orig || words[j].norm || ""))) return j;
  }
  return -1;
}

/* Every head TOKEN of `lookup` (in `mode`) across `keys`, with its decoded morphology. */
export function headOccurrences(lookup, mode, keys, verseData, M) {
  const out = [];
  for (const vk of keys || []) {
    const v = verseData[vk];
    if (!v?.words) continue;
    v.words.forEach((w, i) => {
      if (wordGroupKey(w, mode) === lookup) out.push({ vk, idx: i, m: morphAt(M, vk, i) });
    });
  }
  return out;
}

/* The facets actually attested for a head — so the UI builds chips from real data, not a fixed
 * menu. Returns { forms:[vf…], voices:[…], preps:[{prep,count}…], hasBare:bool }. */
export function availableFacets(heads, frameIdx) {
  const forms = new Set(), voices = new Set(), preps = new Map();
  let bare = 0;
  for (const h of heads) {
    if (h.m?.vf) forms.add(h.m.vf);
    if (h.m?.voice) voices.add(h.m.voice);
    const fr = frameIdx.get(`${h.vk}|${h.idx}`);
    if (fr?.length) for (const p of fr) preps.set(p.prep, (preps.get(p.prep) || 0) + 1);
    else bare++;
  }
  return {
    forms: [...forms].sort((a, b) => a - b),
    voices: [...voices],
    preps: [...preps.entries()].map(([prep, count]) => ({ prep, count })).sort((a, b) => b.count - a.count),
    hasBare: bare > 0,
  };
}

const KW = 3; // KWIC half-window for the inline preview (full window via buildConcordance on export)

/* Run a construction query. `spec`:
 *   { headFilter:EMPTY_MORPH_FILTER-shaped, prep:{set:[skeleton…]|null, mode:"present"|"absent"|"any",
 *     source:"frame"|"standalone"|"any"}|null, object:{definite:true|false|null}|null, span:int }
 * Returns { occ:[{vk,headIdx,prepIdx,prep,objIdx,definite,before,after,head}], total, byPrep, bareCount }. */
export function runConstruction({ lookup, mode, keys, verseData, M, frameIdx, spec = {} }) {
  const heads = headOccurrences(lookup, mode, keys, verseData, M);
  const fi = frameIdx || new Map();
  const span = spec.span || 4;
  const prep = spec.prep || null;
  const wantSet = prep?.set?.length ? new Set(prep.set) : null;
  const standaloneSet = wantSet || new Set(); // standalone scan only over requested skeletons
  const occ = [];
  const byPrep = new Map();
  let bareCount = 0;
  for (const h of heads) {
    // 1. head morphology
    if (morphFilterActive(spec.headFilter) && !passesMorphFilter(h.m, spec.headFilter)) continue;
    const v = verseData[h.vk];
    const words = v.words;
    // 2. governed / adjacent particle — only consulted when a prep facet is requested, so an
    // object-only query reads the direct (accusative) object rather than a governed nominal.
    let matchPrep = null, matchIdx = -1;
    const frames = (prep && prep.source !== "standalone") ? (fi.get(`${h.vk}|${h.idx}`) || []) : [];
    const frameHit = wantSet ? frames.find((p) => wantSet.has(norm(p.prep))) : frames[0];
    if (frameHit) { matchPrep = frameHit.prep; matchIdx = frameHit.idx; }
    if (matchIdx < 0 && prep && prep.source !== "frame" && standaloneSet.size) {
      const j = standaloneAfter(words, h.idx, standaloneSet, span);
      if (j >= 0) { matchPrep = norm(words[j].orig || words[j].norm); matchIdx = j; }
    }
    const hasPrep = matchIdx >= 0;
    if (prep) {
      if (prep.mode === "present" && !hasPrep) continue;
      if (prep.mode === "absent" && hasPrep) continue;
    }
    if (!hasPrep) bareCount++;
    // 3. object: the governed word (frame prepIdx is the cliticised object) else the next nominal
    let objIdx = -1;
    if (hasPrep) objIdx = matchIdx; // بالله — the prep's word IS the object for proclitic frames
    else { for (let j = h.idx + 1; j <= h.idx + span && j < words.length; j++) { const mm = morphAt(M, h.vk, j); if (mm && (mm.pos === "noun" || mm.pos === "pn" || mm.pos === "adj")) { objIdx = j; break; } } }
    const objM = objIdx >= 0 ? morphAt(M, h.vk, objIdx) : null;
    const definite = objIdx >= 0 ? definiteOf(words[objIdx], objM) : null;
    if (spec.object && spec.object.definite != null && definite !== spec.object.definite) continue;
    if (matchPrep) byPrep.set(matchPrep, (byPrep.get(matchPrep) || 0) + 1);
    occ.push({
      vk: h.vk, headIdx: h.idx, prep: matchPrep, prepIdx: hasPrep ? matchIdx : null,
      objIdx: objIdx >= 0 ? objIdx : null, definite,
      head: words[h.idx].orig, vf: h.m?.vf || 0, voice: h.m?.voice || null,
      before: words.slice(Math.max(0, h.idx - KW), h.idx).map((w) => w.orig).join(" "),
      after: words.slice(h.idx + 1, h.idx + 1 + KW).map((w) => w.orig).join(" "),
    });
  }
  return { occ, total: occ.length, byPrep, bareCount };
}

/* Group construction occurrences into verses with the indices to highlight (head + particle/object)
 * — the shape OccurrencesModal's `occ.hi` consumes. */
export function constructionVerses(occ) {
  const m = new Map();
  for (const o of occ) {
    if (!m.has(o.vk)) m.set(o.vk, new Set());
    m.get(o.vk).add(o.headIdx);
    if (o.prepIdx != null) m.get(o.vk).add(o.prepIdx);
    else if (o.objIdx != null) m.get(o.vk).add(o.objIdx);
  }
  const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };
  const out = {};
  const order = [...m.keys()].sort(sortVk);
  for (const vk of order) out[vk] = [...m.get(vk)];
  return { keys: order, hi: out };
}
