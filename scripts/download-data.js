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

const KFGQPC_BASE =
  "https://raw.githubusercontent.com/thetruetruth/quran-data-kfgqpc/main";

const NARRATIONS = [
  { key: "hafs", json: "hafs/data/hafsData_v18.json", font: "hafs/font/hafs.18.woff2" },
  { key: "warsh", json: "warsh/data/warshData_v10.json", font: "warsh/font/warsh.10.woff2" },
  { key: "qaloon", json: "qaloon/data/QaloonData_v10.json", font: "qaloon/font/qaloon.10.woff2" },
  { key: "shouba", json: "shouba/data/ShoubaData08.json", font: "shouba/font/shouba.8.woff2" },
  { key: "doori", json: "doori/data/DooriData_v09.json", font: "doori/font/doori.9.woff2" },
  { key: "soosi", json: "soosi/data/SoosiData09.json", font: "soosi/font/soosi.9.woff2" },
  { key: "bazzi", json: "bazzi/data/BazziData_v07.json", font: "bazzi/font/bazzi.7.woff2" },
  { key: "qumbul", json: "qumbul/data/QumbulData_v07.json", font: "qumbul/font/qumbul.7.woff2" },
];

const dirs = [
  "data/source/kfgqpc",
  "public/fonts/kfgqpc",
];
for (const d of dirs) if (!existsSync(d)) mkdirSync(d, { recursive: true });

async function main() {
  // Tanzil
  console.log("Downloading Tanzil Uthmani XML...");
  const xml = await download(TANZIL_URL);
  writeFileSync("data/source/tanzil-uthmani.xml", xml);
  console.log(`  -> ${xml.length} bytes`);

  // KFGQPC
  for (const n of NARRATIONS) {
    console.log(`Downloading ${n.key} JSON...`);
    const json = await download(`${KFGQPC_BASE}/${n.json}`);
    writeFileSync(`data/source/kfgqpc/${n.key}.json`, json);
    console.log(`  -> ${json.length} bytes`);

    console.log(`Downloading ${n.key} WOFF2...`);
    const font = await download(`${KFGQPC_BASE}/${n.font}`);
    writeFileSync(`public/fonts/kfgqpc/${n.key}.woff2`, font);
    console.log(`  -> ${font.length} bytes`);
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
