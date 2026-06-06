import { writeFileSync, mkdirSync, existsSync } from "fs";
import { get } from "https";

function download(url) {
  return new Promise((resolve, reject) => {
    const follow = (u) =>
      get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`${res.statusCode} for ${u}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      });
    follow(url);
  });
}

const TANZIL_URL =
  "https://raw.githubusercontent.com/q-ran/quran/master/sources/1.0/quran-uthmani.xml";

// Per-word morphology (incl. ROOT) — Quranic Arabic Corpus, Arabic-script mirror.
const MORPHOLOGY_URL =
  "https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt";

// Mu'jam Maqayis al-Lugha (Ibn Faris, d.395) — OpenITI digitisation (Shamela 21710).
const MAQAYIS_URL =
  "https://raw.githubusercontent.com/OpenITI/0400AH/master/data/0395IbnFarisQazwini/0395IbnFarisQazwini.MucjamMaqayis/0395IbnFarisQazwini.MucjamMaqayis.Shamela0021710-ara1";

if (!existsSync("data/source")) mkdirSync("data/source", { recursive: true });

async function main() {
  console.log("Downloading Tanzil Uthmani XML...");
  const xml = await download(TANZIL_URL);
  writeFileSync("data/source/tanzil-uthmani.xml", xml);
  console.log(`  -> ${xml.length} bytes`);

  console.log("Downloading Quran word morphology (roots)...");
  const morph = await download(MORPHOLOGY_URL);
  writeFileSync("data/source/quran-morphology.txt", morph);
  console.log(`  -> ${morph.length} bytes`);

  console.log("Downloading Maqayis al-Lugha (Ibn Faris)...");
  const maqayis = await download(MAQAYIS_URL);
  writeFileSync("data/source/maqayis.txt", maqayis);
  console.log(`  -> ${maqayis.length} bytes`);

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
