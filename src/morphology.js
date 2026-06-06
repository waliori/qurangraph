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
