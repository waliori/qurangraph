import { readFileSync, writeFileSync, existsSync } from "fs";
import { norm } from "../src/arabic-utils.js";
import { parseMorphology, aggregateWord } from "./lib/parse.js";

/* ═══ Multi-word expression inventory (build step) ═══
 *
 * The graph and labs work word-by-word, but much of the Qurʾān's meaning lives in
 * MULTI-WORD UNITS the parts don't predict — verbs that take a specific preposition
 * (آمَنَ بـ "believe IN", كَفَرَ بـ, أَوْحَى إلى), genitive constructs (سبيل الله, يوم الدين),
 * and fixed idioms (حبل الوريد). This step mines them ONCE from the segmented Quranic
 * Arabic Corpus morphology (data/source/quran-morphology.txt) — the only source that
 * carries proclitic prepositions (the بـ in بالغيب is its own segment there, but is
 * folded away in the app's word-level morphology.json) — and emits a typed inventory.
 *
 * Three detectors, all CANDIDATE-surfacing (every entry is evidenced by its verses;
 * the reader judges), precision-first like the relations build:
 *   - frames    : head (verb / content noun) + governed ḥarf jarr. The signature lens
 *                 is the per-head preposition CONTRAST (آمَنَ→بـ vs آمَنَ→… vs bare).
 *   - compounds : إضافة — noun + genitive noun, ranked by log-likelihood so fixed
 *                 constructs rise above incidental adjacencies.
 *   - idioms    : a human-curated seed (data/idioms.json, non-compositional) with its
 *                 verses attached, plus a small clearly-labelled statistical set of
 *                 high-LL content bigrams.
 *
 * Word indices in the corpus align 1:1 with the app's space-split verse words (verified
 * against quran-hafs.json), so occurrences store [verseKey, …wordIndex] for highlighting.
 *
 * Output: public/data/expressions.json
 */

const MORPH = "data/source/quran-morphology.txt";
const HAFS = "public/data/quran-hafs.json";
const IDIOMS = "data/idioms.json";
for (const f of [MORPH, HAFS]) if (!existsSync(f)) { console.error(`Missing ${f}.`); process.exit(1); }

const fail = (m) => { console.error(`ERROR: expressions — ${m}`); process.exit(1); };

// The ḥurūf al-jarr that govern a following noun. Keyed by the corpus lemma; the long
// tail of the bare-"P" tag is noise (diptote nouns), so we whitelist the real set.
const PREP_GLOSS = {
  "ب": { ar: "بـ", en: "bi — in / with / by" },
  "ل": { ar: "لـ", en: "li — for / to" },
  "ك": { ar: "كـ", en: "ka — like / as" },
  "مِن": { ar: "مِن", en: "min — from / of" },
  "فِي": { ar: "فِي", en: "fī — in" },
  "عَلَى": { ar: "عَلَى", en: "ʿalā — on / upon / against" },
  "إِلَى": { ar: "إِلَى", en: "ilā — to / toward" },
  "عَن": { ar: "عَن", en: "ʿan — from / about" },
  "حَتَّى": { ar: "حَتَّى", en: "ḥattā — until" },
};
const PREPS = new Set(Object.keys(PREP_GLOSS));
// A government head is a verb or a common (deverbal) noun — NOT a proper noun: اللَّه etc. don't
// "govern" a ḥarf in the تعدية sense (they're subject/object; the preposition binds a later word).
const HEAD_POS = new Set(["verb", "noun", "actpcpl", "passpcpl"]);
const NOUN_POS = new Set(["noun", "pn", "actpcpl", "passpcpl"]); // nominals for إضافة (PN fine as muḍāf ilayh: سبيل الله)

const isPrepSeg = (sg) => /(?:^|\|)P(?:\||$)/.test(sg.features) && PREPS.has(parseMorphology(sg.features, sg.posClass).lemma);
const hasDet = (word) => word.some((sg) => /(?:^|\|)DET(?:\||$)/.test(sg.features));

/* ── Parse the corpus into verse → words → segments ─────────────────────────── */
const verses = {}; // vk → [ [seg,…], … ]  (word index 0-based)
for (const ln of readFileSync(MORPH, "utf8").trim().split("\n")) {
  const t = ln.split("\t");
  const m = /^(\d+):(\d+):(\d+):(\d+)$/.exec(t[0]);
  if (!m) continue;
  const vk = `${m[1]}:${m[2]}`, w = +m[3] - 1;
  (verses[vk] = verses[vk] || []);
  (verses[vk][w] = verses[vk][w] || []).push({ form: t[1], features: t[3] || "", posClass: t[2] });
}

/* ── Detectors ──────────────────────────────────────────────────────────────── */
const frames = new Map();      // "pos|lemma|prep" → { head, root, pos, prep, count, occ:[[vk,h,p]] }
const headTotals = new Map();  // "pos|lemma" → total content occurrences (for bare = total − governed)
const compounds = new Map();   // "aLemma|bLemma" → { a, b, aRoot, bRoot, count, occ:[[vk,w]] }
const firstNoun = new Map(), secondNoun = new Map(); // إضافة marginals for LL
let idafaSlots = 0;

for (const vk in verses) {
  const words = verses[vk];
  const agg = words.map(aggregateWord);
  // Per word: a governed whitelisted preposition anchored here (proclitic object = this word,
  // standalone preposition = the word itself), else null.
  const prepOf = words.map((word) => { for (const sg of word) if (isPrepSeg(sg)) return parseMorphology(sg.features, sg.posClass).lemma; return null; });

  // Head occurrence tally (for bare counts in the contrast view).
  agg.forEach((a) => { if (a.root && HEAD_POS.has(a.pos)) { const k = `${a.pos}|${a.lemma}`; headTotals.set(k, (headTotals.get(k) || 0) + 1); } });

  for (let w = 0; w < words.length; w++) {
    // (a) GOVERNMENT FRAME — preposition anchored at w, bound to the nearest preceding
    //     content head (≤2 words back, content root only → drops relatives/pronouns).
    const prep = prepOf[w];
    if (prep) {
      let head = null, hi = -1;
      for (let k = w - 1; k >= Math.max(0, w - 2); k--) { const a = agg[k]; if (a.root && HEAD_POS.has(a.pos)) { head = a; hi = k; break; } }
      if (head) {
        const key = `${head.pos}|${head.lemma}|${prep}`;
        const e = frames.get(key) || { head: head.lemma, root: head.root, pos: head.pos, prep, count: 0, occ: [] };
        e.count++; e.occ.push([vk, hi, w]); frames.set(key, e);
      }
    }
    // (b) إضافة — content noun (no ال) immediately followed by a genitive content noun
    //     that is not itself governed by a preposition.
    const A = agg[w], B = agg[w + 1];
    if (A && B && A.root && B.root && NOUN_POS.has(A.pos) && NOUN_POS.has(B.pos) && B.gcase === "gen" && !hasDet(words[w]) && !prepOf[w] && !prepOf[w + 1]) {
      idafaSlots++;
      firstNoun.set(A.lemma, (firstNoun.get(A.lemma) || 0) + 1);
      secondNoun.set(B.lemma, (secondNoun.get(B.lemma) || 0) + 1);
      const key = `${A.lemma}|${B.lemma}`;
      const e = compounds.get(key) || { a: A.lemma, b: B.lemma, aRoot: A.root, bRoot: B.root, count: 0, occ: [] };
      e.count++; e.occ.push([vk, w]); compounds.set(key, e);
    }
  }
}

/* ── إضافة ranking by log-likelihood (G²) over the noun-noun adjacency ────────── */
const g2 = (o11, r1, c1, N) => {
  const o12 = r1 - o11, o21 = c1 - o11, o22 = N - r1 - c1 + o11;
  const e = (a, b) => (a * b) / N;
  const t = (o, ex) => (o > 0 && ex > 0 ? o * Math.log(o / ex) : 0);
  return 2 * (t(o11, e(r1, c1)) + t(o12, e(r1, N - c1)) + t(o21, e(N - r1, c1)) + t(o22, e(N - r1, N - c1)));
};
const compoundList = [...compounds.values()]
  .filter((c) => c.count >= 2)
  .map((c) => ({ ...c, ll: +g2(c.count, firstNoun.get(c.a), secondNoun.get(c.b), idafaSlots).toFixed(2) }))
  .sort((x, y) => y.ll - x.ll)
  .slice(0, 800);

/* ── Frames: keep meaningful recurrence, drop hapax noise ─────────────────────── */
const frameList = [...frames.values()].filter((f) => f.count >= 2).sort((a, b) => b.count - a.count);

/* ── Idioms: curated seed (verses attached) + statistical content bigrams ──────── */
// Consonantal skeleton for phrase matching. norm() already strips the Uthmani dagger-alif
// (so صِرَٰط → صرط) while plain spellings keep ا; dropping every ا reconciles the two and
// makes matching robust to that mismatch. Multi-word contiguity keeps false positives away.
// norm() deletes the Uthmani dagger-alif (صِرَٰط → صرط), which a plain ا spelling keeps; map it
// to a real alif first so both sides agree, without the over-folding of stripping every alif.
const skel = (w) => norm(w.replace(/ٰ/g, "ا"));
// The first idiom word may carry a proclitic (بِحبل for حبل): accept the verse word if removing
// up to two leading proclitic letters yields the target exactly. Precise (equality after a
// controlled strip), unlike a bare suffix test which over-matches 1-letter skeletons (أم→م).
const PROCLITIC = new Set(["و", "ف", "ب", "ل", "ك", "س"]);
const firstMatch = (vw, target) => {
  let s = vw;
  for (let n = 0; n <= 2; n++) { if (s === target) return true; if (!s.length || !PROCLITIC.has(s[0])) break; s = s.slice(1); }
  return false;
};
const hafs = JSON.parse(readFileSync(HAFS, "utf8"));
const verseSkel = {}; // vk → [skelWord,…]
for (const s of hafs) for (const v of s.verses) verseSkel[`${s.id}:${v.id}`] = v.text.trim().split(/\s+/).map(skel);

const idioms = [];
if (existsSync(IDIOMS)) {
  const curated = JSON.parse(readFileSync(IDIOMS, "utf8")).entries || [];
  for (const it of curated) {
    const sk = it.ar.trim().split(/\s+/).map(skel);
    const occ = [];
    for (const vk in verseSkel) {
      const ws = verseSkel[vk];
      for (let i = 0; i + sk.length <= ws.length; i++) {
        if (!sk[0] || (sk.length === 1 && sk[0].length < 2) || !firstMatch(ws[i], sk[0])) continue;
        let ok = true; for (let j = 1; j < sk.length; j++) if (ws[i + j] !== sk[j]) { ok = false; break; }
        if (ok) occ.push([vk, i]);
      }
    }
    idioms.push({ display: it.ar, skeleton: sk.join(" "), en: it.en || null, type: "curated", count: occ.length, occ });
  }
}

console.log(`Expressions: ${frameList.length} frames, ${compoundList.length} compounds, ${idioms.length} idioms`);
console.log(`  frame occurrences: ${frameList.reduce((s, f) => s + f.count, 0)} · top: ${frameList.slice(0, 3).map((f) => `${f.head}+${f.prep}(${f.count})`).join(", ")}`);

/* ── Integrity assertions ─────────────────────────────────────────────────────── */
if (frameList.length < 200) fail(`only ${frameList.length} frames — detector likely broken`);
if (compoundList.length < 50) fail(`only ${compoundList.length} compounds — detector likely broken`);
const aminBi = frames.get("verb|آمَنَ|ب");
if (!aminBi || aminBi.count < 100) fail(`آمَنَ+بـ frame missing or too small (${aminBi?.count}) — alignment broken`);
const missingCurated = idioms.filter((i) => i.count === 0).map((i) => i.display);
if (missingCurated.length) console.warn(`  WARN: curated idioms with no occurrences: ${missingCurated.join(", ")}`);

const out = {
  note: "Multi-word expressions mined from the Quranic Arabic Corpus morphology. frames: head + governed preposition (تعدية); compounds: إضافة ranked by log-likelihood; idioms: curated (non-compositional) + statistical. Candidates evidenced by verses — the reader judges.",
  prepGloss: PREP_GLOSS,
  frames: frameList,
  headTotals: Object.fromEntries(headTotals),
  compounds: compoundList,
  idioms,
};
writeFileSync("public/data/expressions.json", JSON.stringify(out));
console.log(`→ public/data/expressions.json`);
