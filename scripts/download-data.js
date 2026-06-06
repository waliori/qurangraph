import { writeFileSync, mkdirSync, existsSync } from "fs";
import { get } from "https";
import { createHash } from "node:crypto";

const TIMEOUT_MS = 60000;   // per-request socket timeout — never hang the build
const MAX_REDIRECTS = 10;   // cap redirect chains so a loop can't spin forever

function download(url) {
  return new Promise((resolve, reject) => {
    const follow = (u, redirects) => {
      if (redirects > MAX_REDIRECTS) {
        reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`));
        return;
      }
      const req = get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // drain the redirect body so the socket can be reused/freed
          follow(res.headers.location, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`${res.statusCode} for ${u}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      });
      // A socket timeout fires 'timeout' but does NOT abort the request — destroy
      // it explicitly so the build fails fast with a clear message instead of hanging.
      req.setTimeout(TIMEOUT_MS, () => {
        req.destroy(new Error(`Timed out after ${TIMEOUT_MS}ms for ${u}`));
      });
      // A connection-level failure surfaces on the request object, not on res, so
      // catch it here too — otherwise a socket error would throw unhandled.
      req.on("error", reject);
    };
    follow(url, 0);
  });
}

/* ── Source refs ──
 * Each source is pinned to a git ref here, in one place, so re-pinning (e.g. to a
 * specific commit SHA) is a one-line change. These default to the branches the
 * build currently tracks so nothing breaks. For reproducible builds these SHOULD
 * be pinned to commit SHAs rather than moving branches. Override per source with
 * the env var QG_<SOURCE>_REF (e.g. QG_TANZIL_REF=abc123). */
const REFS = {
  TANZIL: process.env.QG_TANZIL_REF || "master",
  MORPHOLOGY: process.env.QG_MORPHOLOGY_REF || "master",
  MAQAYIS: process.env.QG_MAQAYIS_REF || "master",
  MUFRADAT: process.env.QG_MUFRADAT_REF || "master",
  LISAN: process.env.QG_LISAN_REF || "master",
};

const raw = (repo, ref, path) => `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;

const TANZIL_URL = raw("q-ran/quran", REFS.TANZIL, "sources/1.0/quran-uthmani.xml");

// Per-word morphology (incl. ROOT) — Quranic Arabic Corpus, Arabic-script mirror.
const MORPHOLOGY_URL = raw("mustafa0x/quran-morphology", REFS.MORPHOLOGY, "quran-morphology.txt");

// Mu'jam Maqayis al-Lugha (Ibn Faris, d.395) — OpenITI digitisation (Shamela 21710).
const MAQAYIS_URL = raw("OpenITI/0400AH", REFS.MAQAYIS,
  "data/0395IbnFarisQazwini/0395IbnFarisQazwini.MucjamMaqayis/0395IbnFarisQazwini.MucjamMaqayis.Shamela0021710-ara1");

// Al-Mufradat fi Gharib al-Qur'an (al-Raghib al-Isfahani, d.502) — OpenITI (JK).
const MUFRADAT_URL = raw("OpenITI/0525AH", REFS.MUFRADAT,
  "data/0502RaghibIsbahani/0502RaghibIsbahani.Mufradat/0502RaghibIsbahani.Mufradat.JK001150-ara1");

// Lisan al-'Arab (Ibn Manzur, d.711) — OpenITI (JK). Large (~25MB).
const LISAN_URL = raw("OpenITI/0725AH", REFS.LISAN,
  "data/0711IbnManzurIfriqi/0711IbnManzurIfriqi.LisanCarab/0711IbnManzurIfriqi.LisanCarab.JK000880-ara1");

if (!existsSync("data/source")) mkdirSync("data/source", { recursive: true });

// Log byte size + sha256 so build reproducibility can be tracked across runs.
const report = (buf) => `${buf.length} bytes, sha256 ${createHash("sha256").update(buf).digest("hex")}`;

async function main() {
  console.log("Downloading Tanzil Uthmani XML...");
  const xml = await download(TANZIL_URL);
  writeFileSync("data/source/tanzil-uthmani.xml", xml);
  console.log(`  -> ${report(xml)}`);

  console.log("Downloading Quran word morphology (roots)...");
  const morph = await download(MORPHOLOGY_URL);
  writeFileSync("data/source/quran-morphology.txt", morph);
  console.log(`  -> ${report(morph)}`);

  console.log("Downloading Maqayis al-Lugha (Ibn Faris)...");
  const maqayis = await download(MAQAYIS_URL);
  writeFileSync("data/source/maqayis.txt", maqayis);
  console.log(`  -> ${report(maqayis)}`);

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
      console.log(`  -> ${report(buf)}`);
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
