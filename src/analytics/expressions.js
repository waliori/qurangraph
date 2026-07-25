import { norm, lemmaOf } from "../arabic-utils.js";

/* ═══ Multi-word expressions (التعابير) — in-browser analysis ═══
 *
 * The heavy mining is done offline (scripts/build-expressions.js → public/data/expressions.json):
 * government frames (head + governed ḥarf jarr), إضافة compounds, and curated/statistical idioms.
 * These helpers index that inventory and shape the views the UI draws — all pure, so testable:
 *   - indexExpressions : reverse indices (head→frames, root→frames/compounds) built once.
 *   - frameContrast    : a head's preposition CONTRAST (آمَنَ→بـ vs … vs bare) — the signature lens.
 *   - expressionsForRoot: every frame/compound a root takes part in (for the root lab cross-link).
 *   - occVerses        : group an occurrence list into verses + the word indices to highlight.
 *
 * Occurrence tuples store word INDICES (corpus word order = the app's space-split words):
 *   frame    [vk, headIdx, prepIdx]   compound [vk, wordIdx]   idiom [vk, startIdx]
 */

const headKeyOf = (f) => `${f.pos}|${f.head}`;

/* Build the reverse indices once from the loaded expressions object. */
export function indexExpressions(expr) {
  const byHead = new Map();     // "pos|lemma" → [frame…]
  const headByRoot = new Map(); // root → Set("pos|lemma")
  const compByRoot = new Map(); // root → [compound…]
  const colByRoot = new Map();  // root → [collocation…]
  for (const f of expr?.frames || []) {
    const k = headKeyOf(f);
    if (!byHead.has(k)) byHead.set(k, []);
    byHead.get(k).push(f);
    if (f.root) { if (!headByRoot.has(f.root)) headByRoot.set(f.root, new Set()); headByRoot.get(f.root).add(k); }
  }
  for (const c of expr?.compounds || []) {
    for (const r of new Set(c.roots || [])) { if (!r) continue; if (!compByRoot.has(r)) compByRoot.set(r, []); compByRoot.get(r).push(c); }
  }
  for (const c of expr?.collocations || []) {
    for (const r of new Set([c.verbRoot, c.nounRoot])) { if (!r) continue; if (!colByRoot.has(r)) colByRoot.set(r, []); colByRoot.get(r).push(c); }
  }
  return { byHead, headByRoot, compByRoot, colByRoot };
}

/* One head's governed-preposition contrast, strongest first, with the bare (un-governed)
 * residual so the reader sees how often the head takes each ḥarf vs none. Returns
 * { head, pos, root, total, governed, bare, preps:[{ prep, gloss, count, occ }] } or null. */
export function frameContrast(expr, idx, headKey) {
  const list = idx.byHead.get(headKey);
  if (!list || !list.length) return null;
  const total = expr.headTotals?.[headKey] || 0;
  const governed = list.reduce((s, f) => s + f.count, 0);
  const preps = list.map((f) => ({ prep: f.prep, disp: expr.prepDisp?.[f.prep] || f.prep, count: f.count, occ: f.occ }))
    .sort((a, b) => b.count - a.count);
  const [pos, head] = headKey.split("|");
  return { head, pos, root: list[0].root, total, governed, bare: Math.max(0, total - governed), preps };
}

/* The head rows for the explorer: every governing head with its preposition breakdown,
 * by total governed count. */
export function headRows(expr, idx) {
  return [...idx.byHead.keys()]
    .map((k) => frameContrast(expr, idx, k))
    .filter(Boolean)
    .sort((a, b) => b.governed - a.governed);
}

/* Every expression a root participates in — for the root lab's "Expressions" cross-link.
 * Returns { heads:[frameContrast…], collocations:[…], compounds:[compound…] }. */
export function expressionsForRoot(expr, idx, root) {
  if (!root) return { heads: [], collocations: [], compounds: [] };
  const heads = [...(idx.headByRoot.get(root) || [])].map((k) => frameContrast(expr, idx, k)).filter(Boolean).sort((a, b) => b.governed - a.governed);
  const collocations = (idx.colByRoot.get(root) || []).slice().sort((a, b) => b.ll - a.ll);
  const compounds = (idx.compByRoot.get(root) || []).slice().sort((a, b) => b.count - a.count);
  return { heads, collocations, compounds };
}

const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };

/* Group an occurrence list into verses with the word indices to highlight. `span` maps one
 * occurrence tuple → the array of word indices to mark (default: every index after the verse
 * key). Returns [{ vk, hi:[wordIdx…] }] in muṣḥaf order. */
export function occVerses(occ, verseData, span) {
  const m = new Map();
  for (const o of occ || []) {
    const vk = o[0];
    if (verseData && !verseData[vk]) continue;
    const idxs = span ? span(o) : o.slice(1);
    if (!m.has(vk)) m.set(vk, new Set());
    for (const i of idxs) m.get(vk).add(i);
  }
  return [...m.entries()].map(([vk, set]) => ({ vk, hi: [...set] })).sort((a, b) => sortVk(a.vk, b.vk));
}

/* Span helpers. Frames mark two non-adjacent words (head + preposition); compounds and idioms
 * mark a contiguous run of `len` words from the start index. */
export const FRAME_SPAN = (o) => [o[1], o[2]];
export const spanRun = (len) => (o) => Array.from({ length: len }, (_, j) => o[1] + j);

/* Reverse index verse → the expressions occurring in it, each with the word indices to
 * highlight — for the "expressions in this verse" lens. Built once. Items are
 *   { type:"frame"|"colloc"|"compound"|"idiom", label, disp?, span:[wordIdx…], count, root? } */
export function indexByVerse(expr) {
  const m = new Map();
  const push = (vk, item) => { if (!m.has(vk)) m.set(vk, []); m.get(vk).push(item); };
  for (const f of expr?.frames || []) {
    const disp = expr.prepDisp?.[f.prep] || f.prep;
    for (const o of f.occ) push(o[0], { type: "frame", label: `${f.head} ${disp}`, span: [o[1], o[2]], count: f.count, root: f.root });
  }
  for (const c of expr?.collocations || []) for (const o of c.occ) push(o[0], { type: "colloc", label: `${c.verb} ${c.noun}`, span: [o[1], o[2]], count: c.count, root: c.verbRoot });
  for (const c of expr?.compounds || []) for (const o of c.occ) push(o[0], { type: "compound", label: c.words.join(" "), span: spanRun(c.len)(o), count: c.count, root: c.roots?.[0] });
  for (const it of expr?.idioms || []) for (const o of it.occ) push(o[0], { type: "idiom", label: it.display, span: spanRun(it.len || it.skeleton.split(" ").length)(o), count: it.count });
  return m;
}

/* ═══ Contiguous phrase matching — LEMMA-aware (shared with the offline idiom build) ═══
 *
 * `phraseSkel` reconciles the Uthmani long-ā spellings before norm() so a modern typed phrase
 * matches the muṣḥaf (ٱلْحَيَوٰة↔الحياة, ٱلْمَأْوَىٰ↔المأوى, ٱلصِّرَٰط↔الصراط).
 *
 * `matchPhrase` finds every verse where a contiguous run matches the phrase — but each word is
 * resolved to its LEMMA when one is known (so ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ also catches صِرَٰطًا مُّسْتَقِيمًا,
 * صِرَٰطِى مُسْتَقِيمًا … just like the collocation/frame lenses, which are lemma-based). Words with no
 * lemma (pronouns/particles — إِيَّاكَ) fall back to a surface skeleton so fixed liturgical phrases
 * still match. The lemma resolver is injectable so the offline build can pass its own map; at
 * runtime it uses the loaded lemma map (degrading to pure-surface matching until it loads).
 * Returns occurrences as [verseKey, startIdx] — the SAME shape the offline build emits. */
export const phraseSkel = (w) => norm((w || "").replace(/وٰ/g, "ا").replace(/ىٰ/g, "ى").replace(/ٰ/g, "ا"));
const PHRASE_PROCLITIC = new Set(["و", "ف", "ب", "ل", "ك", "س"]);
const firstWordMatch = (vw, target) => {
  let s = vw;
  for (let n = 0; n <= 2; n++) { if (s === target) return true; if (!s.length || !PHRASE_PROCLITIC.has(s[0])) break; s = s.slice(1); }
  return false;
};
export function matchPhrase(text, verseData, lemmaFn = lemmaOf) {
  const display = (text || "").trim();
  // skeleton → lemma, built from the corpus. Keying by phraseSkel (not norm) is what makes a typed
  // modern spelling resolve: the lemma map's key is the dagger-stripped norm (ٱلصِّرَٰط→الصرط), which
  // a typed الصراط (full alif) would miss — but both share the phraseSkel الصراط, so they meet here.
  const skelLemma = new Map();
  for (const vk in verseData) {
    for (const tk of (verseData[vk].text || "").trim().split(/\s+/)) {
      const sk = phraseSkel(tk);
      if (sk && !skelLemma.has(sk)) { const l = lemmaFn(norm(tk)); if (l) skelLemma.set(sk, l); }
    }
  }
  const lemOf = (tk) => skelLemma.get(phraseSkel(tk)) || null;
  // Each phrase word → its lemma (form-aware) when one exists, else its surface skeleton (pronouns
  // / particles like إِيَّاك keep fixed phrases working).
  const tg = display.split(/\s+/)
    .map((w) => { const lem = lemOf(w); return lem ? { lemma: lem } : { surf: phraseSkel(w) }; })
    .filter((t) => t.lemma || (t.surf && t.surf.length >= 2));
  if (!tg.length) return { display, len: 0, occ: [], count: 0 };
  const occ = [];
  for (const vk in verseData) {
    const toks = (verseData[vk].text || "").trim().split(/\s+/); // full token split = the build's indexing
    for (let i = 0; i + tg.length <= toks.length; i++) {
      let ok = true;
      for (let j = 0; j < tg.length; j++) {
        const t = tg[j], tok = toks[i + j];
        const m = t.lemma ? lemOf(tok) === t.lemma
          : (j === 0 ? firstWordMatch(phraseSkel(tok), t.surf) : phraseSkel(tok) === t.surf);
        if (!m) { ok = false; break; }
      }
      if (ok) occ.push([vk, i]);
    }
  }
  return { display, len: tg.length, occ, count: occ.length };
}

/* Distribution of a verse-key list across sūras → [{ s, count }] in sūra order. */
export function distBySura(verseKeys) {
  const m = new Map();
  for (const vk of verseKeys || []) { const s = +vk.split(":")[0]; m.set(s, (m.get(s) || 0) + 1); }
  return [...m.entries()].map(([s, count]) => ({ s, count })).sort((a, b) => a.s - b.s);
}

/* ── The display phrase of a mined multi-word unit ──
 *
 * The builders emit an iḍāfa compound as its component `words` and an idiom under
 * `display`; neither carries `disp` or `norm`. Reading those names returned undefined for
 * every row, which is how /expressions/idioms came to answer with rows containing a count
 * and no idiom. One helper so a renamed field breaks in one place, not four. */
export const compoundPhrase = (c) =>
  c?.disp || c?.norm || (Array.isArray(c?.words) ? c.words.join(" ") : "") || null;

export const idiomPhrase = (i) =>
  i?.display || i?.disp || i?.norm || i?.label || (Array.isArray(i?.words) ? i.words.join(" ") : "") || null;
