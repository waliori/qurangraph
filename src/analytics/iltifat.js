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
    out.push({ person: m.person, number: m.number, gender: m.gender, aspect: m.aspect, voice: m.voice, pos: m.pos, orig: w.orig });
  });
  return out;
}

// Mode of a field over a list (ties → the last, the clause's operative voice).
function dominant(list, field) {
  const counts = {};
  for (const x of list) if (x[field] != null) counts[x[field]] = (counts[x[field]] || 0) + 1;
  let best = null, bestC = 0;
  for (let i = list.length - 1; i >= 0; i--) { const val = list[i][field]; if (val == null) continue; if (counts[val] > bestC) { bestC = counts[val]; best = val; } }
  return best;
}

/* The dominant grammatical reading of a verse: person/number/gender from verbs+pronouns,
 * aspect/voice from VERBS only (pronouns carry neither). Returns
 * { person, number, gender, aspect, voice, sample } or null when the verse has no
 * person-bearing word. */
export function versePerson(words, M, vk) {
  const d = deixis(words, M, vk);
  if (!d.length) return null;
  const person = dominant(d, "person");
  const decider = [...d].reverse().find((x) => x.person === person) || d[d.length - 1];
  const verbs = d.filter((x) => x.pos === "verb");
  return { person, number: decider.number, gender: decider.gender, aspect: dominant(verbs, "aspect"), voice: dominant(verbs, "voice"), sample: decider.orig };
}

const SUR = (vk) => { const [s, a] = vk.split(":").map(Number); return [s, a]; };

/* Iltifāt — grammatical shifts across a sūra. Returns
 *   { contour:[{ a, person, number, gender, aspect, voice, sample }|null …],
 *     shifts:[{ a, b, type, from, to, fromSample, toSample }] }
 * `contour` is every āya in order with its dominant reading (null = no verb/pronoun).
 * `shifts` compares consecutive person-bearing āyāt: a change of PERSON is the headline
 * turn (type "person"); within the SAME person, a change of number / gender / aspect (tense)
 * / voice is a finer turn (الالتفات في العدد/الزمن/البناء). `from`/`to` are that dimension's
 * codes (e.g. person 1/2/3, aspect perf/impf, voice act/pass), so a pair can yield several
 * shift entries when more than one dimension turns. */
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
      const mk = (type, from, to) => ({ a: prev.a, b: c.a, type, from, to, fromSample: prev.sample, toSample: c.sample });
      if (c.person !== prev.person) {
        shifts.push(mk("person", prev.person, c.person)); // the headline turn
      } else { // same speaker — finer turns can stack
        if (c.number && prev.number && c.number !== prev.number) shifts.push(mk("number", prev.number, c.number));
        if (c.gender && prev.gender && c.gender !== prev.gender) shifts.push(mk("gender", prev.gender, c.gender));
        if (c.aspect && prev.aspect && c.aspect !== prev.aspect) shifts.push(mk("aspect", prev.aspect, c.aspect));
        if (c.voice && prev.voice && c.voice !== prev.voice) shifts.push(mk("voice", prev.voice, c.voice));
      }
    }
    prev = c;
  }
  return { contour, shifts };
}
