import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { SOURCES, sha256 } from "./lib/sources.js";

/* ═══ Provenance manifest ═══
 *
 * Records, for the build that's actually shipping, exactly which revision + checksum of
 * each upstream corpus was used — surfaced in-app (Help → "Data sources & versions") so
 * a reader can cite and reproduce the dataset.
 *
 * Crucially this hashes the files ON DISK in data/source/, so it's correct on EVERY
 * build path: the local `data:download` path AND the Dockerfile path (which copies the
 * committed corpora in and never runs the downloader). It's part of the data pipeline,
 * not the downloader, precisely so the manifest ships in the production image.
 *
 * For byte-reproducible builds, pin the source refs (QG_<ID>_REF=<sha>) — the recorded
 * `ref` then names the exact commit and `sha256` lets anyone verify the file. */
if (!existsSync("public/data")) mkdirSync("public/data", { recursive: true });

const sources = SOURCES.map((s) => {
  const base = { id: s.id, label: s.label, repo: s.repo, ref: s.ref, path: s.path };
  try {
    const buf = readFileSync(s.out);
    return { ...base, bytes: buf.length, sha256: sha256(buf) };
  } catch {
    // An optional (non-core) source that wasn't fetched — record it as absent.
    return { ...base, skipped: true };
  }
});

// builtAt is read from SOURCE_DATE_EPOCH when set (reproducible builds), else "now".
const epoch = process.env.SOURCE_DATE_EPOCH;
const builtAt = (epoch ? new Date(Number(epoch) * 1000) : new Date()).toISOString();

writeFileSync("public/data/sources.json", JSON.stringify({ builtAt, sources }, null, 2));
const present = sources.filter((s) => !s.skipped).length;
console.log(`Sources manifest -> public/data/sources.json (${present}/${sources.length} sources present)`);
