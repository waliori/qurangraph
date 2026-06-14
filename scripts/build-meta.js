import { writeFileSync, mkdirSync, existsSync } from "fs";

/* ═══ Surah / structural metadata (build step) ═══
 *
 * Standard, fixed REFERENCE data the Tanzil text alone doesn't carry — revelation place
 * (مكية/مدنية), traditional revelation (nuzūl) order, the 30 juzʾ boundaries, and the 15
 * sajdas of recitation. It is curated reference, not derived from a corpus, so it lives
 * inline here (tracked in git) and is emitted as public/data/surah-meta.json.
 *
 * Provenance / caveats:
 *   - place + nuzūl order follow the Cairo (Egyptian standard) muṣḥaf chronology. The
 *     Meccan/Medinan split is the 86/28 standard; a handful (al-Fātiḥa, al-Raʿd, al-Raḥmān,
 *     al-Insān, al-Zalzala, al-Bayyina) are classically disputed — we take the Egyptian mark.
 *     Chronology is a TRADITION, not a datum: it is offered as a lens, not a certainty.
 *   - juzʾ starts and the 15 sajdas are the standard Ḥafṣ/Madani-muṣḥaf positions.
 */

// Revelation (nuzūl) order — sūra numbers in the traditional sequence (Cairo standard).
// The first 86 are Meccan, the last 28 Medinan.
const NUZUL = [
  96, 68, 73, 74, 1, 111, 81, 87, 92, 89, 93, 94, 103, 100, 108, 102, 107, 109, 105, 113,
  114, 112, 53, 80, 97, 91, 85, 95, 106, 101, 75, 104, 77, 50, 90, 86, 54, 38, 7, 72,
  36, 25, 35, 19, 20, 56, 26, 27, 28, 17, 10, 11, 12, 15, 6, 37, 31, 34, 39, 40,
  41, 42, 43, 44, 45, 46, 51, 88, 18, 16, 71, 14, 21, 23, 32, 52, 67, 69, 70, 78,
  79, 82, 84, 30, 29, 83,
  // Medinan:
  2, 8, 3, 33, 60, 4, 99, 57, 47, 13, 55, 76, 65, 98, 59, 24, 22, 63, 58, 49,
  66, 64, 61, 62, 48, 5, 9, 110,
];

// The 28 Medinan sūras (Egyptian standard) — every other sūra is Meccan.
const MADANI = new Set([2, 3, 4, 5, 8, 9, 13, 22, 24, 33, 47, 48, 49, 55, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 99, 110]);

// Juzʾ START positions [sūra, āya] (1..30), standard Ḥafṣ.
const JUZ = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

// The 15 sajdas of recitation [sūra, āya], standard.
const SAJDA = [
  [7, 206], [13, 15], [16, 50], [17, 109], [19, 58], [22, 18], [22, 77], [25, 60],
  [27, 26], [32, 15], [38, 24], [41, 38], [53, 62], [84, 21], [96, 19],
];

const order = {};
NUZUL.forEach((sid, i) => { order[sid] = i + 1; });
const surahs = {};
for (let id = 1; id <= 114; id++) surahs[id] = { place: MADANI.has(id) ? "madani" : "makki", order: order[id] };

/* ── Integrity assertions — a typo in the reference table must fail the build ── */
const fail = (m) => { console.error(`ERROR: surah-meta — ${m}`); process.exit(1); };
if (NUZUL.length !== 114) fail(`nuzūl order has ${NUZUL.length} entries, expected 114`);
if (new Set(NUZUL).size !== 114) fail("nuzūl order is not a permutation of 1..114 (duplicates)");
for (let id = 1; id <= 114; id++) if (!order[id]) fail(`sūra ${id} missing from nuzūl order`);
if (MADANI.size !== 28) fail(`Medinan set has ${MADANI.size}, expected 28`);
const makki = Object.values(surahs).filter((s) => s.place === "makki").length;
if (makki !== 86) fail(`${makki} Meccan sūras, expected 86`);
if (JUZ.length !== 30) fail(`${JUZ.length} juzʾ, expected 30`);
if (SAJDA.length !== 15) fail(`${SAJDA.length} sajdas, expected 15`);

if (!existsSync("public/data")) mkdirSync("public/data", { recursive: true });
const out = {
  note: "Revelation place + nuzūl order: Cairo (Egyptian standard) chronology — traditional, not certain. Juzʾ + sajda: standard Ḥafṣ positions.",
  surahs, juz: JUZ, sajda: SAJDA,
};
writeFileSync("public/data/surah-meta.json", JSON.stringify(out));
console.log(`Surah meta: 114 sūras (${makki} Meccan / ${114 - makki} Medinan), ${JUZ.length} juzʾ, ${SAJDA.length} sajdas → public/data/surah-meta.json`);
