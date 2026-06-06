import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

/* ── Tanzil XML → quran-hafs.json ── */
const xml = readFileSync("data/source/tanzil-uthmani.xml", "utf8");
const surahs = [];
const suraRe = /<sura\s+index="(\d+)"\s+name="([^"]+)">([\s\S]*?)<\/sura>/g;
const ayaRe = /<aya\s+index="(\d+)"\s+text="([^"]+)"[^/]*\/>/g;

let sm;
while ((sm = suraRe.exec(xml))) {
  const [, idx, name, body] = sm;
  const verses = [];
  let am;
  while ((am = ayaRe.exec(body))) {
    verses.push({ id: +am[1], text: am[2] });
  }
  surahs.push({ id: +idx, name, total_verses: verses.length, verses });
}

/* ── Shape assertion ──
 * The Tanzil Uthmani (Hafs) text is a fixed, canonical corpus: exactly 114
 * surahs and 6236 āyahs. Assert it so an upstream format change (renamed tags,
 * truncated download, encoding shift) can never silently ship a partial Quran. */
const EXPECTED_SURAHS = 114, EXPECTED_AYAHS = 6236;
const totalAyahs = surahs.reduce((s, c) => s + c.verses.length, 0);
if (surahs.length !== EXPECTED_SURAHS || totalAyahs !== EXPECTED_AYAHS) {
  console.error(
    `ERROR: Hafs corpus shape mismatch — got ${surahs.length} surahs / ${totalAyahs} ayahs, ` +
    `expected ${EXPECTED_SURAHS} surahs / ${EXPECTED_AYAHS} ayahs. ` +
    `The source XML likely changed format or downloaded incompletely; refusing to ship truncated data.`
  );
  process.exit(1);
}

if (!existsSync("public/data")) mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/quran-hafs.json", JSON.stringify(surahs));
console.log(`Tanzil: ${surahs.length} surahs, ${totalAyahs} ayas → public/data/quran-hafs.json`);
