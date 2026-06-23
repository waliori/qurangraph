import { readFileSync, writeFileSync } from "fs";
import { norm, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "../src/arabic-utils.js";
import { g2 } from "../src/analytics/assoc.js";

/* ═══ Munāsabāt — inter-sūra coherence (مناسبات السور) — build step ═══
 *
 * The classical نظم / مناسبات tradition (al-Biqāʿī's Naẓm al-Durar) reads each sūra in
 * relation to its NEIGHBOURS. This precomputes, for every consecutive sūra pair, two
 * text-internal signals of that relation:
 *   - sharedKey — roots that are statistically DISTINCTIVE (keyness, signed G²) in BOTH
 *                 sūras: a shared theme carried across the seam.
 *   - seam      — content roots shared between the CLOSING verses of sūra N and the
 *                 OPENING verses of sūra N+1: the lexical hand-off at the join.
 * Purely from the corpus's own roots — no external commentary. Output:
 *   public/data/munasabat.json = { note, pairs:[{ a, b, aName, bName, sharedKey, seam }],
 *                                  bySura:{ suraId:[pairIndex…] } }
 */

const KEY_MIN_VERSES = 2; // a root must appear in ≥2 sūra verses to count as a theme
const TOP_KEY = 25;        // distinctive roots kept per sūra
const SEAM_VERSES = 3;     // how many closing/opening verses define the join

const hafs = JSON.parse(readFileSync("public/data/quran-hafs.json", "utf8"));
const rootMap = JSON.parse(readFileSync("public/data/roots.json", "utf8")); // normForm → root

const stopRoots = new Set();
for (const wrd of [...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT]) { const r = rootMap[norm(wrd)]; if (r) stopRoots.add(r); }

const rootsOf = (text) => {
  const set = new Set();
  for (const raw of text.split(/\s+/)) { const r = rootMap[norm(raw)]; if (r && !stopRoots.has(r)) set.add(r); }
  return set;
};

// Per-sūra verse roots + corpus df.
const N = hafs.reduce((s, su) => s + su.verses.length, 0);
const df = new Map(); // root → # verses corpus-wide
const suras = hafs.map((su) => {
  const verses = su.verses.map((v) => ({ a: v.id, roots: rootsOf(v.text) }));
  for (const v of verses) for (const r of v.roots) df.set(r, (df.get(r) || 0) + 1);
  return { id: su.id, name: su.name, verses };
});

// Distinctive roots per sūra by signed G² (keyness), strongest first.
const keyOf = (su) => {
  const inSura = new Map();
  for (const v of su.verses) for (const r of v.roots) inSura.set(r, (inSura.get(r) || 0) + 1);
  const out = [];
  for (const [root, a] of inSura) {
    if (a < KEY_MIN_VERSES) continue;
    const ll = g2(a, su.verses.length, df.get(root) || a, N);
    if (ll > 0) out.push({ root, ll });
  }
  return out.sort((x, y) => y.ll - x.ll).slice(0, TOP_KEY).map((x) => x.root);
};
const keyRoots = suras.map((su) => new Set(keyOf(su)));

const closing = (su) => { const s = new Set(); for (const v of su.verses.slice(-SEAM_VERSES)) for (const r of v.roots) s.add(r); return s; };
const opening = (su) => { const s = new Set(); for (const v of su.verses.slice(0, SEAM_VERSES)) for (const r of v.roots) s.add(r); return s; };

const pairs = [];
const bySura = {};
for (let i = 0; i + 1 < suras.length; i++) {
  const A = suras[i], B = suras[i + 1];
  const sharedKey = [...keyRoots[i]].filter((r) => keyRoots[i + 1].has(r));
  const cl = closing(A), op = opening(B);
  const seam = [...cl].filter((r) => op.has(r));
  if (!sharedKey.length && !seam.length) continue;
  const idx = pairs.length;
  pairs.push({ a: A.id, b: B.id, aName: A.name, bName: B.name, sharedKey, seam });
  (bySura[A.id] ||= []).push(idx);
  (bySura[B.id] ||= []).push(idx);
}

writeFileSync("public/data/munasabat.json", JSON.stringify({
  note: "Inter-sūra coherence (munāsabāt): per consecutive sūra pair, the roots distinctive in both (sharedKey) and the content roots shared across the closing/opening seam. Text-internal (roots only).",
  pairs,
  bySura,
}));

const withSeam = pairs.filter((p) => p.seam.length).length;
console.log(`Munāsabāt: ${pairs.length}/${suras.length - 1} consecutive sūra pairs linked (${withSeam} via an opening/closing seam).`);
console.log(`→ public/data/munasabat.json`);
