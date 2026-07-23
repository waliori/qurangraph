/* ═══ UI deep links ═══
 *
 * Every API answer carries links back into the app showing the same thing. They are built
 * with the app's OWN encoder (src/hooks/useUrlState.js), so the URL shape can never drift
 * from what the app can read: `https://ayat.network/#s=<url-encoded compact state>`.
 *
 * The compact state names the centre verse (`surah`/`ayah`), the grouping mode, and
 * optionally a `view` — the analysis dialog to open on arrival. The view descriptors here
 * mirror QuranGraph's `openView` switch one-for-one:
 *
 *   occ   {t,k,l,m}  occurrences popup      dist  {t,k,l,m}  distribution by sūra
 *   lab   {t,r,l}    root lab               cmp   {t,a,b}    two-term compare
 *   aya   {t,c}      āya lab                surah {t,s}      sūra lab
 *   ctx   {t,c}      context reader         phrase{t,c}      shared phrases
 *   rhyme {t,c}      rhyme lab              expr  {t,r}      expressions explorer
 *   corpus{t}        corpus explorer        rasm  {t,id}     rasm lab
 *   constr{t,r,l}    construction query     pairing {t,r,c}  pairing matrix
 *   claims{t}        claim board
 *
 * A view always travels WITH a centre verse: the app needs a graph under the dialog, and
 * without one it would fall back to whatever verse that browser last looked at. Callers
 * pass the first (or most relevant) occurrence as the anchor.
 */

import { encodeState } from "../src/hooks/useUrlState.js";
import { config } from "./config.js";

const vkParts = (vk) => { const [s, a] = String(vk || "").split(":").map(Number); return { s, a }; };

/* One app URL from a state object. `base` defaults to the configured UI origin. */
export function appUrl(state, base = config.appBase) {
  return `${base}#s=${encodeState(state)}`;
}

/* A link to the graph centred on a verse, in the given grouping mode. */
export function verseLink(vk, mode = "exact") {
  const { s, a } = vkParts(vk);
  if (!s || !a) return null;
  return appUrl({ surah: s, ayah: a, mode });
}

/* A link that opens `view` over a graph centred on `anchorVk`. */
export function viewLink(view, anchorVk, mode = "exact") {
  const { s, a } = vkParts(anchorVk);
  return appUrl({ surah: s || undefined, ayah: a || undefined, mode, view });
}

/* ── Term-shaped links (a word / lemma / root and its lenses) ──
 * `term` is { key, label, mode }; `anchor` the verse the graph should centre on.
 *
 * `compact` emits only the headline link. Rows in long lists (every collocate, every
 * root in a browse page) use it: a full seven-link block per row is several hundred
 * bytes of near-identical URL, and it turns a 200-row page into a megabyte. The object
 * a request is *about* always gets the full set. */
export function termLinks(term, anchor, compact = false) {
  if (!term?.key) return {};
  const { key: k, label: l, mode: m } = term;
  const mode = m || "exact";
  const occ = viewLink({ t: "occ", k, l, m: mode }, anchor, mode);
  if (compact) return prune({ ui: occ });
  const out = {
    ui: occ,
    ui_occurrences: occ,
    ui_distribution: viewLink({ t: "dist", k, l, m: mode }, anchor, mode),
    ui_graph: anchor ? verseLink(anchor, mode) : null,
  };
  if (mode === "root") {
    out.ui_root_lab = viewLink({ t: "lab", r: k, l }, anchor, "root");
    out.ui_expressions = viewLink({ t: "expr", r: k }, anchor, "root");
    out.ui_construction = viewLink({ t: "constr", r: k, l }, anchor, "root");
  }
  return prune(out);
}

/* ── Verse-shaped links (every lens that takes a centre āya) ── */
export function verseLinks(vk, mode = "exact", compact = false) {
  const { s, a } = vkParts(vk);
  if (!s || !a) return {};
  if (compact) return prune({ ui: verseLink(vk, mode) });
  return prune({
    ui: verseLink(vk, mode),
    ui_graph: verseLink(vk, mode),
    ui_aya_lab: viewLink({ t: "aya", c: vk }, vk, mode),
    ui_context: viewLink({ t: "ctx", c: vk }, vk, mode),
    ui_phrases: viewLink({ t: "phrase", c: vk }, vk, mode),
    ui_rhyme: viewLink({ t: "rhyme", c: vk }, vk, mode),
    ui_surah_lab: viewLink({ t: "surah", s }, vk, mode),
  });
}

/* ── Sūra-shaped links ── */
export function surahLinks(surahId, anchorVk) {
  const anchor = anchorVk || `${surahId}:1`;
  return prune({
    ui: viewLink({ t: "surah", s: surahId }, anchor),
    ui_surah_lab: viewLink({ t: "surah", s: surahId }, anchor),
    ui_graph: verseLink(anchor),
  });
}

/* ── Two-term compare ── */
export function compareLink(a, b, anchor) {
  const t = (x) => (x?.key ? { k: x.key, l: x.label, m: x.mode || "exact" } : null);
  return viewLink({ t: "cmp", a: t(a), b: t(b) }, anchor, a?.mode || "exact");
}

/* ── Pairing matrix (rows × cols of terms) ── */
export function pairingLink(rows, cols, anchor) {
  const t = (x) => ({ k: x.key, l: x.label, m: x.mode || "exact" });
  return viewLink({ t: "pairing", r: (rows || []).map(t), c: (cols || []).map(t) }, anchor);
}

/* Static, argument-free explorers. */
export const corpusLink = (anchor) => viewLink({ t: "corpus" }, anchor);
export const claimsLink = (anchor) => viewLink({ t: "claims" }, anchor);
export const rasmLink = (id, anchor) => viewLink({ t: "rasm", id: id || null }, anchor);

function prune(o) {
  for (const k of Object.keys(o)) if (o[k] == null) delete o[k];
  return o;
}
