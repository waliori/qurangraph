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

/* ── KFGQPC JSON → per-narration app JSON ── */
const NARRATIONS = ["hafs", "warsh", "qaloon", "shouba", "doori", "soosi", "bazzi", "qumbul"];

if (!existsSync("public/data/kfgqpc")) mkdirSync("public/data/kfgqpc", { recursive: true });

// Strip trailing verse number from aya_text (e.g. "... ١" → "...")
function stripAyaNum(text) {
  return text.replace(/\s+[\u0660-\u0669\u06F0-\u06F9٠-٩0-9]+\s*$/, "").trim();
}

for (const key of NARRATIONS) {
  const raw = JSON.parse(readFileSync(`data/source/kfgqpc/${key}.json`, "utf8"));
  const isHafs = key === "hafs";
  const bySura = {};

  for (const entry of raw) {
    const sura = isHafs ? entry.sora : entry.sura_no;
    const suraName = entry.sora_name_ar || entry.sura_name_ar;
    if (!bySura[sura]) bySura[sura] = { id: sura, name: suraName.trim(), verses: [] };
    bySura[sura].verses.push({
      id: entry.aya_no,
      text: stripAyaNum(entry.aya_text),
      ...(isHafs && entry.aya_text_emlaey ? { emlaey: entry.aya_text_emlaey } : {}),
    });
  }

  const out = Object.values(bySura)
    .sort((a, b) => a.id - b.id)
    .map((s) => ({ ...s, total_verses: s.verses.length }));

  writeFileSync(`public/data/kfgqpc/${key}.json`, JSON.stringify(out));
  const totalAyas = out.reduce((s, c) => s + c.verses.length, 0);
  console.log(`${key}: ${out.length} surahs, ${totalAyas} ayas → public/data/kfgqpc/${key}.json`);
}
