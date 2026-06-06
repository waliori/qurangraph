import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { norm, rootKey, rootOf, setRootMap } from "./arabic-utils.js";
import { loadHafsData, loadRoots, loadRootMeanings, loadRootMeaningsFull } from "./data-loader.js";
import { THEMES, fColor } from "./theme.js";
import { buildLazyGraph, buildChildMap, getDescendants, getPathToCenter } from "./graph/buildGraph.js";
import { createSimulation } from "./graph/simulation.js";
import { HighlightedAyah } from "./components/HighlightedAyah.jsx";
import { GraphLayer } from "./components/GraphLayer.jsx";
import { OccurrencesModal } from "./components/OccurrencesModal.jsx";
import { usePersistedState } from "./hooks/usePersistedState.js";

// Fixed virtual canvas the graph is laid out in. Decoupling layout from the
// live viewport size means a window resize never rebuilds the graph or shifts
// settled nodes — the pan/zoom transform maps this canvas onto the screen.
const VW = 1600, VH = 1100;
const isInt = (v) => Number.isInteger(v);

/* ═══ MAIN ═══ */
export default function QuranGraph() {
  const [quranRaw, setQuranRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surah, setSurah] = usePersistedState("qg.surah", 2, (v, f) => (isInt(v) && v >= 1 && v <= 114 ? v : f));
  const [ayah, setAyah] = usePersistedState("qg.ayah", 228, (v, f) => (isInt(v) && v >= 1 ? v : f));
  const [maxBranch, setMaxBranch] = usePersistedState("qg.maxBranch", 10, (v, f) => (isInt(v) && v >= 3 && v <= 2000 ? v : f));
  const [hideStop, setHideStop] = usePersistedState("qg.hideStop", true, (v) => !!v);
  const [showLoops, setShowLoops] = usePersistedState("qg.showLoops", true, (v) => !!v);
  const [searchMode, setSearchMode] = usePersistedState("qg.searchMode", "exact", (v, f) => (v === "exact" || v === "root" ? v : f));
  const [theme, setTheme] = usePersistedState("qg.theme", "dark", (v, f) => (v === "dark" || v === "light" ? v : f));
  const [expandedWords, setExpandedWords] = useState(new Set());
  const [expandedVerses, setExpandedVerses] = useState(new Set());
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const [activeWord, setActiveWord] = useState(null);
  const [hist, setHist] = useState([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [positions, setPositions] = useState({});
  const positionsRef = useRef(positions);
  const [dragId, setDragId] = useState(null);
  const dragStartRef = useRef(null);
  const draggedRef = useRef(false); // true once a press turns into a real drag
  const [sim] = useState(() => createSimulation(VW, VH)); // live force engine (stable)
  const rafSimRef = useRef(0);
  const containerRef = useRef();
  const toolsRef = useRef(null);
  const pointersRef = useRef(new Map()); // pointerId → {x, y}  (for pan / pinch)
  const pinchRef = useRef(null);
  const rafRef = useRef(0);
  const movePendingRef = useRef(null);
  const centeredRef = useRef(false);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showHelp, setShowHelp] = useState(false);
  const [meanings, setMeanings] = useState(null); // root → { c, f } (lazy)
  const [meaningsFull, setMeaningsFull] = useState(null); // root → full article (lazy, on "show more")
  const [meaningOpen, setMeaningOpen] = useState(false); // full-text toggle
  const [occ, setOcc] = useState(null); // occurrences popup: { lookup, label, isRoot, keys }
  const [toolsOpen, setToolsOpen] = useState(false); // graph-tools popover
  const [query, setQuery] = useState(""); // toolbar search field
  const [searchMiss, setSearchMiss] = useState(false); // last search found nothing
  const [readerCollapsed, setReaderCollapsed] = useState(false); // bottom reader dock
  const [sheetOpen, setSheetOpen] = useState(false); // inspector slide-in (mobile sheet)
  const T = THEMES[theme];

  // Translate that centres the virtual canvas in the current viewport.
  const homeView = useCallback(() => ({ x: (dims.w - VW) / 2, y: (dims.h - VH) / 2, k: 1 }), [dims.w, dims.h]);

  // Drive the live layout: tick the simulation once per frame, pushing settled
  // positions into state, until its energy decays to rest. Cheap to call from any
  // interaction — it no-ops if a loop is already running.
  const runSim = useCallback(() => {
    if (rafSimRef.current) return;
    const tick = () => {
      const alive = sim.step();
      if (alive) { setPositions(sim.getPositions()); rafSimRef.current = requestAnimationFrame(tick); }
      else { setPositions(sim.getPositions()); rafSimRef.current = 0; }
    };
    rafSimRef.current = requestAnimationFrame(tick);
  }, [sim]);
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

  // Lazy-load Ibn Faris meanings the first time they're needed — either root
  // mode (roots shown everywhere) or as soon as any node is selected, so a
  // word's root meaning can be surfaced in the inspector even in exact mode.
  useEffect(() => {
    if ((searchMode === "root" || selected != null) && !meanings) loadRootMeanings().then(setMeanings).catch(() => {});
  }, [searchMode, meanings, selected]);

  // Lazy-load the FULL Maqāyīs al-Lugha articles the first time the reader asks
  // to expand a meaning ("show more"). ~1.6MB, so deferred until truly wanted.
  useEffect(() => {
    if (meaningOpen && !meaningsFull) loadRootMeaningsFull().then(setMeaningsFull).catch(() => {});
  }, [meaningOpen, meaningsFull]);

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
    const w2v = {}, r2v = {}, vd = {}, sl = [];
    for (const s of quranRaw) {
      sl.push({ id: s.id, name: s.name, count: s.total_verses });
      for (const v of s.verses) {
        const vk = `${s.id}:${v.id}`;
        const words = [];
        const seenN = new Set(), seenR = new Set();
        for (const raw of v.text.split(/\s+/)) {
          const n = norm(raw);
          if (n.length < 2) continue;
          words.push({ orig: raw, norm: n });
          if (!seenN.has(n)) { seenN.add(n); (w2v[n] ||= []).push(vk); }
          const root = rootKey(n);
          if (!seenR.has(root)) { seenR.add(root); (r2v[root] ||= []).push(vk); }
        }
        vd[vk] = { text: v.text, s: s.id, a: v.id, sn: s.name, words };
      }
    }
    return { w2v, r2v, verseData: vd, surahList: sl };
  }, [quranRaw]);

  const ayahCount = quranRaw?.find((s) => s.id === surah)?.total_verses || 1;
  // Guard against a persisted/out-of-range ayah without a state round-trip.
  const safeAyah = Math.min(Math.max(ayah, 1), ayahCount);
  const currentKey = `${surah}:${safeAyah}`;
  const currentVerse = verseData[currentKey];

  // Build graph STRUCTURE only — laid out in the fixed VW×VH virtual canvas, so
  // this never re-runs on viewport resize.
  const { graphNodes, graphLinks, loopLinks, parentMap } = useMemo(() => {
    if (!currentVerse) return { graphNodes: [], graphLinks: [], loopLinks: [], parentMap: {} };
    const r = buildLazyGraph(currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, VW, VH);
    return { graphNodes: r.nodes, graphLinks: r.links, loopLinks: r.loopLinks, parentMap: r.parentMap };
  }, [currentVerse, currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode]);

  // Adjacency map reused across every subtree query (descendants / drag / highlight).
  const childMap = useMemo(() => buildChildMap(graphLinks), [graphLinks]);

  // Feed the live simulation whenever the graph STRUCTURE changes (expand/collapse,
  // navigate). Surviving nodes keep their settled position; newly-added nodes are
  // pre-seeded in a phyllotaxis disk around their parent's CURRENT position, so a
  // freshly-expanded — or re-expanded — fan always blooms into the space around the
  // parent as it is now, never restoring an old arrangement. Reading positions via
  // a ref keeps this off the per-frame render path (it must not re-run as the sim
  // ticks positions in).
  useEffect(() => {
    const pos = positionsRef.current;
    const parentOf = {};
    for (const l of graphLinks) if (parentOf[l.target] === undefined) parentOf[l.target] = l.source;
    const missing = graphNodes.filter((n) => !n.fixed && !pos[n.id]);
    const missingByParent = {};
    for (const n of missing) (missingByParent[parentOf[n.id]] ||= []).push(n.id);
    const seedAround = (n) => {
      const pp = pos[parentOf[n.id]];
      if (!pp) return { x: n.x, y: n.y };
      const sibs = missingByParent[parentOf[n.id]];
      const idx = Math.max(0, sibs.indexOf(n.id));
      const ang = idx * 2.399963; // golden angle → even angular spread
      // Phyllotaxis (sunflower) seed: radius grows with √idx so siblings fill a
      // uniform-density DISK around the parent, not one overcrowded ring.
      const rad = 110 + 36 * Math.sqrt(idx + 0.5);
      return { x: pp.x + Math.cos(ang) * rad, y: pp.y + Math.sin(ang) * rad };
    };
    const seeded = graphNodes.map((n) => {
      const s = pos[n.id];
      if (s) return { ...n, x: s.x, y: s.y };
      if (n.fixed) return n;
      const sd = seedAround(n);
      return { ...n, x: sd.x, y: sd.y };
    });
    sim.sync(seeded, graphLinks);
    sim.reheat(missing.length ? 1 : 0.45);
    runSim();
  }, [graphNodes, graphLinks, runSim, sim]);

  const nmap = useMemo(() => { const m = {}; graphNodes.forEach((n) => (m[n.id] = n)); return m; }, [graphNodes]);
  // The per-word branch slider caps how many āyāt each word fans out to. Rather
  // than a fixed 50, the ceiling tracks the busiest word currently on the canvas
  // (so the most-frequent word can fan out to *all* its occurrences), floored at
  // 10 and hard-capped for rendering sanity.
  const branchMax = useMemo(() => {
    let m = 10;
    for (const n of graphNodes) if (n.type === "word" && n.count > m) m = n.count;
    return Math.min(m, 250);
  }, [graphNodes]);
  const wordToNodeIds = useMemo(() => { const m = {}; graphNodes.forEach((n) => { if (n.type === "word") { const key = n.lookup || n.wordNorm; (m[key] ||= []).push(n.id); } }); return m; }, [graphNodes]);
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
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of graphNodes) {
      const p = positions[n.id] || { x: n.x, y: n.y };
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
  }, [graphNodes, positions, dims.w, dims.h, homeView]);

  const reset = useCallback(() => { sim.clearSticky(); setExpandedWords(new Set()); setExpandedVerses(new Set()); setSelected(null); setActiveWord(null); setPositions({}); setTransform(homeView()); }, [homeView, sim]);
  const navigate = useCallback((s, a) => { setHist((h) => [...h, { s: surah, a: ayah }]); setSurah(s); setAyah(a); reset(); }, [surah, ayah, reset, setSurah, setAyah]);
  const goBack = useCallback(() => { if (!hist.length) return; const p = hist[hist.length - 1]; setHist((h) => h.slice(0, -1)); setSurah(p.s); setAyah(p.a); reset(); }, [hist, reset, setSurah, setAyah]);

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
    const np = positions[nodeId] || (n ? { x: n.x, y: n.y } : { x: 0, y: 0 });
    const wp = svgToWorld(clientX, clientY);
    dragStartRef.current = { offX: np.x - wp.x, offY: np.y - wp.y, downX: clientX, downY: clientY };
    sim.pin(nodeId, np.x, np.y);
    setDragId(nodeId);
    runSim();
  }, [nmap, positions, svgToWorld, runSim, sim]);

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
    const onWheel = (e) => { e.preventDefault(); applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY); };
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
    const lookup = searchMode === "root" ? rootKey(wordNorm) : wordNorm;
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
  const openOcc = useCallback((lookup, label, isRoot) => {
    const idx = isRoot ? r2v : w2v;
    const all = idx[lookup];
    if (!all?.length) return false;
    const ord = [...all].sort((a, b) => {
      const [sa, aa] = a.split(":").map(Number), [sb, ab] = b.split(":").map(Number);
      return sa - sb || aa - ab;
    });
    const keys = ord.includes(currentKey) ? [currentKey, ...ord.filter((k) => k !== currentKey)] : ord;
    setOcc({ lookup, label, isRoot, keys });
    return true;
  }, [w2v, r2v, currentKey]);

  const runSearch = useCallback((e) => {
    e?.preventDefault?.();
    const q = norm(query);
    if (q.length < 2) { setSearchMiss(true); return; }
    let lookup = searchMode === "root" ? rootKey(q) : q;
    let label = query.trim();
    const isRoot = searchMode === "root";
    if (!isRoot && !w2v[q]) {
      // Forgiving fallback: first indexed word that contains the query.
      const hit = Object.keys(w2v).find((k) => k.includes(q));
      if (hit) { lookup = hit; label = hit; }
    }
    setToolsOpen(false);
    // Show ALL āyāt for the term directly (no node is selected until the user
    // picks one from the list).
    if (openOcc(lookup, label, isRoot)) { setSearchMiss(false); setActiveWord(lookup); }
    else setSearchMiss(true);
  }, [query, searchMode, w2v, openOcc]);

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
            placeholder={searchMode === "root" ? "ابحث عن جذر…" : "ابحث عن كلمة…"}
            onChange={(e) => { setQuery(e.target.value); if (searchMiss) setSearchMiss(false); }} />
        </form>

        <div className="ag-controls">
          <div className="ag-seg" role="group" aria-label="نمط البحث">
            <button type="button" className={"" + (searchMode === "exact" ? "is-on" : "")} title="مطابقة الكلمة"
              aria-pressed={searchMode === "exact"} onClick={() => { setSearchMode("exact"); reset(); }}>كلمة</button>
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
                <div className="ag-range">
                  <div className="ag-range-top">
                    <span className="ag-range-lab">عدد الآيات لكل كلمة</span>
                    <span className="ag-range-val">{Math.min(maxBranch, branchMax)}<span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}> / {branchMax}</span></span>
                  </div>
                  <input type="range" aria-label="عدد الآيات لكل كلمة" min={3} max={branchMax} value={Math.min(maxBranch, branchMax)}
                    onChange={(e) => setMaxBranch(+e.target.value)} />
                </div>
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
                </div>
                <div className="ag-pop-actions">
                  <button type="button" className="ag-btn" aria-label="مساعدة" aria-pressed={showHelp} onClick={() => setShowHelp((h) => !h)}>؟ مساعدة</button>
                </div>
                {showHelp && (
                  <div className="ag-insp-card" style={{ fontSize: "var(--text-xs)", lineHeight: 2, color: "var(--text-muted)" }}>
                    <b style={{ color: "var(--viridian-400)" }}>جذر:</b> الجذر الصرفي لكل كلمة مع معناه من «مقاييس اللغة» لابن فارس — أشهُر/شهور/شهر ← ش ه ر<br />
                    <b style={{ color: "var(--lapis-400)" }}>كلمة:</b> تطابق دقيق<br />
                    اضغط كلمة (في الآية أو الشبكة) ← توسيع، ومرة ثانية ← طي.<br />
                    <span style={{ color: "var(--text-faint)" }}>اسحب للتحريك · العجلة أو إصبعان للتكبير.</span>
                  </div>
                )}
              </div>
            )}
          </div>

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
            <span className="ag-chip">{graphNodes.length} عقدة · {graphLinks.length} رابط</span>
            <span className={"ag-chip is-mode" + (searchMode === "root" ? " is-root" : "")}>{searchMode === "root" ? "جذر ثلاثي" : "تطابق الكلمة"}</span>
          </div>

          {/* Legend */}
          <div className="ag-legend" aria-hidden="true">
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "var(--gold-500)" }} />المركز</div>
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "var(--lapis-500)" }} />كلمة</div>
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "var(--viridian-500)" }} />جذر</div>
            <div className="ag-legend-row"><span className="ag-legend-dot" style={{ background: "#a78bfa" }} />آية</div>
          </div>

          {/* On-canvas graph controls (fit / zoom / collapse / deselect / back) */}
          <div className="ag-dock" data-panel="1">
            <button type="button" className="ag-iconbtn is-gold" title="توسيط العرض" aria-label="توسيط العرض" onClick={() => setTransform(fitView())}>⤢</button>
            <button type="button" className="ag-iconbtn" title="تكبير" aria-label="تكبير" onClick={() => zoomBy(1.2)}>＋</button>
            <button type="button" className="ag-iconbtn" title="تصغير" aria-label="تصغير" onClick={() => zoomBy(0.83)}>－</button>
            {(selected || activeWord) && <button type="button" className="ag-iconbtn is-gold" title="إلغاء التحديد" aria-label="إلغاء التحديد" onClick={() => { setSelected(null); setActiveWord(null); }}>✦</button>}
            {hist.length > 0 && <button type="button" className="ag-iconbtn is-gold" title="رجوع" aria-label="رجوع" onClick={goBack}>↩</button>}
            {totalExp > 0 && <button type="button" className="ag-iconbtn is-warn" title="طي الكل" aria-label="طي الكل" onClick={reset}>↺</button>}
          </div>

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
          <svg width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <defs><marker id="arrL" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fb7185" opacity="0.6" /></marker></defs>
            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`} style={{ pointerEvents: "auto" }}>
              <GraphLayer
                nodes={graphNodes} links={graphLinks} loopLinks={loopLinks} positions={positions} nmap={nmap}
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
                    <HighlightedAyah text={hovNode.text} primaryWord={getConnWord(hovNode)} sharedWords={hovNode.sharedWords || []} searchMode={searchMode} theme={theme}
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
                  <button type="button" className="ag-iconbtn" style={{ width: 30, height: 30, fontSize: 13 }}
                    aria-label={readerCollapsed ? "إظهار الآية" : "إخفاء الآية"} aria-expanded={!readerCollapsed}
                    onClick={() => setReaderCollapsed((c) => !c)}>{readerCollapsed ? "▴" : "▾"}</button>
                </div>
                <div className="ag-reader-body">
                  <div className="ag-reader-text">
                    <HighlightedAyah text={currentVerse.text} primaryWord={activeWord || (hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null)} interactive={true} onWordClick={(wn) => handleWordClick(wn, currentKey)} activeGraphWord={hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null} searchMode={searchMode} theme={theme} />
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
                  </div>
                  <button type="button" className="ag-iconbtn" title="إغلاق" aria-label="إغلاق" onClick={() => { setSelected(null); setActiveWord(null); }}>✕</button>
                </div>
                <div className="ag-insp-scroll">
                  <div className="ag-insp-stat">
                    <span className="ag-insp-num" style={{ color: fColor(selNode.count, theme) }}>{selNode.count}</span>
                    <span className="ag-insp-cap">آية وردت فيها</span>
                  </div>
                  {selNode.count > 1 && (
                    <button type="button" className="ag-btn is-gold ag-occ-btn"
                      onClick={() => openOcc(selNode.lookup || selNode.wordNorm, selNode.label, searchMode === "root")}>
                      ⌖ عرض كل الآيات ({selNode.count})
                    </button>
                  )}
                  {(() => {
                    const sr = selNode.root || rootOf(selNode.wordNorm); // derive root in exact mode too
                    if (!sr || !meanings?.[sr]) return null;
                    const m = meanings[sr];
                    const full = meaningsFull?.[sr];
                    const hasMore = (m.f && m.f !== m.c) || !!full;
                    const body = meaningOpen ? (full || m.f) : m.c;
                    const loadingFull = meaningOpen && !meaningsFull && hasMore;
                    return (
                      <div className="ag-insp-card t-mean">
                        <div className="ag-insp-mean">{body}{loadingFull ? " …" : ""}</div>
                        <div className="ag-insp-card-h" style={{ marginBottom: 0, marginTop: 6 }}>
                          <span className="ag-insp-card-lab">مقاييس اللغة — ابن فارس · جذر {sr}</span>
                          {hasMore && <button type="button" className="ag-btn is-gold" onClick={() => setMeaningOpen((o) => !o)}>{meaningOpen ? "أقل ▲" : "المزيد ▼"}</button>}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => { const pid = parentMap[selNode.id], parent = pid ? nmap[pid] : null; if (parent?.text) return (
                    <div className="ag-insp-card">
                      <div className="ag-insp-card-lab" style={{ marginBottom: 6 }}>من: {parent.label}</div>
                      <div className="ag-insp-verse"><HighlightedAyah text={parent.text} primaryWord={selNode.lookup || selNode.wordNorm} searchMode={searchMode} theme={theme} interactive={true} onWordClick={(wn) => handleWordClick(wn, parent.verseKey)} /></div>
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
                      <HighlightedAyah text={selNode.text} primaryWord={getConnWord(selNode)} sharedWords={selNode.sharedWords || []} searchMode={searchMode} theme={theme}
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
                    <button type="button" className="ag-btn" title="اجعلها المركز" aria-label="اجعلها المركز" onClick={() => navigate(selNode.surahNum, selNode.ayahNum)}>⌖ اجعلها المركز</button>
                  </div>
                </div>
              </>
            ) : null}
          </aside>
        )}
      </div>

      {/* Occurrences popup — every āyah a word/root occurs in, paginated */}
      <OccurrencesModal occ={occ} verseData={verseData} searchMode={searchMode} theme={theme}
        onNavigate={(s, a) => { navigate(s, a); setOcc(null); }} onClose={() => setOcc(null)} />
    </div>
  );
}
