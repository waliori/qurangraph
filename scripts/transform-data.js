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

if (!existsSync("public/data")) mkdirSync("public/data", { recursive: true });
writeFileSync("public/data/quran-hafs.json", JSON.stringify(surahs));
console.log(`Tanzil: ${surahs.length} surahs, ${surahs.reduce((s, c) => s + c.verses.length, 0)} ayas → public/data/quran-hafs.json`);
