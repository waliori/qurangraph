/* ═══ Corpus loading + indexing (server side) ═══
 *
 * Reads the same derived JSON the browser app fetches from /data and builds the same
 * indices through the same pure module (src/corpusIndices.js), so an API answer and the
 * UI answer to "which āyāt contain this root" can never drift apart.
 *
 * Everything except the lexicons' FULL articles is loaded once at boot and held in
 * memory (~7 MB of JSON → a few hundred MB of JS objects is the price of answering any
 * query without touching disk). Full articles are sharded on disk (64 buckets per
 * lexicon, see src/lexiconShard.js) and read lazily, keeping only the hottest few.
 *
 * The `strict` precision variant re-keys every word's exact form, so it needs its own
 * verse spine. It is built LAZILY on the first request that asks for it — most callers
 * use the default loose matching and never pay for it.
 */

import fs from "node:fs";
import path from "node:path";

import { setRootMap, setLemmaMap, wordGroupKey, norm, quoteKeys } from "../src/arabic-utils.js";
import { buildVerseIndices, buildLemmaIndex, buildStopSet, orderedVerseKeys } from "../src/corpusIndices.js";
import { buildRomanIndex } from "../src/search.js";
import { buildSeedIndex } from "../src/analytics/phrases.js";
import { indexExpressions } from "../src/analytics/expressions.js";
import { shardOf } from "../src/lexiconShard.js";
import { buildSurahIndex } from "./surahNames.js";
import { config } from "./config.js";

const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function readOptional(file) {
  try { return readJSON(file); } catch { return null; }
}

/* The whole in-memory corpus. One instance per process, created by loadCorpus(). */
export function loadCorpus(dataDir = config.dataDir) {
  const f = (...p) => path.join(dataDir, ...p);
  const missing = [];
  for (const req of ["quran-hafs.json", "roots.json"]) {
    if (!fs.existsSync(f(req))) missing.push(req);
  }
  if (missing.length) {
    throw new Error(
      `Corpus data not found in ${dataDir} (missing: ${missing.join(", ")}).\n` +
      `Build it first:  npm run data:transform && npm run data:roots && npm run data:lexicons\n` +
      `or point API_DATA_DIR at a directory that already has it.`,
    );
  }

  const quranRaw = readJSON(f("quran-hafs.json"));
  const rootMap = readJSON(f("roots.json"));
  const lemmaMap = readOptional(f("lemmas.json")) || {};
  const morph = readOptional(f("morphology.json"));

  // These are module-level in arabic-utils (the browser has exactly one corpus loaded too),
  // so they must be installed BEFORE any index is built — wordGroupKey reads them.
  setRootMap(rootMap);
  setLemmaMap(lemmaMap);

  const loose = buildVariant({ quranRaw, morph, precision: "loose" });

  const lexiconIndex = readOptional(f("lexicons", "index.json")) || [];
  const lexiconConcise = new Map();
  for (const lx of lexiconIndex) {
    const d = readOptional(f("lexicons", `${lx.id}.json`));
    if (d) lexiconConcise.set(lx.id, d);
  }

  const expressions = readOptional(f("expressions.json"));
  const relations = readOptional(f("relations.json"));
  const semantic = readOptional(f("semantic-neighbours.json")) || {};
  const mutashabihat = readOptional(f("mutashabihat.json"));
  const munasabat = readOptional(f("munasabat.json"));
  const iltifat = readOptional(f("iltifat.json"));
  const coverage = readOptional(f("coverage.json"));
  const sources = readOptional(f("sources.json"));

  // Full-article shards: {lexiconId}-full/{n}.json, read on demand, small LRU.
  const shardCache = new Map();
  function lexiconFull(id, root) {
    const meta = lexiconIndex.find((l) => l.id === id);
    if (!meta || !meta.hasFull) return null;
    const shard = shardOf(root, meta.fullShards || 64);
    const ck = `${id}/${shard}`;
    let data = shardCache.get(ck);
    if (data === undefined) {
      data = readOptional(f("lexicons", `${id}-full`, `${shard}.json`)) || {};
      shardCache.set(ck, data);
      // Plain FIFO eviction — the access pattern is scattered, so recency buys little
      // over insertion order and this keeps the hot path allocation-free.
      if (shardCache.size > config.lexiconShardCache) shardCache.delete(shardCache.keys().next().value);
    }
    return data[root] || null;
  }

  const strictVariants = new Map();
  function variant(precision) {
    if (precision !== "strict") return loose;
    let v = strictVariants.get("strict");
    if (!v) strictVariants.set("strict", (v = buildVariant({ quranRaw, morph, precision: "strict" })));
    return v;
  }

  // Sūrah name → id, built from the corpus's own names plus the curated transliterations.
  // Throws on any ambiguity, so a bad table fails the boot rather than a request.
  const surahIndex = buildSurahIndex(loose.surahList);

  return {
    quranRaw, rootMap, lemmaMap, morph, surahIndex,
    ...loose,                 // the default (loose) indices, spread for direct access
    variant,
    lexiconIndex, lexiconConcise, lexiconFull,
    expressions,
    expressionIndex: expressions ? indexExpressions(expressions) : null,
    relations, semantic, mutashabihat, munasabat, iltifat, coverage, sources,
    stats: {
      surahs: quranRaw.length,
      verses: Object.keys(loose.verseData).length,
      words: Object.values(loose.verseData).reduce((n, v) => n + v.words.length, 0),
      distinctForms: Object.keys(loose.w2v).length,
      distinctRoots: Object.keys(loose.r2v).length,
      distinctLemmas: Object.keys(loose.l2v).length,
      lexicons: lexiconIndex.length,
      morphology: !!morph,
    },
  };
}

/* One precision variant: the verse spine plus everything keyed off it. */
function buildVariant({ quranRaw, morph, precision }) {
  const base = buildVerseIndices({ quranRaw, precision, morph });
  const l2v = buildLemmaIndex(base.verseData);
  // Two-word seed index for the shared-phrase (mutashābihāt) lens — over a million
  // entries, so it is built on first use and then reused, not at boot. Kept behind a
  // function (not a getter) because this object gets spread, which would trigger one.
  let seed = null;
  const ordered = orderedVerseKeys(quranRaw);
  let text = null;
  return {
    ...base,
    precision,
    l2v,
    indices: { exact: base.w2v, root: base.r2v, lemma: l2v },
    orderedKeys: ordered,
    romanIndex: buildRomanIndex(Object.keys(base.w2v)),
    stopSet: buildStopSet({ hideStop: true }),
    seedIndex: () => (seed ||= buildSeedIndex(base.verseData)),
    textIndex: () => (text ||= buildTextIndex(base.verseData, ordered)),
  };
}

/* ═══ Quotation index — the text → āya lookup behind /verses/find ═══
 *
 * The inverse of /verses/{key}: given Arabic text, which āya is it? Each āya becomes an
 * array of per-token KEY SETS, and two tokens are "the same word" when their sets
 * intersect. It has to be a set per token, not one canonical key, because no single
 * normalisation reconciles the muṣḥaf with how people actually type:
 *
 *   ٱلْعَٰلَمِينَ  norm → العلمين   (dagger stripped)   searchAlef → العالمين  ← the typed form
 *   ٱلرَّحْمَٰن   norm → الرحمن    ← the typed form     searchAlef → الرحمان
 *
 * Each key wins one of those and loses the other, and a single quotation routinely
 * contains both kinds of word (رب العالمين الرحمن الرحيم), so folding the āya down to one
 * string and running indexOf cannot work whichever fold is chosen. quoteKeys() already
 * enumerates the spellings a word may be written under — the same ones the corpus index
 * and the search bar resolve through — so agreement on any one of them is the match test.
 *
 * Built over `words` (not the raw text) so the token stream — and so the `word_indices`
 * this yields — is the one `words=true`, the morphology and the app's highlighting all
 * share. Tokens the corpus drops as too short are absent here and from the query alike, so
 * a quotation containing one still matches.
 *
 * Lazy, like seedIndex: ~81k token entries is not much, but a deployment that never asks
 * for a quotation lookup shouldn't pay for it at boot. Keys are interned through a pool
 * because the corpus reuses a few thousand spellings across 6236 āyāt, and holding one
 * string per distinct key rather than per occurrence is most of the footprint. */
function buildTextIndex(verseData, orderedKeys) {
  const pool = new Map();
  const intern = (s) => { const hit = pool.get(s); if (hit !== undefined) return hit; pool.set(s, s); return s; };
  const entries = [];
  for (const vk of orderedKeys) {
    const v = verseData[vk];
    if (!v) continue;
    entries.push({ vk, keys: v.words.map((w) => quoteKeys(w.orig).map(intern)) });
  }
  return entries;
}

/* Count the occurrences (tokens, not verses) of `lookup` in a verse. */
export function tokenCountIn(verse, lookup, mode) {
  let n = 0;
  for (const w of verse.words || []) if (wordGroupKey(w, mode) === lookup) n++;
  return n;
}

/* Word indices in a verse whose active-mode key is `lookup` — what the UI highlights. */
export function hitIndices(verse, lookup, mode) {
  const out = [];
  (verse.words || []).forEach((w, i) => { if (wordGroupKey(w, mode) === lookup) out.push(i); });
  return out;
}

export { norm };
