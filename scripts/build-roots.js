import { readFileSync, writeFileSync, existsSync } from "fs";
import { norm } from "../src/arabic-utils.js";
import { parseMorphologyRoot, matchNorm, matchRoot, parseMaqayisEntry } from "./lib/parse.js";

/* ── Inputs ── */
const MORPH = "data/source/quran-morphology.txt";
const MAQAYIS = "data/source/maqayis.txt";
const HAFS = "public/data/quran-hafs.json";

for (const f of [MORPH, MAQAYIS, HAFS]) {
  if (!existsSync(f)) {
    console.error(`Missing ${f}. Run: npm run data:download && npm run data:transform`);
    process.exit(1);
  }
}

/* ── 1. Morphology → per-word {form, root}, grouped by verse ── */
const verseWords = {}; // "s:a" → [{ form, root }]  (ordered by word index)
{
  const lines = readFileSync(MORPH, "utf8").split("\n");
  const wordAgg = {}; // "s:a:w" → { form, root }
  for (const line of lines) {
    if (!line || line[0] === "#") continue;
    const [loc, form, , feat = ""] = line.split("\t");
    if (!loc) continue;
    const [s, a, w] = loc.split(":");
    const key = `${s}:${a}:${w}`;
    let agg = wordAgg[key];
    if (!agg) {
      agg = { form: "", root: null };
      wordAgg[key] = agg;
      (verseWords[`${s}:${a}`] ||= []).push(agg);
    }
    agg.form += form || "";
    const r = parseMorphologyRoot(feat);
    if (r && !agg.root) agg.root = r;
  }
}

/* ── 2. Maqayis → header → { c, f } + lookup indexes ── */
const entries = {};       // header root → { c, f }
const headerSet = new Set();
const normMap = new Map(); // matchNorm(header) → header
{
  const lines = readFileSync(MAQAYIS, "utf8").split("\n");
  const headerRe = /^###\s*\|\s*\(([^)]+)\)/;
  const isRoot = (s) => /^[ء-ي]{2,6}$/.test(s);
  let curRoot = null, body = [];
  const flush = () => {
    if (curRoot && !entries[curRoot]) {
      const parsed = parseMaqayisEntry(body);
      if (parsed) {
        entries[curRoot] = parsed;
        headerSet.add(curRoot);
        if (!normMap.has(matchNorm(curRoot))) normMap.set(matchNorm(curRoot), curRoot);
      }
    }
  };
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) {
      flush();
      const root = m[1].replace(/[^ء-ي]/g, ""); // strip OCR artifacts e.g. "( [بقر)"
      curRoot = isRoot(root) ? root : null;
      body = [];
    } else if (line.startsWith("###")) {
      flush(); curRoot = null; body = [];
    } else if (curRoot) {
      body.push(line);
    }
  }
  flush();
}

/* ── 3. Align corpus roots onto Tanzil tokens → normForm → root ── */
const hafs = JSON.parse(readFileSync(HAFS, "utf8"));
const tally = {}; // norm → { root: count }  (majority vote for homographs)
let contentTokens = 0, rootedTokens = 0, mismatchVerses = 0;

const vote = (n, root) => {
  if (n.length < 2 || !root) return;
  (tally[n] ||= {});
  tally[n][root] = (tally[n][root] || 0) + 1;
};

for (const sura of hafs) {
  for (const v of sura.verses) {
    const tokens = v.text.split(/\s+/).filter(Boolean);
    const corpus = verseWords[`${sura.id}:${v.id}`] || [];
    const aligned = corpus.length === tokens.length;
    if (!aligned && corpus.length) mismatchVerses++;

    // Surface fallback map for this verse (norm(corpusForm) → root)
    const surface = {};
    for (const cw of corpus) if (cw.root) { const cn = norm(cw.form); if (cn.length >= 2 && !surface[cn]) surface[cn] = cw.root; }

    tokens.forEach((tok, i) => {
      const n = norm(tok);
      if (n.length >= 2) contentTokens++;
      let root = null;
      if (aligned && corpus[i]) root = corpus[i].root;
      if (!root) root = surface[n] || null;
      if (root) { vote(n, root); rootedTokens++; }
    });
  }
}

/* Resolve majority root per surface form */
const roots = {};
for (const [n, counts] of Object.entries(tally)) {
  let best = null, bestC = -1;
  for (const [r, c] of Object.entries(counts)) if (c > bestC) { best = r; bestC = c; }
  roots[n] = best;
}

/* ── 4. Root → meaning, only for roots present in the Quran ── */
const presentRoots = new Set(Object.values(roots));
const meanings = {};
let matched = 0;
const unmatched = [];
for (const root of presentRoots) {
  const header = matchRoot(root, headerSet, normMap);
  if (header && entries[header]) { meanings[root] = entries[header]; matched++; }
  else unmatched.push(root);
}

/* ── 5. Write artifacts ── */
writeFileSync("public/data/roots.json", JSON.stringify(roots));
writeFileSync("public/data/root-meanings.json", JSON.stringify(meanings));

/* ── Report ── */
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "0") + "%";
console.log(`Surface forms with a root: ${Object.keys(roots).length}`);
console.log(`Token root coverage: ${rootedTokens}/${contentTokens} (${pct(rootedTokens, contentTokens)})`);
console.log(`Verses with token-count mismatch (used surface fallback): ${mismatchVerses}`);
console.log(`Distinct Quran roots: ${presentRoots.size}`);
console.log(`Roots matched to Maqayis: ${matched}/${presentRoots.size} (${pct(matched, presentRoots.size)})`);
if (unmatched.length) console.log(`  unmatched sample: ${unmatched.slice(0, 25).join(" ")}`);
console.log(`→ public/data/roots.json, public/data/root-meanings.json`);
