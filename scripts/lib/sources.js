import { createHash } from "node:crypto";

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
  // Mu'jam Maqayis al-Lugha (Ibn Faris, d.395) — OpenITI digitisation (Shamela 21710).
  { id: "maqayis", label: "Maqāyīs al-Lugha (Ibn Fāris, d.395)", repo: "OpenITI/0400AH", ref: ref("MAQAYIS", "master"),
    path: "data/0395IbnFarisQazwini/0395IbnFarisQazwini.MucjamMaqayis/0395IbnFarisQazwini.MucjamMaqayis.Shamela0021710-ara1",
    out: "data/source/maqayis.txt", core: true },
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
