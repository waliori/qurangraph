import { wordGroupKey } from "../arabic-utils.js";
import { morphAt } from "../morphology.js";

/* ═══ Root derivation family (الصرف / الاشتقاق الصغير) ═══
 *
 * The graph groups every inflection of a root into one node; this opens that node up
 * into its DERIVATIONAL family — the distinct words (lemmas) the Qur'an builds from the
 * root, each annotated with its morphology (verb Form, part of speech, voice, aspect)
 * and how often it occurs. It is the ṣarf lens: how one root spreads into عَلِمَ /
 * عَلَّمَ / عالِم / مَعْلوم / عِلْم …, and where each derivative is used.
 *
 * Pure and Qur'an-internal — no inference. Needs the loaded morphology object `M` for
 * per-occurrence Form/POS; without it each occurrence still groups by its lemma (or
 * surface skeleton), just without the grammatical annotation.
 */

// Display order: verbs (by Form), then participles, then nominals, then the rest.
const POS_ORDER = { verb: 0, actpcpl: 1, passpcpl: 2, noun: 3, adj: 4, pn: 5, pron: 6, particle: 7 };

/* The derivational family of `root`. Returns
 *   [{ key, lemma, pos, vf, voice, aspect, count, examples:[orig…], verses:[vk…] }]
 * one entry per derived lemma, ordered by POS class → Form → frequency. `verses` are in
 * muṣḥaf order (r2v is built in that order); `examples` are up to 8 distinct surface
 * spellings. `count` is true token frequency (every occurrence of the derivative). */
export function derivationFamily(root, r2v, verseData, M) {
  if (!root) return [];
  const fam = new Map(); // lemma key → record
  for (const vk of r2v[root] || []) {
    const words = verseData[vk]?.words || [];
    words.forEach((w, i) => {
      if (wordGroupKey(w, "root") !== root) return;
      const m = M ? morphAt(M, vk, i) : null;
      // Key by the DIACRITIZED lemma when present: distinct derivatives can share a
      // bare skeleton (عَلِمَ and عِلْم both → علم), which plemma/norm would wrongly merge.
      const key = (m && m.lemma) || w.plemma || w.norm;
      let rec = fam.get(key);
      if (!rec) {
        rec = { key, lemma: (m && m.lemma) || w.orig, pos: (m && m.pos) || null, vf: (m && m.vf) || 0,
          voice: (m && m.voice) || null, aspect: (m && m.aspect) || null,
          count: 0, examples: [], verses: [], _ex: new Set(), _v: new Set() };
        fam.set(key, rec);
      }
      // Prefer a record that carries real morphology if a later occurrence has it.
      if (!rec.pos && m && m.pos) { rec.pos = m.pos; rec.vf = m.vf || 0; rec.voice = m.voice; rec.aspect = m.aspect; rec.lemma = m.lemma || rec.lemma; }
      rec.count++;
      if (!rec._ex.has(w.orig) && rec.examples.length < 8) { rec._ex.add(w.orig); rec.examples.push(w.orig); }
      if (!rec._v.has(vk)) { rec._v.add(vk); rec.verses.push(vk); }
    });
  }
  const out = [...fam.values()].map(({ _ex, _v, ...r }) => r); // eslint-disable-line no-unused-vars
  out.sort((a, b) =>
    (POS_ORDER[a.pos] ?? 9) - (POS_ORDER[b.pos] ?? 9) ||
    (a.vf || 0) - (b.vf || 0) ||
    b.count - a.count ||
    a.key.localeCompare(b.key));
  return out;
}
