import { readFileSync, writeFileSync, existsSync } from "fs";
import { norm, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "../src/arabic-utils.js";

/* ═══ Lexical relations: opposition (طباق/مقابلة) — build step ═══
 *
 * Precision-first. The AUTHORITATIVE opposites come from a human-curated, reviewable file
 * (data/antonyms.json) — Qurʾanic antonym root-pairs identified by analysis, not statistics.
 * This step only ATTACHES EVIDENCE to them (the verses where the corpus juxtaposes the pair),
 * computes a distributional relatedness, and SEPARATELY surfaces frame-discovered CANDIDATES
 * (pairs in a negation-vs-adversative antithesis frame that are NOT in the curated set) so the
 * reviewer can promote good ones into antonyms.json. No affinity/near-synonym axis.
 *
 * Output: public/data/relations.json
 *   { note,
 *     byRoot:{ root:[{ other, otherEn, polarity:"opposite"|"candidate", cat, relatedness,
 *                       contrast, framed, verses[] }] },
 *     catalogue:[{ a, b, cat, gloss, relatedness, contrast, framed, verses[] }],  // curated
 *     candidates:[{ a, b, relatedness, contrast, verses[] }] }                    // discovered
 */

const HAFS = "public/data/quran-hafs.json";
const ROOTS = "public/data/roots.json";
const ANTONYMS = "data/antonyms.json";
for (const f of [HAFS, ROOTS, ANTONYMS]) if (!existsSync(f)) { console.error(`Missing ${f}.`); process.exit(1); }

const hafs = JSON.parse(readFileSync(HAFS, "utf8"));
const rootMap = JSON.parse(readFileSync(ROOTS, "utf8"));
const present = new Set(Object.values(rootMap));
const curated = JSON.parse(readFileSync(ANTONYMS, "utf8")).pairs || [];

const STOP = new Set([...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT]);
const STOP_ROOTS = new Set();
for (const wrd of STOP) { const r = rootMap[norm(wrd)]; if (r) STOP_ROOTS.add(r); }

const NEG = new Set(["لا", "لم", "لن", "ما", "غير", "لما"]);
const ADV = new Set(["لكن", "ولكن", "بل", "فبل"]);
const isNeg = (n) => NEG.has(n) || NEG.has(n.replace(/^[وف]/, ""));
const isAdv = (n) => ADV.has(n);

/* ── Tokenise; build r2v (root → verse Set) and per-verse content-root bags ── */
const verses = [];
const r2v = new Map();
for (const sura of hafs) {
  for (const v of sura.verses) {
    const vk = `${sura.id}:${v.id}`;
    const toks = []; const bag = new Set();
    for (const raw of v.text.split(/\s+/)) {
      const n = norm(raw);
      if (!n) continue;
      const root = rootMap[n] || null;
      const keep = root && !STOP_ROOTS.has(root) ? root : null;
      toks.push({ root: keep, neg: isNeg(n), adv: isAdv(n) });
      if (keep) { bag.add(keep); if (!r2v.has(keep)) r2v.set(keep, new Set()); r2v.get(keep).add(vk); }
    }
    verses.push({ vk, s: sura.id, a: v.id, toks, roots: [...bag] });
  }
}
const N = verses.length;
const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };
const parse = (vk) => vk.split(":").map(Number);
// Evidence verses for a curated pair, in priority order so every pair shows something:
//   1) same-āya co-occurrence  2) nearby (same sūra, ≤3 āyāt apart)  3) a sample of each root.
// `kind` records which level was used so the UI can label it.
// `versesA`/`versesB` keep each root's own evidence verses so the UI can label which verse
// shows which root — essential for pairs that never share an āya (then `verses` is just the
// union, and "how we knew" is the curated gloss, not a co-occurrence).
function pairEvidence(a, b) {
  const A = r2v.get(a), B = r2v.get(b);
  if (!A || !B) return { verses: [], versesA: [], versesB: [], kind: "none" };
  const same = [...A].filter((vk) => B.has(vk)).sort(sortVk);
  if (same.length) { const v = same.slice(0, 12); return { verses: v, versesA: v, versesB: v, kind: "same" }; }
  // nearby: a-verse and b-verse in the same sūra within 3 āyāt
  const bBy = new Map(); for (const vk of B) { const [s, ay] = parse(vk); (bBy.get(s) || bBy.set(s, []).get(s)).push(ay); }
  const nearA = new Set(), nearB = new Set();
  for (const vk of A) { const [s, ay] = parse(vk); const list = bBy.get(s); if (!list) continue; for (const by of list) if (Math.abs(by - ay) <= 3) { nearA.add(vk); nearB.add(`${s}:${by}`); } }
  if (nearA.size) {
    const va = [...nearA].sort(sortVk).slice(0, 8), vb = [...nearB].sort(sortVk).slice(0, 8);
    return { verses: [...new Set([...va, ...vb])].sort(sortVk).slice(0, 12), versesA: va, versesB: vb, kind: "near" };
  }
  // fallback: a few occurrences of EACH root on its own, kept separate, so the reviewer
  // can inspect where each appears even though they never co-occur.
  const va = [...A].sort(sortVk).slice(0, 4), vb = [...B].sort(sortVk).slice(0, 4);
  return { verses: [...new Set([...va, ...vb])].sort(sortVk), versesA: va, versesB: vb, kind: "sample" };
}

/* ── PPMI vectors + cosine (relatedness only) ── */
const df = new Map();
for (const v of verses) for (const r of v.roots) df.set(r, (df.get(r) || 0) + 1);
const MIN_DF = 3, MAX_DF = 0.25 * N;
const cooc = new Map();
const bump = (a, b) => { let m = cooc.get(a); if (!m) cooc.set(a, (m = new Map())); m.set(b, (m.get(b) || 0) + 1); };
for (const v of verses) for (let i = 0; i < v.roots.length; i++) for (let j = i + 1; j < v.roots.length; j++) { bump(v.roots[i], v.roots[j]); bump(v.roots[j], v.roots[i]); }
const vec = new Map(), mag = new Map();
for (const [r, ctx] of cooc) {
  if (df.get(r) < MIN_DF || df.get(r) > MAX_DF) continue;
  const m = new Map(); let sq = 0;
  for (const [c, k] of ctx) { if (df.get(c) < MIN_DF || df.get(c) > MAX_DF) continue; const pmi = Math.log2((k * N) / (df.get(r) * df.get(c))); if (pmi > 0) { m.set(c, pmi); sq += pmi * pmi; } }
  if (m.size) { vec.set(r, m); mag.set(r, Math.sqrt(sq)); }
}
const cosine = (a, b) => { const va = vec.get(a), vb = vec.get(b); if (!va || !vb) return 0; const [s, l] = va.size < vb.size ? [va, vb] : [vb, va]; let dot = 0; for (const [c, w] of s) { const o = l.get(c); if (o) dot += w * o; } return +(dot / ((mag.get(a) || 1) * (mag.get(b) || 1))).toFixed(3); };

/* ── Antithesis frame mining (negation REQUIRED — high precision) ── */
const SEP = "|";
const canon = (a, b) => (a < b ? a + SEP + b : b + SEP + a);
const frame = new Map(); // key → { a, b, count, verses:Set }
const MAX_CLAUSE = 4;
function add(a, b, vks) { const k = canon(a, b); let r = frame.get(k); if (!r) frame.set(k, (r = { a: a < b ? a : b, b: a < b ? b : a, count: 0, verses: new Set() })); r.count++; for (const vk of vks) r.verses.add(vk); }
function mineUnit(toks, vks) {
  const advI = toks.findIndex((t) => t.adv);
  if (advI < 1 || advI >= toks.length - 1) return;
  const before = [], after = []; let hasNeg = false;
  for (let i = 0; i < advI; i++) { if (toks[i].neg) hasNeg = true; if (toks[i].root) before.push(toks[i].root); }
  if (!hasNeg) return; // negation-vs-adversative only — drop bare-adversative noise
  for (let i = advI + 1; i < toks.length; i++) if (toks[i].root) after.push(toks[i].root);
  if (!before.length || !after.length || before.length > MAX_CLAUSE || after.length > MAX_CLAUSE) return;
  const seen = new Set(), lim = Math.min(before.length, after.length);
  for (let i = 0; i < lim; i++) { if (before[i] !== after[i]) { const k = canon(before[i], after[i]); if (!seen.has(k)) { seen.add(k); add(before[i], after[i], vks); } } }
  const lb = before[before.length - 1], fa = after[0];
  if (lb !== fa && !seen.has(canon(lb, fa))) add(lb, fa, vks);
}
for (let i = 0; i < verses.length; i++) {
  mineUnit(verses[i].toks, [verses[i].vk]);
  if (i + 1 < verses.length && verses[i + 1].s === verses[i].s) mineUnit([...verses[i].toks, ...verses[i + 1].toks], [verses[i].vk, verses[i + 1].vk]);
}

/* ── Assemble: curated (authoritative) + candidates (discovered, not curated) ── */
const curatedKeys = new Set();
let dropped = 0;
const catalogue = [];
for (const p of curated) {
  if (!present.has(p.a) || !present.has(p.b)) { console.warn(`  curated pair dropped (root not in corpus): ${p.a}/${p.b}`); dropped++; continue; }
  const key = canon(p.a, p.b); curatedKeys.add(key);
  const fr = frame.get(key);
  const framed = !!fr;
  const frV = framed ? [...fr.verses].sort(sortVk).slice(0, 12) : null;
  const ev = framed ? { verses: frV, versesA: frV, versesB: frV, kind: "frame" } : pairEvidence(p.a, p.b);
  catalogue.push({ a: p.a, b: p.b, cat: p.cat || null, a_en: p.a_en, b_en: p.b_en, gloss: `${p.a_en} ↔ ${p.b_en}`, relatedness: cosine(p.a, p.b), contrast: fr ? fr.count : 0, framed, evidence: ev.kind, verses: ev.verses, versesA: ev.versesA, versesB: ev.versesB });
}
catalogue.sort((x, y) => y.framed - x.framed || y.contrast - x.contrast || (x.cat || "").localeCompare(y.cat || ""));

const candidates = [];
for (const rec of frame.values()) {
  if (curatedKeys.has(canon(rec.a, rec.b))) continue;       // already authoritative
  if (rec.count < 1) continue;
  candidates.push({ a: rec.a, b: rec.b, relatedness: cosine(rec.a, rec.b), contrast: rec.count, framed: true, evidence: "frame", verses: [...rec.verses].sort(sortVk).slice(0, 8) });
}
candidates.sort((x, y) => y.contrast - x.contrast || y.relatedness - x.relatedness);

/* ── byRoot index (opposites first, then candidates) ── */
const byRoot = {};
// selfV/otherV = this root's own evidence verses vs the opposite's, so a root-centric view
// can show "your root here / the opposite there" when the two never share an āya.
const pushR = (root, other, otherEn, polarity, cat, rec, selfV, otherV) => { (byRoot[root] ||= []).push({ other, otherEn, polarity, cat, relatedness: rec.relatedness, contrast: rec.contrast, framed: !!rec.framed, evidence: rec.evidence || null, verses: rec.verses, versesSelf: selfV || rec.verses, versesOther: otherV || rec.verses }); };
for (const c of catalogue) { pushR(c.a, c.b, c.b_en, "opposite", c.cat, c, c.versesA, c.versesB); pushR(c.b, c.a, c.a_en, "opposite", c.cat, c, c.versesB, c.versesA); }
for (const c of candidates) { pushR(c.a, c.b, null, "candidate", null, c); pushR(c.b, c.a, null, "candidate", null, c); }
for (const root in byRoot) byRoot[root].sort((x, y) => (y.polarity === "opposite") - (x.polarity === "opposite") || y.framed - x.framed || y.contrast - x.contrast);

writeFileSync("public/data/relations.json", JSON.stringify({
  note: "opposite = curated Qurʾanic antonym (data/antonyms.json), evidenced by verses (framed = an antithesis construction; else co-occurrence). candidate = discovered in a negation-vs-adversative frame, NOT curated — for review. No affinity axis.",
  byRoot, catalogue, candidates,
}));
console.log(`Relations: ${catalogue.length} curated opposites (${catalogue.filter((c) => c.framed).length} with an antithesis frame), ${candidates.length} discovered candidates, over ${Object.keys(byRoot).length} roots.`);
console.log(`Curated: ${curated.length - dropped}/${curated.length} kept. → public/data/relations.json`);
