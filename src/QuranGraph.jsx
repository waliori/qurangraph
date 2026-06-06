import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { norm, extractRoot } from "./arabic-utils.js";
import { loadHafsData } from "./data-loader.js";
import { THEMES, fColor } from "./theme.js";
import { buildLazyGraph, getDescendants, getPathToCenter } from "./graph/buildGraph.js";
import { forceLayout } from "./graph/forceLayout.js";
import { HighlightedAyah } from "./components/HighlightedAyah.jsx";

/* localStorage-backed UI preferences */
function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

/* ═══ MAIN ═══ */
export default function QuranGraph() {
  const [quranRaw, setQuranRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [surah, setSurah] = useState(() => loadPref("qg.surah", 2));
  const [ayah, setAyah] = useState(() => loadPref("qg.ayah", 228));
  const [maxBranch, setMaxBranch] = useState(() => loadPref("qg.maxBranch", 10));
  const [hideStop, setHideStop] = useState(() => loadPref("qg.hideStop", true));
  const [showLoops, setShowLoops] = useState(() => loadPref("qg.showLoops", true));
  const [searchMode, setSearchMode] = useState(() => loadPref("qg.searchMode", "exact"));
  const [theme, setTheme] = useState(() => loadPref("qg.theme", "dark"));
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
  const containerRef = useRef();
  const pointersRef = useRef(new Map()); // pointerId → {x, y}  (for pan / pinch)
  const pinchRef = useRef(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [showHelp, setShowHelp] = useState(false);
  const T = THEMES[theme];

  // Persist UI preferences
  useEffect(() => {
    try {
      localStorage.setItem("qg.surah", JSON.stringify(surah));
      localStorage.setItem("qg.ayah", JSON.stringify(ayah));
      localStorage.setItem("qg.maxBranch", JSON.stringify(maxBranch));
      localStorage.setItem("qg.hideStop", JSON.stringify(hideStop));
      localStorage.setItem("qg.showLoops", JSON.stringify(showLoops));
      localStorage.setItem("qg.searchMode", JSON.stringify(searchMode));
      localStorage.setItem("qg.theme", JSON.stringify(theme));
    } catch { /* storage unavailable — ignore */ }
  }, [surah, ayah, maxBranch, hideStop, showLoops, searchMode, theme]);

  useEffect(() => {
    const u = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setDims({ w: r.width, h: r.height });
      }
    };
    u();
    window.addEventListener("resize", u);
    return () => window.removeEventListener("resize", u);
  }, [loading]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    loadHafsData()
      .then((hafs) => { setQuranRaw(hafs); setLoading(false); })
      .catch((e) => { setError(e?.message || "Failed to load Quran data."); setLoading(false); });
  }, []);
  // Fetch the corpus on mount (external system — a legitimate effect).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

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
          const root = extractRoot(n);
          if (!seenR.has(root)) { seenR.add(root); (r2v[root] ||= []).push(vk); }
        }
        vd[vk] = { text: v.text, s: s.id, a: v.id, sn: s.name, words };
      }
    }
    return { w2v, r2v, verseData: vd, surahList: sl };
  }, [quranRaw]);

  const ayahCount = quranRaw?.find((s) => s.id === surah)?.total_verses || 1;
  // Guard against a persisted/out-of-range ayah without a state round-trip.
  const safeAyah = Math.min(ayah, ayahCount);
  const currentKey = `${surah}:${safeAyah}`;
  const currentVerse = verseData[currentKey];

  // Build graph STRUCTURE only (no layout side-effects here).
  const { graphNodes, graphLinks, loopLinks, parentMap } = useMemo(() => {
    if (!currentVerse) return { graphNodes: [], graphLinks: [], loopLinks: [], parentMap: {} };
    const r = buildLazyGraph(currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, dims.w, dims.h);
    return { graphNodes: r.nodes, graphLinks: r.links, loopLinks: r.loopLinks, parentMap: r.parentMap };
  }, [currentVerse, currentKey, verseData, w2v, r2v, expandedWords, expandedVerses, hideStop, maxBranch, searchMode, dims]);

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

  // Lay out only the newly-added nodes; pin already-placed ones so the
  // existing arrangement (incl. user drags) is preserved. Runs in an effect,
  // never during render.
  useEffect(() => {
    const missing = graphNodes.filter((n) => !n.fixed && !positions[n.id]);
    if (missing.length === 0) return;
    const work = graphNodes.map((n) => {
      const s = positions[n.id];
      return { ...n, x: s ? s.x : n.x, y: s ? s.y : n.y, fixed: n.fixed || !!s };
    });
    forceLayout(work, graphLinks, dims.w, dims.h, 140);
    const missingIds = new Set(missing.map((n) => n.id));
    const np = {};
    for (const n of work) if (missingIds.has(n.id)) np[n.id] = { x: n.x, y: n.y };
    // Caching the computed layout in state is the intent; the `missing` guard
    // above makes this a no-op once everything is placed (no render cascade).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions((prev) => ({ ...prev, ...np }));
  }, [graphNodes, graphLinks, dims, positions]);

  const nmap = useMemo(() => { const m = {}; graphNodes.forEach((n) => (m[n.id] = n)); return m; }, [graphNodes]);
  const wordToNodeIds = useMemo(() => { const m = {}; graphNodes.forEach((n) => { if (n.type === "word") { const key = n.lookup || n.wordNorm; (m[key] ||= []).push(n.id); } }); return m; }, [graphNodes]);
  const highlightSet = useMemo(() => { if (!selected) return null; return new Set([...getPathToCenter(selected, parentMap), ...getDescendants(selected, graphLinks)]); }, [selected, parentMap, graphLinks]);
  const highlightLinks = useMemo(() => { if (!highlightSet) return null; const s = new Set(); graphLinks.forEach((l, i) => { if (highlightSet.has(l.source) && highlightSet.has(l.target)) s.add(i); }); return s; }, [highlightSet, graphLinks]);
  const activeWordNodeIds = useMemo(() => (!activeWord ? new Set() : new Set(wordToNodeIds[activeWord] || [])), [activeWord, wordToNodeIds]);

  const getPos = useCallback((n) => positions[n.id] || { x: n.x, y: n.y }, [positions]);
  const getConnWord = useCallback((n) => n?.connectingWord || (parentMap[n?.id] ? nmap[parentMap[n.id]]?.lookup || nmap[parentMap[n.id]]?.wordNorm : null), [parentMap, nmap]);
  const reset = useCallback(() => { setExpandedWords(new Set()); setExpandedVerses(new Set()); setSelected(null); setActiveWord(null); setPositions({}); setTransform({ x: 0, y: 0, k: 1 }); }, []);
  const navigate = useCallback((s, a) => { setHist((h) => [...h, { s: surah, a: ayah }]); setSurah(s); setAyah(a); reset(); }, [surah, ayah, reset]);
  const goBack = useCallback(() => { if (!hist.length) return; const p = hist[hist.length - 1]; setHist((h) => h.slice(0, -1)); setSurah(p.s); setAyah(p.a); reset(); }, [hist, reset]);

  const toggleWord = useCallback((lookup, fromVerseKey) => {
    const key = `${lookup}@${fromVerseKey}`;
    setExpandedWords((prev) => { const n = new Set(prev); if (n.has(key)) { const wid = `w:${lookup}@${fromVerseKey}`; const desc = getDescendants(wid, graphLinks); const nw = new Set(n); nw.delete(key); nw.forEach((ek) => { const vk = ek.split("@").slice(1).join("@"); if (desc.has(`v:${vk}`)) nw.delete(ek); }); setExpandedVerses((p2) => { const nv = new Set(p2); desc.forEach((d) => { if (d.startsWith("v:")) nv.delete(d.slice(2)); }); return nv; }); return nw; } else { n.add(key); return n; } });
  }, [graphLinks]);
  const toggleVerse = useCallback((verseKey) => {
    setExpandedVerses((prev) => { const n = new Set(prev); if (n.has(verseKey)) { const vid = `v:${verseKey}`; const desc = getDescendants(vid, graphLinks); const nv = new Set(n); nv.delete(verseKey); desc.forEach((d) => { if (d.startsWith("v:") && d !== vid) nv.delete(d.slice(2)); }); setExpandedWords((p2) => { const nw = new Set(p2); nw.forEach((ek) => { const vk = ek.split("@").slice(1).join("@"); if (desc.has(`v:${vk}`)) nw.delete(ek); }); return nw; }); return nv; } else { n.add(verseKey); return n; } });
  }, [graphLinks]);

  const svgToWorld = useCallback((cx, cy) => { const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return { x: 0, y: 0 }; return { x: (cx - rect.left - transform.x) / transform.k, y: (cy - rect.top - transform.y) / transform.k }; }, [transform]);
  const startDrag = useCallback((nodeId, clientX, clientY) => { const desc = getDescendants(nodeId, graphLinks); const wp = svgToWorld(clientX, clientY); const np = {}; desc.forEach((did) => { const n = nmap[did]; if (n) { const p = positions[did] || { x: n.x, y: n.y }; np[did] = { x: p.x, y: p.y }; } }); dragStartRef.current = { worldPos: wp, nodePositions: np }; setDragId(nodeId); }, [graphLinks, nmap, positions, svgToWorld]);

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

  // ── Unified pointer handling (mouse + touch + pen): pan, node drag, pinch-zoom ──
  const onPointerDown = useCallback((e) => {
    if (e.target.closest("[data-panel]")) return; // let panels handle their own input
    const pts = pointersRef.current;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

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

  const onPointerMove = useCallback((e) => {
    const pts = pointersRef.current;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

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
      const cur = svgToWorld(e.clientX, e.clientY);
      const dx = cur.x - dragStartRef.current.worldPos.x, dy = cur.y - dragStartRef.current.worldPos.y;
      setPositions((prev) => { const next = { ...prev }; for (const [id, op] of Object.entries(dragStartRef.current.nodePositions)) next[id] = { x: op.x + dx, y: op.y + dy }; return next; });
    } else if (isPanning && panStart) {
      setTransform((t) => ({ ...t, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
    }
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
    const lookup = searchMode === "root" ? extractRoot(wordNorm) : wordNorm;
    const vk = fromVerseKey || currentKey;
    if (activeWord === lookup) { setActiveWord(null); setSelected(null); }
    else { setActiveWord(lookup); const nids = wordToNodeIds[lookup]; if (nids?.length) setSelected(nids[0]); toggleWord(lookup, vk); }
  }, [activeWord, wordToNodeIds, toggleWord, currentKey, searchMode]);

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
        <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #3b82f6, #a855f7, #3b82f6)", backgroundSize: "200%", animation: "sh 1.5s infinite linear" }} />
      </div>
      <style>{`@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
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
            <button title="إعادة ضبط العرض" aria-label="إعادة ضبط العرض" onClick={() => setTransform({ x: 0, y: 0, k: 1 })} style={SS.btn}>⟲</button>
            {hist.length > 0 && <button title="رجوع" aria-label="رجوع" onClick={goBack} style={{ ...SS.btn, color: "#fbbf24" }}>→</button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 9, color: T.textFaint, flexWrap: "wrap" }}>
          <span>{graphNodes.length} عقدة · {graphLinks.length} رابط</span>
          <span style={{ color: searchMode === "root" ? "#22c55e" : "#60a5fa" }}>{searchMode === "root" ? "🌿 جذر ثلاثي" : "📝 تطابق"}</span>
        </div>
        {showHelp && (
          <div style={{ background: theme === "light" ? "#f8fafc" : "#0a0e1a", borderRadius: 8, padding: "8px 12px", marginTop: 6, border: `1px solid ${T.panelBorder}`, fontSize: 11, lineHeight: 2.2, color: T.textDim }}>
            <b style={{ color: "#22c55e" }}>🌿 جذر:</b> يستخرج الجذر الثلاثي — أشهُر/شهور/شهر/الأشهر → ش ه ر<br />
            <b style={{ color: "#60a5fa" }}>📝 كلمة:</b> تطابق دقيق<br />
            <b>اضغط كلمة</b> (في الآية أو الشبكة) → توسيع. مرة ثانية → طي تلقائي مع الفروع.<br />
            <span style={{ color: T.textFaint }}>اسحب للتحريك · عجلة الفأرة أو إصبعان للتكبير · اسحب العقدة لتحريكها.</span>
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
            {graphLinks.map((l, i) => {
              const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
              const sp = getPos(s), tp = getPos(t);
              const isC = s.type === "center" || t.type === "center";
              const onP = highlightLinks ? highlightLinks.has(i) : true;
              const onA = activeWordNodeIds.size > 0 && (activeWordNodeIds.has(l.source) || activeWordNodeIds.has(l.target));
              const bright = onP || onA;
              return <line key={`l${i}`} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                stroke={bright ? (onA ? "#fcc41955" : isC ? T.linkCenter : T.link) : (theme === "light" ? "#e2e8f0" : "#0a1020")}
                strokeWidth={bright ? (isC ? 1.8 : 1) : 0.3}
                strokeOpacity={bright ? 0.7 : 0.1} />;
            })}
            {showLoops && loopLinks.map((l, i) => {
              const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
              const sp = getPos(s), tp = getPos(t), mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2, dx = tp.x - sp.x, dy = tp.y - sp.y;
              return <path key={`lp${i}`} d={`M ${sp.x} ${sp.y} Q ${mx - dy * 0.3} ${my + dx * 0.3} ${tp.x} ${tp.y}`} fill="none" stroke="#ff6b6b" strokeWidth={1.2} strokeDasharray="4,3" strokeOpacity={0.4} markerEnd="url(#arrL)" />;
            })}

            {graphNodes.map((n) => {
              const p = getPos(n);
              const isH = hovered === n.id, isS = selected === n.id;
              const isAW = activeWordNodeIds.has(n.id);
              const onP = highlightSet ? highlightSet.has(n.id) : true;
              const bright = onP || isAW;
              const opacity = bright ? 1 : (highlightSet || activeWordNodeIds.size > 0) ? 0.1 : 1;
              const r = isH ? n.r * 1.35 : isS || isAW ? n.r * 1.2 : n.r;
              const isWE = n.type === "word" && n.isExpanded;
              const isVE = n.type === "verse" && n.isExpanded;

              return (
                <g key={n.id} data-node={n.id} style={{ cursor: "pointer", opacity, transition: "opacity 0.25s" }}
                  onMouseEnter={() => { setHovered(n.id); if (n.type === "word") setActiveWord(n.lookup || n.wordNorm); }}
                  onMouseLeave={() => { setHovered(null); if (!selected) setActiveWord(null); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (n.type === "center") { setSelected(null); setActiveWord(null); return; }
                    if (n.type === "word") { toggleWord(n.lookup || n.wordNorm, n.parentVerseKey); setActiveWord(n.lookup || n.wordNorm); setSelected(n.id); }
                    else if (n.type === "verse") { if (selected === n.id) toggleVerse(n.verseKey); else { setSelected(n.id); setActiveWord(null); } }
                  }}>

                  {(isWE || isVE) && <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke={isWE ? "#22c55e" : "#cc5de8"} strokeWidth={2} opacity={0.3} strokeDasharray={isVE ? "4,2" : "none"} />}
                  {(isS || isAW) && <circle cx={p.x} cy={p.y} r={r + 10} fill="none" stroke={isAW ? "#fcc419" : n.color} strokeWidth={2} opacity={0.3}><animate attributeName="r" values={`${r + 8};${r + 14};${r + 8}`} dur="2s" repeatCount="indefinite" /></circle>}

                  <circle cx={p.x} cy={p.y} r={r}
                    fill={isAW ? "#fcc41944" : isWE ? "#22c55e33" : isVE ? "#cc5de833" : n.color + T.nodeFill}
                    stroke={isS ? (theme === "light" ? "#1e293b" : "#fff") : isAW ? "#fcc419" : isWE ? "#22c55e" : isVE ? "#cc5de8" : isH ? (theme === "light" ? "#1e293b" : "#fff") : n.color}
                    strokeWidth={n.type === "center" ? 3 : isH || isS || isAW ? 2.5 : isWE || isVE ? 2 : n.type === "word" ? 1.8 : 1} />

                  {n.type === "word" && <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={8} fontWeight="bold" fill={theme === "light" ? "#1e293b" : "#fff"} style={{ pointerEvents: "none" }}>{n.count || ""}</text>}
                  {n.type === "verse" && (n.sharedCount || 0) > 1 && <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={7} fill="#fcc419" fontWeight="bold" style={{ pointerEvents: "none" }}>{n.sharedCount}</text>}

                  <text x={p.x} y={n.type === "word" ? p.y - r - 4 : p.y + r + 11}
                    textAnchor="middle" fontSize={n.type === "center" ? 12 : n.type === "word" ? 11 : 8}
                    fontWeight={n.type !== "verse" ? "bold" : "normal"} fill={isS || isAW ? (theme === "light" ? "#1e293b" : "#fff") : n.type === "verse" ? T.textDim : n.color}
                    direction="rtl" style={{ pointerEvents: "none" }}>{n.label}</text>

                  {n.type === "word" && n.rootLabel && n.rootLabel !== norm(n.label) && (
                    <text x={p.x} y={p.y - r - 15} textAnchor="middle" fontSize={8} fill="#22c55e" opacity={0.7} direction="rtl" style={{ pointerEvents: "none" }}>({n.rootLabel})</text>
                  )}
                  {n.type === "word" && !isWE && n.count > 1 && <text x={p.x + r + 3} y={p.y + 3} fontSize={10} fill={T.textFaint} style={{ pointerEvents: "none" }}>+</text>}
                  {isWE && <circle cx={p.x + r - 1} cy={p.y - r + 1} r={5} fill="#22c55e" stroke={T.bg} strokeWidth={1.5} />}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hovNode && hovNode.type !== "center" && !selNode && (
          <div data-panel="1" style={{ position: "absolute", bottom: 12, left: 12, right: 12, background: T.panel + (theme === "dark" ? "f5" : "f8"), backdropFilter: "blur(12px)", borderRadius: 10, padding: "10px 14px", border: `1px solid ${hovNode.color}44`, direction: "rtl", zIndex: 30, pointerEvents: hovNode.type === "verse" ? "auto" : "none", maxHeight: "28vh", overflow: "auto" }}>
            {hovNode.type === "word" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: hovNode.color }}>{hovNode.label}</span>
                {hovNode.rootLabel && <span style={{ fontSize: 12, color: "#22c55e" }}>جذر: {hovNode.rootLabel}</span>}
                <span style={{ fontSize: 10, color: fColor(hovNode.count), background: fColor(hovNode.count) + "22", padding: "1px 8px", borderRadius: 10 }}>{hovNode.count} آية</span>
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
