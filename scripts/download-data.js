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

if (!existsSync("data/source")) mkdirSync("data/source", { recursive: true });

async function main() {
  console.log("Downloading Tanzil Uthmani XML...");
  const xml = await download(TANZIL_URL);
  writeFileSync("data/source/tanzil-uthmani.xml", xml);
  console.log(`  -> ${xml.length} bytes`);

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
