import { readFileSync, writeFileSync } from "fs";

/* ═══ Iltifāt — grammatical register shifts (الالتفات) — build step ═══
 *
 * Iltifāt is the Qurʾān's signature turn between the three grammatical "registers":
 *   غيبة (3rd / absent — narration ABOUT) · خطاب (2nd / address — speaking TO) · تكلم (1st /
 *   speaker). The classic case is al-Fātiḥa: ... مَالِكِ يَوْمِ ٱلدِّينِ (about God, غيبة) ۝
 *   إِيَّاكَ نَعْبُدُ (to God, خطاب).
 *
 * Accuracy needs the SEGMENT-level morphology (Quranic Arabic Corpus), because the deixis
 * lives in attached pronouns (the كَ of رَبِّكَ, the نَا/هِمْ suffixes) that the app's word-level
 * morphology folds away. So this reads quran-morphology.txt directly and assigns each verse a
 * register from ALL its person-bearing segments (verbs + independent + attached pronouns):
 *   register = 2 (خطاب) if ANY 2nd-person token · else 1 (تكلم) if any 1st · else 3 (غيبة,
 *   including purely-nominal verses, which refer to absent entities). A turn is a change of
 *   register between consecutive āyāt; within the same register a change of number (الالتفات في
 *   العدد — the divine نَحْنُ), tense/aspect, or voice is a finer turn.
 *
 * Output: public/data/iltifat.json = { note, bySura:{ s:{ contour:[{a,person,number,sample}],
 *   shifts:[{a,b,type,from,to,fromSample,toSample}] } } }.  Pure, text-internal.
 */

const PERSON_RE = /^([123])([MF]?)([SDP]?)$/; // agreement tokens: 1P, 2MS, 3MP… (leading digit = person)

function mode(arr) {
  if (!arr.length) return null;
  const c = new Map();
  for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
  let best = arr[0], bc = 0;
  for (const [k, n] of c) if (n > bc) { bc = n; best = k; }
  return best;
}

// ── Parse segments, grouped by verse ──
const verseSegs = new Map(); // "s:a" → [{ a, person, number, aspect, voice, isVerb, content, form }]
for (const line of readFileSync("data/source/quran-morphology.txt", "utf8").split(/\r?\n/)) {
  if (!line) continue;
  const [loc, form, tag, feats] = line.split("\t");
  if (!loc || !feats) continue;
  const [s, a] = loc.split(":").map(Number);
  if (!s || !a) continue;
  const F = feats.split("|");
  let person = 0, number = null;
  for (const tk of F) { const m = PERSON_RE.exec(tk); if (m) { person = +m[1]; number = m[3] === "D" ? "d" : m[3] === "P" ? "p" : "s"; break; } }
  const aspect = F.includes("PERF") ? "perf" : F.includes("IMPF") ? "impf" : F.includes("IMPV") ? "impv" : null;
  const isVerb = tag === "V";
  const voice = isVerb ? (F.includes("PASS") ? "pass" : "act") : null;
  const content = (tag === "N" || tag === "V") && F.some((x) => x.startsWith("ROOT:"));
  const key = `${s}:${a}`;
  let arr = verseSegs.get(key); if (!arr) verseSegs.set(key, (arr = []));
  arr.push({ a, person, number, aspect, voice, isVerb, content, form });
}

// ── Per-verse register record ──
function record(segs) {
  const persons = segs.filter((x) => x.person);
  const reg = persons.some((x) => x.person === 2) ? 2 : persons.some((x) => x.person === 1) ? 1 : 3;
  const regToks = persons.filter((x) => x.person === reg);
  const number = mode(regToks.map((x) => x.number).filter(Boolean));
  let sample = regToks[0]?.form || null;
  if (!sample) { const c = segs.find((x) => x.content); sample = c ? c.form : (segs[0]?.form || ""); }
  const verbs = segs.filter((x) => x.isVerb);
  return { a: segs[0].a, person: reg, number, sample, vAspect: mode(verbs.map((x) => x.aspect).filter(Boolean)), vVoice: mode(verbs.map((x) => x.voice).filter(Boolean)) };
}

// ── Build per-sūra contour + shifts ──
const bySuraVerses = new Map(); // s → [record…]
for (const [key, segs] of verseSegs) {
  const s = +key.split(":")[0];
  let arr = bySuraVerses.get(s); if (!arr) bySuraVerses.set(s, (arr = []));
  arr.push(record(segs));
}

const bySura = {};
let totalShifts = 0;
for (const [s, recs] of bySuraVerses) {
  recs.sort((x, y) => x.a - y.a);
  const shifts = [];
  for (let i = 1; i < recs.length; i++) {
    const p = recs[i - 1], c = recs[i];
    const mk = (type, from, to) => ({ a: p.a, b: c.a, type, from, to, fromSample: p.sample, toSample: c.sample });
    if (c.person !== p.person) shifts.push(mk("person", p.person, c.person));
    else {
      if (c.number && p.number && c.number !== p.number) shifts.push(mk("number", p.number, c.number));
      if (c.vAspect && p.vAspect && c.vAspect !== p.vAspect) shifts.push(mk("aspect", p.vAspect, c.vAspect));
      if (c.vVoice && p.vVoice && c.vVoice !== p.vVoice) shifts.push(mk("voice", p.vVoice, c.vVoice));
    }
  }
  totalShifts += shifts.length;
  bySura[s] = { contour: recs.map((r) => ({ a: r.a, person: r.person, number: r.number, sample: r.sample })), shifts };
}

writeFileSync("public/data/iltifat.json", JSON.stringify({
  note: "Iltifāt — grammatical register shifts (غيبة/خطاب/تكلم). Per verse the register is read from ALL person-bearing segments (verbs + independent & attached pronouns) of the Quranic Arabic Corpus morphology; a turn is a register change between consecutive āyāt (or, within a register, a number/tense/voice change). Text-internal.",
  bySura,
}));

console.log(`Iltifāt: ${Object.keys(bySura).length} sūras, ${totalShifts} turns total.`);
const f = bySura[1];
console.log(`  al-Fātiḥa contour: ${f.contour.map((c) => c.person).join(",")} (expect 3,3,3,3,2,2,2)`);
console.log(`  al-Fātiḥa turns: ${f.shifts.map((s) => `${s.a}→${s.b} ${s.type} ${s.from}→${s.to}`).join(" · ")}`);
console.log(`→ public/data/iltifat.json`);
