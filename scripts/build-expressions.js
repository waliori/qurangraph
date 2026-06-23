import { readFileSync, writeFileSync, existsSync } from "fs";
import { matchPhrase } from "../src/analytics/expressions.js";
import { parseMorphology, aggregateWord } from "./lib/parse.js";
import { g2, logDice } from "../src/analytics/assoc.js";

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
 *                 verses attached — authoritative, precision-first, not mined.
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

// The ḥurūf al-jarr that govern a following noun, keyed by the corpus lemma → display form
// (the proclitic ones show as بـ/لـ/كـ). The long tail of the bare-"P" tag is noise (diptote
// nouns), so we whitelist the real set.
const PREP_DISP = {
  "ب": "بـ", "ل": "لـ", "ك": "كـ", "مِن": "مِن", "فِي": "فِي",
  "عَلَى": "عَلَى", "إِلَى": "إِلَى", "عَن": "عَن", "حَتَّى": "حَتَّى",
};
const PREPS = new Set(Object.keys(PREP_DISP));
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
const compounds = new Map();   // "lemma lemma…" → { words, roots, len, count, occ:[[vk,start]] }
const colloc = new Map();      // "verb|noun" → { verb, verbRoot, noun, nounRoot, count, occ:[[vk,v,n]] }
const verbTot = new Map(), nounTot = new Map(); // collocation marginals for log-likelihood
let colSlots = 0;

const isNoun = (a) => a && a.root && NOUN_POS.has(a.pos);

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
    // (b) إضافة CHAIN — a muḍāf (content noun, no ال, not preposition-governed) followed by ONE
    //     OR MORE genitive content nouns (يوم الدين, مالك يوم الدين). We take the MAXIMAL run and
    //     skip past it, so each chain is counted at its full length; shorter constructs that recur
    //     on their own are still caught where they stand alone. Don't start mid-chain (when w is
    //     itself a genitive continuation of the previous noun).
    const A = agg[w];
    if (isNoun(A) && !hasDet(words[w]) && !prepOf[w] && !(w > 0 && isNoun(agg[w - 1]) && A.gcase === "gen")) {
      let e = w;
      while (e + 1 < words.length && isNoun(agg[e + 1]) && agg[e + 1].gcase === "gen" && !prepOf[e + 1]) e++;
      if (e > w) {
        const members = agg.slice(w, e + 1);
        const key = members.map((m) => m.lemma).join(" ");
        const rec = compounds.get(key) || { words: members.map((m) => m.lemma), roots: members.map((m) => m.root), len: members.length, count: 0, occ: [] };
        rec.count++; rec.occ.push([vk, w]); compounds.set(key, rec);
        w = e; // skip the chain so its sub-runs aren't double-counted in this verse
      }
    }
    // (c) COLLOCATION — a verb + its nearest following DIRECT (non-governed) content noun
    //     (أقام الصلاة, ملكت أيمان, ضرب مثلاً). Stop at a preposition (a governed noun is a frame,
    //     not a direct object). Log-likelihood ranking lets tight units rise above diffuse pairings
    //     (اتقى→الله is tight; قال→الله is diffuse), so frequent-but-loose subjects don't dominate.
    if (A && A.pos === "verb" && A.root) {
      for (let k = w + 1; k < Math.min(words.length, w + 4); k++) {
        if (prepOf[k]) break;                                   // governed by a preposition → frame
        const B = agg[k];
        if (B.pos === "pron" || B.pos === "particle") continue; // skip clitics / function words
        if (isNoun(B)) {
          const key = `${A.lemma}|${B.lemma}`;
          const rec = colloc.get(key) || { verb: A.lemma, verbRoot: A.root, noun: B.lemma, nounRoot: B.root, count: 0, occ: [] };
          rec.count++; rec.occ.push([vk, w, k]); colloc.set(key, rec);
          verbTot.set(A.lemma, (verbTot.get(A.lemma) || 0) + 1);
          nounTot.set(B.lemma, (nounTot.get(B.lemma) || 0) + 1);
          colSlots++;
        }
        break; // the first content word after the verb decides
      }
    }
  }
}

const compoundList = [...compounds.values()]
  .filter((c) => c.count >= 2)
  .sort((x, y) => y.count - x.count || y.len - x.len)
  .slice(0, 800);

/* ── Collocation ranking over the verb×noun table — shared metrics (assoc.js) ───
 * `ll` = signed Dunning G² (significance + direction); `logdice` = frequency-stable
 * Log-Dice (0..14), the same measures the runtime collocation lens reports. */
const collocList = [...colloc.values()]
  .filter((c) => c.count >= 3)
  .map((c) => ({
    ...c,
    ll: +g2(c.count, verbTot.get(c.verb), nounTot.get(c.noun), colSlots).toFixed(2),
    logdice: +logDice(c.count, verbTot.get(c.verb), nounTot.get(c.noun)).toFixed(2),
  }))
  .sort((x, y) => y.ll - x.ll)
  .slice(0, 700);

/* ── Frames: keep meaningful recurrence, drop hapax noise ─────────────────────── */
const frameList = [...frames.values()].filter((f) => f.count >= 2).sort((a, b) => b.count - a.count);

/* ── Idioms: curated seed, matched LEMMA-aware so generic forms are caught ────────
 * Each idiom word resolves to its LEMMA (from lemmas.json) so ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ also matches
 * صِرَٰطًا مُّسْتَقِيمًا / صِرَٰطِى مُسْتَقِيمًا — the same form-awareness the collocation/frame lenses have.
 * Words with no lemma (pronouns/particles) fall back to a surface skeleton. matchPhrase is the
 * SAME function the in-app "add your own" uses, so offline and runtime agree exactly. */
const hafs = JSON.parse(readFileSync(HAFS, "utf8"));
const LEMMAS_F = "public/data/lemmas.json";
const lemmasMap = existsSync(LEMMAS_F) ? JSON.parse(readFileSync(LEMMAS_F, "utf8")) : {};
const lemmaFn = (n) => lemmasMap[n] || null;
const verseTexts = {}; // vk → { text }  (matchPhrase splits + indexes it like the app)
for (const s of hafs) for (const v of s.verses) verseTexts[`${s.id}:${v.id}`] = { text: v.text };

const idioms = [];
if (existsSync(IDIOMS)) {
  const curated = JSON.parse(readFileSync(IDIOMS, "utf8")).entries || [];
  for (const it of curated) {
    const r = matchPhrase(it.ar, verseTexts, lemmaFn);
    idioms.push({ display: it.ar, len: r.len, type: "curated", count: r.count, occ: r.occ });
  }
}

console.log(`Expressions: ${frameList.length} frames, ${collocList.length} collocations, ${compoundList.length} compounds, ${idioms.length} idioms`);
console.log(`  frame top: ${frameList.slice(0, 3).map((f) => `${f.head}+${f.prep}(${f.count})`).join(", ")}`);
console.log(`  colloc top: ${collocList.slice(0, 4).map((c) => `${c.verb}·${c.noun}(${c.count})`).join(", ")}`);

/* ── Integrity assertions ─────────────────────────────────────────────────────── */
if (frameList.length < 200) fail(`only ${frameList.length} frames — detector likely broken`);
if (compoundList.length < 50) fail(`only ${compoundList.length} compounds — detector likely broken`);
if (collocList.length < 50) fail(`only ${collocList.length} collocations — detector likely broken`);
const aminBi = frames.get("verb|آمَنَ|ب");
if (!aminBi || aminBi.count < 100) fail(`آمَنَ+بـ frame missing or too small (${aminBi?.count}) — alignment broken`);
const missingCurated = idioms.filter((i) => i.count === 0).map((i) => i.display);
if (missingCurated.length) console.warn(`  WARN: curated idioms with no occurrences: ${missingCurated.join(", ")}`);

const out = {
  note: "Multi-word expressions mined from the Quranic Arabic Corpus morphology. frames: head + governed preposition (تعدية); collocations: verb + characteristic noun (المصاحبات) by log-likelihood; compounds: إضافة chains (2+ words) by frequency; idioms: curated non-compositional. Candidates evidenced by verses — the reader judges. No translation: occurrences carry the sense.",
  prepDisp: PREP_DISP,
  frames: frameList,
  headTotals: Object.fromEntries(headTotals),
  collocations: collocList,
  compounds: compoundList,
  idioms,
};
writeFileSync("public/data/expressions.json", JSON.stringify(out));
console.log(`→ public/data/expressions.json`);
