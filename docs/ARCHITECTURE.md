# Architecture

A single-page React 19 app built with Vite. No runtime dependencies beyond
`react` / `react-dom`; everything else (graph build, force simulation, rendering,
analytics, i18n, persistence) is hand-rolled and unit-tested. This document maps
the code. For the user-facing behaviour see [FEATURES.md](FEATURES.md); for the
data it consumes see [DATA.md](DATA.md).

---

## Entry & providers

```
src/main.jsx
  └─ <I18nProvider>          language + direction (ar/rtl ↔ en/ltr)
     └─ <WorkspaceProvider>  the localStorage-backed notebook
        └─ <ErrorBoundary>   recoverable render-crash fallback
           └─ <QuranGraph/>  the whole app
```

`main.jsx` also registers the service worker (production only) for offline use.

`src/QuranGraph.jsx` (~1.5k lines) is the top-level component: it holds the
interaction state, builds the derived indices, drives the simulation, and renders
the toolbar, stage, inspector, and all modals. It is deliberately one large
component because nearly all of its state is mutually dependent (selection drives
the simulation drives the layout drives the URL…). The heavy, testable logic is
extracted into the modules below.

---

## State model (QuranGraph.jsx)

Persisted UI preferences use `usePersistedState` (localStorage + a sanitizer) and
are keyed `qg.*`: `surah`, `ayah`, `maxBranch`, `allowBig`, `hideStop`,
`showLoops`, `rareOnly`, `searchMode`, `precision`, `lexicon`, `morphFilter`,
`theme`, `renderer`, `stopExtra`, `stopDisabled`, plus `qg.lang` (i18n) and
`qg.workspace`.

Transient interaction state (not persisted): `expandedWords`, `expandedVerses`,
`selected`, `activeWord`, `hovered`, the view `transform`, drag/pan/pinch refs,
and the settled `positions` snapshot.

Derived indices are memoised from the loaded corpus:

- `verseData` — `{ "s:a": { text, s, a, sn, words[] } }`, the spine. Each word is
  `{ orig, norm, exact, proot, plemma }` (position-correct root/lemma once
  morphology loads).
- `w2v` / `r2v` / `l2v` — inverted indices (exact form / root / lemma → verse
  keys). `l2v` is null until lemmas load.
- `stopSet` — the effective hidden-word set (particles governed by the master
  toggle; content defaults + user words always apply, minus any re-enabled).

### Lazy loading

The graph renders immediately from the eager data (`quran-hafs.json` + `roots.json`)
and refines as deferred assets arrive:

- **lemmas** — on first use of lemma mode.
- **morphology** (~2.4 MB) — when the morphology filter is active, a node is
  selected, root/lemma mode is on, or an āya/sūra/corpus lab is open (their POS and
  iltifāt lenses need it). It upgrades grouping from majority-voted to position-correct
  per occurrence (splitting homographs).
- **lexicons** — the manifest, then the active lexicon's concise glosses, then
  individual full-article **shards** on "show more".
- **semantic-neighbours / relations / expressions** — loaded on first open of the lens
  that needs them (root/āya labs, corpus & expressions explorers, a selected word). All
  best-effort: a missing file degrades to an empty/hidden section, never an error.

---

## Graph pipeline: build → layout → render

### 1. Build (`src/graph/buildGraph.js`)

`buildLazyGraph(centerKey, verseData, w2v, r2v, expanded…, mode, VW, VH, opts)`
does a lazy BFS from the centre, following word→verse→word links only through the
expanded set. It returns `{ nodes, links, loopLinks, parentMap, omitted, truncated }`.
Child verses for a word are ranked by how many words they share with the centre
(most-related first), then capped at the per-word slider value; the remainder
becomes an **overflow** node. Helpers: `buildChildMap`, `getDescendants`,
`getPathToCenter` (used for subtree queries, drag, and highlight).

The graph is laid out in a **fixed 1600×1100 virtual canvas** (`VW`×`VH`), decoupled
from the viewport, so a window resize never rebuilds it or shifts settled nodes —
the pan/zoom transform maps that canvas onto the screen.

### 2. Force simulation (`src/graph/`)

A custom force model, shared between a batch and a live engine via
`forceConstants.js` (so they never drift):

- `simulation.js` — the live, decaying-alpha engine. Forces: parent-gravity
  (children orbit their parent word, not the global centre), Barnes-Hut long-range
  repulsion, an O(n) uniform-grid collision pass with label padding, and link
  springs. Supports node **pinning** (drag), **sticking** (drop), and a
  **selection gather** (a selected node's direct neighbours orbit it in a ring).
- `quadtree.js` — Barnes-Hut quadtree for repulsion (θ-approximation, iterative,
  deterministic — no `Math.random()`; seeding is hash-based).
- `forceLayout.js` — a synchronous batch version (~160 iterations) with the same
  forces, used where a settled layout is needed in one shot.
- `simWorker.js` + `simClient.js` — the simulation runs in a **Web Worker**.
  `createSimClient` returns a worker-backed client (positions stream back as a
  transferable `Float32Array`) and transparently falls back to an in-process
  client (`createLocalClient`) when Workers are unavailable (jsdom, tests).

The component feeds structure to the sim via `sim.sync(nodes, links)` on every
structural change; new nodes are pre-seeded in a phyllotaxis disk around their
parent's *current* position so expansions bloom into open space. The sim streams
positions back through `setOnTick`, which writes them imperatively (below) and
commits one React `setPositions` snapshot only when the layout **settles**.

### 3. Rendering — two backends

Positions update ~60×/s; pushing that through React state would re-render
constantly, so the hot path bypasses React:

- **SVG** (`components/GraphLayer.jsx`, default) — memoised nodes/links. The sim's
  per-frame positions are written straight to DOM attributes by
  `graph/applyPositions.js` via a stable `registry` of `Map`s populated by ref
  callbacks. Pan/hover/selection never re-render the whole layer. On large graphs
  (>700 nodes) off-screen nodes are **culled** to keep the DOM small.
- **Canvas** (`components/GraphCanvas.jsx`) — one canvas instead of N DOM nodes,
  for very large graphs. `graph/canvasRenderer.js` is a pure `drawScene(ctx, scene)`
  with level-of-detail (labels drop when zoomed out) and viewport culling. Since
  there's no per-node DOM, hit-testing uses a coarse grid index
  (`graph/spatialIndex.js`) over the settled positions. A visually-hidden,
  focusable mirror (capped) keeps it screen-reader accessible.

`components/nodeAria.js` generates the descriptive labels shared by both backends.

### 4. Export (`src/graph/exportGraph.js`)

Serialises the live SVG framed to its content bounding box: `exportSvgFile`,
`exportPngFile` (SVG→canvas→PNG). Also the data exporters used across modals:
`toCsv`/`exportCsvFile` (UTF-8 BOM for Excel Arabic), `exportJsonFile`,
`buildConcordance` (KWIC), and the citation builders `buildBibtex` / `buildRis`.
Because export serialises the DOM, the component briefly renders the *full* graph
(suspending culling, mounting the SVG even in canvas mode) for one frame first.

---

## Arabic & morphology

- `arabic-utils.js` — `norm()` reduces a token to a consonantal skeleton for
  *matching* (strips harakāt, unifies the alif/hamza family, folds ة→ه and ى→ي);
  `normStrict()` skips those folds for strict precision. The original token is
  always kept for display. Root/lemma lookups are pure map reads
  (`setRootMap`/`rootOf`, `setLemmaMap`/`lemmaOf`); `groupKey`/`wordGroupKey`
  resolve the active mode's key (position-correct when morphology is loaded). Also
  owns the two editable stop-word sets (`STOP_PARTICLES`, `STOP_CONTENT_DEFAULT`).
- `morphology.js` — decodes the columnar `morphology.json` tuples
  (`decodeMorph`, `morphAt`), derives position-correct grouping keys
  (`verseGroupingKeys`), and implements the morphology filter
  (`morphFilterActive`, `passesMorphFilter`, `filterOccurrencesByMorph`,
  `formRoman`, `morphFilterSummary`).
- `lexiconShard.js` — `shardOf(root)` (FNV-1a over the root, 64 buckets), the
  stable hash shared by the lexicon builder and the runtime loader.
- `theme.js` — the two themes and the colour scales: `fColor` (word by frequency),
  `dColor` (verse by depth), `rarityWeight`/`eColor`/`eWidth` (edges). Mirrored in
  CSS tokens via `styles/theme.css` (driven by `data-theme`).

---

## Analytics (`src/analytics/`)

Pure functions over the inverted indices and per-occurrence morphology, all unit-tested.
Each is the engine behind one lens; the heavier ones defer to idle in their modal.

- `stats.js` — `distributionBySura` (true token frequency), `association`
  (PMI + Dunning's signed log-likelihood), `collocations` (whole-verse window by
  default; narrower windows null out the significance scores), `directNeighbors`
  (position-aware ±1 adjacency / bigram counts, before + after; `opts.crossVerse`
  spans the āya boundary within a sūra), `mergeCollocations` (compare split).
- `phrases.js` — `buildSeedIndex` (corpus seed index, built lazily once) and
  `findSharedPhrases` (المتشابهات: maximal contiguous shared runs, sub-phrase-suppressed).
- `rhyme.js` — the fāṣila: a PAUSAL skeleton (no ى→ي fold; ة→ه), `rhymeKey` (strict
  ending) + `rawiyKey` (loose الروي), `suraRhymeScheme`, `rhymeMates`.
- `surah.js` — sūra altitude: `surahKeyness` (G² over the whole corpus), `surahCohesion` +
  `surahSelfSimilarity` (idf-weighted root overlap → topic boundaries / ring composition),
  `surahBonds` (الأواصر), `surahProfile`.
- `verse.js` — `verseProfile` (fingerprint) and `similarVerses` (idf-weighted shared-root cosine).
- `derivation.js` — `derivationFamily` (الصرف: a root's derived lemmas by Form/POS).
- `kinship.js` — `radicalKin` (الاشتقاق الأكبر: anagram / shared-radical roots).
- `iltifat.js` — `versePerson` + `suraIltifat` (الالتفات: grammatical person/number-shift
  contour + turns, off the morphology person tags).
- `diff.js` — `alignWords` (LCS) + `verseDiff` (minimal-pair word diff of near-identical verses).
- `letters.js` — `MUQATTAAT` (the 29 disjoined-letter openings) + `surahLetterProfile`
  (opening-letter over-representation vs the corpus).
- `corpus.js` — `rootFrequency`, `hapaxRoots`, `browseByMorph` (corpus-wide catalogues).
- `relations.js` — runtime readers over the lexical-relations map: `oppositesOf` /
  `candidatesOf` / `verseAntithesis` / `oppositesCatalogue` / `candidatesCatalogue`
  (الطباق — curated opposites plus machine-found, un-curated candidates).
- `names.js` — `divineNames` (a conservative أسماء الله index, keyed by attested surface form).
- `expressions.js` — runtime readers over the precomputed multi-word inventory (`expressions.json`):
  `indexExpressions` (reverse indices by head/root/verb), `frameContrast` (a head's
  governed-preposition contrast + the bare residual), `headRows` (the government matrix),
  `expressionsForRoot` (a root's frames / collocations / compounds, for the inline lenses),
  `indexByVerse` (verse → its expressions), `occVerses` / `distBySura` (التعدية · المصاحبات · الإضافة).
- `assoc.js` — the shared association math (single source for runtime + the offline miner):
  `g2` (signed Dunning log-likelihood), `pmi`, `logDice`, `association`, `sigTier`.
- `construction.js` — `frameOccIndex` + `definiteOf`: the morphology-filtered construction
  query (Form + voice + governed particle + a definiteness heuristic).
- `role.js` — `roleAt` + `roleBreakdown` (الموقع التركيبي: a syntactic-role *proxy* from case
  tags + local adjacency, with a confidence flag — not a dependency parse).
- `pairing.js` — `pairingMatrix` + `flattenPairs` (co-occurrence grid over two term sets).
- `valency.js` — `valencyProfile` (a verb's governed prepositions + nominal co-arguments,
  reshaped from the expressions inventory).
- `field.js` — `fieldStats` (aggregate a user-built semantic field's distribution).
- `rhetoric.js` — `rhetoricScan` (oaths القسم + conditionals الشرط, gated on morphology Forms).

---

## Hooks (`src/hooks/`)

| Hook | Role |
|------|------|
| `useCorpusIndices` | the derived data layer: builds `verseData` + the inverted indices (`w2v`/`r2v`/`l2v`), `searchAlias`, `compareIndices`, `orderedKeys`, and `stopSet` from the loaded corpus. A thin memoised binding over `src/corpusIndices.js`, which holds the actual derivation so the API server (`server/corpus.js`) builds byte-identical indices from the same code. |
| `usePersistedState` | localStorage state with a sanitizer; corrupt-/quota-safe. |
| `useUrlState` | encode/decode the full app state to the URL hash (compact keys, only non-defaults, sorted Sets, optional node positions). `readUrlState`/`writeUrlState` (debounced `replaceState`). |
| `useExplorationHistory` | undo/redo of discrete exploration steps (≤120), keyboard-bound. |
| `useWorkspace` | the notebook: items, notes, tags, fields, groups, and claims CRUD, dedupe, export/import, toast. |
| `useModalFocus` | WAI-ARIA dialog focus trap (Esc, Tab wrap, focus restore). |
| `useVirtualRows` | measured-row virtualization for the long lists (occurrences, context). |
| `useFields` / `useMyExpressions` / `useProposals` | semantic-field sets, user-saved expressions, and coding/claim proposals (workspace-backed). |
| `useSearchHistory` | recent searches surfaced in the empty search box. |
| `useBottomSheetDrag` | the drag-to-resize gesture for mobile bottom-sheet dialogs. |
| `useMediaQuery` / `useReveal` | compact-layout detection and idle-deferred reveal of heavy lists. |

---

## i18n (`src/i18n/`)

A lightweight flat string table with a `t(key, vars)` lookup and `{var}`
interpolation. Arabic is the source language *and* the fallback (an unknown or
missing key falls back to Arabic, then to the raw key), so a component rendered
without the provider still shows Arabic. `index.js` exposes `useI18n()` →
`{ lang, dir, t, setLang }` and flips the document `lang`/`dir`. Strings are split
into namespaced topic modules (`common`, `help`, `occ`, `dist`, `cmp`, `ctx`,
`phrase`, `morph`, `stop`, `ws`, `lab`, `work`, `tour`, `ui`, `changelog`, `intro`)
merged in `strings.js`. Only the app chrome is translated — never the Qurʾān,
morphology, or glosses. (The release content in `changelog.js` carries its own
per-entry `{ ar, en }` strings rather than going through `t()`.)

---

## File map

```
src/
  main.jsx                 entry + providers + SW registration
  QuranGraph.jsx           top-level component (state, interaction, render)
  arabic-utils.js          norm/normStrict, root/lemma lookup, stop words
  morphology.js            columnar morphology decode + filter
  theme.js                 themes + frequency/depth/edge colour scales
  lexiconShard.js          stable shard hash (shared with the builder)
  corpusIndices.js         PURE index derivation — shared by the app and the API server
  onboarding.js            direct-visit vs shared-link gate for the welcome/tour
  data-loader.js           cached BASE_URL-relative JSON fetches
  styles/theme.css         CSS design tokens (data-theme driven)
  graph/
    buildGraph.js          lazy BFS graph builder + traversal helpers
    forceConstants.js      shared force-model constants
    forceLayout.js         synchronous batch force layout
    simulation.js          live decaying-alpha engine (gather/pin/stick)
    quadtree.js            Barnes-Hut repulsion
    simWorker.js           runs the sim in a Web Worker
    simClient.js           worker client + in-process fallback
    applyPositions.js      imperative SVG position writes
    canvasRenderer.js      pure canvas paint (LOD + culling)
    spatialIndex.js        grid hit-testing for canvas mode
    exportGraph.js         SVG/PNG/CSV/JSON/BibTeX/RIS/KWIC export
  components/
    GraphLayer.jsx         memoised SVG renderer
    GraphCanvas.jsx        canvas renderer + a11y mirror
    HighlightedAyah.jsx    verse text with clickable/highlighted words
    nodeAria.js            shared screen-reader node labels
    OccurrencesModal · ContextModal · DistributionModal · CompareModal
    PhraseModal · DefinitionModal · HelpModal              analysis/reading modals
    RhymeModal · RootLabModal · AyaLabModal · SurahLabModal · CorpusLabModal
    ExpressionsModal                                       the labs & explorers
    ConstructionModal · PairingModal · ClaimBoard          the research workbench
    MorphologyFilter · StopWordEditor · VerseFilter        tool panels
    SurahSelect · ToolbarMenu · ModalShell · DisclosurePanel   shared chrome
    WorkspaceDrawer · StickyNotes                          the notebook UI
    ArabicKeyboard.jsx                                     phonetic Latin→Arabic input
    Tour.jsx · WhatsNewModal.jsx                           onboarding + changelog
    ErrorBoundary.jsx
  keyboard/  translit.js (Latin→Arabic map) · editable.js (in-field rewrite)
  hooks/   usePersistedState · useUrlState · useExplorationHistory · useCorpusIndices
           useWorkspace · useModalFocus · useVirtualRows · useFields · useMyExpressions
           useProposals · useSearchHistory · useBottomSheetDrag · useMediaQuery · useReveal
  analytics/  stats · assoc · phrases · rhyme · surah · verse · derivation · kinship ·
              iltifat · diff · letters · corpus · relations · names · expressions ·
              construction · role · pairing · valency · field · rhetoric
  i18n/    index.js · strings.js · common/help/occ/dist/cmp/ctx/phrase/morph/stop/
           ws/lab/work/tour/ui/changelog/intro
scripts/   data pipeline (see DATA.md)
server/    the HTTP API (see API.md) — node:http, zero runtime deps
  index.js       request pipeline + route registration
  config.js      env-driven configuration
  corpus.js      loads public/data/ and builds the indices via src/corpusIndices.js
  links.js       the ui… deep links, built with the app's own encodeState
  terms.js       query → canonical term, and the response shapes
  http.js        router · query validation · paging · CSV · envelope · errors
  auth.js        optional API keys + per-IP rate limiting
  params.js      the parameter vocabulary, declared once
  schemas.js     OpenAPI component schemas (the real response shapes)
  openapi.js     the spec, generated from the route table
  docs.js        the prose reference at /guide
  explorer.js + explorer/   the interactive explorer at /docs (HTML+CSS+JS, inlined)
  routes/        meta · corpus · lexical · analysis · expressions · graph
```

### The API shares the app's code, it does not re-implement it

`server/` imports `src/analytics/*`, `src/graph/buildGraph.js`, `src/search.js` and
`src/morphology.js` directly, and builds its indices from the same
`src/corpusIndices.js` the `useCorpusIndices` hook wraps. That extraction is the point:
"which āyāt contain this root" has one implementation, so an API answer and the on-screen
answer cannot drift. Likewise `server/links.js` encodes its `ui…` URLs with
`src/hooks/useUrlState.js` — the same function the share button uses.

### One declaration drives the code, the spec and the docs

Each route registers its parameters (from `server/params.js`) and a response schema name
(from `server/schemas.js`) alongside its handler. `openapi.js` turns that into the OpenAPI
document, and the explorer at `/docs` builds its forms from that same document — so an
endpoint cannot be documented one way and typed another, and a new route appears in the
docs the moment it is registered. The handlers still validate independently (`http.js`):
the spec is a promise, validation is enforcement.

Tests live next to their modules as `*.test.{js,jsx}`. Most run in Node; component
tests opt into jsdom with a `// @vitest-environment jsdom` pragma.
