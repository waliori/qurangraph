/* ═══ Term resolution + the shapes every endpoint reuses ═══
 *
 * "Give me the āyāt with the word/root X" is the API's centre of gravity, and X arrives
 * as whatever the caller typed: a vocalized Uthmani spelling (ٱلصَّلَوٰة), the conventional
 * imlāʾī one (الصلاة), a bare root (كتب), a lemma, or even Latin (rahman). All of it goes
 * through the app's own resolver (src/search.js), so the API resolves a query exactly the
 * way the search bar does — including its "did you mean" candidates, which become the
 * hint on a 404 instead of a dead end.
 */

import { wordGroupKey } from "../src/arabic-utils.js";
import { looseResolve, romanResolve } from "../src/search.js";
import { morphAt } from "../src/morphology.js";
import { notFound, badRequest } from "./http.js";
import { hitIndices, tokenCountIn } from "./corpus.js";
import { termLinks, verseLinks } from "./links.js";

export const MODES = ["exact", "lemma", "root"];

/* A sūrah, however it was named: 2 · البقرة · بقرة · al-baqarah · "Al Baqara".
 * Exact after normalisation — a miss returns the near spellings rather than a guess.
 * See server/surahNames.js for why fuzzy matching is refused here. */
export function resolveSurahId(C, raw) {
  const id = C.surahIndex.lookup(raw);
  if (id) return id;
  const near = C.surahIndex.near(raw);
  throw notFound(
    `No sūrah matches "${String(raw ?? "").trim()}".`,
    near.length
      ? `Did you mean ${near.map((n) => `${n.name} (${n.id})`).join(", ")}? A sūrah may be given as a number (1–114), its Arabic name, or a transliteration.`
      : `Give a number (1–114), an Arabic name (البقرة), or a transliteration (al-baqarah).`,
  );
}
export const PRECISIONS = ["loose", "strict"];

const isLatin = (s) => /[a-z]/i.test(s || "");

/* Resolve a raw query to a canonical index key in `mode`.
 * Returns { key, label, mode, verses, resolved_from, alternatives }. Throws 404 when the
 * query matches nothing, carrying the near-misses as a hint. */
export function resolveTerm(V, C, query, mode = "exact") {
  const q = String(query || "").trim();
  if (!q) throw badRequest(`"q" is required`, "e.g. ?q=كتب&mode=root");
  if (!MODES.includes(mode)) throw badRequest(`"mode" must be one of ${MODES.join(", ")}`);

  let { direct, candidates } = looseResolve(q, mode, V.precision, V.indices, V.searchAlias, V.searchAliasFuzzy);

  // Latin input ("rahman", "ibrahim") never hits the Arabic aliases — fall back to the
  // romanization index the toolbar uses, then re-resolve through the same path.
  if (!direct && !candidates.length && isLatin(q)) {
    // romanResolve reads `freq[n].length`, so it takes the w2v index itself as the counts.
    const roman = romanResolve(q, V.romanIndex, V.w2v) || [];
    if (roman.length) {
      const r = looseResolve(roman[0].lookup, mode, V.precision, V.indices, V.searchAlias, V.searchAliasFuzzy);
      direct = r.direct; candidates = r.candidates;
    }
  }

  const best = direct || candidates.find((c) => c.tier === 3) || candidates[0];
  if (!best) {
    throw notFound(`No ${mode} in the Qurʾān matches "${q}".`,
      `Try a different mode (exact | lemma | root), or the bare consonantal form.`);
  }
  const key = best.lookup;
  return {
    key,
    label: labelFor(V, key, mode),
    mode,
    verses: (V.indices[mode][key] || []).length,
    resolved_from: q === key ? undefined : q,
    alternatives: candidates.filter((c) => c.lookup !== key).slice(0, 8)
      .map((c) => ({ key: c.lookup, label: labelFor(V, c.lookup, mode), verses: c.count })),
  };
}

/* The prettiest display form for a key: the most frequent vocalized spelling for exact
 * keys (ٱلصَّلَوٰة rather than the bare skeleton), the key itself for lemmas and roots. */
export function labelFor(V, key, mode) {
  return mode === "exact" ? (V.exDisplay[key] || key) : key;
}

/* A term as it appears in a response: identity + counts + every UI lens. */
export function termShape(V, term, { anchor } = {}) {
  const verseKeys = V.indices[term.mode][term.key] || [];
  const anchorVk = anchor || verseKeys[0] || null;
  let tokens = 0;
  for (const vk of verseKeys) tokens += tokenCountIn(V.verseData[vk], term.key, term.mode);
  return {
    key: term.key,
    label: term.label,
    mode: term.mode,
    ...(term.resolved_from ? { resolved_from: term.resolved_from } : {}),
    verses: verseKeys.length,
    occurrences: tokens,
    ...(term.alternatives?.length ? { alternatives: term.alternatives } : {}),
    links: termLinks(term, anchorVk),
  };
}

/* One verse in a response. `hi` marks the word positions that matched the query, so a
 * client can highlight them the way the app does. `words:true` attaches the per-token
 * analysis (surface form, normalised key, root, lemma, full morphology). */
export function verseShape(V, C, vk, { words = false, hits = null, mode = "exact" } = {}) {
  const v = V.verseData[vk];
  if (!v) return null;
  const out = {
    verse_key: vk,
    surah: v.s,
    surah_name: v.sn,
    ayah: v.a,
    text: v.text,
  };
  if (hits) out.matches = hits;
  if (words) out.words = v.words.map((w, i) => {
    const m = C.morph ? morphAt(C.morph, vk, i) : null;
    return {
      index: i,
      form: w.orig,
      normalized: w.norm,
      root: wordGroupKey(w, "root") || null,
      lemma: wordGroupKey(w, "lemma") || null,
      ...(m ? { morphology: compactMorph(m) } : {}),
    };
  });
  out.links = verseLinks(vk, mode);
  return out;
}

function compactMorph(m) {
  const o = {
    pos: m.pos, form: m.vf || undefined, aspect: m.aspect || undefined, voice: m.voice || undefined,
    mood: m.mood || undefined, person: m.person || undefined, gender: m.gender || undefined,
    number: m.number || undefined, case: m.gcase || undefined, precise: m.precise || undefined,
  };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/* The occurrence list for a term: every āya it appears in, in muṣḥaf order, each with the
 * matched word positions. This is the "all ayat having the word/root X" answer. */
export function occurrencesOf(V, C, term, { words = false } = {}) {
  const keys = V.indices[term.mode][term.key] || [];
  return keys.map((vk) => {
    const v = V.verseData[vk];
    return verseShape(V, C, vk, {
      words,
      mode: term.mode,
      hits: { word_indices: hitIndices(v, term.key, term.mode), count: tokenCountIn(v, term.key, term.mode) },
    });
  });
}

/* Resolve `term`/`q` + `mode` off a query string — the shared preamble of every
 * term-shaped endpoint. */
export function termFromQuery(V, C, q, { param = "term", defaultMode = "exact" } = {}) {
  const raw = q.get(param) ?? q.get("q");
  const mode = q.get("mode") || defaultMode;
  return resolveTerm(V, C, raw, mode);
}
