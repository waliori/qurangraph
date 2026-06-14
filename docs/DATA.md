# Data pipeline

Everything the app serves under `public/data/` is **derived** from raw corpora by
the scripts in `scripts/`. The raw corpora live in `data/source/` and **are tracked
in git**; the derived JSON is **not** (it's in `.gitignore`) and must be
reconstructed after a fresh clone.

```
GitHub corpora  ──download──▶  data/source/*          (tracked in git)
                                    │
        ┌───────────────┬──────────┼───────────────────┐
   transform-data    build-roots   build-lexicons   build-sources-manifest
        │               │              │                 │
 quran-hafs.json   roots.json      lexicons/         sources.json
                   lemmas.json     (index + per-     (provenance:
                   morphology.json  lexicon + shards)  revs + checksums)
                                    ▼
                              public/data/  ──▶  the app (offline PWA)
```

## Build commands

```bash
# From the tracked source corpora — no network needed (the usual path):
npm run data:transform     # Tanzil XML → quran-hafs.json
npm run data:roots         # morphology → roots.json, lemmas.json, morphology.json
npm run data:lexicons      # dictionaries → lexicons/*.json (+ index.json)
npm run data:semantic      # distributional neighbours → semantic-neighbours.json
npm run data:relations     # antithesis + affinity → relations.json
npm run data:meta          # revelation place/order, juzʾ, sajda → surah-meta.json
npm run data:manifest      # record source revisions + checksums → sources.json

# Re-fetch the upstream corpora first, then build everything:
npm run data:download
npm run data:build         # download → transform → roots → lexicons → manifest
```

`data:download` and `data:build` are only needed to refresh the inputs; day to day
you build straight from `data/source/`.

---

## Source corpora (`scripts/lib/sources.js`)

`download-data.js` fetches these from GitHub (60 s timeout, redirect-following,
SHA-256 logged). Each ref is pinnable via `QG_<ID>_REF`. Core sources fail the
build if missing; optional ones warn and continue.

| id | Source | Repo | Output | Size | Core |
|----|--------|------|--------|------|------|
| `tanzil` | Tanzil Uthmani (Ḥafṣ) | `q-ran/quran` | `tanzil-uthmani.xml` | ~1.5 MB | ✓ |
| `morphology` | Quranic Arabic Corpus (Arabic mirror) | `mustafa0x/quran-morphology` | `quran-morphology.txt` | ~6.3 MB | ✓ |
| `ayn` | Kitāb al-ʿAyn, al-Khalīl b. Aḥmad | OpenITI | `ayn.txt` | ~3.5 MB | optional |
| `sihah` | al-Ṣiḥāḥ, al-Jawharī | OpenITI | `sihah.txt` | ~5.5 MB | optional |
| `maqayis` | Maqāyīs al-Lugha, Ibn Fāris | OpenITI | `maqayis.txt` | ~3.8 MB | ✓ |
| `muhkam` | al-Muḥkam, Ibn Sīda | OpenITI | `muhkam.txt` | ~10.6 MB | optional |
| `mufradat` | Mufradāt, al-Rāghib | OpenITI | `mufradat.txt` | ~2.0 MB | optional |
| `lisan` | Lisān al-ʿArab, Ibn Manẓūr | OpenITI | `lisan.txt` | ~30 MB | optional |

---

## Transformations

### `transform-data.js` → `quran-hafs.json`
Parses the Tanzil XML into an array of 114 sūrahs, each
`{ id, name, total_verses, verses: [{ id, text }] }`. **Asserts** exactly 114
sūrahs / 6236 āyāt — a hard failure on any format drift or truncated download.

```json
[ { "id": 1, "name": "الفاتحة", "total_verses": 7,
    "verses": [ { "id": 1, "text": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" }, … ] }, … ]
```

### `build-roots.js` → `roots.json`, `lemmas.json`, `morphology.json`
Aligns the Quranic Arabic Corpus morphology onto the Tanzil tokens
(position-first; normalised-surface fallback) and **majority-votes** the root and
lemma per surface form.

- `roots.json` — `{ normForm: root }` (the voted, grouping-level root).
- `lemmas.json` — `{ normForm: lemma }`.
- `morphology.json` — the **full per-occurrence** analysis, columnar and
  dictionary-coded to stay small: a `legend` (POS/aspect/voice/… value tables and
  the field order), shared `lemmas`/`roots` arrays, and `v: { "s:a": [tuple, …] }`
  where each integer tuple aligns 1:1 with that verse's kept words. The app
  decodes it positionally (`src/morphology.js`).

Coverage tripwires guard the alignment (root ≥ 45 %, lemma ≥ 85 %). Typical:
≈65 % of tokens carry a root, ≈96 % a lemma (the rest are particles/proper nouns).

### `build-lexicons.js` → `lexicons/`
Parses the three dictionaries, indexes each by root, and aligns to the Qurʾān's
roots (`matchRoot`: exact → geminate-collapse ربب→رب → alif/hamza fold). Outputs:

- `lexicons/<id>.json` — concise meanings: `{ root: { c, f, cite:{vol,page} } }`
  (`c` = concise gloss, `f` = fuller paragraph).
- `lexicons/<id>-full/<0…63>.json` — the **full articles**, split into 64 shards
  by `shardOf(root)` so "show more" fetches a few hundred KB, not the whole
  (multi-MB) dictionary.
- `lexicons/index.json` — the manifest the app loads first: per lexicon
  `{ id, label, license, edition{…}, hasFull, fullShards, coverage }`.

Coverage (roots matched, Qurʾān-scoped): Maqāyīs ≈92 %, Lisān ≈91 %, Ṣiḥāḥ ≈90 %,
Mufradāt ≈83 %, al-ʿAyn ≈79 %, Muḥkam ≈44 %. al-Muḥkam is low because its phonetic
(تقاليب) ordering only spells some roots out reliably — see `parseMuhkam`.

### `build-semantic.js` → `semantic-neighbours.json`
Distributional meaning by context: per-verse content-root bags → PPMI vectors → cosine
kNN → `{ root: [[neighbour, sim], …] }` (top 12). Firth's hypothesis over the Qurʾān's own
text — no external data. Conservative thresholds (MIN_DF 3, MAX_DF 25 %, MIN_SIM 0.08); the
UI frames the result as suggestive (small corpus).

### `build-antithesis.js` → `relations.json`
The lexical-relations pair scorer. Fuses (a) **relatedness** — the same PPMI cosine as above,
for any pair; (b) **polarity** — antithesis-frame mining across all verses (negation لا/ما set
against an adversative بل/لكن, position-aligned, within or across consecutive āyāt — the
فَلَا صَدَّقَ … وَلَٰكِن كَذَّبَ pattern) plus a curated seed of lexically-certain antonym roots.
Output: `{ byRoot, catalogue }` where each opposite pair carries its evidence verses; affinity =
distributionally close but un-contrasted (near-synonym). `seed:true` tags the curated pairs.

### `build-meta.js` → `surah-meta.json`
Curated structural reference (inlined, tracked): revelation place (مكية/مدنية) + nuzūl order
(Cairo standard), the 30 juzʾ starts, the 15 sajdas. Integrity-asserted (114 sūras, 86/28 split,
order is a 1..114 permutation). Chronology is offered as a tradition-based lens, not a datum.

### `build-sources-manifest.js` → `sources.json`
Records, for each file in `data/source/`, the repo/ref/path it came from plus its
byte count and SHA-256, with a `builtAt` timestamp (honours `SOURCE_DATE_EPOCH`
for reproducible builds). This is the citation/reproducibility record of exactly
which revisions shipped; it's decoupled from the downloader so Docker-built images
also get a correct manifest.

---

## Parsing helpers (`scripts/lib/parse.js`)

Unit-tested (`parse.test.js`) building blocks: `parseMorphology` /
`aggregateWord` (segment → stem morphology), `matchRoot` / `collapseGeminate`
(root-to-header fuzzy matching across editions), the per-format dictionary parsers
(`parseMaqayisEntry`, `parseLexiconText`, `parseSpacedRoot` for al-Muḥkam's
phonetically-ordered headers), and OpenITI metadata/page-milestone extraction
(`parseLexMeta`, `parsePageMarker`).

---

## Runtime loading (`src/data-loader.js`)

BASE_URL-relative fetches with a small in-memory cache, so the app works both at a
domain root and under a sub-path (e.g. GitHub Pages):

- eager: `loadHafsData`, `loadRoots`.
- lazy: `loadLemmas`, `loadMorphology`, `loadLexiconManifest`, `loadLexicon(id)`,
  `loadLexiconFullShard(id, shard)`, `loadSemanticNeighbors`, `loadRelations`,
  `loadSurahMeta`. The last three are optional — they resolve to `null`/`{}` if the build
  didn't emit them, so the lens hides its section rather than erroring.
