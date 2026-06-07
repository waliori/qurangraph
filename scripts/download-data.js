import { writeFileSync, mkdirSync, existsSync } from "fs";
import { get } from "https";
import { SOURCES, raw, sha256, resolveRef } from "./lib/sources.js";

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

if (!existsSync("data/source")) mkdirSync("data/source", { recursive: true });

// Log byte size + sha256 so build reproducibility can be tracked across runs. The
// authoritative provenance manifest (public/data/sources.json) is written separately
// by scripts/build-sources-manifest.js, which hashes whatever is actually on disk — so
// it's correct whether the sources were downloaded here or copied in from git (the
// Dockerfile path, which uses the committed corpora and skips this script).
const report = (buf) => `${buf.length} bytes, sha256 ${sha256(buf)}`;

async function main() {
  const resolved = {}; // id → the exact commit SHA we actually pulled from
  for (const s of SOURCES) {
    try {
      const ref = await resolveRef(s.repo, s.ref);
      if (ref !== s.ref) console.log(`Pinned ${s.id}: ${s.ref} → ${ref}`);
      resolved[s.id] = ref;
      console.log(`Downloading ${s.label}...`);
      const buf = await download(raw(s.repo, ref, s.path));
      writeFileSync(s.out, buf);
      console.log(`  -> ${report(buf)}`);
    } catch (e) {
      if (s.core) throw e; // a core source failing must fail the build
      console.warn(`  ! skipped ${s.label}: ${e.message}`);
    }
  }
  // Record the resolved SHAs so the provenance manifest cites exact commits, not
  // branch labels (the Dockerfile/committed-corpora path simply won't have this file).
  writeFileSync("data/source/source-refs.json", JSON.stringify(resolved, null, 2));
  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
