/* ═══ Per-token morphology (decode + filter) ═══
 *
 * `public/data/morphology.json` is columnar and dictionary-coded to stay small:
 *   { legend:{pos,aspect,voice,mood,gender,number,gcase,fields}, lemmas:[…],
 *     roots:[…], v:{ "s:a":[ tuple, … ] } }
 * where each tuple is int codes in `legend.fields` order. A verse's tuple array
 * is aligned 1:1 with that verse's app words (verseData[vk].words), so word index
 * = tuple index. These helpers turn a tuple into a readable record and test it
 * against the active morphology filter — all pure, so they're trivially testable.
 */

/* Decode one tuple from a loaded morphology object into a readable record. */
export function decodeMorph(tuple, M) {
  if (!tuple || !M) return null;
  const L = M.legend;
  return {
    pos: L.pos[tuple[0]] || null,
    vf: tuple[1] || 0,
    aspect: L.aspect[tuple[2]] || null,
    voice: L.voice[tuple[3]] || null,
    mood: L.mood[tuple[4]] || null,
    person: tuple[5] || 0,
    gender: L.gender[tuple[6]] || null,
    number: L.number[tuple[7]] || null,
    gcase: L.gcase[tuple[8]] || null,
    lemma: M.lemmas[tuple[9]] || null,
    root: M.roots[tuple[10]] || null,
    precise: !!tuple[11],
  };
}

/* The decoded morphology for a word at (verseKey, wordIndex), or null. */
export function morphAt(M, verseKey, wordIndex) {
  const rows = M?.v?.[verseKey];
  return rows ? decodeMorph(rows[wordIndex], M) : null;
}

/* Position-correct grouping keys for every word of a verse, aligned 1:1 with
 * verseData[vk].words (same word order, same <2-char skip — the builder emits the
 * tuple array against that exact filter). Each entry is { proot, plemma } where
 * plemma is the BARE-normalised lemma so it matches the voted lemma map's keys.
 * Returns null when the verse has no morphology row. The app attaches these to its
 * word objects so wordGroupKey() can disambiguate homographs per occurrence. */
export function verseGroupingKeys(M, verseKey, normFn) {
  const rows = M?.v?.[verseKey];
  if (!rows) return null;
  return rows.map((t) => {
    const m = decodeMorph(t, M);
    const proot = m?.root || null;
    const plemma = m?.lemma && normFn ? (normFn(m.lemma) || null) : null;
    return { proot, plemma };
  });
}

/* Empty filter shape. Each category is a list of allowed codes; [] = no constraint. */
export const EMPTY_MORPH_FILTER = { pos: [], form: [], aspect: [], voice: [] };

export function morphFilterActive(f) {
  return !!f && (f.pos?.length || f.form?.length || f.aspect?.length || f.voice?.length);
}

/* Does a decoded morphology record satisfy the filter? A word with no morphology
 * data fails whenever any constraint is active (we can't confirm a match). */
export function passesMorphFilter(m, f) {
  if (!morphFilterActive(f)) return true;
  if (!m) return false;
  if (f.pos.length && !f.pos.includes(m.pos)) return false;
  if (f.form.length && !f.form.includes(m.vf)) return false;
  if (f.aspect.length && !f.aspect.includes(m.aspect)) return false;
  if (f.voice.length && !f.voice.includes(m.voice)) return false;
  return true;
}

/* Roman numeral for a verb Form (1..11) — for display. */
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
export function formRoman(vf) { return vf > 0 && vf < ROMAN.length ? ROMAN[vf] : vf ? String(vf) : ""; }

/* ═══ Morphology-constrained search ═══
 *
 * The morphology filter already prunes the GRAPH (see getUW). These let a SEARCH /
 * occurrence list honour it too: keep only the verses where the term actually
 * occurs WITH a matching morphological reading at its position — so "root X as a
 * Form II passive verb" returns just those occurrences, not every verse with X.
 */
const POS_AR = { noun: "اسم", verb: "فعل", particle: "حرف", pn: "علم", pron: "ضمير", adj: "صفة", actpcpl: "اسم فاعل", passpcpl: "اسم مفعول" };
const ASPECT_AR = { perf: "ماضٍ", impf: "مضارع", impv: "أمر" };
const VOICE_AR = { act: "معلوم", pass: "مجهول" };

/* A short human summary of the active filter, e.g. "فعل · الصيغة II · مجهول". */
export function morphFilterSummary(f) {
  if (!morphFilterActive(f)) return "";
  const parts = [];
  if (f.pos?.length) parts.push(f.pos.map((p) => POS_AR[p] || p).join("/"));
  if (f.form?.length) parts.push("الصيغة " + f.form.map((v) => formRoman(v)).join("/"));
  if (f.aspect?.length) parts.push(f.aspect.map((a) => ASPECT_AR[a] || a).join("/"));
  if (f.voice?.length) parts.push(f.voice.map((v) => VOICE_AR[v] || v).join("/"));
  return parts.join(" · ");
}

/* Keep only the verse keys where `lookup` (in `mode`) occurs at a position whose
 * morphology satisfies `filter`. A no-op (returns `keys` as-is) when the filter is
 * inactive or morphology (`M`) hasn't loaded — so search degrades gracefully to the
 * unfiltered list rather than appearing to find nothing. `groupKeyOf` is injected
 * (wordGroupKey) to avoid a module cycle with arabic-utils. */
export function filterOccurrencesByMorph(keys, lookup, mode, verseData, M, filter, groupKeyOf) {
  if (!morphFilterActive(filter) || !M || !groupKeyOf) return keys;
  return keys.filter((vk) => {
    const v = verseData[vk]; if (!v) return false;
    const rows = M.v?.[vk];
    return v.words.some((w, idx) =>
      groupKeyOf(w, mode) === lookup && passesMorphFilter(rows ? decodeMorph(rows[idx], M) : null, filter));
  });
}
