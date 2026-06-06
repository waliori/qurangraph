import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { parseMaqayisEntry, parseLexiconText, matchNorm, matchRoot } from "./lib/parse.js";
import { FULL_SHARDS, shardOf } from "../src/lexiconShard.js";

/* ═══ Build swappable Arabic lexicons ═══
 *
 * For each available source, parse it into headword→meaning, align those onto the
 * Qur'an's roots (roots.json, via matchRoot), and emit a per-lexicon concise file
 * + full file under public/data/lexicons/, plus an index.json manifest the app
 * reads to populate its lexicon switcher. Each lexicon is ONE language reference —
 * the app labels it as such; none is presented as "the" meaning. Missing sources
 * are skipped, so the build works with whatever has been downloaded. */

const OUT = "public/data/lexicons";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
if (!existsSync("public/data/roots.json")) { console.error("Run data:roots first (need roots.json)."); process.exit(1); }

const roots = JSON.parse(readFileSync("public/data/roots.json", "utf8"));
const presentRoots = new Set(Object.values(roots).filter(Boolean));

// Maqāyīs uses `### | (root)` headers — parse with the dedicated per-entry helper.
function parseMaqayis(text) {
  const entries = {}, lines = text.split("\n");
  const headerRe = /^###\s*\|\s*\(([^)]+)\)/, isRoot = (s) => /^[ء-ي]{2,6}$/.test(s);
  let cur = null, body = [];
  const flush = () => { if (cur && !entries[cur]) { const p = parseMaqayisEntry(body); if (p) entries[cur] = p; } };
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) { flush(); const r = m[1].replace(/[^ء-ي]/g, ""); cur = isRoot(r) ? r : null; body = []; }
    else if (line.startsWith("###")) { flush(); cur = null; body = []; }
    else if (cur) body.push(line);
  }
  flush();
  return entries;
}

const LEXICONS = [
  { id: "maqayis", label: "مقاييس اللغة — ابن فارس", license: "CC-BY-SA (OpenITI)", file: "data/source/maqayis.txt", format: "maqayis" },
  { id: "mufradat", label: "المفردات في غريب القرآن — الراغب الأصفهاني", license: "CC-BY-SA (OpenITI)", file: "data/source/mufradat.txt", format: "mufradat" },
  { id: "lisan", label: "لسان العرب — ابن منظور", license: "CC-BY-SA (OpenITI)", file: "data/source/lisan.txt", format: "lisan" },
];

const manifest = [];
for (const lex of LEXICONS) {
  if (!existsSync(lex.file)) { console.log(`skip ${lex.id} (missing ${lex.file})`); continue; }
  const text = readFileSync(lex.file, "utf8");
  const entries = lex.format === "maqayis" ? parseMaqayis(text) : parseLexiconText(text, lex.format);
  const headerSet = new Set(Object.keys(entries));
  const normMap = new Map();
  for (const h of headerSet) if (!normMap.has(matchNorm(h))) normMap.set(matchNorm(h), h);

  const meanings = {}, full = {};
  let matched = 0;
  for (const root of presentRoots) {
    const h = matchRoot(root, headerSet, normMap);
    if (h && entries[h]) {
      meanings[root] = { c: entries[h].c, f: entries[h].f };
      if (entries[h].full && entries[h].full !== entries[h].f) full[root] = entries[h].full;
      matched++;
    }
  }
  const fullRoots = Object.keys(full);
  const hasFull = fullRoots.length > 0;
  writeFileSync(`${OUT}/${lex.id}.json`, JSON.stringify(meanings));
  // Full articles are sharded by a stable hash of the root, so the app fetches one
  // small bucket per "show more" instead of the whole (multi-MB) file. The old
  // monolithic `${id}-full.json` is removed if present.
  const oldMono = `${OUT}/${lex.id}-full.json`;
  if (existsSync(oldMono)) rmSync(oldMono);
  if (hasFull) {
    const dir = `${OUT}/${lex.id}-full`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const buckets = Array.from({ length: FULL_SHARDS }, () => ({}));
    for (const r of fullRoots) buckets[shardOf(r)][r] = full[r];
    buckets.forEach((b, i) => { if (Object.keys(b).length) writeFileSync(`${dir}/${i}.json`, JSON.stringify(b)); });
  }
  const cov = ((100 * matched) / presentRoots.size).toFixed(1);
  manifest.push({ id: lex.id, label: lex.label, license: lex.license, hasFull, fullShards: hasFull ? FULL_SHARDS : 0, coverage: +cov });
  console.log(`${lex.id}: ${Object.keys(entries).length} entries → ${matched}/${presentRoots.size} roots matched (${cov}%)${hasFull ? `, ${fullRoots.length} full → ${FULL_SHARDS} shards` : ""}`);
}

writeFileSync(`${OUT}/index.json`, JSON.stringify(manifest));
console.log(`→ ${OUT}/index.json (${manifest.map((m) => m.id).join(", ") || "none"})`);
