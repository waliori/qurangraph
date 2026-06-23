import { readFileSync, writeFileSync } from "fs";
import { norm } from "../src/arabic-utils.js";
import { buildSeedIndex } from "../src/analytics/phrases.js";
import { verseDiff } from "../src/analytics/diff.js";

/* ═══ Mutashābihāt discovery (المتشابهات: الآيات المتقاربة) — build step ═══
 *
 * The diff lens shows what two near-identical verses differ by; this finds the PAIRS to
 * begin with — every two verses across the whole Qurʾān whose wording is identical except
 * for a word or two (وَاتَّقُوا۟/فَاتَّقُوا۟, ٱدْخُلُوا۟/ٱسْكُنُوا۟, the parallel passages of the
 * prophets…). A flagship of the mutashābihāt literature and a study aid for ḥuffāẓ.
 *
 * Method: candidates come from a long shared seed (a 4-word verbatim run — cheap, and
 * near-identical verses always share one), then each candidate pair is aligned word-by-word
 * (LCS, src/analytics/diff.js) and kept only when it differs by ≤ MAX_CHANGED tokens and
 * shares ≥ MIN_SAME. Purely text-internal (loose skeleton w.norm).
 *
 * Output: public/data/mutashabihat.json
 *   { note, count, byVerse:{ "s:a":[{ other, same, changed }] },
 *     pairs:[{ a, b, same, changed }] }   // pairs sorted: fewest changes first
 */

const SEED_LEN = 4;     // verbatim run length that makes two verses candidates
const MAX_CHANGED = 2;  // keep pairs differing by at most this many tokens
const MIN_SAME = 3;     // …and sharing at least this many (drop trivially short verses)
const MAX_BUCKET = 400; // skip a seed shared by more verses than this (a ubiquitous formula)

const HAFS = "public/data/quran-hafs.json";
const hafs = JSON.parse(readFileSync(HAFS, "utf8"));

// Build verseData exactly as the app does: split on whitespace, keep tokens whose loose
// skeleton is ≥2 chars, carry { orig, norm }.
const verseData = {};
for (const sura of hafs) {
  for (const v of sura.verses) {
    const words = [];
    for (const raw of v.text.split(/\s+/)) { const n = norm(raw); if (n.length >= 2) words.push({ orig: raw, norm: n }); }
    verseData[`${sura.id}:${v.id}`] = { s: sura.id, a: v.id, words };
  }
}

const seedIndex = buildSeedIndex(verseData, { seedLen: SEED_LEN });

// Candidate pairs: any two verses sharing a SEED_LEN-word run. Dedup by ordered key.
const candidates = new Set();
const ordered = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
for (const arr of seedIndex.values()) {
  const vks = [...new Set(arr.map((x) => x.vk))];
  if (vks.length < 2 || vks.length > MAX_BUCKET) continue;
  for (let i = 0; i < vks.length; i++) for (let j = i + 1; j < vks.length; j++) candidates.add(ordered(vks[i], vks[j]));
}

// Keep the near-identical ones.
const pairs = [];
for (const key of candidates) {
  const [a, b] = key.split("|");
  const d = verseDiff(a, b, verseData);
  if (!d) continue;
  if (d.changed <= MAX_CHANGED && d.same >= MIN_SAME) pairs.push({ a, b, same: d.same, changed: d.changed });
}

// Sort: fewest changes first (the closest pairs), then most shared.
pairs.sort((x, y) => x.changed - y.changed || y.same - x.same);

// Index by verse (both directions) so a verse's lab can show its near-twins directly.
const byVerse = {};
const add = (vk, other, same, changed) => { (byVerse[vk] ||= []).push({ other, same, changed }); };
for (const p of pairs) { add(p.a, p.b, p.same, p.changed); add(p.b, p.a, p.same, p.changed); }
for (const vk in byVerse) byVerse[vk].sort((x, y) => x.changed - y.changed || y.same - x.same);

writeFileSync("public/data/mutashabihat.json", JSON.stringify({
  note: "Near-identical verse pairs (mutashābihāt): identical wording except ≤2 tokens. Discovered by shared 4-word seed + LCS diff over the loose skeleton. Text-internal.",
  count: pairs.length,
  byVerse,
  pairs,
}));

console.log(`Mutashābihāt: ${pairs.length} near-identical verse pairs (≤${MAX_CHANGED} changed), ${Object.keys(byVerse).length} verses involved.`);
const ident = pairs.filter((p) => p.changed === 0).length;
console.log(`  exact-skeleton twins: ${ident}; one-word apart: ${pairs.filter((p) => p.changed === 1).length}`);
console.log(`→ public/data/mutashabihat.json`);
