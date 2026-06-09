import { createHash } from "node:crypto";
import { get } from "node:https";

/* ═══ Upstream source descriptors (single source of truth) ═══
 *
 * Shared by the downloader (scripts/download-data.js — which fetches these) and the
 * provenance-manifest builder (scripts/build-sources-manifest.js — which records, for
 * the SHIPPED build, exactly which revision + checksum of each source was used). Keeping
 * one list means the two can never disagree about where a corpus came from.
 *
 * Each source is pinned to a git ref here. The defaults track the branches the build
 * currently follows so nothing breaks; for byte-reproducible builds, pin to commit SHAs
 * via the env var QG_<ID>_REF (e.g. QG_TANZIL_REF=abc123). `core: true` sources fail the
 * build if they can't be obtained; the extra lexicons are best-effort. */
const ref = (id, dflt) => process.env[`QG_${id}_REF`] || dflt;

export const SOURCES = [
  { id: "tanzil", label: "Tanzil Uthmani (Hafs) — Qur'an text", repo: "q-ran/quran", ref: ref("TANZIL", "master"),
    path: "sources/1.0/quran-uthmani.xml", out: "data/source/tanzil-uthmani.xml", core: true },
  // Per-word morphology (incl. ROOT) — Quranic Arabic Corpus, Arabic-script mirror.
  { id: "morphology", label: "Quranic Arabic Corpus morphology", repo: "mustafa0x/quran-morphology", ref: ref("MORPHOLOGY", "master"),
    path: "quran-morphology.txt", out: "data/source/quran-morphology.txt", core: true },
  // Kitab al-'Ayn (al-Khalil b. Ahmad al-Farahidi, d.170) — OpenITI (JK). First Arabic lexicon.
  { id: "ayn", label: "Kitāb al-ʿAyn (al-Khalīl, d.170)", repo: "OpenITI/0175AH", ref: ref("AYN", "master"),
    path: "data/0170KhalilFarahidi/0170KhalilFarahidi.Cayn/0170KhalilFarahidi.Cayn.JK000930-ara1",
    out: "data/source/ayn.txt", core: false },
  // al-Sihah Taj al-Lugha (al-Jawhari, d.393) — OpenITI digitisation (Shamela 23235).
  { id: "sihah", label: "al-Ṣiḥāḥ (al-Jawharī, d.393)", repo: "OpenITI/0400AH", ref: ref("SIHAH", "master"),
    path: "data/0393IbnHammadJawhari/0393IbnHammadJawhari.SihahTajLugha/0393IbnHammadJawhari.SihahTajLugha.Shamela0023235-ara1",
    out: "data/source/sihah.txt", core: false },
  // Mu'jam Maqayis al-Lugha (Ibn Faris, d.395) — OpenITI digitisation (Shamela 21710).
  { id: "maqayis", label: "Maqāyīs al-Lugha (Ibn Fāris, d.395)", repo: "OpenITI/0400AH", ref: ref("MAQAYIS", "master"),
    path: "data/0395IbnFarisQazwini/0395IbnFarisQazwini.MucjamMaqayis/0395IbnFarisQazwini.MucjamMaqayis.Shamela0021710-ara1",
    out: "data/source/maqayis.txt", core: true },
  // al-Muhkam wa al-Muhit al-A'zam (Ibn Sida, d.458) — OpenITI digitisation (Shamela 9757). Phonetically ordered.
  { id: "muhkam", label: "al-Muḥkam (Ibn Sīda, d.458)", repo: "OpenITI/0475AH", ref: ref("MUHKAM", "master"),
    path: "data/0458IbnSidaMursi/0458IbnSidaMursi.MuhkamWaMuhit/0458IbnSidaMursi.MuhkamWaMuhit.Shamela0009757-ara1",
    out: "data/source/muhkam.txt", core: false },
  // Al-Mufradat fi Gharib al-Qur'an (al-Raghib al-Isfahani, d.502) — OpenITI (JK).
  { id: "mufradat", label: "al-Mufradāt (al-Rāghib al-Iṣfahānī, d.502)", repo: "OpenITI/0525AH", ref: ref("MUFRADAT", "master"),
    path: "data/0502RaghibIsbahani/0502RaghibIsbahani.Mufradat/0502RaghibIsbahani.Mufradat.JK001150-ara1",
    out: "data/source/mufradat.txt", core: false },
  // Lisan al-'Arab (Ibn Manzur, d.711) — OpenITI (JK). Large (~25MB).
  { id: "lisan", label: "Lisān al-ʿArab (Ibn Manẓūr, d.711)", repo: "OpenITI/0725AH", ref: ref("LISAN", "master"),
    path: "data/0711IbnManzurIfriqi/0711IbnManzurIfriqi.LisanCarab/0711IbnManzurIfriqi.LisanCarab.JK000880-ara1",
    out: "data/source/lisan.txt", core: false },
];

export const raw = (repo, r, path) => `https://raw.githubusercontent.com/${repo}/${r}/${path}`;
export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export const isSha = (r) => /^[0-9a-f]{40}$/i.test(r || "");

/* Resolve a branch/tag ref to the commit SHA it currently points at, so the build can
 * record (and download) the EXACT revision instead of a moving branch label — making
 * `data:download` reproducible by default, not only when QG_<ID>_REF is set to a SHA.
 * Best-effort: on any failure (offline, rate-limited, non-200) it returns the ref
 * unchanged so the build still works. Honours GITHUB_TOKEN to dodge the 60/hr limit. */
export function resolveRef(repo, ref) {
  if (isSha(ref)) return Promise.resolve(ref);
  return new Promise((resolve) => {
    const headers = { "User-Agent": "qurangraph-build", Accept: "application/vnd.github.sha" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const req = get(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`, { headers }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(ref); return; }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(isSha(body.trim()) ? body.trim() : ref));
    });
    req.setTimeout(15000, () => req.destroy());
    req.on("error", () => resolve(ref));
  });
}
