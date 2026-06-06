import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { norm, rootKey, setRootMap } from "./arabic-utils.js";
import { loadHafsData, loadRoots, loadRootMeanings } from "./data-loader.js";
import { THEMES, fColor } from "./theme.js";
import { buildLazyGraph, buildChildMap, getDescendants, getPathToCenter } from "./graph/buildGraph.js";
import { forceLayout } from "./graph/forceLayout.js";
import { HighlightedAyah } from "./components/HighlightedAyah.jsx";
import { GraphLayer } from "./components/GraphLayer.jsx";
import { usePersistedState } from "./hooks/usePersistedState.js";

// Fixed virtual canvas the graph is laid out in. Decoupling layout from the
// live viewport size means a window resize never rebuilds the graph or shifts
// settled nodes — the pan/zoom transform maps this canvas onto the screen.
const VW = 900, VH = 600;
const isInt = (v) => Number.isInteger(v);

/* ═══ MAIN ═══ */
export default function QuranGraph() {
  const [quranRaw, setQuranRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surah, setSurah] = usePersistedState("qg.surah", 2, (v, f) => (isInt(v) && v >= 1 && v <= 114 ? v : f));
  const [ayah, setAyah] = usePersistedState("qg.ayah", 228, (v, f) => (isInt(v) && v >= 1 ? v : f));
  const [maxBranch, setMaxBranch] = usePersistedState("qg.maxBranch", 10, (v, f) => (isInt(v) && v >= 3 && v <= 50 ? v : f));
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
  const [dragId, setDragId] = useState(null);
  const dragStartRef = useRef(null);
  const draggedRef = useRef(false); // true once a press turns into a real drag
  const containerRef = useRef();
  const pointersRef = useRef(new Map()); // pointerId → {x, y}  (for pan / pinch)
  const pinchRef = useRef(null);
  const rafRef = useRef(0);
  const movePendingRef = useRef(null);
  const centeredRef = useRef(false);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showHelp, setShowHelp] = useState(false);
  const [meanings, setMeanings] = useState(null); // root → { c, f } (lazy)
  const [meaningOpen, setMeaningOpen] = useState(false); // full-text toggle
  const T = THEMES[theme];

  // Translate that centres the virtual canvas in the current viewport.
  const homeView = useCallback(() => ({ x: (dims.w - VW) / 2, y: (dims.h - VH) / 2, k: 1 }), [dims.w, dims.h]);

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
    return () => { window.removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); };
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

  // Lazy-load Ibn Faris meanings the first time root mode is used.
  useEffect(() => {
    if (searchMode === "root" && !meanings) loadRootMeanings().then(setMeanings).catch(() => {});
  }, [searchMode, meanings]);

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

  // Prune positions of nodes that no longer exist. (Caching derived layout in
  // state is intentional here — the no-op short-circuit prevents churn.)
  useEffect(() => {
    const ids = new Set(graphNodes.map((n) => n.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions((prev) => {
      let changed = false;
      const c = {};
      for (const k in prev) { if (ids.has(k)) c[k] = prev[k]; else changed = true; }
      return changed ? c : prev;
    });
  }, [graphNodes]);

  // Lay out only the newly-added nodes; pin already-placed ones so the existing
  // arrangement (incl. user drags) is preserved. Runs in the fixed virtual canvas.
  useEffect(() => {
    const missing = graphNodes.filter((n) => !n.fixed && !positions[n.id]);
    if (missing.length === 0) return;
    const work = graphNodes.map((n) => {
      const s = positions[n.id];
      return { ...n, x: s ? s.x : n.x, y: s ? s.y : n.y, fixed: n.fixed || !!s };
    });
    forceLayout(work, graphLinks, VW, VH, 140);
    const missingIds = new Set(missing.map((n) => n.id));
    const np = {};
    for (const n of work) if (missingIds.has(n.id)) np[n.id] = { x: n.x, y: n.y };
    // Caching the computed layout in state is the intent; the `missing` guard
    // above makes this a no-op once everything is placed (no render cascade).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions((prev) => ({ ...prev, ...np }));
  }, [graphNodes, graphLinks, positions]);

  const nmap = useMemo(() => { const m = {}; graphNodes.forEach((n) => (m[n.id] = n)); return m; }, [graphNodes]);
  const wordToNodeIds = useMemo(() => { const m = {}; graphNodes.forEach((n) => { if (n.type === "word") { const key = n.lookup || n.wordNorm; (m[key] ||= []).push(n.id); } }); return m; }, [graphNodes]);
  const highlightSet = useMemo(() => { if (!selected) return null; return new Set([...getPathToCenter(selected, parentMap), ...getDescendants(selected, childMap)]); }, [selected, parentMap, childMap]);
  const highlightLinks = useMemo(() => { if (!highlightSet) return null; const s = new Set(); graphLinks.forEach((l, i) => { if (highlightSet.has(l.source) && highlightSet.has(l.target)) s.add(i); }); return s; }, [highlightSet, graphLinks]);
  const activeWordNodeIds = useMemo(() => (!activeWord ? new Set() : new Set(wordToNodeIds[activeWord] || [])), [activeWord, wordToNodeIds]);

  const getConnWord = useCallback((n) => n?.connectingWord || (parentMap[n?.id] ? nmap[parentMap[n.id]]?.lookup || nmap[parentMap[n.id]]?.wordNorm : null), [parentMap, nmap]);
  const reset = useCallback(() => { setExpandedWords(new Set()); setExpandedVerses(new Set()); setSelected(null); setActiveWord(null); setPositions({}); setTransform(homeView()); }, [homeView]);
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
  const startDrag = useCallback((nodeId, clientX, clientY) => { const desc = getDescendants(nodeId, childMap); const wp = svgToWorld(clientX, clientY); const np = {}; desc.forEach((did) => { const n = nmap[did]; if (n) { const p = positions[did] || { x: n.x, y: n.y }; np[did] = { x: p.x, y: p.y }; } }); dragStartRef.current = { worldPos: wp, nodePositions: np, downX: clientX, downY: clientY }; setDragId(nodeId); }, [childMap, nmap, positions, svgToWorld]);

  const applyZoom = useCallback((factor, sx, sy) => {
    setTransform((t) => {
      const nk = Math.max(0.08, Math.min(8, t.k * factor));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, k: nk };
      const mx = sx - rect.left, my = sy - rect.top;
      return { k: nk, x: mx - (mx - t.x) * (nk / t.k), y: my - (my - t.y) * (nk / t.k) };
    });
  }, []);

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
        const dx = w.x - ds.worldPos.x, dy = w.y - ds.worldPos.y;
        setPositions((prev) => { const next = { ...prev }; for (const [id, op] of Object.entries(dragStartRef.current.nodePositions)) next[id] = { x: op.x + dx, y: op.y + dy }; return next; });
      } else if (isPanning && panStart) {
        setTransform((t) => ({ ...t, x: cur.x - panStart.x, y: cur.y - panStart.y }));
      }
    });
  }, [dragId, isPanning, panStart, svgToWorld]);

  const onPointerUp = useCallback((e) => {
    const pts = pointersRef.current;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchRef.current = null;
    if (pts.size === 0) { setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null); }
  }, []);

  // Pointer left the canvas mid-gesture → end it (mirrors mouse-leave behaviour).
  const onPointerLeave = useCallback(() => {
    pointersRef.current.clear();
    pinchRef.current = null;
    setDragId(null); dragStartRef.current = null; setIsPanning(false); setPanStart(null);
  }, []);

  const handleWordClick = useCallback((wordNorm, fromVerseKey) => {
    const lookup = searchMode === "root" ? rootKey(wordNorm) : wordNorm;
    const vk = fromVerseKey || currentKey;
    setMeaningOpen(false);
    if (activeWord === lookup) { setActiveWord(null); setSelected(null); }
    else { setActiveWord(lookup); const nids = wordToNodeIds[lookup]; if (nids?.length) setSelected(nids[0]); toggleWord(lookup, vk); }
  }, [activeWord, wordToNodeIds, toggleWord, currentKey, searchMode]);

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
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: T.bg, color: T.text, fontFamily: "Arial", gap: 14, padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>⚠️</div>
      <div style={{ fontSize: 15, color: T.textDim, maxWidth: 360 }}>تعذّر تحميل بيانات القرآن.</div>
      <div style={{ fontSize: 11, color: T.textFaint, maxWidth: 420, direction: "ltr", wordBreak: "break-word" }}>{error}</div>
      <button onClick={loadData} style={{ background: "#1e40af33", color: "#60a5fa", border: "1px solid #1e40af", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>إعادة المحاولة</button>
    </div>
  );

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "Arial" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🕸️</div>
      <div style={{ fontSize: 15, color: T.textDim, letterSpacing: 2 }}>جارٍ تحميل الشبكة القرآنية...</div>
      <div style={{ width: 220, height: 3, background: T.panelBorder, marginTop: 16, borderRadius: 2, overflow: "hidden" }}>
        <div className="qg-shimmer" style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #3b82f6, #a855f7, #3b82f6)", backgroundSize: "200%", animation: "sh 1.5s infinite linear" }} />
      </div>
      <style>{`@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}@media (prefers-reduced-motion: reduce){.qg-shimmer{animation:none!important}}`}</style>
    </div>
  );

  const totalExp = expandedWords.size + expandedVerses.size;
  const isEmpty = !!currentVerse && graphNodes.length <= 1;
  const SS = {
    sel: { background: theme === "light" ? "#f1f5f9" : "#070b14", color: T.text, border: `1px solid ${T.panelBorder}`, borderRadius: 5, padding: "2px 5px", fontSize: 11, direction: "rtl" },
    btn: { background: theme === "light" ? "#f1f5f9" : "#0c1222", color: T.textDim, border: `1px solid ${T.panelBorder}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontSize: 10 },
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, fontFamily: "Arial", overflow: "hidden" }}>
      {/* Controls */}
      <div style={{ background: T.panel, borderBottom: `1px solid ${T.panelBorder}`, padding: "6px 10px", flexShrink: 0, zIndex: 20, direction: "rtl" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 800, color: "#60a5fa", fontSize: 13 }} role="img" aria-label="شبكة">🕸️</span>
            <select aria-label="السورة" value={surah} onChange={(e) => { setSurah(+e.target.value); setAyah(1); reset(); }} style={SS.sel}>
              {surahList.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
            </select>
            <select aria-label="الآية" value={safeAyah} onChange={(e) => { setAyah(+e.target.value); reset(); }} style={{ ...SS.sel, width: 55 }}>
              {Array.from({ length: ayahCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.panelBorder}` }} role="group" aria-label="نمط البحث">
              <button title="مطابقة الكلمة" aria-pressed={searchMode === "exact"} onClick={() => { setSearchMode("exact"); reset(); }} style={{ ...SS.btn, border: "none", ...(searchMode === "exact" ? { background: "#1e40af33", color: "#60a5fa", fontWeight: 700 } : {}) }}>📝 كلمة</button>
              <button title="مطابقة الجذر" aria-pressed={searchMode === "root"} onClick={() => { setSearchMode("root"); reset(); }} style={{ ...SS.btn, border: "none", ...(searchMode === "root" ? { background: "#22c55e22", color: "#22c55e", fontWeight: 700 } : {}) }}>🌿 جذر</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, background: theme === "light" ? "#f1f5f9" : "#0a0e1a", borderRadius: 6, padding: "2px 8px", border: `1px solid ${T.panelBorder}` }}>
              <span style={{ fontSize: 9, color: "#cc5de8" }}>لكل كلمة</span>
              <input type="range" aria-label="عدد الآيات لكل كلمة" min={3} max={50} value={maxBranch} onChange={(e) => setMaxBranch(+e.target.value)} style={{ width: 50, accentColor: "#cc5de8" }} />
              <span style={{ fontSize: 11, color: "#cc5de8", fontWeight: 700, minWidth: 16 }}>{maxBranch}</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer", fontSize: 9, color: T.textDim }}><input type="checkbox" checked={hideStop} onChange={(e) => setHideStop(e.target.checked)} /> أدوات</label>
            <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer", fontSize: 9, color: T.textDim }}><input type="checkbox" checked={showLoops} onChange={(e) => setShowLoops(e.target.checked)} /> حلقات</label>
            <button title="تبديل السمة" aria-label="تبديل السمة" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} style={{ ...SS.btn, fontSize: 12 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
            {totalExp > 0 && <button title="طي الكل" aria-label="طي الكل" onClick={reset} style={{ ...SS.btn, color: "#ff6b6b" }}>↺ طي</button>}
            {(selected || activeWord) && <button title="إلغاء التحديد" aria-label="إلغاء التحديد" onClick={() => { setSelected(null); setActiveWord(null); }} style={{ ...SS.btn, color: "#fcc419" }}>✦</button>}
            <button title="مساعدة" aria-label="مساعدة" aria-pressed={showHelp} onClick={() => setShowHelp((h) => !h)} style={{ ...SS.btn, color: showHelp ? "#60a5fa" : T.textFaint }}>؟</button>
            <button title="إعادة ضبط العرض" aria-label="إعادة ضبط العرض" onClick={() => setTransform(homeView())} style={SS.btn}>⟲</button>
            {hist.length > 0 && <button title="رجوع" aria-label="رجوع" onClick={goBack} style={{ ...SS.btn, color: "#fbbf24" }}>→</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 9, color: T.textFaint, flexWrap: "wrap" }}>
          <span>{graphNodes.length} عقدة · {graphLinks.length} رابط</span>
          <span style={{ color: searchMode === "root" ? "#22c55e" : "#60a5fa" }}>{searchMode === "root" ? "🌿 جذر ثلاثي" : "📝 تطابق"}</span>
        </div>
        {showHelp && (
          <div style={{ background: theme === "light" ? "#f8fafc" : "#0a0e1a", borderRadius: 8, padding: "8px 12px", marginTop: 6, border: `1px solid ${T.panelBorder}`, fontSize: 11, lineHeight: 2.2, color: T.textDim }}>
            <b style={{ color: "#22c55e" }}>🌿 جذر:</b> الجذر الصرفي لكل كلمة (المدوّنة الصرفية للقرآن) مع معناه من «مقاييس اللغة» لابن فارس — أشهُر/شهور/شهر → ش ه ر<br />
            <b style={{ color: "#60a5fa" }}>📝 كلمة:</b> تطابق دقيق<br />
            <b>اضغط كلمة</b> (في الآية أو الشبكة) → توسيع. مرة ثانية → طي تلقائي مع الفروع.<br />
            <span style={{ color: T.textFaint }}>اسحب للتحريك · عجلة الفأرة أو إصبعان للتكبير · اسحب العقدة لتحريكها.</span><br />
            <span style={{ color: T.textFaint, fontSize: 9 }}>المصادر: نصّ حفص (تنزيل) · الجذور (المدوّنة الصرفية للقرآن) · المعاني (مقاييس اللغة لابن فارس، عبر OpenITI).</span>
          </div>
        )}
      </div>

      {/* Graph */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden", touchAction: "none", cursor: dragId ? "grabbing" : isPanning ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerLeave}>

        <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(circle, ${T.grid} 1px, transparent 1px)`, backgroundSize: "30px 30px", pointerEvents: "none" }} />

        {/* Top ayah */}
        {currentVerse && (
          <div data-panel="1" style={{ position: "absolute", top: 6, left: 6, right: 6, background: T.panel + (theme === "dark" ? "ee" : "f0"), backdropFilter: "blur(8px)", borderRadius: 8, padding: "8px 12px", border: `1px solid ${T.panelBorder}`, direction: "rtl", zIndex: 5 }}>
            <div style={{ fontSize: 17, lineHeight: 2.2, color: T.ayahText }}>
              <HighlightedAyah text={currentVerse.text} primaryWord={activeWord || (hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null)} interactive={true} onWordClick={(wn) => handleWordClick(wn, currentKey)} activeGraphWord={hovNode?.type === "word" ? (hovNode.lookup || hovNode.wordNorm) : null} searchMode={searchMode} theme={theme} />
            </div>
            <div style={{ fontSize: 9, color: T.textFaint, marginTop: 2 }}>
              {currentVerse.sn} — الآية {currentVerse.a}
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", direction: "rtl" }}>
            <div style={{ textAlign: "center", color: T.textFaint, fontSize: 13, maxWidth: 280 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🪶</div>
              لا توجد كلمات قابلة للربط في هذه الآية{hideStop ? " (جرّب إظهار الأدوات)" : ""}.
            </div>
          </div>
        )}

        <svg width={dims.w} height={dims.h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs><marker id="arrL" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6b6b" opacity="0.6" /></marker></defs>
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
          <div data-panel="1" style={{ position: "absolute", bottom: 12, left: 12, right: 12, background: T.panel + (theme === "dark" ? "f5" : "f8"), backdropFilter: "blur(12px)", borderRadius: 10, padding: "10px 14px", border: `1px solid ${hovNode.color}44`, direction: "rtl", zIndex: 30, pointerEvents: hovNode.type === "verse" ? "auto" : "none", maxHeight: "28vh", overflow: "auto" }}>
            {hovNode.type === "word" ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: hovNode.color }}>{hovNode.label}</span>
                  {hovNode.rootLabel && <span style={{ fontSize: 12, color: "#22c55e" }}>جذر: {hovNode.rootLabel}</span>}
                  <span style={{ fontSize: 10, color: fColor(hovNode.count), background: fColor(hovNode.count) + "22", padding: "1px 8px", borderRadius: 10 }}>{hovNode.count} آية</span>
                </div>
                {hovNode.root && meanings?.[hovNode.root] && (
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4, lineHeight: 1.8 }}>{meanings[hovNode.root].c}</div>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: hovNode.color }}>{hovNode.label}</span>
                </div>
                <div style={{ fontSize: 15, lineHeight: 2, color: T.text }}>
                  <HighlightedAyah text={hovNode.text} primaryWord={getConnWord(hovNode)} sharedWords={hovNode.sharedWords || []} searchMode={searchMode} theme={theme}
                    interactive={true} onWordClick={(wn) => handleWordClick(wn, hovNode.verseKey)} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Selected panel */}
        {selNode && (
          <div data-panel="1" style={{ position: "absolute", bottom: 6, left: 6, right: 6, background: T.panel + (theme === "dark" ? "f8" : "fa"), backdropFilter: "blur(12px)", borderRadius: 10, padding: 12, border: `1px solid ${selNode.color}55`, direction: "rtl", zIndex: 25, maxHeight: "32vh", overflow: "auto" }}>
            {selNode.type === "word" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: selNode.color }}>{selNode.label}</span>
                    {selNode.rootLabel && <span style={{ fontSize: 13, color: "#22c55e", background: "#22c55e22", padding: "2px 8px", borderRadius: 8 }}>جذر: {selNode.rootLabel}</span>}
                    <span style={{ fontSize: 11, color: fColor(selNode.count), background: fColor(selNode.count) + "22", padding: "2px 10px", borderRadius: 10 }}>{selNode.count} آية</span>
                  </div>
                  <button title="إغلاق" aria-label="إغلاق" onClick={() => { setSelected(null); setActiveWord(null); }} style={{ ...SS.btn, fontSize: 11 }}>✕</button>
                </div>
                {selNode.root && meanings?.[selNode.root] && (() => {
                  const m = meanings[selNode.root];
                  const hasMore = m.f && m.f !== m.c;
                  return (
                    <div style={{ background: theme === "light" ? "#f0fdf4" : "#0a140d", border: `1px solid ${theme === "light" ? "#bbf7d0" : "#14331f"}`, borderRadius: 8, padding: "6px 10px", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, lineHeight: 1.9, color: theme === "light" ? "#15803d" : "#86efac" }}>{meaningOpen && hasMore ? m.f : m.c}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                        <span style={{ fontSize: 8, color: T.textFaint }}>مقاييس اللغة — ابن فارس</span>
                        {hasMore && <button onClick={() => setMeaningOpen((o) => !o)} style={{ ...SS.btn, fontSize: 10, color: "#22c55e" }}>{meaningOpen ? "أقل ▲" : "المزيد ▼"}</button>}
                      </div>
                    </div>
                  );
                })()}
                {(() => { const pid = parentMap[selNode.id], parent = pid ? nmap[pid] : null; if (parent?.text) return (<div style={{ background: theme === "light" ? "#f1f5f9" : "#0a0e1a", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 9, color: T.textFaint, marginBottom: 3 }}>من: {parent.label}</div><div style={{ fontSize: 15, lineHeight: 2, color: T.text }}><HighlightedAyah text={parent.text} primaryWord={selNode.lookup || selNode.wordNorm} searchMode={searchMode} theme={theme} interactive={true} onWordClick={(wn) => handleWordClick(wn, parent.verseKey)} /></div></div>); return null; })()}
              </>
            ) : selNode.type === "verse" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: selNode.color }}>📖 {selNode.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button title={selNode.isExpanded ? "طي الكلمات" : "إظهار الكلمات"} onClick={() => toggleVerse(selNode.verseKey)} style={{ ...SS.btn, color: selNode.isExpanded ? "#ff6b6b" : "#cc5de8", fontSize: 11 }}>{selNode.isExpanded ? "⊖ طي" : "⊕ كلمات"}</button>
                    <button title="اجعلها المركز" aria-label="اجعلها المركز" onClick={() => navigate(selNode.surahNum, selNode.ayahNum)} style={{ ...SS.btn, color: "#60a5fa", fontSize: 11 }}>🔍</button>
                    <button title="إغلاق" aria-label="إغلاق" onClick={() => { setSelected(null); setActiveWord(null); }} style={{ ...SS.btn, fontSize: 11 }}>✕</button>
                  </div>
                </div>
                <div style={{ fontSize: 17, lineHeight: 2.2, color: T.ayahText }}>
                  <HighlightedAyah text={selNode.text} primaryWord={getConnWord(selNode)} sharedWords={selNode.sharedWords || []} searchMode={searchMode} theme={theme}
                    interactive={true} onWordClick={(wn) => handleWordClick(wn, selNode.verseKey)} />
                </div>
                {(selNode.sharedWords || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "#fcc419" }}>مشتركة:</span>
                    {selNode.sharedWords.map((w, i) => <span key={i} style={{ fontSize: 11, color: "#fcd34d", background: "#fcc41922", padding: "1px 7px", borderRadius: 5, border: "1px solid #fcc41933" }}>{w}</span>)}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
