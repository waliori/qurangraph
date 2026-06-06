import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import { norm, normStrict, groupKey, rootKey, rootOf, setRootMap, setLemmaMap, lemmaKey, setStopSet, STOP_PARTICLES, STOP_CONTENT_DEFAULT } from "./arabic-utils.js";
import { loadHafsData, loadRoots, loadLemmas, loadMorphology, loadLexiconManifest, loadLexicon, loadLexiconFullShard } from "./data-loader.js";
import { shardOf } from "./lexiconShard.js";
import { THEMES, fColor } from "./theme.js";
import { buildLazyGraph, buildChildMap, getDescendants, getPathToCenter } from "./graph/buildGraph.js";
import { createSimulation } from "./graph/simulation.js";
import { applyPositions } from "./graph/applyPositions.js";
import { morphAt, formRoman, morphFilterActive, EMPTY_MORPH_FILTER } from "./morphology.js";
import { serializeSvg, exportSvgFile, exportPngFile } from "./graph/exportGraph.js";
import { readUrlState, writeUrlState } from "./hooks/useUrlState.js";
import { HighlightedAyah } from "./components/HighlightedAyah.jsx";
import { GraphLayer } from "./components/GraphLayer.jsx";
import { OccurrencesModal } from "./components/OccurrencesModal.jsx";
import { ContextModal } from "./components/ContextModal.jsx";
import { MorphologyFilter } from "./components/MorphologyFilter.jsx";
import { StopWordEditor } from "./components/StopWordEditor.jsx";
import { DistributionModal } from "./components/DistributionModal.jsx";
import { PhraseModal } from "./components/PhraseModal.jsx";
import { buildSeedIndex } from "./analytics/phrases.js";
import { HelpModal } from "./components/HelpModal.jsx";
import { usePersistedState } from "./hooks/usePersistedState.js";

// Fixed virtual canvas the graph is laid out in. Decoupling layout from the
// live viewport size means a window resize never rebuilds the graph or shifts
// settled nodes — the pan/zoom transform maps this canvas onto the screen.
const VW = 1600, VH = 1100;
const SOFT_CAP = 300; // per-word fan-out beyond this needs explicit opt-in (perf)
const isInt = (v) => Number.isInteger(v);

// Coerce a persisted morphology filter back to its {pos,form,aspect,voice} shape.
function sanitizeMorphFilter(v) {
  const a = (x) => (Array.isArray(x) ? x : []);
  return v && typeof v === "object"
    ? { pos: a(v.pos), form: a(v.form).filter(isInt), aspect: a(v.aspect), voice: a(v.voice) }
    : { ...EMPTY_MORPH_FILTER };
}

/* ═══ MAIN ═══ */
export default function QuranGraph() {
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
  const graphNodesRef = useRef([]);   // latest node set, for position snapshots off the render path
  // Flat [x0,y0,…] of live node positions in sorted-node-id order — so a share link
  // can reproduce the exact arrangement. Capped to keep the URL sane on huge graphs.
  const posSnapshot = useCallback(() => {
    const nodes = graphNodesRef.current;
    if (!nodes.length || nodes.length > 600) return null;
    const ids = nodes.map((n) => n.id).sort();
    const live = positionsRef.current, out = [];
    for (const id of ids) { const p = live[id]; out.push(p ? Math.round(p.x) : 0, p ? Math.round(p.y) : 0); }
    return out;
  }, []);
  const [dragId, setDragId] = useState(null);
  const dragStartRef = useRef(null);
  const draggedRef = useRef(false); // true once a press turns into a real drag
  const [sim] = useState(() => createSimulation(VW, VH)); // live force engine (stable)
  const rafSimRef = useRef(0);
  // DOM registry for imperative position writes (see GraphLayer + applyPositions).
  // A stable object (not a ref) so it can be passed to GraphLayer without reading
  // .current during render; its Maps are mutated by GraphLayer's ref callbacks.
  const [registry] = useState(() => ({ nodes: new Map(), links: new Map(), loops: new Map() }));
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
  const [lemmaMap, setLemmaMapState] = useState(null); // normForm → lemma (lazy, for lemma mode)
  const [morph, setMorph] = useState(null); // columnar per-token morphology (lazy)
  const [meaningOpen, setMeaningOpen] = useState(false); // full-text toggle
  const [occ, setOcc] = useState(null); // occurrences popup: { lookup, label, mode, keys }
  const [dist, setDist] = useState(null); // distribution/collocation modal: { lookup, label, mode }
  const [ctx, setCtx] = useState(null); // context reader modal: { centerKey }
  const [phrase, setPhrase] = useState(null); // shared-phrase (mutashābihāt) modal: { centerKey }
  const [seedIndex, setSeedIndex] = useState(null); // corpus trigram index (lazy, built on first phrase open)
  const seedVdRef = useRef(null); // verseData identity the current seedIndex was built from
  const [linkCopied, setLinkCopied] = useState(false); // share-link confirmation flash
  const svgRef = useRef(null); // live stage <svg>, for export
  const [hydrated, setHydrated] = useState(false); // URL state applied once after data load
  const [toolsOpen, setToolsOpen] = useState(false); // graph-tools popover
  const [query, setQuery] = useState(""); // toolbar search field
  const [searchMiss, setSearchMiss] = useState(false); // last search found nothing
  const [readerCollapsed, setReaderCollapsed] = useState(false); // bottom reader dock
  const [showExpanded, setShowExpanded] = useState(false); // expanded-words list panel
  const [sheetOpen, setSheetOpen] = useState(false); // inspector slide-in (mobile sheet)
  const T = THEMES[theme];

  // Translate that centres the virtual canvas in the current viewport.
  const homeView = useCallback(() => ({ x: (dims.w - VW) / 2, y: (dims.h - VH) / 2, k: 1 }), [dims.w, dims.h]);

  // Drive the live layout: tick the simulation once per frame, pushing settled
  // positions into state, until its energy decays to rest. Cheap to call from any
  // interaction — it no-ops if a loop is already running.
  // Each frame: step the sim, write positions straight to the DOM (no React
  // re-render), and mirror them into positionsRef so fit/drag/export can read the
  // live layout. Only when the sim comes to rest do we commit ONE setPositions
  // snapshot, so React state holds the settled layout for the next structural
  // render / fit / export — the per-frame churn never touches React.
  const runSim = useCallback(() => {
    if (rafSimRef.current) return;
    const tick = () => {
      const alive = sim.step();
      const p = sim.getPositions();
      positionsRef.current = p;
      applyPositions(registry, p);
      if (alive) rafSimRef.current = requestAnimationFrame(tick);
      else { rafSimRef.current = 0; setPositions(p); }
    };
    rafSimRef.current = requestAnimationFrame(tick);
  }, [sim, registry]);
  // After any GraphLayer re-render (structure change, hover, selection, pan) repaint
  // the live positions imperatively so freshly-rendered DOM lands where the sim has
  // it — not at the last committed React snapshot. Cheap: plain attribute writes.
  useLayoutEffect(() => { applyPositions(registry, positionsRef.current); });
  useEffect(() => () => { if (rafSimRef.current) cancelAnimationFrame(rafSimRef.current); }, []);
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
    setSearchMode(u.mode); setPrecision(u.precision); setTheme(u.theme);
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
    applyState(readUrlState());
    setHydrated(true);
  }, [hydrated, loading, quranRaw, applyState]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mirror the live state back into the URL hash (debounced; replaceState so pan/
  // zoom never spam history). Runs once hydration completes, then on every change.
  const urlSnapshot = { surah, ayah, mode: searchMode, precision, activeLexicon, theme, maxBranch, hideStop, showLoops, rareOnly, expandedWords, expandedVerses, selected, transform, morphFilter, stopExtra, stopDisabled };
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => writeUrlState({ ...urlSnapshot, pos: posSnapshot() }), 350);
    return () => clearTimeout(id);
    // `positions` is included so the URL re-captures the SETTLED layout (it commits
    // only when the simulation comes to rest) — not the transient mid-animation one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, surah, ayah, searchMode, precision, activeLexicon, theme, maxBranch, hideStop, showLoops, rareOnly, expandedWords, expandedVerses, selected, transform, morphFilter, stopExtra, stopDisabled, positions]);

  // ── Undo / redo of exploration (expand/collapse · select · navigate centre) ──
  // Records discrete steps in these fields only — not pan/zoom or hover.
  const histRef = useRef({ undo: [], redo: [], present: null, applying: false });
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false });
  const syncHist = () => { const h = histRef.current; setHistState({ canUndo: h.undo.length > 0, canRedo: h.redo.length > 0 }); };
  useEffect(() => {
    if (!hydrated) return;
    const h = histRef.current;
    const snap = { surah, ayah, ew: [...expandedWords], ev: [...expandedVerses], selected };
    if (h.applying) { h.applying = false; h.present = snap; return; }
    if (h.present) { h.undo.push(h.present); if (h.undo.length > 120) h.undo.shift(); h.redo = []; }
    h.present = snap;
    syncHist();
  }, [hydrated, surah, ayah, expandedWords, expandedVerses, selected]);

  const applySnap = useCallback((s) => {
    histRef.current.applying = true;
    setSurah(s.surah); setAyah(s.ayah);
    setExpandedWords(new Set(s.ew)); setExpandedVerses(new Set(s.ev));
    setSelected(s.selected); setActiveWord(null);
  }, [setSurah, setAyah]);
  const undo = useCallback(() => { const h = histRef.current; if (!h.undo.length) return; h.redo.push(h.present); applySnap(h.undo.pop()); syncHist(); }, [applySnap]);
  const redo = useCallback(() => { const h = histRef.current; if (!h.redo.length) return; h.undo.push(h.present); applySnap(h.redo.pop()); syncHist(); }, [applySnap]);

  // Keyboard: Ctrl/⌘+Z = undo, Ctrl+Y or ⌘/Ctrl+Shift+Z = redo (ignored in inputs).
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Whether root meanings are wanted yet: root/lemma mode (roots shown) or any
  // node selected (so a word's root meaning surfaces in the inspector in any mode).
  const meaningsWanted = searchMode !== "exact" || selected != null;

  // Load the lexicon manifest once meanings are first wanted (drives the switcher).
  useEffect(() => {
    if (meaningsWanted && !lexicons) loadLexiconManifest().then(setLexicons).catch(() => {});
  }, [meaningsWanted, lexicons]);

  // Lazy-load the ACTIVE lexicon's concise meanings; reload (and reset the full
  // text + open state) whenever the user switches lexicon.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!meaningsWanted) return;
    let live = true;
    setMeanings(null); setMeaningsFull(null); setMeaningOpen(false);
    setFullLoaded(new Set()); // full-article shards are per-lexicon
    loadLexicon(activeLexicon).then((m) => { if (live) setMeanings(m); }).catch(() => {});
    return () => { live = false; };
  }, [meaningsWanted, activeLexicon]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Lazy-load the normForm→lemma map the first time lemma mode is used; install it
  // into arabic-utils so groupKey('lemma') resolves, and keep a copy in state so
  // the l2v index + graph rebuild when it arrives.
  useEffect(() => {
    if (searchMode === "lemma" && !lemmaMap) loadLemmas().then((m) => { setLemmaMap(m); setLemmaMapState(m); }).catch(() => {});
  }, [searchMode, lemmaMap]);

  // Lazy-load per-token morphology when the filter is active (graph filtering) or a
  // node is selected (inspector morphology card). ~2.4MB, deferred until needed.
  useEffect(() => {
    if ((morphFilterActive(morphFilter) || selected != null) && !morph) loadMorphology().then(setMorph).catch(() => {});
  }, [morphFilter, selected, morph]);

  // Drive the CSS design tokens (styles/theme.css) off the React theme state so
  // the whole آيات.network shell — including body + boot screens — recolours.
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // Dismiss the graph-tools popover on an outside click or Escape (the toggle
  // button lives inside the same wrapper, so it still toggles normally).
  useEffect(() => {
    if (!toolsOpen) return;
    const onDown = (e) => { if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false); };
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

  const { w2v, r2v, verseData, surahList } = useMemo(() => {
    if (!quranRaw) return { w2v: {}, r2v: {}, verseData: {}, surahList: [] };
    const strict = precision === "strict";
    const w2v = {}, r2v = {}, vd = {}, sl = [];
    for (const s of quranRaw) {
      sl.push({ id: s.id, name: s.name, count: s.total_verses });
      for (const v of s.verses) {
        const vk = `${s.id}:${v.id}`;
        const words = [];
        const seenN = new Set(), seenR = new Set();
        for (const raw of v.text.split(/\s+/)) {
          const n = norm(raw); // loose — keys the root/lemma maps (always built loose)
          if (n.length < 2) continue;
          // Exact-mode key honours precision; root/lemma stay loose so their maps hit.
          const ex = strict ? normStrict(raw) : n;
          words.push({ orig: raw, norm: n, exact: ex });
          if (!seenN.has(ex)) { seenN.add(ex); (w2v[ex] ||= []).push(vk); }
          const root = rootKey(n);
          if (!seenR.has(root)) { seenR.add(root); (r2v[root] ||= []).push(vk); }
        }
        vd[vk] = { text: v.text, s: s.id, a: v.id, sn: s.name, words };
      }
    }
    return { w2v, r2v, verseData: vd, surahList: sl };
  }, [quranRaw, precision]);

  // Lemma → verses index, built only once lemmas are loaded (lemma mode). Mirrors
  // the r2v block but keyed by lemma; null until the map arrives so the graph waits.
  const l2v = useMemo(() => {
    if (!quranRaw || !lemmaMap) return null;
    const idx = {};
    for (const vk in verseData) {
      const seen = new Set();
      for (const w of verseData[vk].words) {
        const lk = lemmaKey(w.norm);
        if (!seen.has(lk)) { seen.add(lk); (idx[lk] ||= []).push(vk); }
      }
    }
    return idx;
  }, [quranRaw, verseData, lemmaMap]);

  // Effective hidden set the graph actually applies. The grammatical particles are
  // governed by the master "إخفاء حروف المعاني" toggle; content defaults and the
  // user's own added words ALWAYS apply (so editing always affects the graph),
  // minus any the user re-enabled.
  const stopSet = useMemo(() => {
    const disabled = new Set(stopDisabled);
    const s = new Set();
    if (hideStop) for (const w of STOP_PARTICLES) if (!disabled.has(w)) s.add(w);
    for (const w of STOP_CONTENT_DEFAULT) if (!disabled.has(w)) s.add(w);
    for (const w of stopExtra) if (!disabled.has(w)) s.add(norm(w));
    return s;
  }, [hideStop, stopExtra, stopDisabled]);
  // Toggle any word's hidden state directly (used by the editor chips): hide a
  // shown word via `extra`, re-show a hidden one via `disabled` — so a single click
  // does the obvious thing whatever group the word is in.
  const toggleStopWord = useCallback((w) => {
    const nw = norm(w);
    if (stopSet.has(nw)) { setStopDisabled((p) => (p.includes(nw) ? p : [...p, nw])); setStopExtra((p) => p.filter((x) => x !== nw)); }
    else { setStopDisabled((p) => p.filter((x) => x !== nw)); setStopExtra((p) => (p.includes(nw) ? p : [...p, nw])); }
  }, [stopSet, setStopDisabled, setStopExtra]);
  // Mirror into arabic-utils so any module-level STOP consumer agrees with the UI.
  useEffect(() => { setStopSet(stopSet); }, [stopSet]);

  // Every āya key in muṣḥaf order — the flat list the context reader scrolls through.
  const orderedKeys = useMemo(() => {
    if (!quranRaw) return [];
    const ks = [];
    for (const s of quranRaw) for (const v of s.verses) ks.push(`${s.id}:${v.id}`);
    return ks;
  }, [quranRaw]);

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
  const { graphNodes, graphLinks, loopLinks, parentMap } = useMemo(() => {
    if (!currentVerse) return { graphNodes: [], graphLinks: [], loopLinks: [], parentMap: {} };
    const r = buildLazyGraph(currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, effMaxBranch, searchMode, VW, VH, { l2v, M: morph, morphFilter, rareOnly, stopSet });
    return { graphNodes: r.nodes, graphLinks: r.links, loopLinks: r.loopLinks, parentMap: r.parentMap };
  }, [currentVerse, currentKey, verseData, w2v, r2v, l2v, morph, morphFilter, rareOnly, stopSet, expandedWords, expandedVerses, hideStop, effMaxBranch, searchMode]);

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
    // Paint the seeded layout before the browser paints (no flash at build-time seeds).
    const p = sim.getPositions();
    positionsRef.current = p;
    applyPositions(registry, p);
    if (pendMap) {
      // Pin the restored layout so it matches the source; the user can drag or reset.
      for (const n of graphNodes) if (!n.fixed) sim.stick(n.id);
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

  // Export the live graph as SVG or PNG, framed to its content.
  const exportGraph = useCallback((kind) => {
    if (!svgRef.current) return;
    const bbox = contentBounds();
    const svgStr = serializeSvg(svgRef.current, { bbox, bg: T.bg });
    const base = `qurangraph-${surah}_${safeAyah}`;
    if (kind === "svg") exportSvgFile(svgStr, base + ".svg");
    else exportPngFile(svgStr, { name: base + ".png", scale: 2, bbox }).catch(() => {});
  }, [contentBounds, T.bg, surah, safeAyah]);

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

    const nodeEl = e.target.closest("[data-node]");
    if (nodeEl) {
      const node = nmap[nodeEl.getAttribute("data-node")];
      if (node && !node.fixed) { startDrag(node.id, e.clientX, e.clientY); return; }
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform, nmap, startDrag]);

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
      }
    });
  }, [dragId, isPanning, panStart, svgToWorld, runSim, sim]);

  // End a node drag: a node that was actually moved sticks where it was dropped
  // (so it doesn't spring back to its parent); a mere press is released.
  const endDrag = useCallback(() => {
    if (!dragId) return;
    if (draggedRef.current) sim.stick(dragId); else sim.unpin(dragId);
    sim.reheat(0.4);
    runSim();
  }, [dragId, runSim, sim]);

  const onPointerUp = useCallback((e) => {
    const pts = pointersRef.current;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchRef.current = null;
    if (pts.size === 0) { endDrag(); setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null); }
  }, [endDrag]);

  // Pointer left the canvas mid-gesture → end it (mirrors mouse-leave behaviour).
  const onPointerLeave = useCallback(() => {
    pointersRef.current.clear();
    pinchRef.current = null;
    endDrag();
    setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null);
  }, [endDrag]);

  const handleWordClick = useCallback((wordNorm, fromVerseKey) => {
    const lookup = groupKey(wordNorm, searchMode);
    const vk = fromVerseKey || currentKey;
    setMeaningOpen(false);
    if (activeWord === lookup) { setActiveWord(null); setSelected(null); }
    else { setActiveWord(lookup); const nids = wordToNodeIds[lookup]; if (nids?.length) setSelected(nids[0]); toggleWord(lookup, vk); }
  }, [activeWord, wordToNodeIds, toggleWord, currentKey, searchMode]);

  // Toolbar search: normalise the query, find the first verse the word (or its
  // root, in root mode) occurs in, jump there and highlight it. Marks a miss so
  // the field can flash when nothing matches.
  // Open the occurrences popup for a word/root: lists every āyah it occurs in,
  // current verse first, then mushaf order. Used by search and the inspector.
  const openOcc = useCallback((lookup, label, mode) => {
    const idx = mode === "root" ? r2v : mode === "lemma" ? (l2v || w2v) : w2v;
    const all = idx[lookup];
    if (!all?.length) return false;
    const ord = [...all].sort((a, b) => {
      const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number);
      return sa - sb || aa - ab;
    });
    const keys = ord.includes(currentKey) ? [currentKey, ...ord.filter((k) => k !== currentKey)] : ord;
    setOcc({ lookup, label, mode, keys });
    return true;
  }, [w2v, r2v, l2v, currentKey]);

  const runSearch = useCallback((e) => {
    e?.preventDefault?.();
    const q = norm(query);
    if (q.length < 2) { setSearchMiss(true); return; }
    const qx = searchMode === "exact" && precision === "strict" ? normStrict(query) : q;
    let lookup = searchMode === "exact" ? qx : groupKey(q, searchMode);
    let label = query.trim();
    if (searchMode === "exact" && !w2v[qx]) {
      // Forgiving fallback: first indexed word that contains the query.
      const hit = Object.keys(w2v).find((k) => k.includes(qx));
      if (hit) { lookup = hit; label = hit; }
    }
    setToolsOpen(false);
    // Show ALL āyāt for the term directly (no node is selected until the user
    // picks one from the list).
    if (openOcc(lookup, label, searchMode)) { setSearchMiss(false); setActiveWord(lookup); }
    else setSearchMiss(true);
  }, [query, searchMode, precision, w2v, openOcc]);

  // Stable node handlers passed to the memoized GraphLayer.
  const onNodeEnter = useCallback((n) => { setHovered(n.id); if (n.type === "word") setActiveWord(n.lookup || n.wordNorm); }, []);
  const onNodeLeave = useCallback(() => { setHovered(null); if (!selected) setActiveWord(null); }, [selected]);
  const onNodeClick = useCallback((n, e) => {
    e.stopPropagation();
    if (draggedRef.current) { draggedRef.current = false; return; } // it was a drag, not a click
    if (n.type === "center") { setSelected(null); setActiveWord(null); return; }
    if (n.type === "word") { setMeaningOpen(false); toggleWord(n.lookup || n.wordNorm, n.parentVerseKey); setActiveWord(n.lookup || n.wordNorm); setSelected(n.id); }
    else if (n.type === "verse") { if (selected === n.id) toggleVerse(n.verseKey); else { setSelected(n.id); setActiveWord(null); } }
  }, [selected, toggleWord, toggleVerse]);

  const hovNode = hovered ? nmap[hovered] : null;
  const selNode = selected ? nmap[selected] : null;
  // The root whose full lexicon article the inspector might show, and how many
  // shards the active lexicon's full articles are split into (0 = no full text).
  const selRoot = selNode?.type === "word" ? (selNode.root || rootOf(selNode.wordNorm)) : null;
  const activeShards = lexicons?.find((L) => L.id === activeLexicon)?.fullShards || 0;

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

  if (error) return (
    <div className="ag-boot">
      <div className="ag-boot-glyph">۞</div>
      <div className="ag-boot-msg">تعذّر تحميل بيانات القرآن.</div>
      <div className="ag-boot-sub">{error}</div>
      <button className="ag-btn is-gold" onClick={loadData}>إعادة المحاولة</button>
    </div>
  );

  if (loading) return (
    <div className="ag-boot">
      <div className="ag-boot-glyph">۞</div>
      <div className="ag-boot-msg">جارٍ نسج الشبكة القرآنية…</div>
      <div className="ag-boot-bar"><div /></div>
    </div>
  );

  const totalExp = expandedWords.size + expandedVerses.size;
  const isEmpty = !!currentVerse && graphNodes.length <= 1;
  const inspOpen = !!selNode;

  return (
    <div className="ag-app">
      {/* ── Toolbar ── */}
      <header className="ag-bar">
        <button type="button" className="ag-brand" aria-label="آيات.network — العودة إلى البداية"
          onClick={() => { setSelected(null); setActiveWord(null); setToolsOpen(false); setTransform(homeView()); }}>
          <img src={`${import.meta.env.BASE_URL}logomark.svg`} alt="" className="ag-logo" />
          <span className="ag-wordmark">آيات<i>.network</i></span>
        </button>

        <form className={"ag-search" + (searchMiss ? " is-miss" : "")} onSubmit={runSearch} role="search">
          <button type="submit" className="ag-search-btn" aria-label="بحث" title="بحث">⌕</button>
          <input className="ag-input" type="search" value={query} aria-label="بحث عن كلمة أو جذر"
            placeholder={searchMode === "root" ? "ابحث عن جذر…" : searchMode === "lemma" ? "ابحث عن صيغة…" : "ابحث عن كلمة…"}
            onChange={(e) => { setQuery(e.target.value); if (searchMiss) setSearchMiss(false); }} />
        </form>

        <div className="ag-controls">
          <div className="ag-seg" role="group" aria-label="نمط البحث">
            <button type="button" className={"" + (searchMode === "exact" ? "is-on" : "")} title="مطابقة الكلمة"
              aria-pressed={searchMode === "exact"} onClick={() => { setSearchMode("exact"); reset(); }}>كلمة</button>
            <button type="button" className={"is-lemma " + (searchMode === "lemma" ? "is-on" : "")} title="مطابقة الصيغة (المعجم)"
              aria-pressed={searchMode === "lemma"} onClick={() => { setSearchMode("lemma"); reset(); }}>صيغة</button>
            <button type="button" className={"is-root " + (searchMode === "root" ? "is-on" : "")} title="مطابقة الجذر"
              aria-pressed={searchMode === "root"} onClick={() => { setSearchMode("root"); reset(); }}>جذر</button>
          </div>

          <div className="ag-select">
            <select aria-label="السورة" value={surah} onChange={(e) => { setSurah(+e.target.value); setAyah(1); reset(); }}>
              {surahList.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
            </select>
          </div>
          <div className="ag-select is-ayah">
            <select aria-label="الآية" value={safeAyah} onChange={(e) => { setAyah(+e.target.value); reset(); }}>
              {Array.from({ length: ayahCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>

          <div className="ag-tools" ref={toolsRef}>
            <button type="button" className={"ag-iconbtn is-gold" + (toolsOpen ? " is-active" : "")} aria-label="أدوات الرسم"
              aria-expanded={toolsOpen} onClick={() => setToolsOpen((o) => !o)}>⚙</button>
            {toolsOpen && (
              <div className="ag-popover" role="dialog" aria-label="أدوات الرسم">
                <h3 className="ag-pop-h">أدوات الرسم</h3>
                {(() => {
                  const sliderMax = allowBig ? branchMax : Math.min(branchMax, SOFT_CAP);
                  return (
                    <div className="ag-range">
                      <div className="ag-range-top">
                        <span className="ag-range-lab">عدد الآيات لكل كلمة</span>
                        <span className="ag-range-val">{Math.min(maxBranch, sliderMax)}<span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}> / {sliderMax}</span></span>
                      </div>
                      <input type="range" aria-label="عدد الآيات لكل كلمة" min={3} max={sliderMax} value={Math.min(maxBranch, sliderMax)}
                        onChange={(e) => setMaxBranch(+e.target.value)} />
                      {branchMax > SOFT_CAP && (
                        <label className="ag-switch" style={{ marginBlockStart: "var(--space-2)" }}>
                          <span>السماح بأكثر من {SOFT_CAP} عقدة <span style={{ color: "var(--rubric-400)", fontSize: "var(--text-xs)" }}>(قد يبطئ الأجهزة الضعيفة)</span></span>
                          <input type="checkbox" checked={allowBig} onChange={(e) => setAllowBig(e.target.checked)} />
                          <span className="ag-track" aria-hidden="true" />
                        </label>
                      )}
                    </div>
                  );
                })()}
                <div className="ag-pop-sec">
                  <label className="ag-switch">
                    <span>إخفاء حروف المعاني</span>
                    <input type="checkbox" checked={hideStop} onChange={(e) => setHideStop(e.target.checked)} />
                    <span className="ag-track" aria-hidden="true" />
                  </label>
                  <label className="ag-switch">
                    <span>إظهار الحلقات</span>
                    <input type="checkbox" checked={showLoops} onChange={(e) => setShowLoops(e.target.checked)} />
                    <span className="ag-track" aria-hidden="true" />
                  </label>
                  <label className="ag-switch">
                    <span>روابط نادرة فقط</span>
                    <input type="checkbox" checked={rareOnly} onChange={(e) => setRareOnly(e.target.checked)} />
                    <span className="ag-track" aria-hidden="true" />
                  </label>
                </div>
                <div className="ag-morph">
                  <div className="ag-morph-grp">
                    <span className="ag-range-lab">دقة المطابقة (وضع الكلمة)</span>
                    <div className="ag-seg ag-seg-sm" role="group" aria-label="دقة المطابقة">
                      <button type="button" className={precision === "loose" ? "is-on" : ""} title="تتطابق الرسوم المتقاربة (آية = اية)"
                        aria-pressed={precision === "loose"} onClick={() => { setPrecision("loose"); reset(); }}>مرنة</button>
                      <button type="button" className={precision === "strict" ? "is-on" : ""} title="تمييز التاء المربوطة والألف المقصورة والهمزات"
                        aria-pressed={precision === "strict"} onClick={() => { setPrecision("strict"); reset(); }}>دقيقة</button>
                    </div>
                  </div>
                </div>
                <MorphologyFilter filter={morphFilter} onChange={setMorphFilter} />
                <StopWordEditor
                  particles={[...STOP_PARTICLES]} content={[...STOP_CONTENT_DEFAULT]}
                  hiddenSet={stopSet} extra={stopExtra}
                  onToggle={toggleStopWord}
                  onAddExtra={(w) => setStopExtra((p) => (p.includes(w) ? p : [...p, w]))}
                  onRemoveExtra={(w) => setStopExtra((p) => p.filter((x) => x !== w))} />
              </div>
            )}
          </div>

          <button type="button" className="ag-iconbtn" title="مساعدة ودليل" aria-label="مساعدة ودليل"
            onClick={() => setShowHelp(true)}>؟</button>
          <button type="button" className="ag-iconbtn" title="تبديل السمة" aria-label="تبديل السمة"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>{theme === "dark" ? "☀" : "☾"}</button>
        </div>
      </header>

      {/* ── Body: stage + inspector ── */}
      <div className="ag-body">
        <main className="ag-stage" ref={containerRef}
          style={{ cursor: dragId || isPanning ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp} onPointerLeave={onPointerLeave}>

          <div className="ag-girih" />

          {/* HUD: status + mode */}
          <div className="ag-hud">
            <span className="ag-chip" title="عدد العقد (الكلمات والآيات) وعدد الروابط المعروضة الآن">{graphNodes.length} عقدة · {graphLinks.length} رابط</span>
            <span className={"ag-chip is-mode" + (searchMode === "root" ? " is-root" : searchMode === "lemma" ? " is-lemma" : "")} title="نمط الربط الحالي">{searchMode === "root" ? "جذر ثلاثي" : searchMode === "lemma" ? "صيغة معجمية" : "تطابق الكلمة"}</span>
          </div>

          {/* Legend */}
          <div className="ag-legend" aria-hidden="true">
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "var(--gold-500)" }} />المركز (الآية المختارة)</div>
            <div className="ag-legend-row"><span className="ag-legend-swatch ag-legend-freq" />{searchMode === "root" ? "جذر" : searchMode === "lemma" ? "صيغة" : "كلمة"} · اللون حسب التكرار</div>
            <div className="ag-legend-row"><span className="ag-legend-swatch ag-legend-depth" />آية · اللون حسب العمق</div>
            <div className="ag-legend-row"><span className="ag-legend-line" />الرابط · سُمكه حسب ندرة الكلمة</div>
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "#34d8a8" }} />نقطة خضراء: كلمة موسّعة</div>
            <div className="ag-legend-row"><span className="ag-legend-ring" />حلقة بنفسجية: آية موسّعة</div>
            {searchMode !== "exact" && <div className="ag-legend-row"><span className="ag-legend-dot ag-legend-dash" />بلا {searchMode === "root" ? "جذر" : "صيغة"}</div>}
          </div>

          {/* On-canvas graph controls (fit / zoom / collapse / deselect / back) */}
          <div className="ag-dock" data-panel="1">
            <button type="button" className="ag-iconbtn is-gold" title="توسيط العرض" aria-label="توسيط العرض" onClick={() => setTransform(fitView())}>⤢</button>
            <button type="button" className="ag-iconbtn" title="تكبير" aria-label="تكبير" onClick={() => zoomBy(1.2)}>＋</button>
            <button type="button" className="ag-iconbtn" title="تصغير" aria-label="تصغير" onClick={() => zoomBy(0.83)}>－</button>
            {(selected || activeWord) && <button type="button" className="ag-iconbtn is-gold" title="إلغاء التحديد" aria-label="إلغاء التحديد" onClick={() => { setSelected(null); setActiveWord(null); }}>✦</button>}
            {histState.canUndo && <button type="button" className="ag-iconbtn" title="تراجع (Ctrl+Z)" aria-label="تراجع" onClick={undo}>↶</button>}
            {histState.canRedo && <button type="button" className="ag-iconbtn" title="إعادة (Ctrl+Y)" aria-label="إعادة" onClick={redo}>↷</button>}
            {totalExp > 0 && <button type="button" className="ag-iconbtn is-warn" title="طي الكل" aria-label="طي الكل" onClick={reset}>↺</button>}
            {expandedWordNodes.length > 0 && <button type="button" className={"ag-iconbtn" + (showExpanded ? " is-active" : "")} title="الكلمات الموسّعة" aria-label="الكلمات الموسّعة" aria-pressed={showExpanded} onClick={() => setShowExpanded((s) => !s)}><span style={{ color: "#34d8a8" }}>✷</span> {expandedWordNodes.length}</button>}
            <button type="button" className="ag-iconbtn" title={linkCopied ? "نُسخ الرابط ✓" : "نسخ رابط المشاركة"} aria-label="نسخ رابط المشاركة" onClick={copyLink}>{linkCopied ? "✓" : "⎘"}</button>
            <button type="button" className="ag-iconbtn" title="تصدير صورة PNG" aria-label="تصدير صورة PNG" onClick={() => exportGraph("png")}>⤓</button>
            <button type="button" className="ag-iconbtn" title="تصدير SVG" aria-label="تصدير SVG" onClick={() => exportGraph("svg")}>❖</button>
          </div>

          {/* Expanded-words list (green-dot words) */}
          {showExpanded && expandedWordNodes.length > 0 && (
            <div className="ag-expanded" data-panel="1">
              <div className="ag-expanded-h">
                <span><span style={{ color: "#34d8a8" }}>✷</span> الكلمات الموسّعة ({expandedWordNodes.length})</span>
                <button type="button" className="ag-iconbtn" style={{ width: 26, height: 26, fontSize: 12 }} aria-label="إغلاق" onClick={() => setShowExpanded(false)}>✕</button>
              </div>
              <div className="ag-expanded-list">
                {expandedWordNodes.map((n) => (
                  <span key={n.id} className="ag-expanded-chip">
                    <button type="button" className="ag-expanded-go" title="انتقل إلى الكلمة" onClick={() => focusNode(n.id)}>
                      {n.label}{n.count > 1 ? <b style={{ color: "var(--text-faint)" }}> {n.count}</b> : null}
                    </button>
                    <button type="button" className="ag-expanded-x" title="طيّ" aria-label="طيّ"
                      onClick={() => toggleWord(n.lookup || n.wordNorm, n.parentVerseKey)}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="ag-empty">
              <div className="ag-empty-inner">
                <div className="ag-empty-glyph">۞</div>
                لا توجد كلمات قابلة للربط في هذه الآية{hideStop ? " (جرّب إيقاف «إخفاء حروف المعاني»)" : ""}.
              </div>
            </div>
          )}

          {/* SVG graph */}
          <svg ref={svgRef} width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            role="group" aria-roledescription="شبكة بيانية"
            aria-label={`شبكة الآية ${currentVerse?.sn || ""} ${safeAyah}: ${graphNodes.length} عقدة و${graphLinks.length} رابط، بنمط ${searchMode === "root" ? "الجذر" : searchMode === "lemma" ? "الصيغة" : "الكلمة"}. تنقّل بين العقد بمفتاح Tab.`}>
            <defs><marker id="arrL" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fb7185" opacity="0.6" /></marker></defs>
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`} style={{ pointerEvents: "auto" }}>
              <GraphLayer
                nodes={graphNodes} links={graphLinks} loopLinks={loopLinks} positions={positions} nmap={nmap} reg={registry}
                highlightSet={highlightSet} highlightLinks={highlightLinks} activeWordNodeIds={activeWordNodeIds}
                hovered={hovered} selected={selected} showLoops={showLoops} T={T} theme={theme}
                onNodeEnter={onNodeEnter} onNodeLeave={onNodeLeave} onNodeClick={onNodeClick} />
            </g>
          </svg>

          {/* Hover tooltip */}
          {hovNode && hovNode.type !== "center" && !selNode && (
            <div data-panel="1" className="ag-tooltip" style={{ pointerEvents: hovNode.type === "verse" ? "auto" : "none" }}>
              {hovNode.type === "word" ? (
                <div>
                  <div className="ag-tip-word">{hovNode.label}</div>
                  <div className="ag-tip-meta">
                    {hovNode.rootLabel && <span className="ag-tag" style={{ background: "color-mix(in oklab, var(--viridian-500) 14%, transparent)", color: "var(--viridian-400)", borderColor: "color-mix(in oklab, var(--viridian-500) 30%, transparent)" }}>جذر {hovNode.rootLabel}</span>}
                    <span className="ag-tag" style={{ color: fColor(hovNode.count, theme), background: fColor(hovNode.count, theme) + "22", borderColor: fColor(hovNode.count, theme) + "44" }}>{hovNode.count} آية</span>
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
                      aria-label="العبارات المشتركة (المتشابهات)" title="العبارات المشتركة (المتشابهات)" onClick={() => openPhrases(currentKey)}>⧉</button>
                    <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label="اقرأ في السياق" title="اقرأ في السياق" onClick={() => setCtx({ centerKey: currentKey })}>☰</button>
                    <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                      aria-label={readerCollapsed ? "إظهار الآية" : "إخفاء الآية"} aria-expanded={!readerCollapsed}
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
          <aside className={"ag-inspector" + (sheetOpen ? " is-open" : "")} aria-label="لوحة التفصيل">
            <button type="button" className="ag-sheet-grab" aria-label="إغلاق اللوحة" onClick={() => { setSelected(null); setActiveWord(null); }} />
            {selNode.type === "word" ? (
              <>
                <div className="ag-insp-head">
                  <div className="ag-insp-title">
                    <span className="ag-badge t-word">كلمة</span>
                    <h2 className="ag-insp-word">{selNode.label}</h2>
                    {selNode.rootLabel && <span className="ag-insp-root">جذر «{selNode.rootLabel}»</span>}
                    {selNode.uncovered && <span className="ag-insp-root" style={{ color: "var(--text-faint)" }}>بلا {searchMode === "root" ? "جذر" : "صيغة"} — غير مجمَّعة</span>}
                  </div>
                  <button type="button" className="ag-iconbtn" title="إغلاق" aria-label="إغلاق" onClick={() => { setSelected(null); setActiveWord(null); }}>✕</button>
                </div>
                <div className="ag-insp-scroll">
                  <div className="ag-insp-stat">
                    <span className="ag-insp-num" style={{ color: fColor(selNode.count, theme) }}>{selNode.count}</span>
                    <span className="ag-insp-cap">آية وردت فيها</span>
                  </div>
                  {selNode.count > 1 && (
                    <div className="ag-insp-actions">
                      <button type="button" className="ag-btn is-gold ag-occ-btn"
                        onClick={() => openOcc(selNode.lookup || selNode.wordNorm, selNode.label, searchMode)}>
                        ⌖ كل الآيات ({selNode.count})
                      </button>
                      <button type="button" className="ag-btn"
                        onClick={() => setDist({ lookup: selNode.lookup || selNode.wordNorm, label: selNode.label, mode: searchMode })}>
                        ▦ التوزيع والمجاورات
                      </button>
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
                          {meanings == null ? "… جارٍ تحميل المعجم"
                            : m ? <>{body}{loadingFull ? " …" : ""}</>
                            : "لا يوجد تعريف لهذا الجذر في هذا المعجم — جرّب معجمًا آخر."}
                        </div>
                        <div className="ag-insp-card-h" style={{ marginBottom: 0, marginTop: 6 }}>
                          <span className="ag-insp-card-lab" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {lexicons?.length > 1
                              ? <select className="ag-lex-select" value={activeLexicon} aria-label="اختر المعجم" onChange={(e) => setActiveLexicon(e.target.value)}>
                                  {lexicons.map((L) => <option key={L.id} value={L.id}>{L.label}</option>)}
                                </select>
                              : <span>{lexicons?.find((L) => L.id === activeLexicon)?.label || "معجم لغوي"}</span>}
                            <span style={{ color: "var(--text-faint)" }}>· جذر {sr}</span>
                          </span>
                          {hasMore && <button type="button" className="ag-btn is-gold" onClick={() => setMeaningOpen((o) => !o)}>{meaningOpen ? "أقل ▲" : "المزيد ▼"}</button>}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    const m = morphAt(morph, selNode.parentVerseKey, selNode.wordIndex);
                    if (!m) return null;
                    const POS_AR = { noun: "اسم", verb: "فعل", particle: "حرف", pn: "اسم علم", pron: "ضمير", adj: "صفة", actpcpl: "اسم فاعل", passpcpl: "اسم مفعول" };
                    const PERSON_AR = { 1: "متكلّم", 2: "مخاطَب", 3: "غائب" }, GEN_AR = { m: "مذكّر", f: "مؤنّث" }, NUM_AR = { s: "مفرد", d: "مثنّى", p: "جمع" };
                    const pgn = [PERSON_AR[m.person], GEN_AR[m.gender], NUM_AR[m.number]].filter(Boolean).join(" ");
                    // The root the corpus assigns to THIS occurrence (position-correct),
                    // vs. the majority-vote grouping root the graph links by. When they
                    // differ this surface form is a homograph: it's grouped under its
                    // commoner reading, but here it's a different root — flag it so the
                    // researcher isn't misled by the grouping or the lexicon gloss above.
                    const groupRoot = selNode.root || rootOf(selNode.wordNorm);
                    const divergent = m.root && groupRoot && m.root !== groupRoot;
                    const rows = [
                      ["النوع", POS_AR[m.pos]],
                      ["الجذر (هنا)", m.root],
                      ["الوزن", m.vf ? `الصيغة ${formRoman(m.vf)}` : null],
                      ["الزمن", { perf: "ماضٍ", impf: "مضارع", impv: "أمر" }[m.aspect]],
                      ["البناء", { act: "معلوم", pass: "مجهول" }[m.voice]],
                      ["الإعراب", { ind: "مرفوع", subj: "منصوب", jus: "مجزوم" }[m.mood] || { nom: "مرفوع", acc: "منصوب", gen: "مجرور" }[m.gcase]],
                      ["الضمير", pgn || null],
                      ["الصيغة المعجمية", m.lemma],
                    ].filter(([, v]) => v);
                    if (!rows.length) return null;
                    return (
                      <div className="ag-insp-card t-morph">
                        <div className="ag-insp-card-lab" style={{ marginBottom: 6 }}>التحليل الصرفي{m.precise ? "" : " (تقريبي)"} — المدوّنة القرآنية</div>
                        <div className="ag-morph-rows">
                          {rows.map(([k, v]) => <div className="ag-morph-row" key={k}><span className="ag-morph-k">{k}</span><span className="ag-morph-v">{v}</span></div>)}
                        </div>
                        {divergent && (
                          <div className="ag-insp-note" style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--rubric-400)", lineHeight: 1.6 }}>
                            ⚠ مشترك لفظي: جذر التجميع «{groupRoot}» (بالأغلبية)، أمّا في هذه الآية فالجذر «{m.root}». المعنى المعجمي أعلاه لجذر التجميع.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(() => { const pid = parentMap[selNode.id], parent = pid ? nmap[pid] : null; if (parent?.text) return (
                    <div className="ag-insp-card">
                      <div className="ag-insp-card-lab" style={{ marginBottom: 6 }}>من: {parent.label}</div>
                      <div className="ag-insp-verse"><HighlightedAyah text={parent.text} primaryWord={selNode.lookup || selNode.wordNorm} searchMode={searchMode} precision={precision} theme={theme} interactive={true} onWordClick={(wn) => handleWordClick(wn, parent.verseKey)} /></div>
                    </div>); return null; })()}
                </div>
              </>
            ) : selNode.type === "verse" ? (
              <>
                <div className="ag-insp-head">
                  <div className="ag-insp-title">
                    <span className="ag-badge t-verse">آية</span>
                    <h2 className="ag-insp-word" style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>{selNode.label}</h2>
                  </div>
                  <button type="button" className="ag-iconbtn" title="إغلاق" aria-label="إغلاق" onClick={() => { setSelected(null); setActiveWord(null); }}>✕</button>
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
                      <div className="ag-insp-card-lab" style={{ marginBottom: 8 }}>كلمات مشتركة</div>
                      <div className="ag-insp-tags">
                        {selNode.sharedWords.map((w, i) => <span key={i} className="ag-tag">{w}</span>)}
                      </div>
                    </div>
                  )}
                  <div className="ag-insp-actions">
                    <button type="button" className="ag-btn is-gold" title={selNode.isExpanded ? "طي الكلمات" : "إظهار الكلمات"} onClick={() => toggleVerse(selNode.verseKey)}>{selNode.isExpanded ? "⊖ طي الكلمات" : "⊕ إظهار الكلمات"}</button>
                    <button type="button" className="ag-btn" title="اقرأ في السياق" onClick={() => setCtx({ centerKey: selNode.verseKey })}>☰ السياق</button>
                    <button type="button" className="ag-btn" title="العبارات المشتركة (المتشابهات)" onClick={() => openPhrases(selNode.verseKey)}>⧉ متشابهات</button>
                    <button type="button" className="ag-btn" title="اجعلها المركز" aria-label="اجعلها المركز" onClick={() => navigate(selNode.surahNum, selNode.ayahNum)}>⌖ اجعلها المركز</button>
                  </div>
                </div>
              </>
            ) : null}
          </aside>
        )}
      </div>

      {/* Occurrences popup — every āyah a word/root occurs in, paginated */}
      <OccurrencesModal occ={occ} verseData={verseData} searchMode={occ?.mode || searchMode} precision={precision} theme={theme}
        onNavigate={(s, a) => { navigate(s, a); setOcc(null); }}
        onBack={() => { const d = occ?.back; setOcc(null); if (d) setDist(d); }}
        onClose={() => setOcc(null)} />

      {dist && (
        <DistributionModal dist={dist}
          index={dist.mode === "root" ? r2v : dist.mode === "lemma" ? (l2v || w2v) : w2v}
          verseData={verseData} surahList={surahList} stopSet={stopSet} theme={theme}
          onNavigate={(s, a) => { setDist(null); navigate(s, a); }}
          onPick={(key, label) => {
            // Show only the verses where the neighbour co-occurs WITH the original
            // word — computed the SAME way the collocation count is (scan the
            // original word's verses for the neighbour), so the count matches the
            // chip exactly. Includes a back button to the original distribution.
            const idx = dist.mode === "root" ? r2v : dist.mode === "lemma" ? (l2v || w2v) : w2v;
            const keyOf = (w) => dist.mode === "exact" ? (w.exact ?? w.norm) : groupKey(w.norm, dist.mode);
            const shared = (idx[dist.lookup] || [])
              .filter((vk) => (verseData[vk]?.words || []).some((w) => keyOf(w) === key))
              .sort((a, b) => { const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number); return sa - sb || aa - ab; });
            const back = dist;
            setDist(null);
            setOcc({ lookup: key, label: `«${label}» مع «${dist.label}»`, mode: dist.mode, keys: shared, back });
          }}
          onClose={() => setDist(null)} />
      )}

      {ctx && (
        <ContextModal ctx={ctx} orderedKeys={orderedKeys} verseData={verseData}
          onNavigate={(s, a) => { navigate(s, a); setCtx(null); }} onClose={() => setCtx(null)} />
      )}

      <PhraseModal phrase={phrase} seedIndex={seedIndex} verseData={verseData}
        onNavigate={(s, a) => { setPhrase(null); navigate(s, a); }} onClose={() => setPhrase(null)} />

      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
