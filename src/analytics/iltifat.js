import { morphAt } from "../morphology.js";

/* ═══ Iltifāt — grammatical person/number shift (الالتفات) ═══
 *
 * Iltifāt is the Qurʾān's signature rhetorical "turn": the grammatical PERSON (or number)
 * of the discourse shifts while the referent holds — 3rd→2nd (… مَالِكِ يَوْمِ الدِّينِ ۝
 * إِيَّاكَ نَعْبُدُ), the divine plural (نَحْنُ) for the One, address swinging to the absent.
 * It is the one major balāgha figure computable straight from the corpus's own person/
 * number tags (already loaded for the morphology filter) — no inference, just a contour of
 * who is speaking/addressed verse by verse, with the turns marked. Like the other lenses it
 * surfaces CANDIDATES (every shift is evidenced by the two verses); the reader judges intent.
 *
 * Needs the loaded morphology object `M`; returns empty contours without it.
 */

// Person-bearing tokens of a verse — verbs and pronouns are the referential anchors.
function deixis(words, M, vk) {
  const out = [];
  if (!M) return out;
  words.forEach((w, i) => {
    const m = morphAt(M, vk, i);
    if (!m || !m.person || (m.pos !== "verb" && m.pos !== "pron")) return;
    out.push({ person: m.person, number: m.number, gender: m.gender, pos: m.pos, orig: w.orig });
  });
  return out;
}

/* The dominant grammatical person of a verse (mode of its verbs/pronouns, ties → the last —
 * the clause's operative voice), with the number/gender of the deciding token. Returns
 * { person, number, gender, sample } or null when the verse carries no person-bearing word. */
export function versePerson(words, M, vk) {
  const d = deixis(words, M, vk);
  if (!d.length) return null;
  const counts = {};
  for (const x of d) counts[x.person] = (counts[x.person] || 0) + 1;
  let best = d[d.length - 1].person, bestC = 0;
  for (let i = d.length - 1; i >= 0; i--) { const p = d[i].person; if (counts[p] > bestC) { bestC = counts[p]; best = p; } }
  const decider = [...d].reverse().find((x) => x.person === best) || d[d.length - 1];
  return { person: best, number: decider.number, gender: decider.gender, sample: decider.orig };
}

const SUR = (vk) => { const [s, a] = vk.split(":").map(Number); return [s, a]; };

/* Person/number shifts across a sūra. Returns
 *   { contour:[{ a, person, number, gender, sample }|null …], shifts:[{ a, b, type, from, to,
 *     fromNumber, toNumber, fromSample, toSample }] }
 * `contour` is every āya in order with its dominant person (null = no verb/pronoun); `shifts`
 * are consecutive āyāt (skipping person-less ones) whose person changes (type "person") or
 * whose number changes at the same person (type "number") — the iltifāt turns. */
export function suraIltifat(suraId, verseData, M) {
  const keys = [];
  for (const vk in verseData) if (verseData[vk].s === suraId) keys.push(vk);
  keys.sort((x, y) => SUR(x)[1] - SUR(y)[1]);
  const contour = keys.map((vk) => { const p = versePerson(verseData[vk].words, M, vk); return p ? { a: verseData[vk].a, ...p } : { a: verseData[vk].a, person: null }; });
  const shifts = [];
  let prev = null; // last verse that HAD a person
  for (const c of contour) {
    if (c.person == null) continue;
    if (prev) {
      if (c.person !== prev.person)
        shifts.push({ a: prev.a, b: c.a, type: "person", from: prev.person, to: c.person, fromNumber: prev.number, toNumber: c.number, fromSample: prev.sample, toSample: c.sample });
      else if (c.number && prev.number && c.number !== prev.number)
        shifts.push({ a: prev.a, b: c.a, type: "number", from: prev.person, to: c.person, fromNumber: prev.number, toNumber: c.number, fromSample: prev.sample, toSample: c.sample });
    }
    prev = c;
  }
  return { contour, shifts };
}
