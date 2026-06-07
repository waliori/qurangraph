<div align="center">

<img src="public/logomark.svg" alt="" width="92" height="92" />

# QuranGraph · آيات.network

**An interactive, force-directed graph of the Qurʾān — explore where the text reuses the same word, lemma, and root.**

</div>

Pick a verse and it becomes
the centre of a network; expand its words to discover every other verse that
shares the same **word**, the same **lemma** (صيغة), or the same triliteral
**root** (جذر) — and keep expanding outward. A pure Qurʾān↔Qurʾān + Arabic-language
research tool: every link is *lexical* (shared surface form / lemma / root). There
is **no** interpretive verse-to-verse cross-referencing and **no** translation layer.

The app ships as a fully client-side, installable **PWA** (works offline after
first load). The graph physics run in a **Web Worker**; rendering is **SVG** for
moderate graphs and switches to **Canvas** for large ones. The whole UI is
bilingual — **Arabic (RTL)** and **English (LTR)** — though the Qurʾanic text,
morphology, and lexicon glosses are never translated.

> `qurangraph` is the repository/codename; **آيات.network** is the product name in
> the UI. This is the **simple-graph** edition: the old multi-reading (qirāʾāt)
> feature and its KFGQPC data/fonts have been removed; only the Ḥafṣ word graph
> remains.

---

## Highlights

- **Three grouping modes** — exact surface form · lemma · root — with a **matching
  precision** toggle (loose folds آية/اية; strict keeps them distinct).
- **Morphology** from the Quranic Arabic Corpus: filter the graph by part of
  speech / verb Form (وزن) / aspect / voice, and read a word's full per-occurrence
  analysis in the inspector. Homographs are grouped by their commoner root but
  flagged when *this* occurrence's root differs.
- **Three classical Arabic lexicons** — Maqāyīs (Ibn Fāris), Mufradāt (al-Rāghib),
  Lisān al-ʿArab (Ibn Manẓūr) — swappable per word, concise + full article, with
  print volume/page citation and **BibTeX/RIS** export.
- **Analytics** — distribution by sūrah, within-verse **collocation** (PMI + signed
  log-likelihood), **direct neighbours** (the word immediately before/after a term,
  corpus-wide adjacency), two-term **compare**, and shared multi-word phrases
  (المتشابهات). Everything exports to **CSV/JSON**.
- **Rarity-weighted edges** (rarer shared word = stronger signal) + a "rare links
  only" filter, and an **editable stop-word layer** (particles vs. content words).
- **Workspace** — a client-side researcher's notebook: save graph snapshots,
  occurrences, distributions, comparisons, lexicon entries, verses, and phrases;
  write free-text notes and pin **sticky notes** onto graph nodes; export/import
  the whole workspace as JSON.
- **Shareable deep-link URLs** (encode the entire graph state, including the exact
  node layout), **PNG/SVG export**, **undo/redo** of exploration, and full
  keyboard/screen-reader accessibility.
- Pan, zoom, drag nodes, light/dark themes — all in the browser, offline-capable.

## The Qurʾān text

The base text is the **Ḥafṣ ʿan ʿĀṣim** reading (the standard Uthmani text). It
comes from **[Tanzil](https://tanzil.net)**'s `quran-uthmani.xml`, parsed to
`public/data/quran-hafs.json` — 114 sūrahs, 6236 āyāt, with the basmala counted as
āyah 1 of al-Fātiḥah (Kufan/Ḥafṣ numbering).

---

## Quick start

```bash
npm install

# Reconstruct the runtime data from the tracked source corpora (one-time;
# the derived JSON is NOT committed — see "Data" below). No network needed.
npm run data:transform && npm run data:roots && npm run data:lexicons && npm run data:manifest

npm run dev        # Vite dev server
```

Other scripts:

```bash
npm run build      # production build → dist/
npm run preview    # serve the production build
npm run lint       # eslint
npm test           # unit tests (vitest)
```

The source corpora live in `data/source/` and **are tracked in git**, so you do
*not* need to download anything to build. Use `npm run data:build` only if you
want to re-fetch the upstream corpora from scratch (it runs `data:download` first).

### Run with Docker

```bash
docker build -t qurangraph .
docker run -p 8080:80 qurangraph   # → http://localhost:8080
```

The image reconstructs the data from `data/source/` and serves the static build
through nginx (no network at build time unless a corpus is missing).

---

## Documentation

| Doc | What's inside |
|-----|---------------|
| [docs/FEATURES.md](docs/FEATURES.md) | End-user guide: every mode, panel, modal, and analysis view. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code map: state model, graph build → layout → render pipeline, i18n, hooks. |
| [docs/DATA.md](docs/DATA.md) | The data pipeline: source corpora → derived JSON, file formats, coverage. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | PWA/service worker, Docker, nginx, CSP, CI. |

## Sources & licences

- **Text** — Tanzil Uthmani (Ḥafṣ). Tanzil terms (free, non-commercial).
- **Roots / lemmas / morphology** — [Quranic Arabic Corpus](https://corpus.quran.com)
  morphology (Arabic-script mirror `mustafa0x/quran-morphology`). GNU GPL.
- **Lexicons** ([OpenITI](https://github.com/OpenITI) digitisations, CC-BY-SA):
  *Muʿjam Maqāyīs al-Lugha*, Ibn Fāris (d. 395 AH); *Mufradāt fī Gharīb al-Qurʾān*,
  al-Rāghib al-Iṣfahānī (d. 502 AH); *Lisān al-ʿArab*, Ibn Manẓūr (d. 711 AH).

Each rebuild records the exact upstream revisions + checksums it shipped in
`public/data/sources.json` (see [docs/DATA.md](docs/DATA.md)).
