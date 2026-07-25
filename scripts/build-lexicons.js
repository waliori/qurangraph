import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { parseMaqayisEntry, parseLexiconText, matchNorm, matchRoot, parseLexMeta, parsePageMarker, parseSpacedRoot } from "./lib/parse.js";
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

// Several classical lexicons share OpenITI's `### | …` section layout but differ in how
// the header names its root: Maqāyīs parenthesises it `(root)`, Ṣiḥāḥ brackets it `[root]`.
// Each layout is one regex + a header→root mapper; the body parsing (concise/full/page)
// is shared. (al-Muḥkam also uses `### |` but needs body lookahead — see parseMuhkam.)
const arabicRoot = (s) => { const r = (s || "").replace(/[^ء-ي]/g, ""); return /^[ء-ي]{2,6}$/.test(r) ? r : null; };
const SECTIONED = {
  maqayis: { headerRe: /^###\s*\|\s*\(([^)]+)\)/, rootOf: arabicRoot },          // ### | (رب)
  sihah: { headerRe: /^###\s*\|\s*\[([^\]]+)\]/, rootOf: arabicRoot },           // ### | [نوأ]
};

// Parse a `### |`-sectioned lexicon into root→{c,f,full,cite}. `rootOf` returns null for
// non-root dividers (فصل/أبواب/الجزء…), which end the current entry without starting one.
// Tracks inline page milestones so each entry carries its (approximate) page.
function parseSectioned(text, { headerRe, rootOf }) {
  const entries = {}, lines = text.split(/\r?\n/);
  let cur = null, body = [], lastPage = null, entryPage = null;
  const flush = () => { if (cur && !entries[cur]) { const p = parseMaqayisEntry(body); if (p) { const cite = entryPage || lastPage; if (cite) p.cite = cite; entries[cur] = p; } } };
  for (const line of lines) {
    const pg = parsePageMarker(line);
    if (pg) { lastPage = pg; if (cur && entryPage == null) entryPage = pg; }
    const m = headerRe.exec(line);
    if (m) { flush(); cur = rootOf(m[1]); body = []; entryPage = null; }
    else if (line.startsWith("###")) { flush(); cur = null; body = []; entryPage = null; }
    else if (cur) body.push(line);
  }
  flush();
  return entries;
}

// al-Muḥkam (Ibn Sīda) is ordered by al-Khalīl's phonetic permutation (تقاليب) scheme, so a
// `### |` section header names its radicals in PHONETIC order ("العين والشين والطاء"), which
// is not the root's own order and can't be trusted to spell the headword. Two markers DO
// spell it out reliably as spaced letters: a permutation header `مقلوبه: (ن ز ل)`, and the
// entry-opening bracket `# [ل ز ن] …`. We take the header's spaced root when present, else
// the first body bracket; named-letter primaries with no bracket are skipped (sound over
// complete — better no entry than a wrong-order root with the wrong gloss).
function parseMuhkam(text) {
  const entries = {}, lines = text.split(/\r?\n/);
  let cur = null, body = [], lastPage = null, entryPage = null;
  const flush = () => { if (cur && !entries[cur]) { const p = parseMaqayisEntry(body); if (p) { const cite = entryPage || lastPage; if (cite) p.cite = cite; entries[cur] = p; } } };
  const open = (root) => { flush(); cur = root; body = []; entryPage = null; };
  for (const line of lines) {
    const pg = parsePageMarker(line);
    if (pg) { lastPage = pg; if (cur && entryPage == null) entryPage = pg; }
    if (/^###\s*\|/.test(line)) { open(parseSpacedRoot(line)); continue; }
    // Inside a named-letter primary (no header root yet) the first `# [ل ز ن]` fixes the root.
    if (!cur) { const m = /^#\s*\[[^\]]*\]/.exec(line); if (m) cur = parseSpacedRoot(m[0]); }
    // Drop the spaced-letter root marker `[ل ز ن]` so it doesn't leak into the gloss text.
    if (cur) body.push(line.replace(/\[\s*[ء-ي](?:\s+[ء-ي]){1,5}\s*\]/g, " "));
  }
  flush();
  return entries;
}

// `core` lexicons fail the build if they parse to (almost) nothing — a parser
// regression must not silently ship an empty dictionary. `floor` is the minimum
// fraction of Qur'an roots a present lexicon must cover (catches total breakage
// without false-positiving on a genuinely sparse reference).
const COVERAGE_FLOOR = 0.1;
// Ordered chronologically by author (the lexicon switcher follows this order). The
// app's default lexicon is keyed by id ("maqayis"), so order is cosmetic, not behavioural.
const LEXICONS = [
  { id: "ayn", label: "العين — الخليل بن أحمد الفراهيدي", license: "CC-BY-SA (OpenITI)", file: "data/source/ayn.txt", format: "lisan" },
  { id: "sihah", label: "الصحاح — الجوهري", license: "CC-BY-SA (OpenITI)", file: "data/source/sihah.txt", format: "sihah" },
  { id: "maqayis", label: "مقاييس اللغة — ابن فارس", license: "CC-BY-SA (OpenITI)", file: "data/source/maqayis.txt", format: "maqayis", core: true },
  { id: "muhkam", label: "المحكم والمحيط الأعظم — ابن سيده", license: "CC-BY-SA (OpenITI)", file: "data/source/muhkam.txt", format: "muhkam" },
  { id: "mufradat", label: "المفردات في غريب القرآن — الراغب الأصفهاني", license: "CC-BY-SA (OpenITI)", file: "data/source/mufradat.txt", format: "mufradat" },
  { id: "lisan", label: "لسان العرب — ابن منظور", license: "CC-BY-SA (OpenITI)", file: "data/source/lisan.txt", format: "lisan" },
];

const manifest = [];
for (const lex of LEXICONS) {
  if (!existsSync(lex.file)) { console.log(`skip ${lex.id} (missing ${lex.file})`); continue; }
  const text = readFileSync(lex.file, "utf8");
  const edition = parseLexMeta(text); // editor / publisher / year / volumes for the citation
  const entries = lex.format === "muhkam" ? parseMuhkam(text)
    : SECTIONED[lex.format] ? parseSectioned(text, SECTIONED[lex.format])
    : parseLexiconText(text, lex.format);
  const headerSet = new Set(Object.keys(entries));
  // matchNorm folds hamza/alif/weak-final, so two distinct headers can collapse to the
  // same key — first-wins, and the loser becomes unreachable (a silent wrong-gloss
  // risk). Count + sample the collisions so the build surfaces them instead of hiding.
  const normMap = new Map();
  let collisions = 0; const collisionSample = [];
  for (const h of headerSet) {
    const k = matchNorm(h);
    if (normMap.has(k)) { collisions++; if (collisionSample.length < 8) collisionSample.push(`${normMap.get(k)}≈${h}`); }
    else normMap.set(k, h);
  }
  if (collisions) console.log(`  ${lex.id}: ${collisions} header(s) collide on matchNorm (first wins) e.g. ${collisionSample.join(", ")}`);

  const meanings = {}, full = {};
  let matched = 0;
  for (const root of presentRoots) {
    const h = matchRoot(root, headerSet, normMap);
    if (h && entries[h]) {
      meanings[root] = { c: entries[h].c, f: entries[h].f };
      if (entries[h].cite) meanings[root].cite = entries[h].cite; // { vol, page }
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
  manifest.push({ id: lex.id, label: lex.label, license: lex.license, edition, hasFull, fullShards: hasFull ? FULL_SHARDS : 0, coverage: +cov });
  console.log(`${lex.id}: ${Object.keys(entries).length} entries → ${matched}/${presentRoots.size} roots matched (${cov}%)${hasFull ? `, ${fullRoots.length} full → ${FULL_SHARDS} shards` : ""}`);

  // Coverage tripwire: a present lexicon that matches almost nothing means the parser
  // broke. Fail the build for a core lexicon; loudly warn for best-effort ones.
  if (matched / presentRoots.size < COVERAGE_FLOOR) {
    const msg = `${lex.id} coverage ${cov}% is below the ${COVERAGE_FLOOR * 100}% floor — the parser likely broke (a present source matching ~no roots).`;
    if (lex.core) { console.error(`ERROR: ${msg} Refusing to ship an empty core dictionary.`); process.exit(1); }
    console.warn(`  ! ${msg}`);
  }
}

writeFileSync(`${OUT}/index.json`, JSON.stringify(manifest));
console.log(`→ ${OUT}/index.json (${manifest.map((m) => m.id).join(", ") || "none"})`);
