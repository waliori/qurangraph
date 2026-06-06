# QuranGraph

An interactive force-directed graph of the Qur'an. Pick a verse and it becomes
the centre of a network; expand its words to discover every other verse that
shares the same word — or the same triliteral **root** — and keep expanding
outward. In root mode each root also shows its core meaning from Ibn Fāris's
*Maqāyīs al-Lugha*. Pan, zoom, drag nodes, switch light/dark, all in the browser.

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
`quran-hafs.json` (text), `roots.json` (word→root), `root-meanings.json`
(root→meaning). To regenerate from source:

```bash
npm run data:download   # fetch Tanzil XML + morphology + Maqayis → data/source/
npm run data:transform  # XML → public/data/quran-hafs.json
npm run data:roots      # morphology + Maqayis → roots.json + root-meanings.json
# or all three in order:
npm run data:build
```

`roots.json` is built by aligning the per-word **Quranic Arabic Corpus**
morphology onto the Tanzil tokens (position-first, normalised-surface
fallback). `root-meanings.json` extracts each root's opening sense from
**Maqāyīs al-Lugha**. The builder prints coverage (≈65 % of all tokens carry a
root — the rest are particles/proper nouns with none; ≈92 % of the Quran's
~1,650 roots are matched to a Maqāyīs entry).

## Architecture

```
src/
  main.jsx                 React entry
  QuranGraph.jsx           top-level component: state, interaction, rendering
  arabic-utils.js          norm() + precomputed root lookup + STOP words
  data-loader.js           fetch + cache the JSON artifacts
  theme.js                 colour themes + frequency/depth colour scales
  components/
    HighlightedAyah.jsx    verse text with clickable / highlighted words
  graph/
    buildGraph.js          lazy graph builder + traversal helpers
    forceLayout.js          deterministic force-directed layout
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
- Each root carries its **Ibn Fāris meaning** from `root-meanings.json` (concise
  sense + expandable full paragraph), shown in the word panel.
- Child verses for an expanded word are **ranked by how many words they share
  with the centre verse** (most-related first), then capped at the "per word"
  slider value.

## Sources & licences

- **Text** — Tanzil Uthmani (Ḥafṣ). Tanzil terms (free, non-commercial).
- **Roots** — [Quranic Arabic Corpus](https://corpus.quran.com) morphology
  (Arabic-script mirror `mustafa0x/quran-morphology`). GNU GPL.
- **Meanings** — *Muʿjam Maqāyīs al-Lugha*, Ibn Fāris (d. 395 AH); public-domain
  text via the [OpenITI](https://github.com/OpenITI) digitisation (CC-BY-SA).

## Interaction

- **Drag background** — pan. **Wheel / two-finger pinch** — zoom. **Drag a
  node** — move it (and its subtree). Touch, mouse and pen are all supported.
- **Click a word** (in a verse or the graph) — expand it; click again to
  collapse it and its branches.
- Verse / search-mode / theme / slider preferences persist in `localStorage`.
