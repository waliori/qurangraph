# QuranGraph

An interactive force-directed graph of the Qur'an. Pick a verse and it becomes
the centre of a network; expand its words to discover every other verse that
shares the same word — or the same triliteral **root** — and keep expanding
outward. Pan, zoom, drag nodes, switch light/dark, all in the browser.

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

The committed `public/data/quran-hafs.json` is all the app needs at runtime.
To regenerate it from source:

```bash
npm run data:download   # fetch Tanzil XML → data/source/
npm run data:transform  # XML → public/data/quran-hafs.json
# or both:
npm run data:build
```

## Architecture

```
src/
  main.jsx                 React entry
  QuranGraph.jsx           top-level component: state, interaction, rendering
  arabic-utils.js          norm() + extractRoot() + STOP words
  data-loader.js           fetch + cache the Quran JSON
  theme.js                 colour themes + frequency/depth colour scales
  components/
    HighlightedAyah.jsx    verse text with clickable / highlighted words
  graph/
    buildGraph.js          lazy graph builder + traversal helpers
    forceLayout.js          deterministic force-directed layout
scripts/                   one-off data download / transform (Node)
```

### How matching works

- **`norm()`** reduces a token to a consonantal skeleton for *matching* (strips
  harakat, unifies the alif/hamza family, folds `ة→ه` and `ى→ي`). The original
  token is always kept for *display*, so nothing is lost visually. This is an
  intentional matching heuristic, not a transliteration.
- **`extractRoot()`** is a heuristic triliteral stemmer (affix stripping +
  pattern rules) with a small curated override table for common Qur'anic words.
  It is correct for most regular forms but **not** a full morphological
  analyzer — irregular/weak/hamzated roots can be mis-stemmed. Swapping in a
  real analyzer (Farasa / AraMorph / ISRI) is the intended long-term upgrade.
- Child verses for an expanded word are **ranked by how many words they share
  with the centre verse** (most-related first), then capped at the "per word"
  slider value.

## Interaction

- **Drag background** — pan. **Wheel / two-finger pinch** — zoom. **Drag a
  node** — move it (and its subtree). Touch, mouse and pen are all supported.
- **Click a word** (in a verse or the graph) — expand it; click again to
  collapse it and its branches.
- Verse / search-mode / theme / slider preferences persist in `localStorage`.
