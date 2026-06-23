import { morphAt } from "../morphology.js";

/* ═══ Rhetorical structures (أساليب: القسم والشرط) ═══
 *
 * Two recognisable rhetorical frames computed from the text + its morphology:
 *   - qasam (القسم / oath): the oath particles (تالله، لعمرك), the swearing VERBS — أَقْسَمَ
 *     (Form IV), قاسَمَ (III), تَقاسَمَ (VI), and حَلَفَ (root حلف) — and the signature qasam-wāw
 *     openings (وَالشَّمْسِ، وَالْعَصْرِ، وَالتِّينِ …). Crucially it gates the قسم root on the verb
 *     FORM: only the swearing forms count, so تَسْتَقْسِمُوا۟ (Form X = divination by arrows),
 *     يَقْسِمُونَ (Form I = apportion) and the noun قِسْمَة (division) are NOT oaths.
 *   - shart (الشرط / conditional): the unambiguous conditional particles (إذا، لو، لولا،
 *     كلما، لئن …); the ambiguous ones (إن، ما، من) are left out to keep precision high.
 * CANDIDATES, each evidenced by its verse. Needs the morphology `M` to read the verb form;
 * without it, oath detection falls back to the particles + the qasam-wāw openings only. Pure. */

// Unambiguous conditional particles (norm/skeleton forms — hamza folded to ا).
const COND = new Set(["اذا", "لو", "لولا", "لوما", "كلما", "لئن", "اذما", "اينما", "حيثما", "مهما", "متى", "انى"]);
// Explicit oath particles (the ت of oath; "by my life").
const OATH_PARTICLES = new Set(["تالله", "لعمرك"]);
// قسم verb forms that mean "to swear" (Form IV أقسم, III قاسم, VI تقاسم) — NOT I (apportion)
// or X (seek divination). حلف is swear-semantic throughout the Qurʾān.
const OATH_QSM_FORMS = new Set([3, 4, 6]);

/* A sūra-opening qasam-wāw: the verse is the first of its sūra and opens on وَ+definite
 * noun (وال…), the hallmark of the oath sūras (والشمس، والعصر، والفجر، والتين). */
function qasamOpening(v) {
  if (v.a !== 1 || !v.words?.length) return false;
  const first = v.words[0].norm || "";
  return first.startsWith("وال") && first.length >= 4;
}

// Is the word at (vk, i) a swearing act? Verb of حلف, or قسم in a swearing form. Needs M.
function isOathWord(M, vk, i) {
  const m = morphAt(M, vk, i);
  if (!m || m.pos !== "verb") return false;
  if (m.root === "حلف") return true;
  if (m.root === "قسم" && OATH_QSM_FORMS.has(m.vf)) return true;
  return false;
}

/* Scan the corpus (or one sūra if `opts.suraId`) for the two frames. Returns
 * { oath:[{ vk, marker }], conditional:[{ vk, marker }] } in muṣḥaf order, one entry per
 * verse (the first trigger word, with its diacritics, is the marker). */
export function rhetoricScan(verseData, M, opts = {}) {
  const suraId = opts.suraId || null;
  const oath = [], conditional = [];
  const keys = Object.keys(verseData).sort((x, y) => {
    const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab;
  });
  for (const vk of keys) {
    const v = verseData[vk];
    if (suraId && v.s !== suraId) continue;
    let oathMark = null, condMark = null;
    if (qasamOpening(v)) oathMark = v.words[0].orig;
    (v.words || []).forEach((w, i) => {
      if (!oathMark && (OATH_PARTICLES.has(w.norm) || isOathWord(M, vk, i))) oathMark = w.orig;
      if (!condMark && COND.has(w.norm)) condMark = w.orig;
    });
    if (oathMark) oath.push({ vk, marker: oathMark });
    if (condMark) conditional.push({ vk, marker: condMark });
  }
  return { oath, conditional };
}
