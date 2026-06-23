import { readFileSync, writeFileSync, existsSync } from "fs";
import { norm } from "../src/arabic-utils.js";
import { aggregateWord } from "./lib/parse.js";

/* Builds roots.json, lemmas.json and morphology.json from the corpus + Tanzil.
 * Lexicon meanings (Maqāyīs / Mufradāt / Lisān) are built separately by
 * scripts/build-lexicons.js. */

/* ── Inputs ── */
const MORPH = "data/source/quran-morphology.txt";
const HAFS = "public/data/quran-hafs.json";

for (const f of [MORPH, HAFS]) {
  if (!existsSync(f)) {
    console.error(`Missing ${f}. Run: npm run data:download && npm run data:transform`);
    process.exit(1);
  }
}

/* ── 1. Morphology → per-word full morphology, grouped by verse ──
 * Each word (s:a:w) spans several segment rows (prefixes + stem + suffix);
 * aggregateWord() concatenates their forms and lifts the stem's root/lemma/POS/
 * inflection. verseWords["s:a"] is the ordered list of word morphology records. */
const verseWords = {}; // "s:a" → [{ form, root, lemma, vf, aspect, voice, mood, pos, person, gender, number, gcase }]
{
  const lines = readFileSync(MORPH, "utf8").split("\n");
  const segs = {};      // "s:a:w" → [{ form, features, posClass }]
  const order = {};     // "s:a" → ["s:a:w", …]  (first-seen word order)
  for (const line of lines) {
    if (!line || line[0] === "#") continue;
    const [loc, form, posClass = "", feat = ""] = line.split("\t");
    if (!loc) continue;
    const [s, a, w] = loc.split(":");
    const key = `${s}:${a}:${w}`;
    if (!segs[key]) { segs[key] = []; (order[`${s}:${a}`] ||= []).push(key); }
    segs[key].push({ form, features: feat, posClass });
  }
  for (const [vk, keys] of Object.entries(order)) verseWords[vk] = keys.map((k) => aggregateWord(segs[k]));
}

/* ── 2. Align corpus morphology onto Tanzil tokens ──
 * Produces, by majority vote over occurrences: normForm → root and normForm →
 * lemma. Also emits a per-verse morphology dataset aligned 1:1 with the words
 * the APP keeps (raw whitespace split, dropping tokens whose norm is <2 chars —
 * the exact filter in QuranGraph's index useMemo), so word index ↔ tuple index. */
const hafs = JSON.parse(readFileSync(HAFS, "utf8"));
const rootTally = {};  // norm → { root: count }
const lemmaTally = {}; // norm → { lemma(bare): count }
let contentTokens = 0, rootedTokens = 0, lemmatizedTokens = 0, mismatchVerses = 0, versesWithMorph = 0;

const vote = (tally, n, val) => {
  if (n.length < 2 || !val) return;
  (tally[n] ||= {});
  tally[n][val] = (tally[n][val] || 0) + 1;
};

// Dictionary-coding for the columnar morphology file (index 0 = unknown "").
const makeDict = () => { const arr = [""], idx = new Map([["", 0]]); return { arr, id: (v) => { v = v || ""; if (idx.has(v)) return idx.get(v); const i = arr.length; arr.push(v); idx.set(v, i); return i; } }; };
const dPos = makeDict(), dAspect = makeDict(), dVoice = makeDict(), dMood = makeDict(),
  dGender = makeDict(), dNumber = makeDict(), dCase = makeDict(), dLemma = makeDict(), dRoot = makeDict();
// Encode one word's morphology to an int tuple (precise = aligned vs surface fallback).
const tupleOf = (m, precise) => [
  dPos.id(m.pos), m.vf || 0, dAspect.id(m.aspect), dVoice.id(m.voice), dMood.id(m.mood),
  m.person || 0, dGender.id(m.gender), dNumber.id(m.number), dCase.id(m.gcase),
  dLemma.id(m.lemma), dRoot.id(m.root), precise ? 1 : 0,
];
const morphV = {}; // "s:a" → [tuple, …]  aligned to app words

for (const sura of hafs) {
  for (const v of sura.verses) {
    const tokens = v.text.split(/\s+/).filter(Boolean);
    const corpus = verseWords[`${sura.id}:${v.id}`] || [];
    const aligned = corpus.length === tokens.length;
    if (corpus.length) { versesWithMorph++; if (!aligned) mismatchVerses++; }

    // Surface fallback map for this verse: norm(corpusForm) → morphology record.
    const surface = {};
    for (const cw of corpus) { const cn = norm(cw.form); if (cn.length >= 2 && !surface[cn]) surface[cn] = cw; }

    const vk = `${sura.id}:${v.id}`;
    const tuples = [];
    tokens.forEach((tok, i) => {
      const n = norm(tok);
      if (n.length < 2) return; // matches the app's word filter — skip clitics/markers
      contentTokens++;
      const precise = aligned && corpus[i];
      const m = precise ? corpus[i] : (surface[n] || null);
      if (m) {
        if (m.root) { vote(rootTally, n, m.root); rootedTokens++; }
        // Vote the DIACRITIZED lemma (guarded by the bare skeleton's length) so the map
        // keeps عَلِمَ / عِلْم distinct instead of bare-merging them to علم — matching the
        // per-occurrence plemma (verseGroupingKeys), which is diacritized for the same reason.
        const bareLemma = norm(m.lemma || "");
        if (bareLemma.length >= 2) { vote(lemmaTally, n, m.lemma); lemmatizedTokens++; }
        tuples.push(tupleOf(m, !!precise));
      } else {
        tuples.push(tupleOf({}, false)); // no data
      }
    });
    if (tuples.length) morphV[vk] = tuples;
  }
}

/* Resolve majority value per surface form */
const resolve = (tally) => { const out = {}; for (const [n, counts] of Object.entries(tally)) { let best = null, bestC = -1; for (const [val, c] of Object.entries(counts)) if (c > bestC) { best = val; bestC = c; } out[n] = best; } return out; };
const roots = resolve(rootTally);
const lemmas = resolve(lemmaTally);
const presentRoots = new Set(Object.values(roots).filter(Boolean));

/* ── 3. Write artifacts ── */
const morphology = {
  legend: {
    pos: dPos.arr, aspect: dAspect.arr, voice: dVoice.arr, mood: dMood.arr,
    gender: dGender.arr, number: dNumber.arr, gcase: dCase.arr,
    // tuple field order, so the app reads positionally without guessing.
    fields: ["pos", "vf", "aspect", "voice", "mood", "person", "gender", "number", "gcase", "lemma", "root", "precise"],
  },
  lemmas: dLemma.arr, // diacritized lemma strings, referenced by index
  roots: dRoot.arr,   // root strings, referenced by index
  v: morphV,
};
writeFileSync("public/data/roots.json", JSON.stringify(roots));
writeFileSync("public/data/lemmas.json", JSON.stringify(lemmas));
writeFileSync("public/data/morphology.json", JSON.stringify(morphology));

/* Coverage manifest — so the app can disclose, on every root-based aggregate, what
 * fraction of tokens it actually covers (the rest — particles, proper nouns, rare
 * words — carry no root and are silently excluded otherwise). */
writeFileSync("public/data/coverage.json", JSON.stringify({
  contentTokens, rootedTokens, lemmatizedTokens,
  rootCoverage: contentTokens ? +(rootedTokens / contentTokens).toFixed(4) : 0,
  lemmaCoverage: contentTokens ? +(lemmatizedTokens / contentTokens).toFixed(4) : 0,
  distinctRoots: presentRoots.size, mismatchVerses,
}, null, 2));

/* ── Report ── */
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "0") + "%";
console.log(`Surface forms with a root: ${Object.keys(roots).length}`);
console.log(`Surface forms with a lemma: ${Object.keys(lemmas).length} (distinct lemmas: ${dLemma.arr.length - 1})`);
console.log(`Token root coverage: ${rootedTokens}/${contentTokens} (${pct(rootedTokens, contentTokens)})`);
console.log(`Token lemma coverage: ${lemmatizedTokens}/${contentTokens} (${pct(lemmatizedTokens, contentTokens)})`);
console.log(`Verses with token-count mismatch (used surface fallback): ${mismatchVerses}`);
console.log(`Distinct Quran roots: ${presentRoots.size}`);
console.log(`Morphology verses: ${Object.keys(morphV).length}`);
console.log(`→ roots.json, lemmas.json, morphology.json`);

/* ── Coverage tripwires ──
 * A healthy build lands around ~0.65 root / ~0.96 lemma coverage. These floors
 * sit well under that — they are NOT quality gates, just tripwires that catch a
 * broken alignment (e.g. a morphology format change that stops matching tokens),
 * so a gutted dataset can never silently ship. */
const ROOT_FLOOR = 0.45, LEMMA_FLOOR = 0.85;
const rootCov = contentTokens ? rootedTokens / contentTokens : 0;
const lemmaCov = contentTokens ? lemmatizedTokens / contentTokens : 0;
if (rootCov < ROOT_FLOOR || lemmaCov < LEMMA_FLOOR) {
  console.error(
    `ERROR: coverage below sanity floor — root ${(rootCov * 100).toFixed(1)}% (min ${ROOT_FLOOR * 100}%), ` +
    `lemma ${(lemmaCov * 100).toFixed(1)}% (min ${LEMMA_FLOOR * 100}%). ` +
    `The corpus↔morphology alignment is likely broken; refusing to ship a gutted dataset.`
  );
  process.exit(1);
}

/* ── Alignment tripwire ──
 * Mismatched verses fall back to a per-verse surface map that collapses homographs,
 * so a few are tolerable (genuine tokenisation differences) but a flood means the
 * corpus↔Tanzil tokenisation has drifted apart and per-occurrence readings are mostly
 * lost. This floor is far above the healthy rate (a few %), so it only trips on a real
 * break — not normal noise. */
const MISMATCH_CEIL = 0.25;
const mismatchRate = versesWithMorph ? mismatchVerses / versesWithMorph : 0;
if (mismatchRate > MISMATCH_CEIL) {
  console.error(
    `ERROR: ${(mismatchRate * 100).toFixed(1)}% of verses (${mismatchVerses}/${versesWithMorph}) have a ` +
    `morphology↔Tanzil token-count mismatch (max ${MISMATCH_CEIL * 100}%). The tokenisations have drifted; ` +
    `per-occurrence (homograph-correct) readings would be mostly lost. Refusing to ship.`
  );
  process.exit(1);
}
