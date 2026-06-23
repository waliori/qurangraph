import { readFileSync, writeFileSync, existsSync } from "fs";
import { norm, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "../src/arabic-utils.js";
import { pmi as pmiScore } from "../src/analytics/assoc.js";

/* ═══ Distributional semantic neighbours (build step) ═══
 *
 * The app links words by FORM (same word / lemma / root). This precomputes the missing
 * axis — MEANING by context: two roots that keep similar company (co-occur with the same
 * other roots, verse by verse) are semantically related even when they never share a
 * letter (روح↔نفس, terms of punishment clustering …). This is Firth's distributional
 * hypothesis applied to the Qur'an's own text — no external data, no interpretation,
 * just statistics over co-occurrence.
 *
 * Method: per-verse bag of content roots → verse-level co-occurrence counts → positive
 * PMI (PPMI) context vectors per root → cosine similarity → top-K neighbours per root.
 * Output: public/data/semantic-neighbours.json = { root: [[neighbourRoot, sim], …] }.
 */

const HAFS = "public/data/quran-hafs.json";
const ROOTS = "public/data/roots.json";
for (const f of [HAFS, ROOTS]) {
  if (!existsSync(f)) { console.error(`Missing ${f}. Run data:transform && data:roots first.`); process.exit(1); }
}

const TOP_K = 12;        // neighbours kept per root
const MIN_DF = 3;        // ignore roots occurring in <3 verses (too sparse to be reliable)
const MIN_SIM = 0.08;    // drop weak ties so the list stays meaningful
const SYNTAGM_MIN = 0.25; // direct co-occurrence / min(df) above this → syntagmatic, else paradigmatic
const MAX_DF_FRAC = 0.25; // backstop: a root in >25% of verses is too ubiquitous to inform

const hafs = JSON.parse(readFileSync(HAFS, "utf8"));
const rootMap = JSON.parse(readFileSync(ROOTS, "utf8")); // normForm → root

/* Stop ROOTS: distributional neighbours of a function word (من→منن, على→علو, الذي→ألل)
 * or an omnipresent content word (الله, رب, قال) are universal hubs that swamp every
 * list with the same handful of entries. Mirror the app's own stopword philosophy: take
 * the surface stop sets, map them through the root map, and exclude those roots as both
 * context dimensions and neighbours. A frequency backstop (MAX_DF_FRAC) catches the rest. */
const STOP_ROOTS = new Set();
for (const w of [...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT]) { const r = rootMap[norm(w)]; if (r) STOP_ROOTS.add(r); }

/* ── 1. Per-verse bag of distinct content roots ── */
const verseRoots = []; // [ [root, …], … ]  one entry per verse that has ≥1 root
const df = new Map();   // root → # verses containing it
for (const sura of hafs) {
  for (const v of sura.verses) {
    const set = new Set();
    for (const raw of v.text.split(/\s+/)) {
      const n = norm(raw);
      if (n.length < 2) continue;
      const r = rootMap[n];
      if (r && !STOP_ROOTS.has(r)) set.add(r); // rooted, non-stop tokens only
    }
    if (set.size) { verseRoots.push([...set]); for (const r of set) df.set(r, (df.get(r) || 0) + 1); }
  }
}
const N = verseRoots.length;

/* ── 2. Verse-level co-occurrence counts ── */
const cooc = new Map(); // root → Map(contextRoot → count)
const bump = (a, b) => { let m = cooc.get(a); if (!m) cooc.set(a, (m = new Map())); m.set(b, (m.get(b) || 0) + 1); };
for (const roots of verseRoots) {
  for (let i = 0; i < roots.length; i++)
    for (let j = i + 1; j < roots.length; j++) { bump(roots[i], roots[j]); bump(roots[j], roots[i]); }
}

/* ── 3. PPMI context vectors (+ L2 norm), restricted to roots with enough evidence ── */
const dfCeil = MAX_DF_FRAC * N;
const eligible = [...df.keys()].filter((r) => df.get(r) >= MIN_DF && df.get(r) <= dfCeil);
const vectors = new Map(); // root → Map(context → ppmi)
const norms = new Map();   // root → L2 norm of its ppmi vector
for (const r of eligible) {
  const ctx = cooc.get(r);
  if (!ctx) continue;
  const vec = new Map();
  let sq = 0;
  for (const [c, k] of ctx) {
    if (df.get(c) < MIN_DF || df.get(c) > dfCeil) continue;
    const p = pmiScore(k, df.get(r), df.get(c), N);
    if (p > 0) { vec.set(c, p); sq += p * p; }
  }
  if (vec.size) { vectors.set(r, vec); norms.set(r, Math.sqrt(sq)); }
}

/* ── 4. Cosine kNN via an inverted index (context → roots), so we only score roots that
 *      share ≥1 context dimension instead of all-pairs. ── */
const inverted = new Map(); // context → [root…]
for (const [r, vec] of vectors) for (const c of vec.keys()) { let a = inverted.get(c); if (!a) inverted.set(c, (a = [])); a.push(r); }

const out = {};
for (const [r, vec] of vectors) {
  const nr = norms.get(r);
  const dot = new Map(); // candidate → accumulated dot product
  for (const [c, w] of vec) {
    const others = inverted.get(c);
    if (!others) continue;
    for (const o of others) { if (o === r) continue; dot.set(o, (dot.get(o) || 0) + w * (vectors.get(o).get(c) || 0)); }
  }
  const scored = [];
  for (const [o, d] of dot) {
    const sim = d / (nr * norms.get(o));
    if (sim >= MIN_SIM) scored.push([o, sim]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  // Relation type: a neighbour that ALSO co-occurs directly with the root often
  // (relative to the rarer of the two) is SYNTAGMATIC (they go together in a verse);
  // one that merely shares contexts but seldom co-occurs is PARADIGMATIC (substitutable —
  // a candidate synonym/antonym). The cosine alone can't tell these apart.
  if (scored.length) out[r] = scored.slice(0, TOP_K).map(([o, s]) => {
    const k = cooc.get(r)?.get(o) || 0;
    const denom = Math.min(df.get(r) || 1, df.get(o) || 1);
    const rel = denom && k / denom >= SYNTAGM_MIN ? "syntagmatic" : "paradigmatic";
    return [o, +s.toFixed(3), rel];
  });
}

writeFileSync("public/data/semantic-neighbours.json", JSON.stringify(out));
const withNbrs = Object.keys(out).length;
const avg = withNbrs ? (Object.values(out).reduce((s, a) => s + a.length, 0) / withNbrs).toFixed(1) : 0;
console.log(`Semantic neighbours: ${withNbrs}/${eligible.length} eligible roots have neighbours (avg ${avg} each, ${N} verses).`);
console.log(`→ public/data/semantic-neighbours.json`);
