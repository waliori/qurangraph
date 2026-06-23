import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useDeferredValue, useRef, lazy, Suspense } from "react";
import { looseResolve, verseSearch, buildContentIndex, romanResolve } from "./search.js";
import { latinSkeleton, isLatinQuery, arabicSkeletons } from "./romanize.js";
import { norm, groupKey, wordGroupKey, rootOf, setRootMap, setLemmaMap, setStopSet, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "./arabic-utils.js";
import { useCorpusIndices } from "./hooks/useCorpusIndices.js";
import { loadHafsData, loadRoots, loadLemmas, loadMorphology, loadLexiconManifest, loadLexicon, loadLexiconFullShard, loadSemanticNeighbors, loadRelations, loadExpressions, loadSources } from "./data-loader.js";
import { shardOf } from "./lexiconShard.js";
import { THEMES, fColor } from "./theme.js";
import { buildLazyGraph, buildChildMap, getDescendants, getPathToCenter } from "./graph/buildGraph.js";
import { createSimClient } from "./graph/simClient.js";
import { applyPositions } from "./graph/applyPositions.js";
import { morphAt, formRoman, morphFilterActive, morphFilterSummary, filterOccurrencesByMorph, EMPTY_MORPH_FILTER } from "./morphology.js";
import { serializeSvg, exportSvgFile, exportPngFile, buildBibtex, exportTextFile, setExportCorpusVersion } from "./graph/exportGraph.js";
import { readUrlState, writeUrlState, encodeState, decodeState } from "./hooks/useUrlState.js";
import { useWorkspace } from "./hooks/useWorkspace.js";
import { StickyNotes } from "./components/StickyNotes.jsx";
import { HighlightedAyah } from "./components/HighlightedAyah.jsx";
import { GraphLayer } from "./components/GraphLayer.jsx";
import { GraphCanvas } from "./components/GraphCanvas.jsx";
import { buildSpatialIndex, hitTest } from "./graph/spatialIndex.js";
import { MorphologyFilter } from "./components/MorphologyFilter.jsx";
import { SaveButton } from "./components/SaveButton.jsx";
import { StopWordEditor } from "./components/StopWordEditor.jsx";
import { ArabicKeyboard } from "./components/ArabicKeyboard.jsx";
import { SurahSelect } from "./components/SurahSelect.jsx";
import { buildSeedIndex } from "./analytics/phrases.js";
import { oppositesOf } from "./analytics/relations.js";
import { indexExpressions, indexByVerse, expressionsForRoot } from "./analytics/expressions.js";
// Modals + the onboarding tour are split into their own chunks (React.lazy) and mounted
// only when opened — not on the critical path, and react-joyride (the Tour) is heavy and
// never loads for returning users who dismissed it. Named exports, so map to a default
// for lazy(). See the gated <Suspense> below.
const lazyNamed = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const OccurrencesModal = lazyNamed(() => import("./components/OccurrencesModal.jsx"), "OccurrencesModal");
const ContextModal = lazyNamed(() => import("./components/ContextModal.jsx"), "ContextModal");
const DistributionModal = lazyNamed(() => import("./components/DistributionModal.jsx"), "DistributionModal");
const CompareModal = lazyNamed(() => import("./components/CompareModal.jsx"), "CompareModal");
const DefinitionModal = lazyNamed(() => import("./components/DefinitionModal.jsx"), "DefinitionModal");
const PhraseModal = lazyNamed(() => import("./components/PhraseModal.jsx"), "PhraseModal");
const RootLabModal = lazyNamed(() => import("./components/RootLabModal.jsx"), "RootLabModal");
const RhymeModal = lazyNamed(() => import("./components/RhymeModal.jsx"), "RhymeModal");
const AyaLabModal = lazyNamed(() => import("./components/AyaLabModal.jsx"), "AyaLabModal");
const SurahLabModal = lazyNamed(() => import("./components/SurahLabModal.jsx"), "SurahLabModal");
const CorpusLabModal = lazyNamed(() => import("./components/CorpusLabModal.jsx"), "CorpusLabModal");
const ExpressionsModal = lazyNamed(() => import("./components/ExpressionsModal.jsx"), "ExpressionsModal");
const ConstructionModal = lazyNamed(() => import("./components/ConstructionModal.jsx"), "ConstructionModal");
const PairingModal = lazyNamed(() => import("./components/PairingModal.jsx"), "PairingModal");
const ClaimBoard = lazyNamed(() => import("./components/ClaimBoard.jsx"), "ClaimBoard");
const HelpModal = lazyNamed(() => import("./components/HelpModal.jsx"), "HelpModal");
const WorkspaceDrawer = lazyNamed(() => import("./components/WorkspaceDrawer.jsx"), "WorkspaceDrawer");
const Tour = lazyNamed(() => import("./components/Tour.jsx"), "Tour");
const IntroVideoModal = lazyNamed(() => import("./components/IntroVideoModal.jsx"), "IntroVideoModal");
const WhatsNewModal = lazyNamed(() => import("./components/WhatsNewModal.jsx"), "WhatsNewModal");
import { CHANGELOG, CURRENT_VERSION, unseenSince } from "./changelog.js";
import { usePersistedState } from "./hooks/usePersistedState.js";
import { useExplorationHistory } from "./hooks/useExplorationHistory.js";
import { useSearchHistory } from "./hooks/useSearchHistory.js";
import { useI18n } from "./i18n/index.js";

// Fixed virtual canvas the graph is laid out in. Decoupling layout from the
// live viewport size means a window resize never rebuilds the graph or shifts
// settled nodes — the pan/zoom transform maps this canvas onto the screen.
const VW = 1600, VH = 1100;
// Forgiving search keys (looseKeys / searchAlef) live in arabic-utils, shared with the
// corpus-index builder; the toolbar typeahead resolves through looseResolve (search.js).
const SOFT_CAP = 300; // per-word fan-out beyond this needs explicit opt-in (perf)
const CULL_THRESHOLD = 700; // above this many nodes, cull off-screen ones from the SVG
const POS_LINK_CAP = 600;   // above this, a share link can't embed the exact layout
const isInt = (v) => Number.isInteger(v);
// The tour's worked example: Āyat al-Kursī, with the word indices it spotlights
// (15 = ٱلسَّمَٰوَٰت / heavens, 41 = كُرْسِيّ / a rare word). Module-scoped so it's a
// stable reference for the tour's memo/effect deps.
// Worked example: Āyat al-Kursī. earthWi = ٱلْأَرْض (word 18) — chosen as the first
// example word because its root (أرض) has entries in nearly every lexicon (incl. the
// default Maqāyīs), unlike ٱلسَّمَٰوَٰت (root سمو, only in a couple); kursWi = كُرْسِيّ
// (word 41, a hapax-like rarity).
const TOUR_EX = { s: 2, a: 255, key: "2:255", earthWi: 18, kursWi: 41, kursPartner: "38:34" };

// Coerce a persisted morphology filter back to its {pos,form,aspect,voice} shape.
function sanitizeMorphFilter(v) {
  const a = (x) => (Array.isArray(x) ? x : []);
  return v && typeof v === "object"
    ? { pos: a(v.pos), form: a(v.form).filter(isInt), aspect: a(v.aspect), voice: a(v.voice),
        person: a(v.person).filter(isInt), number: a(v.number), mood: a(v.mood), gcase: a(v.gcase) }
    : { ...EMPTY_MORPH_FILTER };
}

/* ═══ MAIN ═══ */
export default function QuranGraph() {
  const { t, lang, setLang, numerals, setNumerals } = useI18n();
  const ws = useWorkspace();
  const [wsOpen, setWsOpen] = useState(false); // workspace drawer
  const [pendingOpen, setPendingOpen] = useState(null); // a saved item waiting on a lazy index (l2v) to load
  const [quranRaw, setQuranRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surah, setSurah] = usePersistedState("qg.surah", 2, (v, f) => (isInt(v) && v >= 1 && v <= 114 ? v : f));
  const [ayah, setAyah] = usePersistedState("qg.ayah", 228, (v, f) => (isInt(v) && v >= 1 ? v : f));
  const [maxBranch, setMaxBranch] = usePersistedState("qg.maxBranch", 10, (v, f) => (isInt(v) && v >= 3 && v <= 6236 ? v : f));
  const [allowBig, setAllowBig] = usePersistedState("qg.allowBig", false, (v) => !!v); // opt-in to large fan-outs
  const [hideStop, setHideStop] = usePersistedState("qg.hideStop", true, (v) => !!v);
  const [showLoops, setShowLoops] = usePersistedState("qg.showLoops", true, (v) => !!v);
  const [rareOnly, setRareOnly] = usePersistedState("qg.rareOnly", false, (v) => !!v);
  const sanitizeList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  const [stopExtra, setStopExtra] = usePersistedState("qg.stopExtra", [], sanitizeList); // extra words to hide
  const [stopDisabled, setStopDisabled] = usePersistedState("qg.stopDisabled", [], sanitizeList); // defaults the user re-enabled
  const [searchMode, setSearchMode] = usePersistedState("qg.searchMode", "exact", (v, f) => (v === "exact" || v === "lemma" || v === "root" ? v : f));
  const [precision, setPrecision] = usePersistedState("qg.precision", "loose", (v, f) => (v === "loose" || v === "strict" ? v : f));
  const [activeLexicon, setActiveLexicon] = usePersistedState("qg.lexicon", "maqayis", (v, f) => (typeof v === "string" && v ? v : f));
  const [morphFilter, setMorphFilter] = usePersistedState("qg.morphFilter", EMPTY_MORPH_FILTER, sanitizeMorphFilter);
  const [theme, setTheme] = usePersistedState("qg.theme", "dark", (v, f) => (v === "dark" || v === "light" ? v : f));
  const [renderer, setRenderer] = usePersistedState("qg.renderer", "svg", (v, f) => (v === "svg" || v === "canvas" ? v : f));
  const [kbEnabled, setKbEnabled] = usePersistedState("qg.keyboard", false, (v) => !!v); // floating Arabic keyboard
  const [expandedWords, setExpandedWords] = useState(new Set());
  const [expandedVerses, setExpandedVerses] = useState(new Set());
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [activeWord, setActiveWord] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [positions, setPositions] = useState({});
  const positionsRef = useRef(positions);
  const pendingPosRef = useRef(null); // shared node positions to apply on next structural build
  const pendingViewRef = useRef(null); // analysis view (from a deep link) to reopen once hydrated
  const arrivedViaViewRef = useRef(false); // a deep link carried an open view → suppress the auto-tour
  const graphNodesRef = useRef([]);   // latest node set, for position snapshots off the render path
  // Flat [x0,y0,…] of live node positions in sorted-node-id order — so a share link
  // can reproduce the exact arrangement. Capped to keep the URL sane on huge graphs.
  const posSnapshot = useCallback(() => {
    const nodes = graphNodesRef.current;
    if (!nodes.length || nodes.length > POS_LINK_CAP) return null;
    const ids = nodes.map((n) => n.id).sort();
    const live = positionsRef.current, out = [];
    for (const id of ids) { const p = live[id]; out.push(p ? Math.round(p.x) : 0, p ? Math.round(p.y) : 0); }
    return out;
  }, []);
  const [dragId, setDragId] = useState(null);
  const dragStartRef = useRef(null);
  const draggedRef = useRef(false); // true once a press turns into a real drag
  const [draggedId, setDraggedId] = useState(null); // last node the user actually dragged (tour gate)
  const [dragTick, setDragTick] = useState(0); // increments on every real drag, so the gate can require a fresh one
  const [sim] = useState(() => createSimClient(VW, VH)); // live force engine — runs in a Web Worker (stable)
  // DOM registry for imperative position writes (see GraphLayer + applyPositions).
  // A stable object (not a ref) so it can be passed to GraphLayer without reading
  // .current during render; its Maps are mutated by GraphLayer's ref callbacks.
  const [registry] = useState(() => ({ nodes: new Map(), links: new Map(), loops: new Map() }));
  const canvasApiRef = useRef(null);   // GraphCanvas's imperative { draw } (canvas renderer)
  const spatialIndexRef = useRef(null); // grid index for canvas hit-testing (settled positions)
  const pressNodeRef = useRef(null);   // node grabbed on pointerdown in canvas mode (for click)
  const canvasHoverRef = useRef(null); // last hovered node id in canvas mode (de-dupe)
  const onNodeClickRef = useRef(null); // latest onNodeClick, so pointerup can fire it (defined below)
  const containerRef = useRef();
  const toolsRef = useRef(null);
  const pointersRef = useRef(new Map()); // pointerId → {x, y}  (for pan / pinch)
  const pinchRef = useRef(null);
  const rafRef = useRef(0);
  const movePendingRef = useRef(null);
  const centeredRef = useRef(false);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showHelp, setShowHelp] = useState(false);
  const [meanings, setMeanings] = useState(null); // active lexicon: root → { c, f } (lazy)
  const [meaningsFull, setMeaningsFull] = useState(null); // active lexicon: root → full article (accumulated per fetched shard)
  const [fullLoaded, setFullLoaded] = useState(() => new Set()); // "lexicon:shard" keys already fetched (so a miss doesn't spin forever)
  const [lexicons, setLexicons] = useState(null); // manifest [{id,label,license,hasFull}]
  const [lexAll, setLexAll] = useState(null); // { id: root→{c,f} } — all six concise lexicons, for the dictionary↔corpus panel (lazy, on RootLab open)
  const [lemmaMap, setLemmaMapState] = useState(null); // normForm → lemma (lazy, for lemma mode)
  const [morph, setMorph] = useState(null); // columnar per-token morphology (lazy)
  const [meaningOpen, setMeaningOpen] = useState(false); // full-text toggle
  const [occ, setOcc] = useState(null); // occurrences popup: { lookup, label, mode, keys }
  const [dist, setDist] = useState(null); // distribution/collocation modal: { lookup, label, mode }
  const [cmp, setCmp] = useState(null); // compare modal: { A, B } each { lookup, label, mode } | null
  const [def, setDef] = useState(null); // definition reader modal: { root, lexicon } (from saved items)
  const [ctx, setCtx] = useState(null); // context reader modal: { centerKey }
  const [phrase, setPhrase] = useState(null); // shared-phrase (mutashābihāt) modal: { centerKey }
  const [lab, setLab] = useState(null); // root analysis lab (derivation/kinship/semantic): { root, label }
  const [rhyme, setRhyme] = useState(null); // verse rhyme/cadence modal: { centerKey, back }
  const [aya, setAya] = useState(null); // āya analysis lab: { centerKey, back }
  const [surahLab, setSurahLab] = useState(null); // sūra analysis lab: { surahId, back }
  const [semantic, setSemantic] = useState(null); // distributional neighbour map (lazy, on first lab open)
  const [corpusOpen, setCorpusOpen] = useState(false); // corpus explorer (frequency / hapax / grammar catalogue)
  const [construction, setConstruction] = useState(null); // construction-query builder: { root, label }
  const [pairing, setPairing] = useState(null); // pairing-matrix workbench: { open, seed, rows, cols } — config persists while closed so cell→verses→back round-trips
  const [claimsOpen, setClaimsOpen] = useState(false); // claim board (ما يؤيد / ما يعارض)
  const [expr, setExpr] = useState(null); // multi-word expression inventory (lazy, on first explorer open)
  const [exprOpen, setExprOpen] = useState(false); // expressions explorer { } | false
  const [exprFocus, setExprFocus] = useState(null); // root the explorer opened scoped to (cross-link)
  const [exprInitial, setExprInitial] = useState(null); // saved-expression record to reopen the explorer straight into its detail
  const [relations, setRelations] = useState(null); // lexical opposition (طباق) + affinity map (lazy)
  const [seedIndex, setSeedIndex] = useState(null); // corpus trigram index (lazy, built on first phrase open)
  const seedVdRef = useRef(null); // verseData identity the current seedIndex was built from
  const [linkCopied, setLinkCopied] = useState(false); // share-link confirmation flash
  const [graphSaved, setGraphSaved] = useState(false); // graph-snapshot save confirmation flash (a snapshot is unique each time, so no toggle)
  const [exportCount, setExportCount] = useState(0); // bumps on each image export (tour download gate)
  const svgRef = useRef(null); // live stage <svg>, for export
  const [hydrated, setHydrated] = useState(false); // URL state applied once after data load
  const [toolsOpen, setToolsOpen] = useState(false); // graph-tools popover
  const [query, setQuery] = useState(""); // toolbar search field
  const [searchMiss, setSearchMiss] = useState(false); // last search found nothing
  const tourLockSearchRef = useRef(false); // true while the tour's search step shows (search disabled)
  const [sugOpen, setSugOpen] = useState(false); // search typeahead dropdown visible
  const [sugIndex, setSugIndex] = useState(-1);  // highlighted suggestion (roving)
  const [readerCollapsed, setReaderCollapsed] = useState(false); // bottom reader dock
  const [showExpanded, setShowExpanded] = useState(false); // expanded-words list panel
  const [sheetOpen, setSheetOpen] = useState(false); // inspector slide-in (mobile sheet)
  const [exporting, setExporting] = useState(false); // suspends culling so export captures the whole graph
  const T = THEMES[theme];

  // Translate that centres the virtual canvas in the current viewport.
  const homeView = useCallback(() => ({ x: (dims.w - VW) / 2, y: (dims.h - VH) / 2, k: 1 }), [dims.w, dims.h]);

  // The force simulation runs in a Web Worker (simClient) so the heavy physics pass no
  // longer blocks the main thread on large graphs. It streams positions back via
  // onTick: we mirror them into positionsRef, paint imperatively (SVG + Canvas, never a
  // React re-render), and commit ONE setPositions snapshot when the layout settles so
  // React state holds the resting layout for the next structural render / fit / export.
  // Worker commands (sync/reheat/pin/…) auto-start the worker's stepping, so the old
  // main-thread rAF driver is gone and runSim() is now a no-op kept for call-site clarity.
  useEffect(() => {
    sim.setOnTick((p, alive) => {
      positionsRef.current = p;
      applyPositions(registry, p);        // SVG renderer (no-op if its registry is empty)
      canvasApiRef.current?.draw();       // Canvas renderer (no-op if not mounted)
      if (!alive) setPositions(p);
    });
    return () => sim.terminate?.();
  }, [sim, registry]);
  const runSim = useCallback(() => {}, []);
  // After any GraphLayer re-render (structure change, hover, selection, pan) repaint
  // the live positions imperatively so freshly-rendered DOM lands where the sim has
  // it — not at the last committed React snapshot. Cheap: plain attribute writes.
  useLayoutEffect(() => { applyPositions(registry, positionsRef.current); canvasApiRef.current?.draw(); });
  // Mirror the latest committed positions into a ref so the structure-sync effect
  // can seed new nodes around their parent's CURRENT spot without taking positions
  // as a dependency (which would re-fire it on every simulation frame).
  useEffect(() => { positionsRef.current = positions; }, [positions]);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setDims((d) => (d.w === r.width && d.h === r.height ? d : { w: r.width, h: r.height }));
      }
    };
    // Debounce resize: collapse a burst of events into one rAF-aligned measure.
    const onResize = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
    measure();
    window.addEventListener("resize", onResize);
    // Observe the stage element itself so the canvas also re-measures when the
    // layout (not just the window) changes — e.g. the inspector docks/undocks
    // or the toolbar wraps on a narrow screen.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => { window.removeEventListener("resize", onResize); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [loading]);

  // Centre the graph in the viewport once, after the first real measurement.
  useEffect(() => {
    if (!centeredRef.current && dims.w && dims.h) {
      centeredRef.current = true;
      setTransform(homeView());
    }
  }, [dims, homeView]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadHafsData(), loadRoots()])
      .then(([hafs, roots]) => { setRootMap(roots); setQuranRaw(hafs); setLoading(false); })
      .catch((e) => { setError(e?.message || "Failed to load Quran data."); setLoading(false); });
    // Record the corpus build version so reproducible exports can cite the snapshot.
    loadSources().then((s) => setExportCorpusVersion(s?.builtAt)).catch(() => {});
  }, []);
  // Fetch the corpus on mount (external system — a legitimate effect).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  // Apply a decoded URL/session state onto the live app (shared by deep-link
  // hydration and session load). Replaces the whole interactive state.
  const applyState = useCallback((u) => {
    if (!u) return;
    pendingPosRef.current = u.pos || null; // applied (and pinned) by the structure effect
    if (u.surah) setSurah(u.surah);
    if (u.ayah) setAyah(u.ayah);
    setSearchMode(u.mode); setPrecision(u.precision);
    if (u.theme !== undefined) setTheme(u.theme); // personal pref — only if the link carries it
    if (u.activeLexicon) setActiveLexicon(u.activeLexicon);
    setMaxBranch(u.maxBranch); setHideStop(u.hideStop); setShowLoops(u.showLoops); setRareOnly(u.rareOnly);
    if (u.morphFilter) setMorphFilter(sanitizeMorphFilter(u.morphFilter));
    setStopExtra(u.stopExtra || []); setStopDisabled(u.stopDisabled || []);
    setExpandedWords(new Set(u.expandedWords || []));
    setExpandedVerses(new Set(u.expandedVerses || []));
    setSelected(u.selected || null);
    setPositions({});
    if (u.transform) { centeredRef.current = true; setTransform(u.transform); }
  }, [setSurah, setAyah, setSearchMode, setPrecision, setActiveLexicon, setTheme, setMaxBranch, setHideStop, setShowLoops, setRareOnly, setMorphFilter, setStopExtra, setStopDisabled]);

  // Hydrate from the URL hash ONCE, after the corpus is loaded (so verseData exists).
  // Precedence: URL > persisted localStorage defaults.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (hydrated || loading || !quranRaw) return;
    const u = readUrlState();
    applyState(u);
    pendingViewRef.current = u?.view || null; // reopened by the view-restore effect below
    arrivedViaViewRef.current = !!u?.view;     // …and the auto-tour must not clobber it
    setHydrated(true);
  }, [hydrated, loading, quranRaw, applyState]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The open analysis VIEW as a compact, link-able descriptor (distribution / compare /
  // a root·āya·sūra·rhyme lab / the corpus or expressions explorer / context / phrases).
  // Heavy payloads (occurrence key lists) are intentionally omitted — openView recomputes
  // them — so the URL stays short. Lets a deep link reproduce the lens, not just the graph.
  const currentView = useMemo(() => {
    if (dist) return { t: "dist", k: dist.lookup, l: dist.label, m: dist.mode };
    if (cmp) return { t: "cmp", a: cmp.A ? { k: cmp.A.lookup, l: cmp.A.label, m: cmp.A.mode } : null, b: cmp.B ? { k: cmp.B.lookup, l: cmp.B.label, m: cmp.B.mode } : null };
    if (occ) return { t: "occ", k: occ.lookup, l: occ.label, m: occ.mode };
    if (lab) return { t: "lab", r: lab.root, l: lab.label };
    if (aya) return { t: "aya", c: aya.centerKey };
    if (surahLab) return { t: "surah", s: surahLab.surahId };
    if (rhyme) return { t: "rhyme", c: rhyme.centerKey };
    if (exprOpen) return { t: "expr", r: exprFocus || null };
    if (corpusOpen) return { t: "corpus" };
    if (ctx) return { t: "ctx", c: ctx.centerKey };
    if (phrase) return { t: "phrase", c: phrase.centerKey };
    return null;
  }, [dist, cmp, occ, lab, aya, surahLab, rhyme, exprOpen, exprFocus, corpusOpen, ctx, phrase]);

  // Mirror the live state back into the URL hash (debounced; replaceState so pan/
  // zoom never spam history). Runs once hydration completes, then on every change.
  const urlSnapshot = { surah, ayah, mode: searchMode, precision, activeLexicon, theme, maxBranch, hideStop, showLoops, rareOnly, expandedWords, expandedVerses, selected, transform, morphFilter, stopExtra, stopDisabled, view: currentView };
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => writeUrlState({ ...urlSnapshot, pos: posSnapshot() }), 350);
    return () => clearTimeout(id);
    // `positions` is included so the URL re-captures the SETTLED layout (it commits
    // only when the simulation comes to rest) — not the transient mid-animation one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, surah, ayah, searchMode, precision, activeLexicon, theme, maxBranch, hideStop, showLoops, rareOnly, expandedWords, expandedVerses, selected, transform, morphFilter, stopExtra, stopDisabled, positions, currentView]);

  // ── Undo / redo of exploration (expand/collapse · select · navigate centre) ──
  // Restore a recorded snapshot into the live state (must be stable — it's a dep of
  // the history hook's undo/redo). Pan/zoom/hover are deliberately not history.
  const applyHistorySnap = useCallback((s) => {
    setSurah(s.surah); setAyah(s.ayah);
    setExpandedWords(new Set(s.ew)); setExpandedVerses(new Set(s.ev));
    setSelected(s.selected); setActiveWord(null);
  }, [setSurah, setAyah]);
  const { undo, redo, canUndo, canRedo } = useExplorationHistory({
    hydrated, surah, ayah, expandedWords, expandedVerses, selected, apply: applyHistorySnap,
  });

  // Whether root meanings are wanted yet: root/lemma mode (roots shown) or any
  // node selected (so a word's root meaning surfaces in the inspector in any mode).
  const meaningsWanted = searchMode !== "exact" || selected != null;

  // Lazy resources (lexicon/lemma/morphology) used to fail SILENTLY — a dropped fetch
  // left the inspector spinning "loading…" or the graph stuck on the lemma empty state
  // forever. Track which one failed and let the user retry: retryTick is in each
  // loader effect's deps, so bumping it re-runs the failed fetch.
  const [dataErr, setDataErr] = useState(null); // "lexicon" | "lemma" | "morph" | null
  const [retryTick, setRetryTick] = useState(0);
  const retryLoads = useCallback(() => { setDataErr(null); setRetryTick((n) => n + 1); }, []);

  // Load the lexicon manifest once meanings are first wanted (drives the switcher).
  useEffect(() => {
    if (meaningsWanted && !lexicons) loadLexiconManifest().then(setLexicons).catch(() => setDataErr("lexicon"));
  }, [meaningsWanted, lexicons, retryTick]);

  // Lazy-load the ACTIVE lexicon's concise meanings; reload (and reset the full
  // text + open state) whenever the user switches lexicon.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!meaningsWanted) return;
    let live = true;
    setMeanings(null); setMeaningsFull(null); setMeaningOpen(false);
    setFullLoaded(new Set()); // full-article shards are per-lexicon
    loadLexicon(activeLexicon).then((m) => { if (live) setMeanings(m); }).catch(() => { if (live) setDataErr("lexicon"); });
    return () => { live = false; };
  }, [meaningsWanted, activeLexicon, retryTick]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lazy-load the normForm→lemma map the first time lemma mode is used; install it
  // into arabic-utils so groupKey('lemma') resolves, and keep a copy in state so
  // the l2v index + graph rebuild when it arrives.
  // Also load when the Compare modal is open or the user is typing in the toolbar search
  // (≥2 chars): both offer Lemma results, which are dead without the lemma index (l2v) — so a
  // forgiving "did you mean جِنّ?" can't resolve.
  useEffect(() => {
    if ((searchMode === "lemma" || cmp || exprOpen || pairing?.open || construction || query.trim().length >= 2) && !lemmaMap) loadLemmas().then((m) => { setLemmaMap(m); setLemmaMapState(m); }).catch(() => setDataErr("lemma"));
  }, [searchMode, cmp, exprOpen, pairing, construction, query, lemmaMap, retryTick]);

  // Lazy-load per-token morphology when the filter is active (graph filtering), a
  // node is selected (inspector morphology card), or root/lemma mode is active (so
  // edges/counts can upgrade to the position-correct, per-occurrence reading and
  // stop linking homographs by their commoner root). ~2.4MB, deferred until needed;
  // the graph renders immediately with the voted grouping and refines when it lands.
  useEffect(() => {
    // Also load when an āya/sūra lab is open: their POS breakdown and iltifāt (person-shift)
    // lens read per-token morphology, degrading gracefully until it lands.
    if ((morphFilterActive(morphFilter) || selected != null || searchMode !== "exact" || aya || surahLab || corpusOpen || construction || pairing?.open) && !morph) loadMorphology().then(setMorph).catch(() => setDataErr("morph"));
  }, [morphFilter, selected, searchMode, aya, surahLab, corpusOpen, construction, pairing, morph, retryTick]);

  // Lazy-load the distributional semantic-neighbour map the first time the root lab is
  // opened (it's only used by that modal's "semantic" tab). Best-effort: stays null on
  // failure so the tab shows its empty state rather than erroring.
  useEffect(() => {
    if (lab && !semantic) loadSemanticNeighbors().then(setSemantic).catch(() => setSemantic({}));
  }, [lab, semantic]);

  // Lazy-load the lexical-relations map (opposites/affinity) when the root/āya labs or the
  // corpus explorer open — all surface it. Best-effort: stays {} on failure.
  useEffect(() => {
    if ((lab || aya || corpusOpen || selected) && relations == null) loadRelations().then((r) => setRelations(r || {})).catch(() => setRelations({}));
  }, [lab, aya, corpusOpen, selected, relations]);

  // Lazy-load the multi-word expression inventory the first time it's needed — the explorer,
  // a selected word (inline inspector section), or the root/āya labs all surface it now.
  // Best-effort: stays {} on failure so those surfaces just show nothing.
  useEffect(() => {
    if ((exprOpen || selected != null || lab || aya || construction) && expr == null) loadExpressions().then((e) => setExpr(e || {})).catch(() => setExpr({}));
  }, [exprOpen, selected, lab, aya, construction, expr]);

  // Load all six concise lexicons when the root lab opens — the dictionary↔corpus tab
  // juxtaposes what every dictionary says against the corpus behaviour. Best-effort.
  useEffect(() => {
    if (!lab || lexAll) return;
    if (!lexicons) { loadLexiconManifest().then(setLexicons).catch(() => {}); return; }
    Promise.all(lexicons.map((L) => loadLexicon(L.id).then((m) => [L.id, m]).catch(() => [L.id, {}])))
      .then((pairs) => setLexAll(Object.fromEntries(pairs)));
  }, [lab, lexicons, lexAll]);

  // Drive the CSS design tokens (styles/theme.css) off the React theme state so
  // the whole آيات.network shell — including body + boot screens — recolours.
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // Dismiss the graph-tools popover on an outside click or Escape (the toggle
  // button lives inside the same wrapper, so it still toggles normally).
  useEffect(() => {
    if (!toolsOpen) return;
    const onDown = (e) => { if (toolsRef.current && !toolsRef.current.contains(e.target) && !e.target.closest?.("#react-joyride-portal")) setToolsOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setToolsOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [toolsOpen]);

  // Animate the inspector in: mount closed, then flip `is-open` next frame so the
  // mobile bottom sheet slides up (on desktop it's an in-flow column, so this is
  // a no-op visually). Driven by the selected node id.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected == null) { setSheetOpen(false); return; }
    const id = requestAnimationFrame(() => setSheetOpen(true));
    return () => cancelAnimationFrame(id);
  }, [selected]);

  // Derived corpus indices (verseData spine, inverted indices, search alias, stop set …)
  // live in their own hook — the first slice of the QuranGraph decomposition. Pure
  // derivations from the loaded corpus + a few prefs; no interaction state involved.
  const { w2v, r2v, verseData, surahList, searchAlias, searchAliasFuzzy, l2v, compareIndices, orderedKeys, stopSet, romanIndex, exDisplay } =
    useCorpusIndices({ quranRaw, precision, morph, lemmaMap, hideStop, stopExtra, stopDisabled });

  // Toggle any word's hidden state directly (used by the editor chips): hide a
  // shown word via `extra`, re-show a hidden one via `disabled` — so a single click
  // does the obvious thing whatever group the word is in.
  const toggleStopWord = useCallback((w) => {
    const nw = norm(w);
    if (stopSet.has(nw)) { setStopDisabled((p) => (p.includes(nw) ? p : [...p, nw])); setStopExtra((p) => p.filter((x) => x !== nw)); }
    else { setStopDisabled((p) => p.filter((x) => x !== nw)); setStopExtra((p) => (p.includes(nw) ? p : [...p, nw])); }
  }, [stopSet, setStopDisabled, setStopExtra]);
  // Show all: re-enable (un-hide) every hideable word — disabling the whole set. Persisted,
  // so once clicked the words stay shown across sessions. Hide all: clear the re-enabled set
  // (content + custom hide again) and turn the particle master toggle on.
  const showAllStop = useCallback(() => {
    setStopDisabled([...new Set([...STOP_PARTICLES, ...STOP_CONTENT_DEFAULT, ...stopExtra.map(norm)])]);
  }, [stopExtra, setStopDisabled]);
  const hideAllStop = useCallback(() => { setStopDisabled([]); setHideStop(true); }, [setStopDisabled, setHideStop]);
  // Mirror into arabic-utils so any module-level STOP consumer agrees with the UI.
  useEffect(() => { setStopSet(stopSet); }, [stopSet]);

  const ayahCount = quranRaw?.find((s) => s.id === surah)?.total_verses || 1;
  // Guard against a persisted/out-of-range ayah without a state round-trip.
  const safeAyah = Math.min(Math.max(ayah, 1), ayahCount);
  const currentKey = `${surah}:${safeAyah}`;
  const currentVerse = verseData[currentKey];

  // Effective per-word fan-out: capped at SOFT_CAP unless the user opted into large
  // graphs (which can tax weak devices when rendering thousands of nodes).
  const effMaxBranch = allowBig ? maxBranch : Math.min(maxBranch, SOFT_CAP);

  // Build graph STRUCTURE only — laid out in the fixed VW×VH virtual canvas, so
  // this never re-runs on viewport resize.
  // Lemma mode needs the lemma index loaded before it can link anything; until then
  // we hold off building (rather than fall back to exact-form matches dressed up as
  // lemma links). Root/exact build immediately.
  const lemmaPending = searchMode === "lemma" && !l2v;
  const { graphNodes, graphLinks, loopLinks, parentMap, omitted, truncated } = useMemo(() => {
    if (!currentVerse || lemmaPending) return { graphNodes: [], graphLinks: [], loopLinks: [], parentMap: {}, omitted: 0, truncated: false };
    const r = buildLazyGraph(currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, effMaxBranch, searchMode, VW, VH, { l2v, M: morph, morphFilter, rareOnly, stopSet });
    return { graphNodes: r.nodes, graphLinks: r.links, loopLinks: r.loopLinks, parentMap: r.parentMap, omitted: r.omitted, truncated: r.truncated };
  }, [currentVerse, lemmaPending, currentKey, verseData, w2v, r2v, l2v, morph, morphFilter, rareOnly, stopSet, expandedWords, expandedVerses, hideStop, effMaxBranch, searchMode]);

  // Adjacency map reused across every subtree query (descendants / drag / highlight).
  const childMap = useMemo(() => buildChildMap(graphLinks), [graphLinks]);

  // Feed the live simulation whenever the graph STRUCTURE changes (expand/collapse,
  // navigate). Surviving nodes keep their settled position; newly-added nodes are
  // pre-seeded in a phyllotaxis disk around their parent's CURRENT position, so a
  // freshly-expanded — or re-expanded — fan always blooms into the space around the
  // parent as it is now, never restoring an old arrangement. Reading positions via
  // a ref keeps this off the per-frame render path (it must not re-run as the sim
  // ticks positions in).
  useLayoutEffect(() => {
    graphNodesRef.current = graphNodes;
    const pos = positionsRef.current;
    const parentOf = {};
    for (const l of graphLinks) if (parentOf[l.target] === undefined) parentOf[l.target] = l.source;
    const missing = graphNodes.filter((n) => !n.fixed && !pos[n.id]);
    const missingByParent = {};
    for (const n of missing) (missingByParent[parentOf[n.id]] ||= []).push(n.id);
    const C = { x: VW / 2, y: VH / 2 };
    const centerId = "v:" + currentKey;
    // Seed a new node near its parent. The centre's own words ring it (full circle);
    // a word's verse-fan blooms OUTWARD — away from the centre, into open space — so
    // expansions don't pile on top of existing clusters.
    const seedAround = (n) => {
      const par = parentOf[n.id];
      const pp = pos[par];
      if (!pp) return { x: n.x, y: n.y };
      const sibs = missingByParent[par] || [n.id];
      const idx = Math.max(0, sibs.indexOf(n.id)), k = sibs.length;
      if (par === centerId) {
        const ang = idx * 2.399963; // golden angle around the centre
        const rad = 110 + 36 * Math.sqrt(idx + 0.5);
        return { x: pp.x + Math.cos(ang) * rad, y: pp.y + Math.sin(ang) * rad };
      }
      const outward = Math.atan2(pp.y - C.y, pp.x - C.x) || idx * 2.399963;
      const spread = Math.min(Math.PI * 1.4, 0.6 + k * 0.16);
      const t = k > 1 ? idx / (k - 1) - 0.5 : 0;
      const rad = 90 + 30 * Math.sqrt(idx + 0.5);
      return { x: pp.x + Math.cos(outward + t * spread) * rad, y: pp.y + Math.sin(outward + t * spread) * rad };
    };

    const pend = pendingPosRef.current;
    let pendMap = null;
    if (pend && pend.length) {
      // Reproduce a shared arrangement: place every node at its saved position
      // (sorted-node-id order) — fall back to the seed for any node not covered.
      const ids = graphNodes.map((n) => n.id).sort();
      const at = new Map(ids.map((id, i) => [id, i]));
      pendMap = {};
      for (const n of graphNodes) {
        if (n.fixed) continue;
        const i = at.get(n.id), x = pend[2 * i], y = pend[2 * i + 1];
        if (Number.isFinite(x) && Number.isFinite(y)) pendMap[n.id] = { x, y };
      }
    }
    const seeded = graphNodes.map((n) => {
      if (pendMap && pendMap[n.id]) return { ...n, ...pendMap[n.id] };
      const s = pos[n.id];
      if (s) return { ...n, x: s.x, y: s.y };
      if (n.fixed) return n;
      return { ...n, ...seedAround(n) };
    });
    sim.sync(seeded, graphLinks);
    if (pendMap) sim.place(pendMap); // force EXISTING bodies too (sync keeps their old spot)
    // Paint the seeded layout immediately, before the browser paints, from the seeds we
    // just computed — the worker streams refined positions a frame later, so there's no
    // flash and no synchronous round-trip waiting on the worker.
    const seedPos = {};
    for (const n of seeded) seedPos[n.id] = { x: n.x, y: n.y };
    if (pendMap) for (const id in pendMap) seedPos[id] = pendMap[id];
    positionsRef.current = seedPos;
    applyPositions(registry, seedPos);
    canvasApiRef.current?.draw();
    if (pendMap) {
      // Reproduce the shared arrangement as the STARTING layout, then leave the nodes
      // FREE — so they follow their centre when it's dragged, can be moved, and re-flow
      // under the live forces. (Previously they were stuck `fixed`, which froze them in
      // place: they couldn't be dragged and ignored their centre.) A gentle reheat just
      // relaxes any integer-rounding overlap from the encoded positions.
      pendingPosRef.current = null;
      sim.reheat(0.04);
    } else {
      sim.reheat(missing.length ? 1 : 0.45);
    }
    runSim();
  }, [graphNodes, graphLinks, currentKey, runSim, sim, registry]);

  const nmap = useMemo(() => { const m = {}; graphNodes.forEach((n) => (m[n.id] = n)); return m; }, [graphNodes]);
  // The per-word branch slider caps how many āyāt each word fans out to. Rather
  // than a fixed 50, the ceiling tracks the busiest word currently on the canvas
  // (so the most-frequent word can fan out to *all* its occurrences), floored at
  // 10 and hard-capped for rendering sanity.
  const branchMax = useMemo(() => {
    let m = 10;
    for (const n of graphNodes) if (n.type === "word" && n.count > m) m = n.count;
    return m; // no artificial cap — a word can fan out to ALL its occurrences
  }, [graphNodes]);
  const wordToNodeIds = useMemo(() => { const m = {}; graphNodes.forEach((n) => { if (n.type === "word") { const key = n.lookup || n.wordNorm; (m[key] ||= []).push(n.id); } }); return m; }, [graphNodes]);
  // Currently-expanded words (the green-dot nodes) — surfaced as a quick list.
  const expandedWordNodes = useMemo(() => graphNodes.filter((n) => n.type === "word" && n.isExpanded), [graphNodes]);
  const highlightSet = useMemo(() => { if (!selected) return null; return new Set([...getPathToCenter(selected, parentMap), ...getDescendants(selected, childMap)]); }, [selected, parentMap, childMap]);
  const highlightLinks = useMemo(() => { if (!highlightSet) return null; const s = new Set(); graphLinks.forEach((l, i) => { if (highlightSet.has(l.source) && highlightSet.has(l.target)) s.add(i); }); return s; }, [highlightSet, graphLinks]);
  const activeWordNodeIds = useMemo(() => (!activeWord ? new Set() : new Set(wordToNodeIds[activeWord] || [])), [activeWord, wordToNodeIds]);

  // Nodes the simulation pulls toward the selection: its DIRECT linked nodes —
  // immediate children PLUS any āyah it shares via a loop link (parented to another
  // word). Selecting a word gathers exactly these around it; selecting the other
  // word a shared āyah belongs to makes it travel over there. Kept to the direct
  // ring (not the whole subtree) so deeper nodes keep orbiting their own parents.
  const gatherSet = useMemo(() => {
    if (!selected) return new Set();
    const s = new Set(childMap[selected] || []);
    for (const l of loopLinks) if (l.source === selected) s.add(l.target);
    return s;
  }, [selected, childMap, loopLinks]);

  // Push the current selection into the sim and reheat so the gather animates.
  useEffect(() => {
    sim.setSelected(selected, gatherSet);
    sim.reheat(selected ? 0.7 : 0.3);
    runSim();
  }, [selected, gatherSet, runSim, sim]);

  const getConnWord = useCallback((n) => n?.connectingWord || (parentMap[n?.id] ? nmap[parentMap[n.id]]?.lookup || nmap[parentMap[n.id]]?.wordNorm : null), [parentMap, nmap]);
  // Fit-to-content: frame EVERYTHING currently on the canvas, not just the fixed
  // virtual centre. Walks every node's live position (settled layout, falling back
  // to its build-time seed), pads for the node's radius + its label, then returns
  // the transform that centres that bounding box in the viewport and zooms to fit.
  const fitView = useCallback(() => {
    const live = positionsRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of graphNodes) {
      const p = live[n.id] || { x: n.x, y: n.y };
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const pad = (n.r || 8) + 46; // node radius + room for the label drawn beside it
      if (p.x - pad < minX) minX = p.x - pad;
      if (p.x + pad > maxX) maxX = p.x + pad;
      if (p.y - pad < minY) minY = p.y - pad;
      if (p.y + pad > maxY) maxY = p.y + pad;
    }
    if (!Number.isFinite(minX)) return homeView();
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    const margin = 48;
    const k = Math.max(0.08, Math.min(1.5, Math.min((dims.w - margin * 2) / bw, (dims.h - margin * 2) / bh)));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return { k, x: dims.w / 2 - cx * k, y: dims.h / 2 - cy * k };
  }, [graphNodes, dims.w, dims.h, homeView]);

  // Pan the view to centre a node (used by the expanded-words list) and select it.
  const focusNode = useCallback((id) => {
    const p = positionsRef.current[id];
    setSelected(id);
    if (p) setTransform((t) => ({ ...t, x: dims.w / 2 - p.x * t.k, y: dims.h / 2 - p.y * t.k }));
  }, [dims.w, dims.h]);

  // World-coordinate bounding box of all on-canvas content — frames the export.
  const contentBounds = useCallback(() => {
    const live = positionsRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of graphNodes) {
      const p = live[n.id] || { x: n.x, y: n.y };
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const pad = (n.r || 8) + 48;
      minX = Math.min(minX, p.x - pad); maxX = Math.max(maxX, p.x + pad);
      minY = Math.min(minY, p.y - pad); maxY = Math.max(maxY, p.y + pad);
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: VW, h: VH };
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }, [graphNodes]);

  // Export the live graph as SVG or PNG, framed to its content. Export serialises
  // the live DOM, so if viewport culling is on (large graph) the off-screen nodes
  // are missing — flip `exporting` to render the full graph for one frame first, let
  // the layout effect paint positions, then serialise on the next frame.
  const writeExport = useCallback((kind) => {
    if (!svgRef.current) return;
    const bbox = contentBounds();
    const svgStr = serializeSvg(svgRef.current, { bbox, bg: T.bg });
    const base = `qurangraph-${surah}_${safeAyah}`;
    if (kind === "svg") exportSvgFile(svgStr, base + ".svg");
    else exportPngFile(svgStr, { name: base + ".png", scale: 2, bbox }).catch(() => {});
  }, [contentBounds, T.bg, surah, safeAyah]);
  const exportGraph = useCallback((kind) => {
    setExportCount((n) => n + 1); // signal an export happened (tour download gate)
    // Export serialises the SVG. In canvas mode the SVG isn't normally mounted, and on
    // large graphs it's culled — either way flip `exporting` to render the FULL graph
    // into the SVG for one frame, let the layout effect paint it, then serialise.
    if (renderer === "canvas" || graphNodesRef.current.length > CULL_THRESHOLD) {
      setExporting(true);
      requestAnimationFrame(() => requestAnimationFrame(() => { writeExport(kind); setExporting(false); }));
    } else {
      writeExport(kind);
    }
  }, [writeExport, renderer]);

  // Write current state to the URL and copy the deep-link to the clipboard.
  const copyLink = () => {
    const href = writeUrlState({ ...urlSnapshot, pos: posSnapshot() });
    const flash = () => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(href).then(flash).catch(flash);
    else flash();
  };

  const reset = useCallback(() => { sim.clearSticky(); setExpandedWords(new Set()); setExpandedVerses(new Set()); setSelected(null); setActiveWord(null); setPositions({}); setTransform(homeView()); }, [homeView, sim]);
  const navigate = useCallback((s, a) => { setSurah(s); setAyah(a); reset(); }, [reset, setSurah, setAyah]);

  // Open the shared-phrase (mutashābihāt) view for a verse. The corpus-wide trigram
  // seed index is heavy (~one entry per word), so build it lazily on first use and
  // rebuild only if the verse data itself changed (e.g. precision toggle).
  // The sūra lab's "bonds" lens needs the same corpus phrase index; build it lazily when
  // the lab opens (declared here, after verseData, so it can reference it).
  useEffect(() => {
    if (surahLab && seedVdRef.current !== verseData) { seedVdRef.current = verseData; setSeedIndex(buildSeedIndex(verseData)); }
  }, [surahLab, verseData]);

  const openPhrases = useCallback((centerKey) => {
    if (seedVdRef.current !== verseData) { seedVdRef.current = verseData; setSeedIndex(buildSeedIndex(verseData)); }
    setPhrase({ centerKey });
  }, [verseData]);

  const toggleWord = useCallback((lookup, fromVerseKey) => {
    const key = `${lookup}@${fromVerseKey}`;
    setExpandedWords((prev) => { const n = new Set(prev); if (n.has(key)) { const wid = `w:${lookup}@${fromVerseKey}`; const desc = getDescendants(wid, childMap); const nw = new Set(n); nw.delete(key); nw.forEach((ek) => { const vk = ek.split("@").slice(1).join("@"); if (desc.has(`v:${vk}`)) nw.delete(ek); }); setExpandedVerses((p2) => { const nv = new Set(p2); desc.forEach((d) => { if (d.startsWith("v:")) nv.delete(d.slice(2)); }); return nv; }); return nw; } else { n.add(key); return n; } });
  }, [childMap]);
  const toggleVerse = useCallback((verseKey) => {
    setExpandedVerses((prev) => { const n = new Set(prev); if (n.has(verseKey)) { const vid = `v:${verseKey}`; const desc = getDescendants(vid, childMap); const nv = new Set(n); nv.delete(verseKey); desc.forEach((d) => { if (d.startsWith("v:") && d !== vid) nv.delete(d.slice(2)); }); setExpandedWords((p2) => { const nw = new Set(p2); nw.forEach((ek) => { const vk = ek.split("@").slice(1).join("@"); if (desc.has(`v:${vk}`)) nw.delete(ek); }); return nw; }); return nv; } else { n.add(verseKey); return n; } });
  }, [childMap]);

  const svgToWorld = useCallback((cx, cy) => { const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (cx - rect.left - transform.x) / transform.k, y: (cy - rect.top - transform.y) / transform.k }; }, [transform]);

  // Canvas mode has no per-node DOM, so rebuild a grid index over the SETTLED node
  // positions for pointer hit-testing — refreshed when the layout commits or the
  // structure changes. Null (and skipped) in SVG mode, which hit-tests via the DOM.
  useEffect(() => { spatialIndexRef.current = renderer === "canvas" ? buildSpatialIndex(graphNodes, positionsRef.current) : null; }, [renderer, graphNodes, positions]);
  // The node under a client point in canvas mode (world-space hit-test), or null.
  const hitTestAt = useCallback((clientX, clientY) => {
    if (renderer !== "canvas" || !spatialIndexRef.current) return null;
    const w = svgToWorld(clientX, clientY);
    return hitTest(spatialIndexRef.current, positionsRef.current, w.x, w.y);
  }, [renderer, svgToWorld]);
  // Begin dragging a node: pin ONLY this node in the sim (grabbed at its current
  // point, not snapped to the cursor). Its linked nodes are left free so they
  // re-gather around it live as it moves, rather than being towed rigidly.
  const startDrag = useCallback((nodeId, clientX, clientY) => {
    const n = nmap[nodeId];
    const np = positionsRef.current[nodeId] || (n ? { x: n.x, y: n.y } : { x: 0, y: 0 });
    const wp = svgToWorld(clientX, clientY);
    dragStartRef.current = { offX: np.x - wp.x, offY: np.y - wp.y, downX: clientX, downY: clientY };
    sim.pin(nodeId, np.x, np.y);
    setDragId(nodeId);
    runSim();
  }, [nmap, svgToWorld, runSim, sim]);

  const applyZoom = useCallback((factor, sx, sy) => {
    setTransform((t) => {
      const nk = Math.max(0.08, Math.min(8, t.k * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, k: nk };
      const mx = sx - rect.left, my = sy - rect.top;
      return { k: nk, x: mx - (mx - t.x) * (nk / t.k), y: my - (my - t.y) * (nk / t.k) };
    });
  }, []);
  // Zoom from the on-canvas buttons, anchored at the stage centre.
  const zoomBy = useCallback((factor) => { const r = containerRef.current?.getBoundingClientRect(); if (r) applyZoom(factor, r.left + r.width / 2, r.top + r.height / 2); }, [applyZoom]);

  // Native non-passive wheel listener (React's onWheel is passive → can't preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || loading || error) return;
    const onWheel = (e) => {
      // Don't hijack the wheel for zoom while a modal is open — let its list scroll.
      if (e.target.closest?.(".ag-modal-scrim, [data-panel]")) return;
      e.preventDefault();
      applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading, error, applyZoom]);

  // Cancel any pending rAF on unmount.
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ── Unified pointer handling (mouse + touch + pen): pan, node drag, pinch-zoom ──
  const onPointerDown = useCallback((e) => {
    if (e.target.closest("[data-panel]")) return; // let panels handle their own input
    // Suppress the browser's native text-selection drag while panning/dragging a node
    // (otherwise gliding a node selects the reader/inspector text). Panels are exempt
    // (returned above) so their text stays selectable; restored on pointer up/leave.
    document.body.style.userSelect = "none";
    const pts = pointersRef.current;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggedRef.current = false; // fresh gesture — not a drag until the pointer moves

    if (pts.size === 2) {
      const [p1, p2] = [...pts.values()];
      pinchRef.current = {
        startDist: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1,
        startK: transform.k,
        midX: (p1.x + p2.x) / 2,
        midY: (p1.y + p2.y) / 2,
      };
      setIsPanning(false); setPanStart(null); setDragId(null); dragStartRef.current = null;
      return;
    }

    // Canvas mode: no per-node DOM — hit-test instead. A hit node is grabbed (for a
    // possible drag) and remembered so pointerup can fire its click; a miss pans.
    if (renderer === "canvas") {
      const node = hitTestAt(e.clientX, e.clientY);
      pressNodeRef.current = node || null;
      if (node) { if (!node.fixed) startDrag(node.id, e.clientX, e.clientY); return; }
    } else {
      const nodeEl = e.target.closest("[data-node]");
      if (nodeEl) {
        const node = nmap[nodeEl.getAttribute("data-node")];
        if (node && !node.fixed) { startDrag(node.id, e.clientX, e.clientY); return; }
        return;
      }
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform, nmap, startDrag, renderer, hitTestAt]);

  // rAF-throttled: pointermove can fire faster than frames; coalesce to one
  // state update per frame so pan/drag stay smooth on large graphs.
  const onPointerMove = useCallback((e) => {
    const pts = pointersRef.current;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movePendingRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const cur = movePendingRef.current;
      if (!cur) return;

      if (pinchRef.current && pts.size >= 2) {
        const [p1, p2] = [...pts.values()];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const { startDist, startK, midX, midY } = pinchRef.current;
        setTransform((t) => {
          const nk = Math.max(0.08, Math.min(8, startK * (dist / startDist)));
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return { ...t, k: nk };
          const mx = midX - rect.left, my = midY - rect.top;
          return { k: nk, x: mx - (mx - t.x) * (nk / t.k), y: my - (my - t.y) * (nk / t.k) };
        });
        return;
      }
      if (dragId && dragStartRef.current) {
        const ds = dragStartRef.current;
        // Past a small screen-space threshold this press counts as a drag, so the
        // trailing click is suppressed and the node isn't toggled.
        if (!draggedRef.current && Math.hypot(cur.x - ds.downX, cur.y - ds.downY) > 4) draggedRef.current = true;
        const w = svgToWorld(cur.x, cur.y);
        // Move the grabbed node to follow the cursor (keeping the grab offset) and
        // reheat — its linked nodes chase and re-cluster around its new position.
        sim.pin(dragId, w.x + ds.offX, w.y + ds.offY);
        sim.reheat(0.5);
        runSim();
      } else if (isPanning && panStart) {
        setTransform((t) => ({ ...t, x: cur.x - panStart.x, y: cur.y - panStart.y }));
      } else if (renderer === "canvas") {
        // Idle hover in canvas mode: hit-test and mirror onNodeEnter/onNodeLeave.
        const node = hitTestAt(cur.x, cur.y);
        const id = node ? node.id : null;
        if (id !== canvasHoverRef.current) {
          canvasHoverRef.current = id;
          setHovered(id);
          if (node && node.type === "word") setActiveWord(node.lookup || node.wordNorm);
          else if (!node && !selected) setActiveWord(null);
        }
      }
    });
  }, [dragId, isPanning, panStart, svgToWorld, runSim, sim, renderer, hitTestAt, selected]);

  // End a node drag: a node that was actually moved sticks where it was dropped
  // (so it doesn't spring back to its parent); a mere press is released.
  const endDrag = useCallback(() => {
    if (!dragId) return;
    if (draggedRef.current) { sim.stick(dragId); setDraggedId(dragId); setDragTick((n) => n + 1); } else sim.unpin(dragId);
    sim.reheat(0.4);
    runSim();
  }, [dragId, runSim, sim]);

  const onPointerUp = useCallback((e) => {
    const pts = pointersRef.current;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchRef.current = null;
    if (pts.size === 0) {
      // Canvas mode: a press that didn't turn into a drag is a click on that node.
      if (renderer === "canvas" && pressNodeRef.current) {
        const node = pressNodeRef.current;
        if (!draggedRef.current) onNodeClickRef.current?.(node, { stopPropagation() {} });
      }
      pressNodeRef.current = null;
      endDrag(); setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null);
      document.body.style.userSelect = ""; // gesture over — text selectable again
    }
  }, [endDrag, renderer]);

  // Pointer left the canvas mid-gesture → end it (mirrors mouse-leave behaviour).
  const onPointerLeave = useCallback(() => {
    pointersRef.current.clear();
    pinchRef.current = null;
    pressNodeRef.current = null;
    if (canvasHoverRef.current) { canvasHoverRef.current = null; setHovered(null); if (!selected) setActiveWord(null); }
    endDrag();
    setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null);
    document.body.style.userSelect = ""; // gesture over — text selectable again
  }, [endDrag, selected]);

  const handleWordClick = useCallback((wordNorm, fromVerseKey) => {
    const vk = fromVerseKey || currentKey;
    // Resolve to the position-correct grouping key by finding the actual word in the
    // source verse (so a homograph expands its real root, not the commoner one);
    // fall back to the voted key if the word isn't found.
    const wObj = (verseData[vk]?.words || []).find((w) => w.norm === wordNorm);
    const lookup = wObj ? wordGroupKey(wObj, searchMode) : groupKey(wordNorm, searchMode);
    setMeaningOpen(false);
    if (activeWord === lookup) { setActiveWord(null); setSelected(null); }
    else { setActiveWord(lookup); const nids = wordToNodeIds[lookup]; if (nids?.length) setSelected(nids[0]); toggleWord(lookup, vk); }
  }, [activeWord, wordToNodeIds, toggleWord, currentKey, searchMode, verseData]);

  // Toolbar search: normalise the query, find the first verse the word (or its
  // root, in root mode) occurs in, jump there and highlight it. Marks a miss so
  // the field can flash when nothing matches.
  // Open the occurrences popup for a word/root: lists every āyah it occurs in,
  // current verse first, then mushaf order. Used by search and the inspector.
  const openOcc = useCallback((lookup, label, mode, back) => {
    // Never fall back to the exact index for lemma mode — an unloaded l2v means "not
    // ready", not "use surface forms". An empty index simply reports no occurrences.
    const idx = mode === "root" ? r2v : mode === "lemma" ? (l2v || {}) : w2v;
    const all = idx[lookup];
    if (!all?.length) return false;
    let ord = [...all].sort((a, b) => {
      const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number);
      return sa - sb || aa - ab;
    });
    // Honour an active morphology filter: keep only the occurrences whose reading at
    // the term's position matches (e.g. root X *as a Form II passive verb*). A no-op
    // until morphology has loaded; an empty result reports a miss rather than misleads.
    ord = filterOccurrencesByMorph(ord, lookup, mode, verseData, morph, morphFilter, wordGroupKey);
    if (!ord.length) return false;
    const keys = ord.includes(currentKey) ? [currentKey, ...ord.filter((k) => k !== currentKey)] : ord;
    const morphNote = morphFilterActive(morphFilter) ? morphFilterSummary(morphFilter) : null;
    setOcc({ lookup, label, mode, keys, morphNote, back });
    return true;
  }, [w2v, r2v, l2v, currentKey, verseData, morph, morphFilter]);

  // Close every analysis dialog — used before restoring a saved/linked state so the
  // reopened view starts from a clean slate (the setters are stable useState dispatchers).
  const closeAllViews = useCallback(() => {
    setDist(null); setCmp(null); setOcc(null); setLab(null); setAya(null); setSurahLab(null);
    setRhyme(null); setExprOpen(false); setExprFocus(null); setExprInitial(null); setCorpusOpen(false); setCtx(null); setPhrase(null); setDef(null);
    setConstruction(null); setPairing(null); setClaimsOpen(false);
  }, []);

  // Reopen an analysis view from its compact descriptor (the inverse of `currentView`).
  // Shared by deep-link hydration and saved-graph restore — recomputes any heavy payload
  // (e.g. occurrence key lists) rather than carrying it in the URL.
  const openView = useCallback((v) => {
    if (!v || !v.t) return;
    switch (v.t) {
      case "dist": setDist({ lookup: v.k, label: v.l, mode: v.m }); break;
      case "cmp": setCmp({ A: v.a ? { lookup: v.a.k, label: v.a.l, mode: v.a.m } : null, B: v.b ? { lookup: v.b.k, label: v.b.l, mode: v.b.m } : null }); break;
      case "occ": openOcc(v.k, v.l, v.m); break;
      case "lab": setLab({ root: v.r, label: v.l || v.r }); break;
      case "aya": setAya({ centerKey: v.c }); break;
      case "surah": setSurahLab({ surahId: v.s }); break;
      case "rhyme": setRhyme({ centerKey: v.c }); break;
      case "expr": setExprFocus(v.r || null); setExprOpen(true); break;
      case "corpus": setCorpusOpen(true); break;
      case "ctx": setCtx({ centerKey: v.c }); break;
      case "phrase": openPhrases(v.c); break;
      default: break;
    }
  }, [openOcc, openPhrases]);

  // Apply a deep-linked analysis view once hydration has completed (and openView/its data
  // dependencies exist). One-shot: the pending descriptor is consumed and cleared.
  useEffect(() => {
    if (!hydrated || !pendingViewRef.current) return;
    openView(pendingViewRef.current);
    pendingViewRef.current = null;
  }, [hydrated, openView]);

  // ═══ Cross-dialog back-stack ═══
  // The analysis dialogs (root/āya/sūra/rhyme labs, occurrences) link to one another. To
  // avoid "jump away and lose the thread", a click OPENS the next dialog carrying a `back`
  // descriptor of where it came from; its ← button calls reopenLab() to restore it. A
  // descriptor is { t, …payload, back } and nests, so the trail can be many steps deep.
  const reopenLab = useCallback((d) => {
    if (!d) return;
    setOcc(null); setDist(null); setCmp(null); setDef(null); setLab(null); setAya(null); setSurahLab(null); setRhyme(null);
    switch (d.t) {
      case "lab": setLab({ root: d.root, label: d.label, back: d.back }); break;
      case "aya": setAya({ centerKey: d.centerKey, back: d.back }); break;
      case "surah": setSurahLab({ surahId: d.surahId, back: d.back }); break;
      case "rhyme": setRhyme({ centerKey: d.centerKey, back: d.back }); break;
      case "dist": if (d.dist) setDist(d.dist); break;
      case "pairing": setPairing((p) => (p ? { ...p, open: true } : { open: true, seed: null, rows: [], cols: [] })); break;
      default: break;
    }
  }, []);

  const searchHistory = useSearchHistory();
  // ═══ Search typeahead (cross-mode) ═══
  // Live, ranked candidates as the user types — across ALL three modes at once (word ·
  // lemma · root), each labelled, so the user never has to pre-guess the mode and an
  // ambiguous skeleton (جن) shows every sense it could mean (جِنّ · جنن · جَنَّ …) instead of
  // silently jumping to one. A verse reference yields a single "go to" row. Resolution is
  // always loose (ignores the precision toggle) and imlāʾī-tolerant via looseResolve.
  // Deferred so fast typing never blocks on the index scan.
  const deferredQuery = useDeferredValue(query);
  // Full-text content index for phrase search. Built lazily (idle) on the first multi-word query and
  // cached by verseData identity — the build is ~0.5s over the whole corpus, so it must never run on
  // initial load nor block typing. Phrase rows appear once it lands (a render later).
  const [contentIdx, setContentIdx] = useState(null); // { vd, idx } | null
  useEffect(() => {
    if (!verseData || !/\s/.test(deferredQuery.trim())) return undefined;
    if (contentIdx && contentIdx.vd === verseData) return undefined;
    const ric = window.requestIdleCallback || ((f) => setTimeout(f, 0));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => setContentIdx({ vd: verseData, idx: buildContentIndex(verseData) }), { timeout: 500 });
    return () => cic(id);
  }, [deferredQuery, verseData, contentIdx]);
  const searchSuggestions = useMemo(() => {
    const raw = deferredQuery.trim();
    if (raw.length < 2) return [];
    const western = raw.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    const ref = western.match(/^(\d{1,3})\s*[:.،/\s-]\s*(\d{1,3})$/);
    if (ref) {
      const s = +ref[1], a = +ref[2];
      const sur = quranRaw?.find((x) => x.id === s);
      return sur && a >= 1 && a <= sur.total_verses ? [{ ref: true, s, a, lookup: `${s}:${a}`, label: `${sur.name} ${a}` }] : [];
    }
    // A bare sūra NUMBER (1–114) jumps to that sūra — no āya required (the header's sūra picker
    // doesn't force one either). āya defaults to 1; add an āya with "59 7" / "59:7" above.
    const surNum = western.match(/^(\d{1,3})$/);
    if (surNum) {
      const s = +surNum[1];
      const sur = quranRaw?.find((x) => x.id === s);
      return sur ? [{ ref: true, surah: true, s, a: 1, lookup: `surah:${s}`, label: `${s}. ${sur.name}` }] : [];
    }
    const indices = { exact: w2v, root: r2v, lemma: l2v || {} };
    const snippetOf = (vk) => { const t = verseData[vk]?.text || ""; return t.length > 64 ? t.slice(0, 64) + "…" : t; };
    const head = []; // surah-nav + phrase rows lead the list

    // ── Surah-name navigation: "Baqarah", "البقرة", "Fatiha 6" (Arabic name or romanized) ──
    {
      const m = raw.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).match(/^(.+?)(?:\s+(\d{1,3}))?$/);
      const namePart = (m ? m[1] : raw).trim();
      const verseNo = m && m[2] ? +m[2] : null;
      const qN = norm(namePart).replace(/^ال/, ""); // de-article: بقرة matches البقرة
      const qL = isLatinQuery(namePart) ? latinSkeleton(namePart) : "";
      if (qN.length >= 2 || qL.length >= 3) {
        const rows = [];
        for (const su of surahList) {
          const nm = norm(su.name).replace(/^ال/, "");
          const sk = arabicSkeletons(nm)[0] || "";
          const tier = Math.max(
            qN.length >= 2 ? (nm === qN ? 3 : nm.startsWith(qN) ? 2 : 0) : 0,
            qL.length >= 3 ? (sk === qL ? 3 : sk.startsWith(qL) ? 2 : 0) : 0,
          );
          if (tier) rows.push({ ref: true, surah: true, s: su.id, a: verseNo && verseNo <= su.count ? verseNo : 1, lookup: `surah:${su.id}`, label: `${su.id}. ${su.name}${verseNo ? " " + verseNo : ""}`, tier });
        }
        rows.sort((a, b) => b.tier - a.tier || a.s - b.s);
        head.push(...rows.slice(0, verseNo ? 1 : 2));
      }
    }

    // ── Arabic morphological terms (word · lemma · root), each with a vocalized label + snippet ──
    const seen = new Set(), out = [];
    for (const mode of ["exact", "lemma", "root"]) {
      for (const c of looseResolve(raw, mode, "loose", indices, searchAlias, searchAliasFuzzy).candidates) {
        const key = mode + ":" + c.lookup;
        if (seen.has(key)) continue;
        seen.add(key);
        const first = indices[mode][c.lookup]?.[0];
        out.push({ ...c, mode, display: mode === "exact" ? (exDisplay[c.lookup] || c.lookup) : c.lookup, snippet: first ? snippetOf(first) : "" });
      }
    }

    // ── Romanized (Latin) fallback: "rahman", "ibrahim", "musa" → the Arabic word ──
    if (isLatinQuery(raw) && romanIndex) {
      for (const c of romanResolve(raw, romanIndex, w2v)) {
        const key = "exact:" + c.lookup;
        if (seen.has(key)) continue;
        seen.add(key);
        const first = w2v[c.lookup]?.[0];
        out.push({ ...c, display: exDisplay[c.lookup] || c.lookup, snippet: first ? snippetOf(first) : "" });
      }
    }

    // Best tier first (exact › prefix › infix › fuzzy-typo), then nearest edit, then frequency.
    out.sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || (a.dist ?? 0) - (b.dist ?? 0) || b.count - a.count);
    for (const c of out) if (c.tier === 0) c.didYouMean = true; // edit-distance rows are guesses
    const terms = out.slice(0, 10);

    // ── Multi-word: full-text verse search over a content index. Any-order co-occurrence, broad
    //    orthography (آتاكم ≈ ءَاتَىٰكُمُ, الربا ≈ ٱلرِّبَوٰا), ranked contiguous › in-order › any-order.
    //    Lead with the top few āyāt; a "see all N" row opens the full list (savable/taggable). ──
    if (/\s/.test(raw) && contentIdx?.vd === verseData) {
      const vs = verseSearch(raw, contentIdx.idx, { limit: 300 });
      const rows = [];
      for (const r of vs.slice(0, 5)) {
        const [s, a] = r.vk.split(":").map(Number);
        const sur = quranRaw?.find((x) => x.id === s);
        if (sur) rows.push({ ref: true, phrase: true, adjacent: r.contiguous, s, a, lookup: r.vk, label: `${sur.name} ${a}`, snippet: snippetOf(r.vk) });
      }
      if (vs.length > rows.length) rows.push({ allResults: true, keys: vs.map((r) => r.vk), hi: Object.fromEntries(vs.map((r) => [r.vk, r.pos])), q: raw, lookup: `all:${raw}`, label: t("common.search.allResults", { n: vs.length }), count: vs.length });
      head.unshift(...rows);
    }

    const list = [...head, ...terms].slice(0, 10);
    return list.length ? list : [{ noResult: true, lookup: raw, label: raw }];
  }, [deferredQuery, w2v, r2v, l2v, searchAlias, searchAliasFuzzy, quranRaw, surahList, verseData, romanIndex, exDisplay, contentIdx, t]);

  // Act on a chosen suggestion: a verse-ref row navigates; a term row switches to that
  // suggestion's mode (so the graph now links by it) and opens its occurrences.
  const acceptSearch = useCallback((item) => {
    setSugOpen(false); setSugIndex(-1); setToolsOpen(false);
    if (!item || item.noResult) { setSearchMiss(true); return; }
    setSearchMiss(false);
    // "See all N results" → open the full ranked match list (savable/taggable like any concordance).
    if (item.allResults) {
      searchHistory.record({ id: `p:${item.q}`, kind: "phrase", q: item.q, label: item.q }, Date.now());
      setActiveWord(null); setOcc({ lookup: "", label: t("common.search.phraseResultsTitle", { q: item.q }), mode: "root", keys: item.keys, hi: item.hi }); setQuery(""); return;
    }
    if (item.ref) { navigate(item.s, item.a); setQuery(""); return; }
    searchHistory.record({ id: `t:${item.mode}:${item.lookup}`, kind: "term", mode: item.mode, lookup: item.lookup, label: item.display || item.label || item.lookup }, Date.now());
    if (item.mode !== searchMode) { setSearchMode(item.mode); reset(); }
    setActiveWord(item.lookup);
    openOcc(item.lookup, item.display || item.label, item.mode);
  }, [searchMode, setSearchMode, reset, openOcc, navigate, t, searchHistory]);

  // Re-run a remembered search. A phrase re-executes the verse search; a term re-runs directly.
  const acceptHistory = useCallback((h) => {
    if (h.kind === "phrase" && contentIdx?.idx) {
      const vs = verseSearch(h.q, contentIdx.idx, { limit: 300 });
      if (vs.length) {
        setSugOpen(false); setQuery(""); setActiveWord(null);
        setOcc({ lookup: "", label: t("common.search.phraseResultsTitle", { q: h.q }), mode: "root", keys: vs.map((r) => r.vk), hi: Object.fromEntries(vs.map((r) => [r.vk, r.pos])) });
        searchHistory.record({ id: `p:${h.q}`, kind: "phrase", q: h.q, label: h.q }, Date.now());
      } else { setQuery(h.q); }
    } else if (h.kind === "term") {
      acceptSearch({ mode: h.mode, lookup: h.lookup, display: h.label });
    }
  }, [contentIdx, t, acceptSearch, searchHistory]);

  const runSearch = useCallback((e) => {
    e?.preventDefault?.();
    if (tourLockSearchRef.current) return; // search disabled during the tour's search step
    const sug = searchSuggestions;
    acceptSearch(sugIndex >= 0 && sug[sugIndex] ? sug[sugIndex] : sug[0]); // highlighted, else top
  }, [searchSuggestions, sugIndex, acceptSearch]);

  // Arrow-key navigation of the dropdown (Enter is the form submit → runSearch).
  const onSearchKey = useCallback((e) => {
    const n = searchSuggestions.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setSugOpen(true); setSugIndex((i) => Math.min(n - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSugIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Escape") { setSugOpen(false); setSugIndex(-1); }
  }, [searchSuggestions.length]);

  // ── Workspace: quick-save the current graph, and re-open any saved item ──
  // Plain function (only an onClick handler) — avoids depending on the per-render
  // urlSnapshot object; it reads the live state directly when invoked.
  const saveGraphView = () => {
    const code = encodeState({ ...urlSnapshot, pos: posSnapshot() });
    const title = `${t("ws.savedView")}: ${currentVerse?.sn || surah} ${safeAyah}`;
    ws.saveItem({ type: "graph", title, payload: { code, surah, ayah: safeAyah } });
    ws.toast(t("ws.saved"));
    setGraphSaved(true); setTimeout(() => setGraphSaved(false), 1400); // on-button ✓ (toast can hide behind the keyboard)
  };
  const openWorkspaceItem = useCallback((item) => {
    const p = item.payload || {};
    // Occurrence/distribution items in lemma mode read the lemma index (l2v), which is
    // lazy-loaded — on a fresh load (exact mode, no query) it isn't fetched yet, so the
    // open would silently no-op. Kick off the load and retry once it lands.
    if ((item.type === "occ" || item.type === "dist") && p.mode === "lemma" && !l2v) {
      if (!lemmaMap) loadLemmas().then((m) => { setLemmaMap(m); setLemmaMapState(m); }).catch(() => setDataErr("lemma"));
      setPendingOpen(item);
      setWsOpen(false);
      return;
    }
    // A saved pairing matrix recomputes each term's verses from the indices; lemma terms need
    // l2v, which is lazy — defer until it lands (same retry path) so they don't reopen with 0.
    if (item.type === "pairing" && !l2v && [...(p.rows || []), ...(p.cols || [])].some((tm) => tm.mode === "lemma")) {
      if (!lemmaMap) loadLemmas().then((m) => { setLemmaMap(m); setLemmaMapState(m); }).catch(() => setDataErr("lemma"));
      setPendingOpen(item);
      setWsOpen(false);
      return;
    }
    setWsOpen(false);
    switch (item.type) {
      case "graph": { const u = decodeState(p.code); if (u) { closeAllViews(); applyState(u); if (u.view) openView(u.view); } break; }
      case "compare": setCmp({ A: p.A, B: p.B }); break;
      case "occ": openOcc(p.lookup, p.label, p.mode); break;
      case "dist": setDist({ lookup: p.lookup, label: p.label, mode: p.mode }); break;
      case "lexicon": setDef({ root: p.root, lexicon: p.lexicon }); break;
      case "phrase": if (p.surah) { navigate(p.surah, p.ayah); openPhrases(`${p.surah}:${p.ayah}`); } break;
      case "expr": setExprFocus(null); setExprInitial(p); setExprOpen(true); break;
      case "pairing": {
        const rebuild = (arr) => (arr || []).map((tm) => ({ ...tm, keys: (compareIndices[tm.mode] || {})[tm.key] || [] }));
        setPairing({ open: true, seed: null, rows: rebuild(p.rows), cols: rebuild(p.cols) });
        break;
      }
      case "verse": case "word": if (p.surah) navigate(p.surah, p.ayah); break;
      default: break;
    }
  }, [applyState, openOcc, navigate, openPhrases, closeAllViews, openView, l2v, lemmaMap, compareIndices]);
  // Complete a deferred open once the lemma index it was waiting on has loaded.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (pendingOpen && l2v) { const it = pendingOpen; setPendingOpen(null); openWorkspaceItem(it); }
  }, [pendingOpen, l2v, openWorkspaceItem]);
  /* eslint-enable react-hooks/set-state-in-effect */
  // Pin a note onto the current graph (anchored to the selected node, else the centre).
  const pinNote = useCallback((id) => {
    const nodeId = (selected && nmap[selected]) ? selected : "v:" + currentKey;
    ws.updateNote(id, { pin: { centerKey: currentKey, nodeId, dx: 0, dy: -70 } });
    ws.toast(t("ws.pinned"));
  }, [ws, t, selected, nmap, currentKey]);
  // Pinned notes anchored to the current centre verse.
  const stickyNotes = useMemo(() => ws.notes.filter((n) => n.pin && n.pin.centerKey === currentKey), [ws.notes, currentKey]);

  // Stable node handlers passed to the memoized GraphLayer.
  const onNodeEnter = useCallback((n) => { setHovered(n.id); if (n.type === "word") setActiveWord(n.lookup || n.wordNorm); }, []);
  const onNodeLeave = useCallback(() => { setHovered(null); if (!selected) setActiveWord(null); }, [selected]);
  const onNodeClick = useCallback((n, e) => {
    e.stopPropagation();
    if (draggedRef.current) { draggedRef.current = false; return; } // it was a drag, not a click
    if (n.type === "center") { setSelected(null); setActiveWord(null); return; }
    // Overflow meta-node: the verses the per-word cap hid. Open the full list so the
    // user can reach every occurrence (the escape hatch for hub words).
    if (n.type === "overflow") { const parent = nmap[parentMap[n.id]]; openOcc(n.lookup, parent?.label || n.lookup, searchMode); return; }
    if (n.type === "word") { setMeaningOpen(false); toggleWord(n.lookup || n.wordNorm, n.parentVerseKey); setActiveWord(n.lookup || n.wordNorm); setSelected(n.id); }
    else if (n.type === "verse") { if (selected === n.id) toggleVerse(n.verseKey); else { setSelected(n.id); setActiveWord(null); } }
  }, [selected, toggleWord, toggleVerse, nmap, parentMap, openOcc, searchMode]);
  // Keep a live ref to onNodeClick so the canvas pointerup (defined earlier) can fire
  // it without a forward reference. Written in an effect, never during render.
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);

  const hovNode = hovered ? nmap[hovered] : null;
  const selNode = selected ? nmap[selected] : null;
  // The root whose full lexicon article the inspector might show, and how many
  // shards the active lexicon's full articles are split into (0 = no full text).
  const selRoot = selNode?.type === "word" ? (selNode.root || rootOf(selNode.wordNorm)) : null;
  const activeShards = lexicons?.find((L) => L.id === activeLexicon)?.fullShards || 0;
  // Multi-word expression indices (built once the inventory loads) + the selected word's
  // own expressions, for the inline inspector section and the labs.
  const exprIndex = useMemo(() => (expr ? indexExpressions(expr) : null), [expr]);
  const exprByVerse = useMemo(() => (expr ? indexByVerse(expr) : null), [expr]);
  const selExpr = useMemo(() => (expr && exprIndex && selRoot ? expressionsForRoot(expr, exprIndex, selRoot) : null), [expr, exprIndex, selRoot]);

  // Lazy-load just the ONE shard the selected root falls in, the first time "show
  // more" is hit for it. A shard is a small slice of the lexicon's full articles,
  // so this fetches a few hundred KB instead of the whole (multi-MB) lexicon. The
  // fetched shard's roots are merged into meaningsFull; the shard key is remembered
  // so a root with no full article doesn't re-fetch (or spin) forever.
  useEffect(() => {
    if (!meaningOpen || !selRoot || !activeShards) return;
    const shard = shardOf(selRoot, activeShards);
    const key = `${activeLexicon}:${shard}`;
    if (fullLoaded.has(key)) return;
    let live = true;
    const done = (mp) => { if (!live) return; setFullLoaded((p) => new Set(p).add(key)); setMeaningsFull((p) => ({ ...(p || {}), ...(mp || {}) })); };
    loadLexiconFullShard(activeLexicon, shard).then(done).catch(() => done(null));
    return () => { live = false; };
  }, [meaningOpen, selRoot, activeLexicon, activeShards, fullLoaded]);

  /* ═══ Getting-started tour ═══
   * A scripted, end-to-end RESEARCH walkthrough on a known verse — Āyat al-Kursī
   * (2:255) — driven by react-joyride in CONTROLLED mode. "Action" steps WAIT
   * for the user to do the real thing (search to the verse, click a specific
   * word, switch the dictionary, open/close each modal, switch to Root mode,
   * toggle a tool, save, change theme) and advance when the gate effect detects
   * it; modal steps auto-advance once the modal is closed. Each step's `before`
   * re-establishes the canonical UI (selecting the example word by node id) so
   * the sequence stays deterministic. Auto-opens every load until the user ticks
   * "don't show on startup" (qg.tourHide). */
  const [tourRun, setTourRun] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  // First-run presentation video (qg.introHide), independent of the tour's flag.
  // `introAutoRef` distinguishes the auto first-run open (which hands off to the
  // tour on close) from a manual replay opened from Help (which just closes).
  const [introOpen, setIntroOpen] = useState(false);
  const introAutoRef = useRef(false);
  // "What's new" changelog. `whatsNew` holds the entries to display (null = closed).
  // `qg.lastSeenVersion` records the newest release the user has acknowledged, so
  // a deploy with a newer changelog entry auto-opens the dialog (see the gate in
  // the first-run effect). Persisted via JSON like every other qg.* key.
  const [whatsNew, setWhatsNew] = useState(null);
  const [lastSeenVersion, setLastSeenVersion] = usePersistedState("qg.lastSeenVersion", null,
    (v, f) => (typeof v === "string" ? v : f));
  // The example's target words resolved to live graph nodes (only when we're on
  // the example verse) — matched by their position in the verse (word nodes carry
  // wordIndex), so steps can spotlight & select them precisely.
  const tourEx = useMemo(() => {
    if (currentKey !== TOUR_EX.key) return null;
    const find = (wi) => graphNodes.find((g) => g.type === "word" && g.wordIndex === wi && g.parentVerseKey === TOUR_EX.key);
    const earth = find(TOUR_EX.earthWi), kurs = find(TOUR_EX.kursWi);
    // The كرسي partner verse (38:34) node — only present once كرسي is expanded.
    const partner = graphNodes.find((g) => g.type === "verse" && g.verseKey === TOUR_EX.kursPartner);
    return { earthId: earth?.id || null, kursId: kurs?.id || null, earthNorm: earth?.wordNorm || null, earthLookup: earth?.lookup || earth?.wordNorm || null, kursNorm: kurs?.wordNorm || null, partnerId: partner?.id || null };
  }, [currentKey, graphNodes]);

  const tourSettle = useCallback(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))), []);
  const tourReset = useCallback(() => {
    setToolsOpen(false); setWsOpen(false); setSheetOpen(false); setShowHelp(false);
    setSelected(null); setActiveWord(null);
    setDist(null); setOcc(null); setCmp(null); setCtx(null); setPhrase(null); setDef(null); setLab(null); setRhyme(null); setAya(null); setSurahLab(null);
  }, []);
  // Each step's `before` sets the canonical UI it needs, then waits for the commit
  // so its target exists before react-joyride measures it. `navEx` guarantees the
  // example verse; `selectId` selects a specific node (the example word).
  const tourBefore = useCallback((cfg = {}) => async () => {
    if (cfg.navEx && currentKey !== TOUR_EX.key) navigate(TOUR_EX.s, TOUR_EX.a);
    if (cfg.mode) setSearchMode(cfg.mode); // pin the grouping mode so counts are accurate
    setToolsOpen(!!cfg.tools); setWsOpen(!!cfg.ws);
    setOcc(null); setCmp(null); setCtx(null); setPhrase(null); setDef(null); setDist(null); setLab(null); setRhyme(null); setAya(null); setSurahLab(null);
    if (cfg.selectId) {
      const n = nmap[cfg.selectId];
      setSelected(cfg.selectId); setActiveWord(n?.lookup || n?.wordNorm || null); setSheetOpen(true);
      // `collapse`: make sure the selected word is NOT fanned out, so the step's
      // "click it again to fan out" is a real, repeatable action (the first tap
      // already toggled it open; undo that here).
      if (cfg.collapse && n) {
        const expKey = `${n.lookup || n.wordNorm}@${n.parentVerseKey}`;
        setExpandedWords((prev) => { if (!prev.has(expKey)) return prev; const nw = new Set(prev); nw.delete(expKey); return nw; });
      }
    } else { setSelected(null); setActiveWord(null); setSheetOpen(false); }
    await tourSettle();
  }, [currentKey, navigate, nmap, setSearchMode, setExpandedWords, tourSettle]);

  const tourSteps = useMemo(() => {
    const center = (key, content) => ({ target: '[data-tour="stage"]', placement: "center", title: t(`tour.${key}Title`), content: content ?? t(`tour.${key}Body`), before: tourBefore({}) });
    const info = (target, key, cfg, placement, extra) => ({ target, placement: placement || "auto", title: t(`tour.${key}Title`), content: t(`tour.${key}Body`), before: tourBefore(cfg), ...extra });
    const action = (target, key, cfg, gate, placement, extra) => ({ target, placement: placement || "auto", title: t(`tour.${key}Title`), content: t(`tour.${key}Body`), before: tourBefore(cfg), data: { gate, gated: true }, ...extra });
    const colorsContent = (
      <div className="ag-tour-colors">
        <p>{t("tour.colorsBody")}</p>
        <div className="ag-tour-color"><span className="ag-legend-dot" style={{ background: "var(--gold-500)" }} />{t("tour.colCenter")}</div>
        <div className="ag-tour-color"><span className="ag-legend-swatch ag-legend-freq" />{t("tour.colWord")}</div>
        <div className="ag-tour-color"><span className="ag-legend-swatch ag-legend-depth" />{t("tour.colVerse")}</div>
        <div className="ag-tour-color"><span className="ag-legend-line" style={{ borderColor: "var(--gold-400)" }} />{t("tour.colLink")}</div>
        <div className="ag-tour-color"><span className="ag-legend-dot" style={{ background: "#34d8a8" }} />{t("tour.colGreen")}</div>
        <div className="ag-tour-color"><span className="ag-legend-ring" />{t("tour.colPurple")}</div>
      </div>
    );
    // Plain-language "what am I looking at" diagram: a centre verse, a word that
    // branches to two other verses — labelled simply (verse/āyah, word).
    const basicsContent = (
      <div className="ag-tour-basics">
        <svg viewBox="0 0 260 130" className="ag-tour-basics-svg" role="img" aria-label={t("tour.basicsAlt")}>
          <line x1="130" y1="60" x2="70" y2="40" stroke="var(--gold-500)" strokeWidth="2.2" strokeOpacity="0.8" />
          <line x1="70" y1="40" x2="40" y2="100" stroke="#6aa8ff" strokeWidth="1.6" strokeOpacity="0.7" />
          <line x1="70" y1="40" x2="120" y2="108" stroke="#6aa8ff" strokeWidth="1.6" strokeOpacity="0.7" />
          <circle cx="40" cy="100" r="9" fill="#6aa8ff33" stroke="#6aa8ff" strokeWidth="1.6" />
          <circle cx="120" cy="108" r="9" fill="#6aa8ff33" stroke="#6aa8ff" strokeWidth="1.6" />
          <circle cx="70" cy="40" r="11" fill="#fb718533" stroke="#fb7185" strokeWidth="2" />
          <circle cx="130" cy="60" r="17" fill="color-mix(in oklab, var(--gold-400) 20%, transparent)" stroke="var(--gold-400)" strokeWidth="3" />
          <text x="130" y="64" textAnchor="middle" fontSize="11" fill="var(--gold-400)" fontFamily="var(--font-display)">۞</text>
          <text x="130" y="92" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--gold-400)" fontFamily="var(--font-ui)">{t("tour.basicsVerse")}</text>
          <text x="70" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fb7185" fontFamily="var(--font-ui)">{t("tour.basicsWord")}</text>
          <text x="195" y="108" textAnchor="middle" fontSize="10.5" fill="#6aa8ff" fontFamily="var(--font-ui)">{t("tour.basicsOther")}</text>
        </svg>
        <p>{t("tour.basicsP1")}</p>
        <p>{t("tour.basicsP2")}</p>
      </div>
    );
    const earthSel = tourEx?.earthId ? `[data-node="${tourEx.earthId}"]` : '[data-tour="stage"]';
    const kursSel = tourEx?.kursId ? `[data-node="${tourEx.kursId}"]` : '[data-tour="stage"]';
    const partnerSel = tourEx?.partnerId ? `[data-node="${tourEx.partnerId}"]` : '[data-tour="stage"]';
    const earthId = tourEx?.earthId;
    const lit = { hideOverlay: true }; // modal/canvas steps: keep the page & modal bright + interactive
    const noRing = { data: { noRing: true } }; // large "subject" panels: card explains, no ring
    return [
      center("welcome"),                                                                              // 0
      center("basics", basicsContent),                                                                // 1 plain-language idea
      center("colors", colorsContent),                                                                // 2
      info('[data-tour="search"]', "search", {}, "bottom", { data: { lockSearch: true } }),            // 3 explain search (read-only here)
      action('[data-tour="picker"]', "picker", {}, "navigate", "bottom"),                             // 4 pick 2:255 (waits for both)
      info('[data-tour="modes"]', "modes", { mode: "exact", navEx: true }, "bottom"),                 // 5 modes (pin Word)
      info('[data-tour="dock"]', "graph", { navEx: true }, "left", { ...lit, ...noRing }),            // 6 pan/zoom
      action(earthSel, "tapEarth", { navEx: true }, `word:${tourEx?.earthNorm || ""}`, "auto"),        // 7 tap ٱلْأَرْض (select)
      action(earthSel, "fanOut", { selectId: earthId, collapse: true }, `expand:${tourEx?.earthLookup || ""}@${TOUR_EX.key}`, "auto", lit), // 8 re-click to fan out its verses
      action(earthSel, "dragZoom", { selectId: earthId }, `drag:${earthId || ""}`, "auto", lit),                // 9 drag ٱلْأَرْض itself (children follow); auto-zoom-out effect below
      info(".ag-inspector", "inspector", { selectId: earthId }, "auto", noRing),                      // 9
      action('[data-tour="lexSelect"]', "dict", { selectId: earthId }, "lexicon", "auto"),            // 10 switch dictionary
      action('[data-tour="distBtn"]', "dist", { selectId: earthId }, "modal:dist", "auto", lit),      // 11 distribution
      action('[data-tour="compareBtn"]', "compare", { selectId: earthId }, "modal:cmp", "auto", lit), // 12 compare
      action('[data-tour="allVersesBtn"]', "allverses", { selectId: earthId }, "modal:occ", "auto", lit), // 13 all verses
      action(kursSel, "tapKursi", { navEx: true }, `word:${tourEx?.kursNorm || ""}`, "auto"),         // 13 rare word
      action(partnerSel, "kursiVerse", {}, `verse:${TOUR_EX.kursPartner}`, "auto"),                   // 14 click the other verse (38:34)
      info(".ag-inspector", "kursiVerseDetail", { selectId: tourEx?.partnerId }, "auto", noRing),     // 15 its details stay open
      action('[data-tour="modeRoot"]', "rootMode", {}, "mode-root", "bottom"),                        // 16 root mode
      action('[data-tour="echoesBtn"]', "echoes", {}, "modal:phrase", "auto", lit),                   // 16 echoes
      action('[data-tour="contextBtn"]', "context", {}, "modal:ctx", "auto", lit),                    // 17 context
      action('[data-tour="exprBtn"]', "expr", {}, "modal:expr", "bottom", lit),                        // expressions explorer
      action('[data-tour="tools"]', "toolsOpen", {}, "tools", "bottom"),                              // 18 open tools
      action('[data-tour="toolspop"]', "toolsTry", { tools: true }, "tool-toggle", "left"),           // 19 try a toggle
      action('[data-tour="saveViewBtn"]', "saveView", {}, "save", "left"),                            // 20 save the view
      action('[data-tour="copyLinkBtn"]', "shareLink", {}, "copylink", "left"),                        // 21 share a state link
      action('[data-tour="exportPngBtn"]', "download", {}, "export", "left"),                          // 22 download an image
      action('[data-tour="workspace"]', "wsOpen", {}, "ws", "bottom"),                                // 23 open workspace
      info('[data-tour="wsdrawer"]', "wsView", { ws: true }, "left", { ...lit, ...noRing }),          // 24 workspace detail
      action('[data-tour="helpBtn"]', "help", {}, "modal:help", "bottom", lit),                        // 25 open & close help
      action('[data-tour="themeBtn"]', "theme", { ws: false }, "theme", "bottom"),                    // 26 theme/lang
      center("finish"),                                                                               // 27
    ];
  }, [t, tourEx, tourBefore]);

  // ── Gating: advance an action step once the user performs the action ──
  const gateRef = useRef({});
  // Capture a baseline (and reset the modal "armed" latch) on entering a step.
  useEffect(() => {
    if (!tourRun) return;
    gateRef.current = {
      lex: activeLexicon, theme, lang, rareOnly, renderer,
      morph: JSON.stringify(morphFilter), saveCount: ws.items.length, expC: exportCount, dragBase: dragTick, armed: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourRun, tourIndex]);
  useEffect(() => {
    if (!tourRun) return;
    const gate = tourSteps[tourIndex]?.data?.gate;
    if (!gate) return;
    const B = gateRef.current;
    let done = false;
    if (gate === "navigate") done = currentKey === TOUR_EX.key;
    else if (gate.startsWith("word:")) { const nw = gate.slice(5); done = !!nw && selNode?.type === "word" && selNode.wordNorm === nw; }
    else if (gate.startsWith("verse:")) { const vk = gate.slice(6); done = selNode?.type === "verse" && selNode.verseKey === vk; }
    else if (gate.startsWith("expand:")) { const k = gate.slice(7); const exp = expandedWords.has(k); if (!exp) B.armed = true; done = B.armed && exp; } // saw it collapsed → then fanned out
    else if (gate.startsWith("drag:")) { done = dragTick > B.dragBase && draggedId === gate.slice(5); } // dragged that exact node, during this step
    else if (gate === "lexicon") done = activeLexicon !== B.lex;
    else if (gate === "mode-root") done = searchMode === "root";
    else if (gate === "tools") done = toolsOpen;
    else if (gate === "tool-toggle") done = rareOnly !== B.rareOnly || renderer !== B.renderer || JSON.stringify(morphFilter) !== B.morph;
    else if (gate === "save") done = ws.items.length > B.saveCount;
    else if (gate === "copylink") done = linkCopied;              // copied a share link
    else if (gate === "export") done = exportCount > B.expC;      // downloaded an image
    else if (gate === "ws") done = wsOpen;
    else if (gate === "theme") done = theme !== B.theme || lang !== B.lang;
    else if (gate.startsWith("modal:")) {
      const open = gate === "modal:dist" ? !!dist : gate === "modal:cmp" ? !!cmp : gate === "modal:occ" ? !!occ : gate === "modal:phrase" ? !!phrase : gate === "modal:ctx" ? !!ctx : gate === "modal:expr" ? exprOpen : gate === "modal:help" ? showHelp : false;
      if (open) B.armed = true; // user opened it
      done = B.armed && !open; // …then closed it
    }
    if (done) setTourIndex((i) => (tourSteps[i]?.data?.gate === gate ? i + 1 : i));
  }, [tourRun, tourIndex, tourSteps, currentKey, selNode, activeLexicon, searchMode, toolsOpen, rareOnly, renderer, morphFilter, ws.items.length, linkCopied, exportCount, wsOpen, theme, lang, expandedWords, draggedId, dragTick, dist, cmp, occ, phrase, ctx, exprOpen, showHelp]);

  // Suppress text selection while the tour runs (so dragging the graph or the
  // tour card never selects page text).
  useEffect(() => {
    document.documentElement.classList.toggle("qg-tour-active", tourRun);
    return () => document.documentElement.classList.remove("qg-tour-active");
  }, [tourRun]);

  // On a tour "modal" step the user must CLOSE the window to continue. Block
  // clicks inside the modal body (which would open/navigate and wrongly advance
  // the tour) at the capture phase — leaving hover, scroll, and the close button
  // (in the header) / backdrop working.
  const tourModalStep = tourRun && !!tourSteps[tourIndex]?.data?.gate?.startsWith?.("modal:");
  // The compare step is hands-on: the user builds the comparison by typing a second
  // term (ٱلْأَرْض) and setting it. Keep the term-picker area live, but still block the
  // result rows/chips below — those navigate / re-pick and would derail the tour.
  const tourCmpStep = tourRun && tourSteps[tourIndex]?.data?.gate === "modal:cmp";
  useEffect(() => {
    if (!tourModalStep) return undefined;
    const block = (e) => {
      const inModal = e.target.closest?.(".ag-modal");
      if (!inModal || e.target.closest?.(".ag-modal-head")) return; // backdrop or close/header → allow
      if (tourCmpStep && e.target.closest?.(".ag-cmp-slots")) return; // compare: term pickers stay live
      if (e.target.closest?.("[data-export]")) return; // downloads (CSV/JSON/…) stay usable during the tour
      e.preventDefault(); e.stopPropagation();
    };
    document.addEventListener("click", block, true);
    return () => document.removeEventListener("click", block, true);
  }, [tourModalStep, tourCmpStep]);

  // The search step just *shows* the search bar; it stays read-only so the user
  // doesn't navigate away mid-tour (they use the sūrah/āyah selectors next).
  const tourLockSearch = tourRun && !!tourSteps[tourIndex]?.data?.lockSearch;
  useEffect(() => { tourLockSearchRef.current = tourLockSearch; }, [tourLockSearch]);

  // Entering the "drag ٱلْأَرْض" step, ease the view out a little so the word's
  // freshly fanned-out verses fit. Done in an effect (reading containerRef via
  // zoomBy is fine here) and deferred so the setState isn't synchronous in the body.
  useEffect(() => {
    if (!tourRun || !tourSteps[tourIndex]?.data?.gate?.startsWith?.("drag:")) return undefined;
    const id = window.setTimeout(() => zoomBy(0.7), 260); // after the fanned layout settles
    return () => window.clearTimeout(id);
  }, [tourRun, tourIndex, tourSteps, zoomBy]);

  // Launch the tour from a clean, predictable state: snapshot the user's settings,
  // reset the graph-affecting ones to defaults so the scripted example always
  // behaves the same (SVG renderer — needed for node spotlighting; no rare-only /
  // morphology filter / custom stop-words hiding the example words; minimal
  // branching), then restore everything (including the centre verse) on exit.
  const prevSettingsRef = useRef(null);
  const startTour = () => {
    prevSettingsRef.current = { surah, ayah, searchMode, precision, hideStop, showLoops, rareOnly, morphFilter, renderer, maxBranch, stopExtra, stopDisabled, activeLexicon, theme };
    setSearchMode("exact"); setPrecision("loose"); setHideStop(true); setShowLoops(true);
    setRareOnly(false); setMorphFilter({ ...EMPTY_MORPH_FILTER }); setRenderer("svg"); setMaxBranch(3);
    setStopExtra([]); setStopDisabled([]);
    tourReset(); setTourIndex(0); setTourRun(true);
  };
  const endTour = (dontShow) => {
    setTourRun(false); setTourIndex(0); tourReset();
    const s = prevSettingsRef.current;
    if (s) {
      setSearchMode(s.searchMode); setPrecision(s.precision); setHideStop(s.hideStop); setShowLoops(s.showLoops);
      setRareOnly(s.rareOnly); setMorphFilter(s.morphFilter); setRenderer(s.renderer); setMaxBranch(s.maxBranch);
      setStopExtra(s.stopExtra); setStopDisabled(s.stopDisabled); setActiveLexicon(s.activeLexicon); setTheme(s.theme);
      setSurah(s.surah); setAyah(s.ayah);
      prevSettingsRef.current = null;
    }
    if (dontShow) { try { localStorage.setItem("qg.tourHide", "1"); } catch { /* private mode */ } }
  };

  const tourHidden = () => { try { return localStorage.getItem("qg.tourHide") === "1"; } catch { return false; } };
  const persistIntroHide = (dontShow) => { if (dontShow) { try { localStorage.setItem("qg.introHide", "1"); } catch { /* private mode */ } } };
  // Dismiss the intro video. On the auto first-run open this hands off to the
  // interactive tour (the chosen "video → tour" flow) unless the tour is disabled;
  // when replayed from Help it just closes.
  const closeIntro = (dontShow) => {
    setIntroOpen(false);
    persistIntroHide(dontShow);
    const auto = introAutoRef.current; introAutoRef.current = false;
    if (auto && !tourHidden()) startTour();
  };
  // "Start the interactive tour" button inside the video — always launches it.
  const startTourFromIntro = (dontShow) => {
    setIntroOpen(false);
    persistIntroHide(dontShow);
    introAutoRef.current = false;
    startTour();
  };
  // Replay the intro from Help (manual; closing won't auto-start the tour).
  const openIntro = () => { introAutoRef.current = false; setShowHelp(false); setIntroOpen(true); };

  // Open the "what's new" dialog from Help with the FULL release history, and
  // mark everything seen on close. Auto-open (deploy gate) passes only the unseen
  // slice — see the first-run effect below.
  const openWhatsNew = () => { setShowHelp(false); setWhatsNew(CHANGELOG); };
  const closeWhatsNew = () => { setWhatsNew(null); setLastSeenVersion(CURRENT_VERSION); };

  // Auto-open once, after data is ready, unless dismissed for good. The intro
  // video comes first; the tour follows when the video closes (see closeIntro).
  const autoTourRef = useRef(false);
  useEffect(() => {
    if (autoTourRef.current || loading || error || !currentVerse) return;
    autoTourRef.current = true;
    // Arrived via a shared link that opens an analysis view? Don't auto-run the intro/tour —
    // it would tourReset() the just-restored dialog away (the "shared link works only when the
    // tour is disabled" bug). The user came for that view, not the walkthrough.
    if (arrivedViaViewRef.current) return;
    let introHidden = false;
    try { introHidden = localStorage.getItem("qg.introHide") === "1"; } catch { /* ignore */ }
    // Changelog gate. A null lastSeenVersion means a brand-new install OR an
    // existing user from before this feature shipped — baseline them to the
    // current version so we never retroactively dump the whole history; real
    // changelogs surface from the NEXT deploy onward.
    const unseen = lastSeenVersion == null ? [] : unseenSince(lastSeenVersion);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (lastSeenVersion == null) setLastSeenVersion(CURRENT_VERSION);
    if (!introHidden) { introAutoRef.current = true; setIntroOpen(true); }
    else if (unseen.length) setWhatsNew(unseen);
    else if (!tourHidden()) startTour();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, currentVerse]);

  if (error) return (
    <div className="ag-boot">
      <div className="ag-boot-glyph">۞</div>
      <div className="ag-boot-msg">{t("common.boot.error")}</div>
      <div className="ag-boot-sub">{error}</div>
      <button className="ag-btn is-gold" onClick={loadData}>{t("common.boot.retry")}</button>
    </div>
  );

  if (loading) return (
    <div className="ag-boot">
      <div className="ag-boot-glyph">۞</div>
      <div className="ag-boot-msg">{t("common.boot.loading")}</div>
      <div className="ag-boot-bar"><div /></div>
    </div>
  );

  const totalExp = expandedWords.size + expandedVerses.size;
  const isEmpty = !!currentVerse && graphNodes.length <= 1;
  const inspOpen = !!selNode;
  // On large graphs, cull nodes/links outside the (padded) visible world rect so the
  // SVG DOM stays small. null on small graphs → GraphLayer keeps its memoised fast
  // path and never re-renders on pan. Suspended while exporting (capture everything).
  const cullViewport = (graphNodes.length > CULL_THRESHOLD && !exporting)
    ? (() => {
        const m = 240 / transform.k; // ~240px screen margin, in world units
        return {
          minX: -transform.x / transform.k - m, minY: -transform.y / transform.k - m,
          maxX: (dims.w - transform.x) / transform.k + m, maxY: (dims.h - transform.y) / transform.k + m,
        };
      })()
    : null;
  // Above POS_LINK_CAP a share link can't embed the settled positions (URL size) — it
  // will reproduce a re-simulated layout, not this exact one. Tell the user.
  const layoutNotShared = graphNodes.length > POS_LINK_CAP;

  return (
    <div className="ag-app">
      {/* Recoverable lazy-load failure — dismissible, with retry (replaces the old
          silent .catch that stranded the inspector/graph in a permanent loading state). */}
      {dataErr && (
        <div role="alert" style={{ position: "fixed", insetInlineStart: "50%", insetBlockStart: 8, transform: "translateX(-50%)", zIndex: 200, display: "flex", alignItems: "center", gap: "var(--space-3, 12px)", background: "var(--surface-3, #1b2233)", color: "var(--text-body)", border: "1px solid var(--gold-500, #b8932f)", borderRadius: 8, padding: "8px 12px", fontSize: "var(--text-sm)", boxShadow: "var(--shadow-2, 0 6px 20px rgba(0,0,0,.35))", maxWidth: "92vw" }}>
          <span>{t(`common.dataErr.${dataErr}`)}</span>
          <button type="button" className="ag-btn is-gold" style={{ padding: "2px 10px" }} onClick={retryLoads}>{t("common.dataErr.retry")}</button>
          <button type="button" className="ag-iconbtn" style={{ width: 24, height: 24, fontSize: 12 }} aria-label={t("common.dataErr.dismiss")} onClick={() => setDataErr(null)}>✕</button>
        </div>
      )}
      {/* ── Toolbar ── */}
      <header className="ag-bar">
        <button type="button" className="ag-brand" aria-label={t("common.brand.home")}
          onClick={() => { setSelected(null); setActiveWord(null); setToolsOpen(false); setTransform(homeView()); }}>
          <img src={`${import.meta.env.BASE_URL}logomark.svg`} alt="" className="ag-logo" />
          <span className="ag-wordmark">آيات<i>.network</i></span>
        </button>
        <span className="ag-ver" dir="ltr" title={t("changelog.version") + " " + CURRENT_VERSION}>v{CURRENT_VERSION}</span>

        <form data-tour="search" className={"ag-search" + (searchMiss ? " is-miss" : "")} onSubmit={runSearch} role="search" style={{ position: "relative" }}>
          <button type="submit" className="ag-search-btn" aria-label={t("common.search.button")} title={t("common.search.button")} disabled={tourLockSearch}>⌕</button>
          <input className="ag-input" type="search" value={query} aria-label={t("common.search.aria")} readOnly={tourLockSearch}
            role="combobox" aria-expanded={sugOpen && searchSuggestions.length > 0} aria-controls="ag-search-listbox" aria-autocomplete="list"
            placeholder={searchMode === "root" ? t("common.search.phRoot") : searchMode === "lemma" ? t("common.search.phLemma") : t("common.search.phWord")}
            onChange={(e) => { setQuery(e.target.value); setSugIndex(-1); setSugOpen(true); if (searchMiss) setSearchMiss(false); }}
            onFocus={() => setSugOpen(true)} onBlur={() => setSugOpen(false)} onKeyDown={onSearchKey} />
          {sugOpen && !tourLockSearch && !query.trim() && searchHistory.items.length > 0 && (
            <div className="ag-search-recents" role="listbox" aria-label={t("common.search.recent")}
              style={{ position: "absolute", insetInlineStart: 0, insetBlockStart: "calc(100% + 4px)", zIndex: 40, background: "var(--surface-3, #1b2233)", border: "1px solid var(--gold-500, #b8932f)", borderRadius: 8, padding: 4, boxShadow: "var(--shadow-2, 0 6px 20px rgba(0,0,0,.35))", display: "flex", flexDirection: "column", gap: 2, maxHeight: 340, overflowY: "auto", minWidth: 240, maxWidth: 380 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 8px", color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>
                <span>{t("common.search.recent")}</span>
                <button type="button" className="ag-btn ag-btn-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => searchHistory.clear()}>{t("common.search.clearHistory")}</button>
              </div>
              {[...searchHistory.items].sort((a, b) => b.at - a.at).slice(0, 8).map((h) => (
                <button type="button" key={h.id} role="option" className="ag-search-suggest"
                  onMouseDown={(e) => e.preventDefault()} onClick={() => acceptHistory(h)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: "var(--text-body)", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: "var(--text-sm)", textAlign: "start", width: "100%" }}>
                  <span style={{ color: "var(--text-faint)" }} aria-hidden="true">↻</span>
                  <span style={{ fontFamily: "var(--font-quran)", color: "var(--gold-400)", fontSize: "var(--text-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
                  <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span className={"ag-badge " + (h.kind === "phrase" ? "t-lemma" : h.mode === "root" ? "t-root" : h.mode === "lemma" ? "t-lemma" : "t-word")} style={{ fontSize: "var(--text-2xs, 10px)", padding: "1px 6px" }}>
                      {h.kind === "phrase" ? t("common.search.phraseBadge") : h.mode === "root" ? t("common.graphMode.root") : h.mode === "lemma" ? t("common.graphMode.lemma") : t("common.graphMode.word")}
                    </span>
                    <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }} title={t("common.search.timesSearched", { n: h.count })}>×{h.count}</span>
                    <span role="button" tabIndex={-1} aria-label={t("common.search.removeHistory")} title={t("common.search.removeHistory")}
                      onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); searchHistory.remove(h.id); }}
                      style={{ cursor: "pointer", color: "var(--text-faint)" }}>✕</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {sugOpen && !tourLockSearch && query.trim() && searchSuggestions.length > 0 && (
            <div id="ag-search-listbox" role="listbox" aria-label={t("common.search.suggestions")}
              style={{ position: "absolute", insetInlineStart: 0, insetBlockStart: "calc(100% + 4px)", zIndex: 40, background: "var(--surface-3, #1b2233)", border: "1px solid var(--gold-500, #b8932f)", borderRadius: 8, padding: 4, boxShadow: "var(--shadow-2, 0 6px 20px rgba(0,0,0,.35))", display: "flex", flexDirection: "column", gap: 2, maxHeight: 340, overflowY: "auto", minWidth: 240, maxWidth: 380 }}>
              {searchSuggestions.map((item, i) => (
                <button type="button" key={(item.mode || "ref") + ":" + item.lookup + ":" + i} role="option" aria-selected={i === sugIndex} className="ag-search-suggest"
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSugIndex(i)} onClick={() => acceptSearch(item)}
                  style={{ display: "flex", flexDirection: "column", gap: 2, background: i === sugIndex ? "var(--surface-4, #243049)" : "transparent", color: "var(--text-body)", border: "none", borderRadius: 6, padding: "5px 8px", cursor: item.noResult ? "default" : "pointer", fontSize: "var(--text-sm)", textAlign: "start", width: "100%", opacity: item.noResult ? 0.65 : 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                    <span style={{ fontFamily: item.noResult ? "inherit" : "var(--font-quran)", color: item.noResult ? "var(--text-faint)" : item.didYouMean ? "var(--text-muted, #9aa3b2)" : "var(--gold-400)", fontSize: "var(--text-base)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.didYouMean ? "≈ " : ""}{item.noResult ? t("common.search.noResults") + " · " + item.label : (item.display || item.label || item.lookup)}
                    </span>
                    <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {item.surah && <span className="ag-badge t-word" style={{ fontSize: "var(--text-2xs, 10px)", padding: "1px 6px" }}>{t("common.search.surahBadge")}</span>}
                      {item.phrase && <span className="ag-badge t-lemma" style={{ fontSize: "var(--text-2xs, 10px)", padding: "1px 6px" }}>{t("common.search.phraseBadge")}</span>}
                      {item.roman && <span className="ag-badge t-root" style={{ fontSize: "var(--text-2xs, 10px)", padding: "1px 6px" }} title={t("common.search.latinBadge")}>𝐀</span>}
                      {!item.ref && !item.noResult && !item.allResults && <span className={"ag-badge " + (item.mode === "root" ? "t-root" : item.mode === "lemma" ? "t-lemma" : "t-word")} style={{ fontSize: "var(--text-2xs, 10px)", padding: "1px 6px" }}>{item.mode === "root" ? t("common.graphMode.root") : item.mode === "lemma" ? t("common.graphMode.lemma") : t("common.graphMode.word")}</span>}
                      {!item.noResult && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", minWidth: 18, textAlign: "end" }}>{item.allResults ? "≫" : item.ref ? "→" : item.count}</span>}
                    </span>
                  </span>
                  {item.snippet && <span dir="rtl" style={{ fontFamily: "var(--font-quran)", color: "var(--text-faint)", fontSize: "var(--text-xs)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{item.snippet}</span>}
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="ag-controls">
          <div data-tour="modes" className="ag-seg" role="group" aria-label={t("common.search.modeGroup")}>
            <button type="button" className={"" + (searchMode === "exact" ? "is-on" : "")} title={t("common.search.matchWord")}
              aria-pressed={searchMode === "exact"} onClick={() => { setSearchMode("exact"); reset(); }}>{t("common.graphMode.word")}</button>
            <button type="button" className={"is-lemma " + (searchMode === "lemma" ? "is-on" : "")} title={t("common.search.matchLemma")}
              aria-pressed={searchMode === "lemma"} onClick={() => { setSearchMode("lemma"); reset(); }}>{t("common.graphMode.lemma")}</button>
            <button type="button" data-tour="modeRoot" className={"is-root " + (searchMode === "root" ? "is-on" : "")} title={t("common.search.matchRoot")}
              aria-pressed={searchMode === "root"} onClick={() => { setSearchMode("root"); reset(); }}>{t("common.graphMode.root")}</button>
          </div>

          {/* Both selects wrapped so the tour can spotlight the whole picker. */}
          <span data-tour="picker" className="ag-picker">
            <SurahSelect value={surah} surahList={surahList}
              onChange={(id) => { setSurah(id); setAyah(1); reset(); }} />
            <div className="ag-select is-ayah">
              <select aria-label={t("common.select.ayah")} value={safeAyah} onChange={(e) => { setAyah(+e.target.value); reset(); }}>
                {Array.from({ length: ayahCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          </span>

          <div className="ag-tools" ref={toolsRef}>
            <button type="button" data-tour="tools" className={"ag-iconbtn is-gold" + (toolsOpen ? " is-active" : "")} aria-label={t("common.tools.title")}
              aria-expanded={toolsOpen} onClick={() => setToolsOpen((o) => !o)}>⚙</button>
            {toolsOpen && (
              <div data-tour="toolspop" className="ag-popover" role="dialog" aria-label={t("common.tools.title")}>
                <h3 className="ag-pop-h">{t("common.tools.title")}</h3>
                {(() => {
                  const sliderMax = allowBig ? branchMax : Math.min(branchMax, SOFT_CAP);
                  return (
                    <div className="ag-range">
                      <div className="ag-range-top">
                        <span className="ag-range-lab">{t("common.tools.versesPerWord")}</span>
                        <span className="ag-range-val">{Math.min(maxBranch, sliderMax)}<span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}> / {sliderMax}</span></span>
                      </div>
                      <input type="range" aria-label={t("common.tools.versesPerWord")} min={3} max={sliderMax} value={Math.min(maxBranch, sliderMax)}
                        onChange={(e) => setMaxBranch(+e.target.value)} />
                      {branchMax > SOFT_CAP && (
                        <label className="ag-switch" style={{ marginBlockStart: "var(--space-2)" }}>
                          <span>{t("common.tools.allowBig", { n: SOFT_CAP })} <span style={{ color: "var(--rubric-400)", fontSize: "var(--text-xs)" }}>{t("common.tools.allowBigHint")}</span></span>
                          <input type="checkbox" checked={allowBig} onChange={(e) => setAllowBig(e.target.checked)} />
                          <span className="ag-track" aria-hidden="true" />
                        </label>
                      )}
                    </div>
                  );
                })()}
                <div className="ag-pop-sec">
                  <label className="ag-switch">
                    <span>{t("common.tools.hideStop")}</span>
                    <input type="checkbox" checked={hideStop} onChange={(e) => setHideStop(e.target.checked)} />
                    <span className="ag-track" aria-hidden="true" />
                  </label>
                  <label className="ag-switch">
                    <span>{t("common.tools.showLoops")}</span>
                    <input type="checkbox" checked={showLoops} onChange={(e) => setShowLoops(e.target.checked)} />
                    <span className="ag-track" aria-hidden="true" />
                  </label>
                  <label className="ag-switch">
                    <span>{t("common.tools.rareOnly")}</span>
                    <input type="checkbox" checked={rareOnly} onChange={(e) => setRareOnly(e.target.checked)} />
                    <span className="ag-track" aria-hidden="true" />
                  </label>
                </div>
                <div className="ag-morph">
                  <div className="ag-morph-grp">
                    <span className="ag-range-lab">{t("common.tools.precision")}</span>
                    <div className="ag-seg ag-seg-sm" role="group" aria-label={t("common.tools.precisionAria")}>
                      <button type="button" className={precision === "loose" ? "is-on" : ""} title={t("common.tools.looseTitle")}
                        aria-pressed={precision === "loose"} onClick={() => { setPrecision("loose"); reset(); }}>{t("common.tools.loose")}</button>
                      <button type="button" className={precision === "strict" ? "is-on" : ""} title={t("common.tools.strictTitle")}
                        aria-pressed={precision === "strict"} onClick={() => { setPrecision("strict"); reset(); }}>{t("common.tools.strict")}</button>
                    </div>
                  </div>
                </div>
                <MorphologyFilter filter={morphFilter} onChange={setMorphFilter} />
                <div className="ag-morph">
                  <div className="ag-morph-grp">
                    <span className="ag-range-lab">{t("common.tools.renderer")}</span>
                    <div className="ag-seg ag-seg-sm" role="group" aria-label={t("common.tools.renderer")}>
                      <button type="button" className={renderer === "svg" ? "is-on" : ""} title={t("common.tools.svgTitle")}
                        aria-pressed={renderer === "svg"} onClick={() => setRenderer("svg")}>SVG</button>
                      <button type="button" className={renderer === "canvas" ? "is-on" : ""} title={t("common.tools.canvasTitle")}
                        aria-pressed={renderer === "canvas"} onClick={() => setRenderer("canvas")}>Canvas</button>
                    </div>
                  </div>
                </div>
                <StopWordEditor
                  particles={[...STOP_PARTICLES]} content={[...STOP_CONTENT_DEFAULT]}
                  hiddenSet={stopSet} extra={stopExtra}
                  onToggle={toggleStopWord}
                  onShowAll={showAllStop} onHideAll={hideAllStop}
                  onAddExtra={(w) => setStopExtra((p) => (p.includes(w) ? p : [...p, w]))}
                  onRemoveExtra={(w) => setStopExtra((p) => p.filter((x) => x !== w))} />
              </div>
            )}
          </div>

          <button type="button" data-tour="workspace" className={"ag-iconbtn" + (wsOpen ? " is-active" : "")} title={t("ws.open")} aria-label={t("ws.open")}
            aria-pressed={wsOpen} onClick={() => setWsOpen((o) => !o)}>✶{ws.items.length + ws.notes.length > 0 ? <span className="ag-ws-badge">{ws.items.length + ws.notes.length}</span> : null}</button>
          <button type="button" className={"ag-iconbtn" + (corpusOpen ? " is-active" : "")} title={t("corpus.open")} aria-label={t("corpus.open")}
            aria-pressed={corpusOpen} onClick={() => setCorpusOpen((o) => !o)}>≣</button>
          <button type="button" className={"ag-iconbtn" + (pairing?.open ? " is-active" : "")} title={t("work.tools.pairing")} aria-label={t("work.tools.pairing")}
            aria-pressed={!!pairing?.open} onClick={() => setPairing((p) => (p?.open ? { ...p, open: false } : { seed: null, rows: [], cols: [], ...(p || {}), open: true }))}>⊞</button>
          <button type="button" className={"ag-iconbtn" + (claimsOpen ? " is-active" : "")} title={t("work.tools.claims")} aria-label={t("work.tools.claims")}
            aria-pressed={claimsOpen} onClick={() => setClaimsOpen((o) => !o)}>⚖{ws.claims.length > 0 ? <span className="ag-ws-badge">{ws.claims.length}</span> : null}</button>
          <button type="button" data-tour="exprBtn" className={"ag-iconbtn" + (exprOpen ? " is-active" : "")} title={t("expr.open")} aria-label={t("expr.open")}
            aria-pressed={exprOpen} onClick={() => { setExprFocus(null); setExprInitial(null); setExprOpen((o) => !o); }}>⛓</button>
          <button type="button" data-tour="helpBtn" className="ag-iconbtn" title={t("common.help")} aria-label={t("common.help")}
            onClick={() => setShowHelp(true)}>؟</button>
          <a className="ag-iconbtn" href="https://github.com/waliori/qurangraph" target="_blank" rel="noopener noreferrer"
            title={t("common.github")} aria-label={t("common.github")}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <button type="button" className="ag-iconbtn" title={t("common.language")} aria-label={t("common.language")}
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}>{lang === "ar" ? "EN" : "ع"}</button>
          {/* Numeral system toggle. "auto" follows the language (Arabic→١٢٣, English→123);
              clicking pins arabic↔western, so either system works under either language.
              arabicActive mirrors the effective choice in i18n (not the raw "auto" string).
              Shows the system it switches TO (like the theme button). */}
          {(() => {
            const arabicActive = numerals === "arabic" ? true : numerals === "western" ? false : lang === "ar";
            return (
              <button type="button" className="ag-iconbtn" style={{ fontSize: "var(--text-sm)" }}
                title={t("common.numerals")} aria-label={t("common.numerals")} aria-pressed={!arabicActive}
                onClick={() => setNumerals(arabicActive ? "western" : "arabic")}>{arabicActive ? "123" : "١٢٣"}</button>
            );
          })()}
          <button type="button" className={"ag-iconbtn" + (kbEnabled ? " is-active" : "")} title={t("keyboard.toggle")} aria-label={t("keyboard.toggle")}
            aria-pressed={kbEnabled} onClick={() => setKbEnabled((k) => !k)}>⌨</button>
          <button type="button" data-tour="themeBtn" className="ag-iconbtn" title={t("common.theme")} aria-label={t("common.theme")}
            onClick={() => setTheme((th) => (th === "dark" ? "light" : "dark"))}>{theme === "dark" ? "☀" : "☾"}</button>
        </div>
      </header>

      {/* ── Body: stage + inspector ── */}
      <div className="ag-body">
        <main data-tour="stage" className="ag-stage" ref={containerRef}
          style={{ cursor: dragId || isPanning ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp} onPointerLeave={onPointerLeave}>

          <div className="ag-girih" />

          {/* HUD: status + mode */}
          <div className="ag-hud">
            <span className="ag-chip" title={t("common.hud.countTitle")}>{t("common.hud.count", { n: graphNodes.length, m: graphLinks.length })}</span>
            <span className={"ag-chip is-mode" + (searchMode === "root" ? " is-root" : searchMode === "lemma" ? " is-lemma" : "")} title={t("common.hud.modeTitle")}>{searchMode === "root" ? t("common.hud.modeRoot") : searchMode === "lemma" ? t("common.hud.modeLemma") : t("common.hud.modeWord")}</span>
            {morphFilterActive(morphFilter) && <span className="ag-chip is-morph" title={t("common.hud.morphTitle")}>⚙ {morphFilterSummary(morphFilter)}</span>}
            {searchMode !== "exact" && !morph && !lemmaPending && <span className="ag-chip" title={t("common.hud.refiningTitle")}>{t("common.hud.refining")}</span>}
            {(omitted > 0 || truncated) && <span className="ag-chip" style={{ color: "var(--rubric-400)" }} title={t(truncated ? "common.hud.truncatedTitle" : "common.hud.incompleteTitle")}>{truncated ? t("common.hud.truncated") : t("common.hud.incomplete", { n: omitted })}</span>}
            {layoutNotShared && <span className="ag-chip" style={{ color: "var(--rubric-400)" }} title={t("common.hud.noPosTitle")}>{t("common.hud.noPos")}</span>}
          </div>

          {/* Legend */}
          <div className="ag-legend" aria-hidden="true">
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "var(--gold-500)" }} />{t("common.legend.center")}</div>
            <div className="ag-legend-row"><span className="ag-legend-swatch ag-legend-freq" />{searchMode === "root" ? t("common.graphMode.root") : searchMode === "lemma" ? t("common.graphMode.lemma") : t("common.graphMode.word")}{t("common.legend.colorByFreq")}</div>
            <div className="ag-legend-row"><span className="ag-legend-swatch ag-legend-depth" />{t("common.legend.verseDepth")}</div>
            <div className="ag-legend-row"><span className="ag-legend-line" />{t("common.legend.link")}</div>
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "#34d8a8" }} />{t("common.legend.greenDot")}</div>
            <div className="ag-legend-row"><span className="ag-legend-ring" />{t("common.legend.purpleRing")}</div>
            {searchMode !== "exact" && <div className="ag-legend-row"><span className="ag-legend-dot ag-legend-dash" />{searchMode === "root" ? t("common.legend.noRoot") : t("common.legend.noLemma")}</div>}
          </div>

          {/* On-canvas graph controls (fit / zoom / collapse / deselect / back) */}
          <div data-tour="dock" className="ag-dock" data-panel="1">
            <button type="button" className="ag-iconbtn is-gold" title={t("common.dock.fit")} aria-label={t("common.dock.fit")} onClick={() => setTransform(fitView())}>⤢</button>
            <button type="button" className="ag-iconbtn" title={t("common.dock.zoomIn")} aria-label={t("common.dock.zoomIn")} onClick={() => zoomBy(1.2)}>＋</button>
            <button type="button" className="ag-iconbtn" title={t("common.dock.zoomOut")} aria-label={t("common.dock.zoomOut")} onClick={() => zoomBy(0.83)}>－</button>
            {(selected || activeWord) && <button type="button" className="ag-iconbtn is-gold" title={t("common.dock.clearSel")} aria-label={t("common.dock.clearSel")} onClick={() => { setSelected(null); setActiveWord(null); }}>✦</button>}
            {canUndo && <button type="button" className="ag-iconbtn" title={t("common.dock.undoTitle")} aria-label={t("common.dock.undo")} onClick={undo}>↶</button>}
            {canRedo && <button type="button" className="ag-iconbtn" title={t("common.dock.redoTitle")} aria-label={t("common.dock.redo")} onClick={redo}>↷</button>}
            {totalExp > 0 && <button type="button" className="ag-iconbtn is-warn" title={t("common.dock.collapseAll")} aria-label={t("common.dock.collapseAll")} onClick={reset}>↺</button>}
            {expandedWordNodes.length > 0 && <button type="button" className={"ag-iconbtn" + (showExpanded ? " is-active" : "")} title={t("common.dock.expandedWords")} aria-label={t("common.dock.expandedWords")} aria-pressed={showExpanded} onClick={() => setShowExpanded((s) => !s)}><span style={{ color: "#34d8a8" }}>✷</span> {expandedWordNodes.length}</button>}
            <button type="button" data-tour="saveViewBtn" className={"ag-iconbtn" + (graphSaved ? " is-active" : "")} title={graphSaved ? t("ws.saved") : t("ws.saveGraph")} aria-label={t("ws.saveGraph")} onClick={saveGraphView}>{graphSaved ? "✓" : "✶"}</button>
            <button type="button" data-tour="copyLinkBtn" className="ag-iconbtn" title={linkCopied ? t("common.dock.linkCopied") : t("common.dock.copyLink")} aria-label={t("common.dock.copyLink")} onClick={copyLink}>{linkCopied ? "✓" : "⎘"}</button>
            <button type="button" data-tour="exportPngBtn" className="ag-iconbtn" title={t("common.dock.exportPng")} aria-label={t("common.dock.exportPng")} onClick={() => exportGraph("png")}>⤓</button>
            <button type="button" className="ag-iconbtn" title={t("common.dock.exportSvg")} aria-label={t("common.dock.exportSvg")} onClick={() => exportGraph("svg")}>❖</button>
          </div>

          {/* Expanded-words list (green-dot words) */}
          {showExpanded && expandedWordNodes.length > 0 && (
            <div className="ag-expanded" data-panel="1">
              <div className="ag-expanded-h">
                <span><span style={{ color: "#34d8a8" }}>✷</span> {t("common.dock.expandedWords")} ({expandedWordNodes.length})</span>
                <button type="button" className="ag-iconbtn" style={{ width: 26, height: 26, fontSize: 12 }} aria-label={t("common.close")} onClick={() => setShowExpanded(false)}>✕</button>
              </div>
              <div className="ag-expanded-list">
                {expandedWordNodes.map((n) => (
                  <span key={n.id} className="ag-expanded-chip">
                    <button type="button" className="ag-expanded-go" title={t("common.expanded.goToWord")} onClick={() => focusNode(n.id)}>
                      {n.label}{n.count > 1 ? <b style={{ color: "var(--text-faint)" }}> {n.count}</b> : null}
                    </button>
                    <button type="button" className="ag-expanded-x" title={t("common.expanded.collapse")} aria-label={t("common.expanded.collapse")}
                      onClick={() => toggleWord(n.lookup || n.wordNorm, n.parentVerseKey)}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lemma index still loading — don't show the empty-state (it isn't empty,
              it's pending) and don't fall back to exact-form matches. */}
          {lemmaPending && (
            <div className="ag-empty">
              <div className="ag-empty-inner">
                <div className="ag-empty-glyph">۞</div>
                {t("common.empty.lemmaLoading")}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!lemmaPending && isEmpty && (
            <div className="ag-empty">
              <div className="ag-empty-inner">
                <div className="ag-empty-glyph">۞</div>
                {t("common.empty.noWords")}{hideStop ? t("common.empty.stopHint") : ""}.
              </div>
            </div>
          )}

          {/* SVG graph */}
          <svg ref={svgRef} width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            role="group" aria-roledescription={t("common.graphRole")}
            aria-label={t("common.graphAria", { sn: currentVerse?.sn || "", a: safeAyah, n: graphNodes.length, m: graphLinks.length, mode: searchMode === "root" ? t("common.graphMode.root") : searchMode === "lemma" ? t("common.graphMode.lemma") : t("common.graphMode.word") })}>
            <defs><marker id="arrL" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fb7185" opacity="0.6" /></marker></defs>
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`} style={{ pointerEvents: "auto" }}>
              {(renderer === "svg" || exporting) && <GraphLayer
                nodes={graphNodes} links={graphLinks} loopLinks={loopLinks} positions={positions} nmap={nmap} reg={registry} viewport={cullViewport}
                highlightSet={highlightSet} highlightLinks={highlightLinks} activeWordNodeIds={activeWordNodeIds}
                hovered={hovered} selected={selected} showLoops={showLoops} T={T} theme={theme}
                onNodeEnter={onNodeEnter} onNodeLeave={onNodeLeave} onNodeClick={onNodeClick} />}
            </g>
          </svg>

          {/* Canvas renderer (high-scale): one canvas instead of N DOM nodes. Pan/zoom/
              drag/hit-testing stay in the stage's pointer handlers; this only paints. */}
          {renderer === "canvas" && (
            <GraphCanvas
              nodes={graphNodes} links={graphLinks} loopLinks={loopLinks} nmap={nmap} positionsRef={positionsRef}
              transform={transform} dims={dims} T={T} theme={theme} showLoops={showLoops} viewport={cullViewport}
              highlightSet={highlightSet} highlightLinks={highlightLinks} activeWordNodeIds={activeWordNodeIds}
              hovered={hovered} selected={selected} apiRef={canvasApiRef}
              onNodeClick={onNodeClick} onNodeEnter={onNodeEnter} onNodeLeave={onNodeLeave} />
          )}

          {/* Canvas-anchored sticky notes (pinned to the current centre verse) */}
          {stickyNotes.length > 0 && (
            <StickyNotes notes={stickyNotes} positions={positions} transform={transform} currentKey={currentKey} nmap={nmap}
              onMove={(id, dx, dy) => ws.updateNote(id, { pin: { ...ws.notes.find((n) => n.id === id).pin, dx, dy } })}
              onEdit={(id, patch) => ws.updateNote(id, patch)}
              onUnpin={(id) => ws.updateNote(id, { pin: null })} />
          )}

          {/* Hover tooltip */}
          {hovNode && (hovNode.type === "word" || hovNode.type === "verse") && !selNode && (
            <div data-panel="1" className="ag-tooltip" style={{ pointerEvents: hovNode.type === "verse" ? "auto" : "none" }}>
              {hovNode.type === "word" ? (
                <div>
                  <div className="ag-tip-word">{hovNode.label}</div>
                  <div className="ag-tip-meta">
                    {hovNode.rootLabel && <span className="ag-tag" style={{ background: "color-mix(in oklab, var(--viridian-500) 14%, transparent)", color: "var(--viridian-400)", borderColor: "color-mix(in oklab, var(--viridian-500) 30%, transparent)" }}>{t("common.graphMode.root")} {hovNode.rootLabel}</span>}
                    <span className="ag-tag" style={{ color: fColor(hovNode.count, theme), background: fColor(hovNode.count, theme) + "22", borderColor: fColor(hovNode.count, theme) + "44" }}>{hovNode.count} {t("common.tip.verse")}</span>
                  </div>
                  {hovNode.root && meanings?.[hovNode.root] && <div className="ag-tip-mean">{meanings[hovNode.root].c}</div>}
                </div>
              ) : (
                <>
                  <div className="ag-ayah-ref" style={{ marginBottom: 4 }}><span className="ag-ayah-surah">{hovNode.label}</span></div>
                  <div className="ag-insp-verse">
                    <HighlightedAyah text={hovNode.text} primaryWord={getConnWord(hovNode)} sharedWords={hovNode.sharedWords || []} searchMode={searchMode} precision={precision} theme={theme}
                      interactive={true} onWordClick={(wn) => handleWordClick(wn, hovNode.verseKey)} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Reader dock — the current centre verse */}
          {currentVerse && (
            <div className="ag-reader-dock">
              <div data-panel="1" className={"ag-reader" + (readerCollapsed ? " is-collapsed" : "")}>
                <div className="ag-reader-head">
                  <span className="ag-ayah-ref">
                    <span className="ag-ayah-surah">{currentVerse.sn}</span>
                    <span className="ag-ayah-num">{currentVerse.a}</span>
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={t("common.insp.ayaAnalyze")} title={t("common.insp.ayaAnalyzeTitle")} onClick={() => setAya({ centerKey: currentKey })}>⊞</button>
                    <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={t("surah.badge")} title={t("surah.title", { name: currentVerse.sn })} onClick={() => setSurahLab({ surahId: currentVerse.s })}>▦</button>
                    <button type="button" data-tour="echoesBtn" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={t("common.reader.phrases")} title={t("common.reader.phrases")} onClick={() => openPhrases(currentKey)}>⧉</button>
                    <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={t("common.insp.rhyme")} title={t("common.insp.rhymeTitle")} onClick={() => setRhyme({ centerKey: currentKey })}>♪</button>
                    <button type="button" data-tour="contextBtn" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={t("common.reader.readContext")} title={t("common.reader.readContext")} onClick={() => setCtx({ centerKey: currentKey })}>☰</button>
                    <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={readerCollapsed ? t("common.reader.showVerse") : t("common.reader.hideVerse")} aria-expanded={!readerCollapsed}
                      onClick={() => setReaderCollapsed((c) => !c)}>{readerCollapsed ? "▴" : "▾"}</button>
                  </span>
                </div>
                <div className="ag-reader-body">
                  <div className="ag-reader-text">
                    <HighlightedAyah text={currentVerse.text} primaryWord={activeWord || (hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null)} interactive={true} onWordClick={(wn) => handleWordClick(wn, currentKey)} activeGraphWord={hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null} searchMode={searchMode} precision={precision} theme={theme} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Inspector — selected node detail (side panel ↔ mobile drawer) */}
        <div className={"ag-scrim" + (inspOpen && sheetOpen ? " is-open" : "")} onClick={() => { setSelected(null); setActiveWord(null); }} />
        {selNode && (
          <aside className={"ag-inspector" + (sheetOpen ? " is-open" : "")} aria-label={t("common.insp.panel")}>
            <button type="button" className="ag-sheet-grab" aria-label={t("common.insp.closePanel")} onClick={() => { setSelected(null); setActiveWord(null); }} />
            {selNode.type === "word" ? (
              <>
                <div className="ag-insp-head">
                  <div className="ag-insp-title">
                    <span className="ag-badge t-word">{t("common.graphMode.word")}</span>
                    <h2 className="ag-insp-word">{selNode.label}</h2>
                    {selNode.rootLabel && <span className="ag-insp-root">{t("common.graphMode.root")} «{selNode.rootLabel}»</span>}
                    {selNode.uncovered && <span className="ag-insp-root" style={{ color: "var(--text-faint)" }}>{searchMode === "root" ? t("common.legend.noRoot") : t("common.legend.noLemma")}{t("common.insp.notGrouped")}</span>}
                  </div>
                  <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} onClick={() => { setSelected(null); setActiveWord(null); }}>✕</button>
                </div>
                <div className="ag-insp-scroll">
                  <div className="ag-insp-stat">
                    <span className="ag-insp-num" style={{ color: fColor(selNode.count, theme) }}>{selNode.count}</span>
                    <span className="ag-insp-cap">{t("common.insp.versesLabel")}</span>
                  </div>
                  {selNode.count > 1 && (
                    <div className="ag-insp-actions">
                      <button type="button" data-tour="allVersesBtn" className="ag-btn is-gold ag-occ-btn"
                        onClick={() => openOcc(selNode.lookup || selNode.wordNorm, selNode.label, searchMode)}>
                        ⌖ {t("common.insp.allVerses")} ({selNode.count})
                      </button>
                      <button type="button" data-tour="distBtn" className="ag-btn"
                        onClick={() => setDist({ lookup: selNode.lookup || selNode.wordNorm, label: selNode.label, mode: searchMode })}>
                        ▦ {t("common.insp.distribution")}
                      </button>
                      <button type="button" data-tour="compareBtn" className="ag-btn" title={t("common.insp.compareTitle")}
                        onClick={() => setCmp({ A: { lookup: selNode.lookup || selNode.wordNorm, label: selNode.label, mode: searchMode }, B: null })}>
                        ⇄ {t("common.insp.compare")}
                      </button>
                      {(selNode.root || rootOf(selNode.wordNorm)) && (
                        <button type="button" data-tour="labBtn" className="ag-btn" title={t("common.insp.analyzeTitle")}
                          onClick={() => setLab({ root: selNode.root || rootOf(selNode.wordNorm), label: selNode.label })}>
                          ⚛ {t("common.insp.analyze")}
                        </button>
                      )}
                      <SaveButton dataTour="saveWordBtn" label={t("ws.save")}
                        item={{ type: "occ", title: selNode.label, payload: { lookup: selNode.lookup || selNode.wordNorm, label: selNode.label, mode: searchMode } }} />
                    </div>
                  )}
                  {selExpr && (selExpr.heads.length || selExpr.collocations.length || selExpr.compounds.length) > 0 && (
                    <div className="ag-insp-card">
                      <div className="ag-insp-card-h" style={{ marginBottom: 6 }}>
                        <span className="ag-insp-card-lab">{t("lab.expressions")}</span>
                        <button type="button" className="ag-btn" title={t("expr.open")} onClick={() => { setExprFocus(selRoot); setExprOpen(true); }}>⛓ {t("expr.seeAll")}</button>
                      </div>
                      <div className="ag-dist-tags">
                        {selExpr.collocations.slice(0, 4).map((c, i) => (
                          <button type="button" key={`c${i}`} className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} title={t("expr.tab.collocations")} onClick={() => { setExprFocus(selRoot); setExprOpen(true); }}>
                            {c.verb} {c.noun} <b style={{ color: "var(--gold-400)" }}>{c.count}</b>
                          </button>
                        ))}
                        {selExpr.heads.flatMap((h) => h.preps.map((p) => ({ head: h.head, disp: expr.prepDisp?.[p.prep] || p.prep, count: p.count, k: h.head + p.prep }))).slice(0, 4).map((x) => (
                          <button type="button" key={`h${x.k}`} className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} title={t("expr.tab.frames")} onClick={() => { setExprFocus(selRoot); setExprOpen(true); }}>
                            {x.head} {x.disp} <b style={{ color: "var(--gold-400)" }}>{x.count}</b>
                          </button>
                        ))}
                        {selExpr.compounds.slice(0, 4).map((c, i) => (
                          <button type="button" key={`k${i}`} className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} title={t("expr.tab.compounds")} onClick={() => { setExprFocus(selRoot); setExprOpen(true); }}>
                            {c.words.join(" ")} <b style={{ color: "var(--gold-400)" }}>{c.count}</b>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const sr = selNode.root || rootOf(selNode.wordNorm); // derive root in exact mode too
                    if (!sr) return null; // no root at all → nothing lexical to show
                    const m = meanings?.[sr];        // undefined if this lexicon lacks the root
                    const full = meaningsFull?.[sr]; // populated once sr's shard is fetched
                    const shard = activeShards ? shardOf(sr, activeShards) : -1;
                    const shardLoaded = shard >= 0 && fullLoaded.has(`${activeLexicon}:${shard}`);
                    // "Show more" offered whenever a fuller concise text exists OR the lexicon
                    // ships full articles (we only learn if THIS root has one after fetching).
                    const hasMore = m ? ((m.f && m.f !== m.c) || activeShards > 0) : false;
                    const body = m ? (meaningOpen ? (full || m.f) : m.c) : null;
                    const loadingFull = meaningOpen && shard >= 0 && full === undefined && !shardLoaded;
                    // The section ALWAYS shows (with the lexicon switcher) even when the
                    // active mu'jam has no entry for this root — so the user can switch.
                    return (
                      <div className="ag-insp-card t-mean">
                        <div className="ag-insp-mean" style={!m ? { color: "var(--text-faint)", fontStyle: "italic" } : undefined}>
                          {meanings == null ? t("common.insp.lexLoading")
                            : m ? <>{body}{loadingFull ? " …" : ""}</>
                            : t("common.insp.lexNone")}
                        </div>
                        <div className="ag-insp-card-h" style={{ marginBottom: 0, marginTop: 6 }}>
                          <span className="ag-insp-card-lab" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {lexicons?.length > 1
                              ? <select data-tour="lexSelect" className="ag-lex-select" value={activeLexicon} aria-label={t("common.insp.chooseLex")} onChange={(e) => setActiveLexicon(e.target.value)}>
                                  {lexicons.map((L) => <option key={L.id} value={L.id}>{L.label}</option>)}
                                </select>
                              : <span>{lexicons?.find((L) => L.id === activeLexicon)?.label || t("common.insp.lexFallback")}</span>}
                            <span style={{ color: "var(--text-faint)" }}>· {t("common.graphMode.root")} {sr}</span>
                          </span>
                          <span style={{ display: "flex", gap: 6 }}>
                            {m && (() => { const lx = lexicons?.find((L) => L.id === activeLexicon); return (
                              <SaveButton item={{ type: "lexicon", title: `${sr} — ${lx?.label || activeLexicon}`, payload: { root: sr, lexicon: activeLexicon, gloss: m.c, cite: m.cite || null, surah: selNode.surahNum || surah, ayah: selNode.ayahNum || safeAyah } }} />
                            ); })()}
                            {hasMore && <button type="button" className="ag-btn is-gold" onClick={() => setMeaningOpen((o) => !o)}>{meaningOpen ? t("common.insp.less") : t("common.insp.more")}</button>}
                          </span>
                        </div>
                        {m && (() => {
                          // Edition citation: the print volume/page this gloss sits on (from the
                          // OpenITI page milestones — approximate) + the edition's editor/publisher.
                          const ed = lexicons?.find((L) => L.id === activeLexicon)?.edition;
                          const ct = m.cite;
                          if (!ed && !ct) return null;
                          const edStr = ed ? [ed.editor && t("common.cite.editor", { name: ed.editor }), ed.publisher, ed.year].filter(Boolean).join(t("common.cite.sep")) : "";
                          return (
                            <div className="ag-insp-cite" title={t("common.cite.title")}>
                              {ct && <span className="ag-insp-cite-pg">{t("common.cite.volPage", { vol: ct.vol, page: ct.page })}</span>}
                              {edStr && <span className="ag-insp-cite-ed">{edStr}</span>}
                              <button type="button" className="ag-btn" style={{ marginInlineStart: "auto" }} title={t("common.cite.bib")}
                                onClick={() => exportTextFile(buildBibtex({ root: sr, lexLabel: lexicons?.find((L) => L.id === activeLexicon)?.label || activeLexicon, edition: ed || null, cite: ct || null }), `cite-${activeLexicon}-${sr}.bib`, "application/x-bibtex")}>⧉ {t("common.cite.cite")}</button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                  {(() => {
                    const m = morphAt(morph, selNode.parentVerseKey, selNode.wordIndex);
                    if (!m) return null;
                    const POS_AR = { noun: t("common.morph.pos.noun"), verb: t("common.morph.pos.verb"), particle: t("common.morph.pos.particle"), pn: t("common.morph.pos.pn"), pron: t("common.morph.pos.pron"), adj: t("common.morph.pos.adj"), actpcpl: t("common.morph.pos.actpcpl"), passpcpl: t("common.morph.pos.passpcpl") };
                    const PERSON_AR = { 1: t("common.morph.person.1"), 2: t("common.morph.person.2"), 3: t("common.morph.person.3") }, GEN_AR = { m: t("common.morph.gen.m"), f: t("common.morph.gen.f") }, NUM_AR = { s: t("common.morph.num.s"), d: t("common.morph.num.d"), p: t("common.morph.num.p") };
                    const pgn = [PERSON_AR[m.person], GEN_AR[m.gender], NUM_AR[m.number]].filter(Boolean).join(" ");
                    // The root the corpus assigns to THIS occurrence (position-correct),
                    // vs. the majority-vote grouping root the graph links by. When they
                    // differ this surface form is a homograph: it's grouped under its
                    // commoner reading, but here it's a different root — flag it so the
                    // researcher isn't misled by the grouping or the lexicon gloss above.
                    const groupRoot = selNode.root || rootOf(selNode.wordNorm);
                    const divergent = m.root && groupRoot && m.root !== groupRoot;
                    const rows = [
                      [t("common.morph.label.pos"), POS_AR[m.pos]],
                      [t("common.morph.label.root"), m.root],
                      [t("common.morph.label.form"), m.vf ? t("common.morph.formVal", { f: formRoman(m.vf) }) : null],
                      [t("common.morph.label.aspect"), { perf: t("common.morph.aspect.perf"), impf: t("common.morph.aspect.impf"), impv: t("common.morph.aspect.impv") }[m.aspect]],
                      [t("common.morph.label.voice"), { act: t("common.morph.voice.act"), pass: t("common.morph.voice.pass") }[m.voice]],
                      [t("common.morph.label.mood"), { ind: t("common.morph.mood.ind"), subj: t("common.morph.mood.subj"), jus: t("common.morph.mood.jus") }[m.mood] || { nom: t("common.morph.case.nom"), acc: t("common.morph.case.acc"), gen: t("common.morph.case.gen") }[m.gcase]],
                      [t("common.morph.label.pgn"), pgn || null],
                      [t("common.morph.label.lemma"), m.lemma],
                    ].filter(([, v]) => v);
                    if (!rows.length) return null;
                    return (
                      <div className="ag-insp-card t-morph">
                        <div className="ag-insp-card-lab" style={{ marginBottom: 6 }}>{t("common.morph.title")}{m.precise ? "" : t("common.morph.approx")}{t("common.morph.corpus")}</div>
                        <div className="ag-morph-rows">
                          {rows.map(([k, v]) => <div className="ag-morph-row" key={k}><span className="ag-morph-k">{k}</span><span className="ag-morph-v">{v}</span></div>)}
                        </div>
                        {divergent && (
                          <div className="ag-insp-note" style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--rubric-400)", lineHeight: 1.6 }}>
                            {t("common.morph.homograph", { group: groupRoot, here: m.root })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    // Opposition (ṭibāq): this word's root and its curated Qurʾanic antonyms,
                    // each evidenced by verses. Shown right under the morphological analysis.
                    const sr = selNode.root || rootOf(selNode.wordNorm);
                    const opp = sr && relations ? oppositesOf(sr, relations) : [];
                    if (!opp.length) return null;
                    return (
                      <div className="ag-insp-card t-opp">
                        <div className="ag-insp-card-lab" style={{ marginBottom: 6 }}>{t("lab.opp.title")}</div>
                        <ul className="ag-phrase-list" style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                          {opp.map((o) => {
                            const split = o.evidence === "near" || o.evidence === "sample";
                            const vchip = (vk) => <button type="button" className="ag-tag ag-tag-btn" key={vk} title={vk}
                              onClick={() => setOcc({ lookup: sr, label: `${sr} ↔ ${o.other}`, mode: "root", keys: [vk] })}>{vk}</button>;
                            return (
                              <li key={o.other} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                <button type="button" className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} title={t("lab.opp.go", { root: o.other })}
                                  onClick={() => setLab({ root: o.other, label: o.other })}>{o.other}</button>
                                {o.framed ? <span title={t("lab.opp.framedTitle")} style={{ color: "var(--gold-400)", fontSize: "var(--text-xs)" }}>⊶ {t("lab.opp.framed")}</span>
                                  : o.evidence && o.evidence !== "same" ? <span style={{ fontSize: "var(--text-xs)", fontStyle: "italic", color: "var(--text-faint)" }}>{t(`lab.opp.ev.${o.evidence}`)}</span> : null}
                                {split ? (
                                  <span style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
                                    <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontFamily: "var(--font-quran)" }}>{sr}</b>{(o.versesSelf || []).slice(0, 5).map(vchip)}</span>
                                    <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontFamily: "var(--font-quran)" }}>{o.other}</b>{(o.versesOther || []).slice(0, 5).map(vchip)}</span>
                                  </span>
                                ) : (o.verses?.length > 0 && (
                                  <span style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{o.verses.slice(0, 6).map(vchip)}</span>
                                ))}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })()}
                  {(() => { const pid = parentMap[selNode.id], parent = pid ? nmap[pid] : null; if (parent?.text) return (
                    <div className="ag-insp-card">
                      <div className="ag-insp-card-lab" style={{ marginBottom: 6 }}>{t("common.insp.from")} {parent.label}</div>
                      <div className="ag-insp-verse"><HighlightedAyah text={parent.text} primaryWord={selNode.lookup || selNode.wordNorm} searchMode={searchMode} precision={precision} theme={theme} interactive={true} onWordClick={(wn) => handleWordClick(wn, parent.verseKey)} /></div>
                    </div>); return null; })()}
                </div>
              </>
            ) : selNode.type === "verse" ? (
              <>
                <div className="ag-insp-head">
                  <div className="ag-insp-title">
                    <span className="ag-badge t-verse">{t("common.insp.verseBadge")}</span>
                    <h2 className="ag-insp-word" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>{selNode.label}</h2>
                  </div>
                  <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} onClick={() => { setSelected(null); setActiveWord(null); }}>✕</button>
                </div>
                <div className="ag-insp-scroll">
                  <div className="ag-insp-card">
                    <div className="ag-insp-verse">
                      <HighlightedAyah text={selNode.text} primaryWord={getConnWord(selNode)} sharedWords={selNode.sharedWords || []} searchMode={searchMode} precision={precision} theme={theme}
                        interactive={true} onWordClick={(wn) => handleWordClick(wn, selNode.verseKey)} />
                    </div>
                  </div>
                  {(selNode.sharedWords || []).length > 0 && (
                    <div>
                      <div className="ag-insp-card-lab" style={{ marginBottom: 8 }}>{t("common.insp.sharedWords")}</div>
                      <div className="ag-insp-tags">
                        {selNode.sharedWords.map((w, i) => <span key={i} className="ag-tag">{w}</span>)}
                      </div>
                    </div>
                  )}
                  <div className="ag-insp-actions">
                    <button type="button" className="ag-btn is-gold" title={selNode.isExpanded ? t("common.insp.collapseWords") : t("common.insp.showWords")} onClick={() => toggleVerse(selNode.verseKey)}>{selNode.isExpanded ? "⊖ " + t("common.insp.collapseWords") : "⊕ " + t("common.insp.showWords")}</button>
                    <button type="button" className="ag-btn" title={t("common.reader.readContext")} onClick={() => setCtx({ centerKey: selNode.verseKey })}>☰ {t("common.insp.context")}</button>
                    <button type="button" className="ag-btn" title={t("common.reader.phrases")} onClick={() => openPhrases(selNode.verseKey)}>⧉ {t("common.insp.phrasesShort")}</button>
                    <button type="button" className="ag-btn" title={t("common.insp.rhymeTitle")} onClick={() => setRhyme({ centerKey: selNode.verseKey })}>♪ {t("common.insp.rhyme")}</button>
                    <button type="button" className="ag-btn" title={t("common.insp.ayaAnalyzeTitle")} onClick={() => setAya({ centerKey: selNode.verseKey })}>⊞ {t("common.insp.ayaAnalyze")}</button>
                    <button type="button" className="ag-btn" title={t("common.insp.makeCenter")} aria-label={t("common.insp.makeCenter")} onClick={() => navigate(selNode.surahNum, selNode.ayahNum)}>⌖ {t("common.insp.makeCenter")}</button>
                    <SaveButton label={t("ws.save")} item={{ type: "verse", title: selNode.label, payload: { surah: selNode.surahNum, ayah: selNode.ayahNum, label: selNode.label } }} />
                  </div>
                </div>
              </>
            ) : null}
          </aside>
        )}
      </div>

      {/* Lazy-loaded modals + tour: each chunk is fetched only when first opened. */}
      <Suspense fallback={null}>
      {/* Occurrences popup — every āyah a word/root occurs in, paginated */}
      {occ && <OccurrencesModal occ={occ} verseData={verseData} searchMode={occ?.mode || searchMode} precision={precision} morph={morph} theme={theme}
        onNavigate={(s, a) => { navigate(s, a); setOcc(null); }}
        onBack={() => { const d = occ?.back; setOcc(null); reopenLab(d ? (d.t ? d : { t: "dist", dist: d }) : null); }}
        onClose={() => setOcc(null)} />}

      {dist && (
        <DistributionModal dist={dist}
          index={dist.mode === "root" ? r2v : dist.mode === "lemma" ? (l2v || {}) : w2v}
          verseData={verseData} surahList={surahList} stopSet={stopSet} theme={theme}
          onSurah={(sura, suraName) => {
            // Show every āyah in THIS sūrah where the term occurs — same list view as
            // the occurrences popup (downloadable, savable), with a back button to the
            // distribution. Sorted by āyah (all share the one sūrah).
            const idx = dist.mode === "root" ? r2v : dist.mode === "lemma" ? (l2v || {}) : w2v;
            const keys = (idx[dist.lookup] || [])
              .filter((vk) => verseData[vk]?.s === sura)
              .sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]));
            const back = dist;
            setDist(null);
            setOcc({ lookup: dist.lookup, label: t("dist.surahLabel", { label: dist.label, name: suraName }), mode: dist.mode, keys, back });
          }}
          onCompare={(term) => { setDist(null); setCmp({ A: term, B: null }); }}
          onPick={(key, label) => {
            // Show only the verses where the neighbour co-occurs WITH the original
            // word — computed the SAME way the collocation count is (scan the
            // original word's verses for the neighbour), so the count matches the
            // chip exactly. Includes a back button to the original distribution.
            const idx = dist.mode === "root" ? r2v : dist.mode === "lemma" ? (l2v || {}) : w2v;
            const keyOf = (w) => wordGroupKey(w, dist.mode);
            const shared = (idx[dist.lookup] || [])
              .filter((vk) => (verseData[vk]?.words || []).some((w) => keyOf(w) === key))
              .sort((a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; });
            const back = dist;
            setDist(null);
            setOcc({ lookup: key, label: t("common.occ.withLabel", { a: label, b: dist.label }), mode: dist.mode, keys: shared, back });
          }}
          onClose={() => setDist(null)} />
      )}

      {cmp && <CompareModal cmp={cmp} indices={compareIndices} searchAlias={searchAlias} searchAliasFuzzy={searchAliasFuzzy} verseData={verseData} surahList={surahList} stopSet={stopSet} precision={precision}
        onNavigate={(s, a) => { setCmp(null); navigate(s, a); }}
        onPick={(key, label, mode) => { setCmp(null); openOcc(key, label, mode); }}
        onChange={setCmp}
        onClose={() => setCmp(null)} />}

      {def && <DefinitionModal def={def} onClose={() => setDef(null)} />}

      {ctx && (
        <ContextModal ctx={ctx} orderedKeys={orderedKeys} verseData={verseData}
          onNavigate={(s, a) => { navigate(s, a); setCtx(null); }} onClose={() => setCtx(null)} />
      )}

      {phrase && <PhraseModal phrase={phrase} seedIndex={seedIndex} verseData={verseData}
        onNavigate={(s, a) => { setPhrase(null); navigate(s, a); }} onClose={() => setPhrase(null)} />}

      {/* Root analysis lab — derivation (ṣarf), letter kinship, semantic neighbours. */}
      {lab && (() => { const self = { t: "lab", root: lab.root, label: lab.label, back: lab.back }; return (
        <RootLabModal lab={lab} r2v={r2v} verseData={verseData} morph={morph} semantic={semantic} relations={relations} lexAll={lexAll} lexMeta={lexicons} expr={expr} exprIndex={exprIndex} back={lab.back}
          onRetarget={(r) => setLab({ root: r, label: r, back: self })}
          onVerses={(label, keys, hi) => { setLab(null); setOcc({ lookup: lab.root, label, mode: "root", keys, hi, back: self }); }}
          onExpressions={(r) => { setLab(null); setExprFocus(r); setExprOpen(true); }}
          onConstruct={(r, l) => { setLab(null); setConstruction({ root: r, label: l || r, back: self }); }}
          onPairing={(r, l) => { setLab(null); setPairing({ open: true, seed: { root: r, label: l || r }, rows: [], cols: [] }); }}
          onBack={() => reopenLab(lab.back)}
          onClose={() => setLab(null)} />); })()}

      {/* Construction query — pin a root to one Form/voice/governed-particle/object construction. */}
      {construction && <ConstructionModal lab={construction} r2v={r2v} verseData={verseData} morph={morph} expr={expr}
        onVerses={(label, keys, hi) => { const back = construction.back; setConstruction(null); setOcc({ lookup: construction.root, label, mode: "root", keys, hi, back }); }}
        onBack={construction.back ? () => { const d = construction.back; setConstruction(null); reopenLab(d); } : null}
        onClose={() => setConstruction(null)} />}

      {/* Pairing matrix — co-occurrence grid over a chosen term set (the empty cell is the finding).
          Config persists in `pairing` while the modal is closed, so a cell → shared verses → ← back
          (and reopening from the toolbar, or from a saved item) restores the same matrix. */}
      {pairing?.open && <PairingModal seed={pairing.seed} initialRows={pairing.rows} initialCols={pairing.cols}
        indices={compareIndices} r2v={r2v} verseData={verseData} morph={morph} precision={precision}
        searchAlias={searchAlias} searchAliasFuzzy={searchAliasFuzzy}
        onChange={(rows, cols) => setPairing((p) => (p ? { ...p, rows, cols } : p))}
        onOpen={(o) => { setPairing((p) => (p ? { ...p, open: false } : p)); setOcc({ ...o, back: { t: "pairing" } }); }}
        onClose={() => setPairing((p) => (p ? { ...p, open: false } : null))} />}

      {/* Claim board — the ما يؤيد / ما يعارض ledger; verses pinned from any concordance. */}
      {claimsOpen && <ClaimBoard open={claimsOpen} verseData={verseData}
        onNavigate={(s, a) => { setClaimsOpen(false); navigate(s, a); }} onClose={() => setClaimsOpen(false)} />}

      {/* Verse rhyme / cadence (fāṣila) — sūrah rhyme scheme + verses sharing the ending. */}
      {rhyme && <RhymeModal rhyme={rhyme} verseData={verseData} theme={theme}
        onRetarget={(vk) => setRhyme({ centerKey: vk, back: { t: "rhyme", centerKey: rhyme.centerKey, back: rhyme.back } })}
        onBack={() => reopenLab(rhyme.back)}
        onNavigate={(s, a) => { setRhyme(null); navigate(s, a); }} onClose={() => setRhyme(null)} />}

      {/* Āya analysis lab — verse fingerprint + lexically similar verses (read inline). */}
      {aya && <AyaLabModal aya={aya} verseData={verseData} r2v={r2v} morph={morph} relations={relations} exprByVerse={exprByVerse} theme={theme}
        onBack={() => reopenLab(aya.back)}
        onNavigate={(s, a) => { setAya(null); navigate(s, a); }}
        onRoot={(r) => { setAya(null); openOcc(r, r, "root", { t: "aya", centerKey: aya.centerKey, back: aya.back }); }}
        onClose={() => setAya(null)} />}

      {/* Sūra analysis lab — keyness · cohesion · structure · lexical bonds (al-awāṣir). */}
      {surahLab && <SurahLabModal surah={surahLab} verseData={verseData} r2v={r2v} w2v={w2v} seedIndex={seedIndex} stopSet={stopSet} morph={morph} back={surahLab.back}
        onNavigate={(s, a) => { setSurahLab(null); navigate(s, a); }}
        onRoot={(r) => { setSurahLab(null); openOcc(r, r, "root", { t: "surah", surahId: surahLab.surahId, back: surahLab.back }); }}
        onBack={() => reopenLab(surahLab.back)}
        onClose={() => setSurahLab(null)} />}

      {/* Corpus explorer — root frequency, hapax legomena, and the grammar catalogue. */}
      {corpusOpen && <CorpusLabModal open={corpusOpen} verseData={verseData} r2v={r2v} w2v={w2v} precision={precision} morph={morph} relations={relations} theme={theme}
        onNavigate={(s, a) => { setCorpusOpen(false); navigate(s, a); }}
        onClose={() => setCorpusOpen(false)} />}

      {exprOpen && <ExpressionsModal open={exprOpen} verseData={verseData} expr={expr} theme={theme} focusRoot={exprFocus} initialDetail={exprInitial}
        onNavigate={(s, a) => { setExprOpen(false); setExprInitial(null); navigate(s, a); }}
        onRoot={(r) => { setExprOpen(false); setExprInitial(null); setLab({ root: r, label: r }); }}
        onClose={() => { setExprOpen(false); setExprInitial(null); }} />}

      {showHelp && <HelpModal open={showHelp} onClose={() => setShowHelp(false)}
        onStartTour={() => { setShowHelp(false); startTour(); }} onWatchIntro={openIntro} onWhatsNew={openWhatsNew} />}

      {/* First-run presentation video (language-aware; switchable mid-play). */}
      {introOpen && <IntroVideoModal open={introOpen} onClose={closeIntro} onStartTour={startTourFromIntro} />}

      {/* "What's new" changelog — auto-opens after a deploy, re-openable from Help. */}
      {whatsNew && <WhatsNewModal open={!!whatsNew} entries={whatsNew} onClose={closeWhatsNew} />}

      {/* Getting-started tour (interactive; waits for the user on action steps). */}
      {tourRun && <Tour run={tourRun} stepIndex={tourIndex} steps={tourSteps} onStepChange={setTourIndex} onEnd={endTour}
        theme={theme} onToggleTheme={() => setTheme((th) => (th === "dark" ? "light" : "dark"))} />}

      {wsOpen && <WorkspaceDrawer open={wsOpen} onClose={() => setWsOpen(false)} onOpen={openWorkspaceItem} onPinNote={pinNote}
        onOpenTag={(tagId, label) => {
          const keys = Object.entries(ws.tagAssign || {})
            .filter(([, ids]) => ids.includes(tagId)).map(([vk]) => vk).filter((vk) => verseData[vk])
            .sort((a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; });
          if (!keys.length) return;
          setWsOpen(false);
          setOcc({ lookup: "", label, mode: "root", keys });
        }}
        canPin={!!currentVerse} />}
      </Suspense>

      {/* One-click-save confirmation toast */}
      {ws.toastMsg && <div className="ag-toast" role="status" aria-live="polite">{ws.toastMsg}</div>}

      {/* Floating phonetic Arabic keyboard — portals to <body> above all dialogs */}
      <ArabicKeyboard open={kbEnabled} onClose={() => setKbEnabled(false)} />
    </div>
  );
}
