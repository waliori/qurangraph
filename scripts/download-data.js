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

// Al-Mufradat fi Gharib al-Qur'an (al-Raghib al-Isfahani, d.502) — OpenITI (JK).
const MUFRADAT_URL =
  "https://raw.githubusercontent.com/OpenITI/0525AH/master/data/0502RaghibIsbahani/0502RaghibIsbahani.Mufradat/0502RaghibIsbahani.Mufradat.JK001150-ara1";

// Lisan al-'Arab (Ibn Manzur, d.711) — OpenITI (JK). Large (~25MB).
const LISAN_URL =
  "https://raw.githubusercontent.com/OpenITI/0725AH/master/data/0711IbnManzurIfriqi/0711IbnManzurIfriqi.LisanCarab/0711IbnManzurIfriqi.LisanCarab.JK000880-ara1";

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

  // Extra lexicons are best-effort: a failure (e.g. moved OpenITI path) shouldn't
  // break the core build, so each is caught and skipped.
  for (const [name, url, out] of [
    ["Mufradat (al-Raghib)", MUFRADAT_URL, "data/source/mufradat.txt"],
    ["Lisan al-'Arab (Ibn Manzur)", LISAN_URL, "data/source/lisan.txt"],
  ]) {
    try {
      console.log(`Downloading ${name}...`);
      const buf = await download(url);
      writeFileSync(out, buf);
      console.log(`  -> ${buf.length} bytes`);
    } catch (e) {
      console.warn(`  ! skipped ${name}: ${e.message}`);
    }
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
