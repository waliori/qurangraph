# QuranGraph

An interactive force-directed graph of the Qur'an. Pick a verse and it becomes
the centre of a network; expand its words to discover every other verse that
shares the same word, the same **lemma** (صيغة), or the same triliteral **root** —
and keep expanding outward. A pure Qur'an↔Qur'an + Arabic-language research tool:
all links are *lexical* (shared surface form / lemma / root); there is no
interpretive verse-to-verse cross-referencing and no translation layer.

**Features**

- **Three grouping modes** — exact surface form · lemma · root — plus a **matching
  precision** toggle (loose folds آية/اية; strict keeps them distinct).
- **Morphology**, from the Quranic Arabic Corpus: filter the graph by part of
  speech / Form (وزن) / aspect / voice, and read a word's full morphology
  (root, lemma, form, tense, voice, mood, person/gender/number/case) in the inspector.
- **Multiple Arabic lexicons** — Maqāyīs (Ibn Fāris), Mufradāt (al-Rāghib),
  Lisān al-ʿArab (Ibn Manẓūr) — swappable per word; each labelled as one source.
- **Rarity-weighted edges** (rarer shared word = stronger signal) + a "rare links
  only" filter; an **editable stop-word layer** (particles vs. content words).
- **Distribution-by-sūrah** and within-verse **collocation** views; **CSV** export.
- **Shareable URL state** (deep-link any graph), **PNG/SVG export**, and an
  installable **PWA** (works offline after first load).
- Pan, zoom, drag nodes, switch light/dark — all in the browser.

## Quran text & reading

The base text is the **Ḥafṣ ʿan ʿĀṣim** reading (the standard Uthmani text used
in most of the world). It comes from **[Tanzil](https://tanzil.net)**'s
`quran-uthmani.xml` (via the `q-ran/quran` mirror), parsed to
`public/data/quran-hafs.json` — 114 sūrahs, 6236 āyāt, with basmala counted as
āyah 1 of al-Fātiḥah (the Kufan/Ḥafṣ numbering).

> This branch is the **simple graph** edition. The multi-reading (qirā'āt)
> feature and its KFGQPC data/fonts have been removed; only the Hafs word graph
> remains.

## Develop

```bash
npm install
npm run dev        # start Vite dev server
npm run build      # production build → dist/
npm run preview    # serve the production build
npm run lint       # eslint
npm test           # unit tests (vitest)
```

## Data pipeline

Everything the app needs at runtime is committed under `public/data/`:
`quran-hafs.json` (text), `roots.json` (word→root), `lemmas.json` (word→lemma),
`morphology.json` (columnar per-token morphology), and `lexicons/` (per-lexicon
root→meaning files + an `index.json` manifest). To regenerate from source:

```bash
npm run data:download   # fetch Tanzil + morphology + Maqayis + Mufradat + Lisan → data/source/
npm run data:transform  # XML → public/data/quran-hafs.json
npm run data:roots      # morphology → roots.json + lemmas.json + morphology.json
npm run data:lexicons   # dictionaries → public/data/lexicons/*.json (+ index.json)
# or all of them in order:
npm run data:build
```

`roots.json` / `lemmas.json` are built by aligning the per-word **Quranic Arabic
Corpus** morphology onto the Tanzil tokens (position-first, normalised-surface
fallback) and majority-voting per surface form. `morphology.json` keeps the full
per-token analysis (POS, lemma, Form, aspect, voice, mood, agreement, case),
dictionary-coded and verse-keyed to stay small. Each lexicon under `lexicons/`
extracts root→meaning from its source and aligns to the Qur'an's roots. Coverage
(printed by the builders): ≈65 % of tokens carry a root and ≈96 % a lemma (the
rest are particles/proper nouns); roots matched to a lexicon ≈92 % (Maqāyīs),
≈91 % (Lisān), ≈83 % (Mufradāt, Qur'an-scoped).

## Architecture

```
src/
  main.jsx                 React entry (wraps the app in an ErrorBoundary)
  QuranGraph.jsx           top-level component: state, interaction, rendering
  arabic-utils.js          norm() + precomputed root lookup + STOP words
  data-loader.js           fetch + cache the JSON artifacts (BASE_URL-relative)
  theme.js                 colour themes + frequency/depth colour scales
  hooks/
    usePersistedState.js   localStorage-backed, sanitized UI preferences
  components/
    HighlightedAyah.jsx    verse text with clickable / highlighted words
    GraphLayer.jsx         memoized SVG nodes/links (pan/hover don't re-render all)
    ErrorBoundary.jsx      recoverable fallback for render-time crashes
  graph/
    buildGraph.js          lazy graph builder + traversal helpers (buildChildMap)
    forceLayout.js          deterministic force-directed layout (spatial-hash grid)
scripts/                   data download / transform / root build (Node)
  lib/parse.js             morphology + Maqayis parsing helpers (unit-tested)
```

### How matching works

- **`norm()`** reduces a token to a consonantal skeleton for *matching* (strips
  harakat, unifies the alif/hamza family, folds `ة→ه` and `ى→ي`). The original
  token is always kept for *display*, so nothing is lost visually.
- **Roots are precomputed, not guessed.** `roots.json` (built from the Quranic
  Arabic Corpus) maps each normalised word form to its authoritative root;
  `rootOf()` / `rootKey()` are pure lookups. Tokens with no root (particles,
  proper nouns) are shown but left **ungrouped** in root mode.
- **Lemmas & morphology are precomputed too** — `lemmas.json` maps each form to
  its lemma (lemma mode groups inflections of one lemma but keeps distinct
  derivations of a shared root apart); `morphology.json` holds the per-token
  analysis the inspector displays and the morphology filter queries.
- Each root carries a **lexicon meaning** from the active dictionary under
  `lexicons/` (Maqāyīs / Mufradāt / Lisān), concise + expandable, shown and
  switchable in the word panel — each labelled as one language reference.
- Child verses for an expanded word are **ranked by how many words they share
  with the centre verse** (most-related first), then capped at the "per word"
  slider value. Edges are coloured by the connecting word's rarity.

## Sources & licences

- **Text** — Tanzil Uthmani (Ḥafṣ). Tanzil terms (free, non-commercial).
- **Roots / lemmas / morphology** — [Quranic Arabic Corpus](https://corpus.quran.com)
  morphology (Arabic-script mirror `mustafa0x/quran-morphology`). GNU GPL.
- **Lexicons** ([OpenITI](https://github.com/OpenITI) digitisations, CC-BY-SA):
  *Muʿjam Maqāyīs al-Lugha*, Ibn Fāris (d. 395 AH); *Mufradāt fī Gharīb al-Qurʾān*,
  al-Rāghib al-Iṣfahānī (d. 502 AH); *Lisān al-ʿArab*, Ibn Manẓūr (d. 711 AH).

## Interaction

- **Drag background** — pan. **Wheel / two-finger pinch** — zoom. **Drag a
  node** — move it (and its subtree). Touch, mouse and pen are all supported.
- **Click a word** (in a verse or the graph) — expand it; click again to
  collapse it and its branches.
- Verse / search-mode / theme / slider preferences persist in `localStorage`.
