import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { norm, extractRoot, STOP } from "./src/arabic-utils.js";
import { loadHafsData } from "./src/data-loader.js";

function tokenize(text) {
  return text.split(/\s+/).filter(w => w.length > 0).map(w => {
    const n = norm(w);
    return n.length >= 2 ? { orig: w, norm: n, root: extractRoot(w) } : null;
  }).filter(Boolean);
}

const FC = {1:"#ef4444",2:"#f97316",5:"#eab308",15:"#22c55e",40:"#3b82f6",100:"#8b5cf6",999:"#6b7280"};
function freqColor(c){for(const[k,v]of Object.entries(FC))if(c<=+k)return v;return"#6b7280"}
function freqBg(c){return freqColor(c)+"22"}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [surah, setSurah] = useState(2);
  const [ayah, setAyah] = useState(228);
  const [expanded, setExpanded] = useState(new Set());
  const [subExpanded, setSubExpanded] = useState(new Set());
  const [hist, setHist] = useState([]);
  const [hideStop, setHideStop] = useState(true);
  const [searchMode, setSearchMode] = useState("norm"); // norm | root
  const [focusWord, setFocusWord] = useState(null);
  const ref = useRef();

  useEffect(() => {
    loadHafsData().then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const { idx, ridx, verses, snames } = useMemo(() => {
    if (!data) return { idx:{}, ridx:{}, verses:{}, snames:{} };
    const idx={}, ridx={}, verses={}, snames={};
    for (const s of data) {
      snames[s.id] = s.name;
      for (const v of s.verses) {
        const k = `${s.id}:${v.id}`;
        const toks = tokenize(v.text);
        verses[k] = { toks, text: v.text, s: s.id, a: v.id, sn: s.name };
        for (const t of toks) {
          if (!idx[t.norm]) idx[t.norm] = new Set();
          idx[t.norm].add(k);
          if (!ridx[t.root]) ridx[t.root] = new Set();
          ridx[t.root].add(k);
        }
      }
    }
    return { idx, ridx, verses, snames };
  }, [data]);

  const key = `${surah}:${ayah}`;
  const cv = verses[key];

  const words = useMemo(() => {
    if (!cv) return [];
    const seen = new Set();
    return cv.toks.filter(t => { if (seen.has(t.norm)) return false; seen.add(t.norm); return true; })
      .map(t => {
        const index = searchMode === "root" ? ridx : idx;
        const lookup = searchMode === "root" ? t.root : t.norm;
        const all = index[lookup] || new Set();
        const others = [...all].filter(v => v !== key);
        const isStop = STOP.has(t.norm) || STOP.has(t.root);
        return { ...t, lookup, count: all.size, others, isStop };
      })
      .sort((a, b) => a.count - b.count);
  }, [cv, idx, ridx, key, searchMode]);

  const go = useCallback((s, a) => {
    setHist(h => [...h, { s: surah, a: ayah }]);
    setSurah(s); setAyah(a);
    setExpanded(new Set()); setSubExpanded(new Set()); setFocusWord(null);
    ref.current?.scrollTo(0, 0);
  }, [surah, ayah]);

  const back = useCallback(() => {
    if (!hist.length) return;
    const p = hist[hist.length - 1];
    setHist(h => h.slice(0, -1));
    setSurah(p.s); setAyah(p.a);
    setExpanded(new Set()); setSubExpanded(new Set()); setFocusWord(null);
  }, [hist]);

  const toggle = useCallback(w => setExpanded(p => { const n = new Set(p); n.has(w) ? n.delete(w) : n.add(w); return n; }), []);
  const toggleSub = useCallback(k => setSubExpanded(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }), []);

  const getShared = useCallback((k1, k2) => {
    const v1 = verses[k1], v2 = verses[k2];
    if (!v1 || !v2) return [];
    const s1 = new Set(v1.toks.map(t => searchMode === "root" ? t.root : t.norm));
    return [...new Set(v2.toks.filter(t => s1.has(searchMode === "root" ? t.root : t.norm)).map(t => t.orig))];
  }, [verses, searchMode]);

  if (loading) return (
    <div style={S.loadWrap}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📖</div>
      <div style={{ color: "#94a3b8" }}>جارٍ تحميل النص القرآني الكامل وبناء شبكة الكلمات...</div>
      <div style={S.loadBar}><div style={{ ...S.loadFill, animation: "pulse 1s infinite alternate" }} /></div>
    </div>
  );

  const slist = data?.map(s => ({ id: s.id, n: s.name, c: s.total_verses })) || [];
  const ac = data?.find(s => s.id === surah)?.total_verses || 1;
  const shown = hideStop ? words.filter(w => !w.isStop) : words;

  return (
    <div style={S.root}>
      {/* TOP BAR */}
      <div style={S.topBar}>
        <div style={S.topRow}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#60a5fa", display: "flex", alignItems: "center", gap: 6 }}>
            📖 شبكة الكلمات القرآنية
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <select value={surah} onChange={e => { setSurah(+e.target.value); setAyah(1); setExpanded(new Set()); setFocusWord(null); }} style={S.sel}>
              {slist.map(s => <option key={s.id} value={s.id}>{s.id}. {s.n}</option>)}
            </select>
            <select value={ayah} onChange={e => { setAyah(+e.target.value); setExpanded(new Set()); setFocusWord(null); }} style={{ ...S.sel, width: 65 }}>
              {Array.from({ length: ac }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
            </select>
            {hist.length > 0 && <button onClick={back} style={S.backBtn}>→ رجوع</button>}
          </div>
        </div>
        <div style={S.optRow}>
          <label style={S.optLabel}>
            <input type="checkbox" checked={hideStop} onChange={e => setHideStop(e.target.checked)} />
            إخفاء حروف الجر والأدوات
          </label>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10 }}>بحث بـ:</span>
            <button onClick={() => setSearchMode("norm")} style={{ ...S.modeBtn, ...(searchMode === "norm" ? S.modeBtnActive : {}) }}>الكلمة</button>
            <button onClick={() => setSearchMode("root")} style={{ ...S.modeBtn, ...(searchMode === "root" ? S.modeBtnActive : {}) }}>الجذر</button>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
            {[[1,"نادرة"],[5,"قليلة"],[15,"متوسطة"],[40,"كثيرة"]].map(([n,l]) => (
              <span key={n} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: freqColor(n) }} />{l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div ref={ref} style={S.content}>
        {cv && <>
          {/* VERSE CARD */}
          <div style={S.verseCard}>
            <div style={S.verseLabel}>{cv.sn} — الآية {cv.a}</div>
            <div style={S.verseText}>{cv.text}</div>
            <div style={S.verseMeta}>
              {words.length} كلمة فريدة • {shown.length} معروضة •
              وضع البحث: {searchMode === "root" ? "الجذر (يجمع المشتقات)" : "الكلمة (تطابق دقيق)"}
            </div>
          </div>

          {/* WORD CHIPS */}
          <div style={S.chipWrap}>
            {shown.map((w, i) => {
              const on = expanded.has(w.lookup);
              const c = freqColor(w.count);
              return (
                <button key={i} onClick={() => { toggle(w.lookup); setFocusWord(on ? null : w); }}
                  style={{ ...S.chip, background: on ? c + "22" : "#1e293b", borderColor: on ? c : "#334155", color: on ? c : "#cbd5e1" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{w.orig}</span>
                  {searchMode === "root" && <span style={{ fontSize: 9, color: "#94a3b8" }}>({w.root})</span>}
                  <span style={{ ...S.chipBadge, background: c + "33", color: c }}>{w.count}</span>
                </button>
              );
            })}
          </div>

          {/* EXPANDED WORD PANELS */}
          {shown.filter(w => expanded.has(w.lookup)).map(w => (
            <WordPanel key={w.lookup} w={w} cv={cv} currentKey={key} verses={verses}
              idx={searchMode === "root" ? ridx : idx} searchMode={searchMode}
              getShared={getShared} go={go} subExpanded={subExpanded} toggleSub={toggleSub} />
          ))}
        </>}
      </div>
    </div>
  );
}

function WordPanel({ w, cv, currentKey, verses, idx, searchMode, getShared, go, subExpanded, toggleSub }) {
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState("shared"); // shared | surah
  const c = freqColor(w.count);

  const connected = useMemo(() => {
    return w.others.map(vk => {
      const v = verses[vk];
      if (!v) return null;
      const shared = getShared(currentKey, vk);
      return { key: vk, v, shared, sharedCount: shared.length };
    }).filter(Boolean).sort((a, b) => sortBy === "shared" ? b.sharedCount - a.sharedCount : a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [w.others, verses, getShared, currentKey, sortBy]);

  const display = showAll ? connected : connected.slice(0, 30);

  return (
    <div style={{ ...S.panel, borderColor: c + "44" }}>
      <div style={S.panelHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: c }}>{w.orig}</span>
          {searchMode === "root" && <span style={{ fontSize: 13, color: "#94a3b8" }}>جذر: {w.root}</span>}
          <span style={{ ...S.panelBadge, background: c + "22", color: c }}>{w.count} آية في القرآن</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setSortBy(s => s === "shared" ? "surah" : "shared")}
            style={S.sortBtn}>{sortBy === "shared" ? "⇅ ترتيب بالسورة" : "⇅ ترتيب بالتشابه"}</button>
        </div>
      </div>

      {display.map(({ key: vk, v, shared, sharedCount }) => {
        const subKey = `${w.lookup}:${vk}`;
        const isSub = subExpanded.has(subKey);

        // Sub-connections: words in this verse that connect to other verses
        const subWords = isSub ? (() => {
          const seen = new Set();
          return v.toks.filter(t => {
            const k = searchMode === "root" ? t.root : t.norm;
            if (seen.has(k) || STOP.has(t.norm) || STOP.has(t.root)) return false;
            seen.add(k); return true;
          }).map(t => {
            const lookup = searchMode === "root" ? t.root : t.norm;
            const all = idx[lookup] || new Set();
            return { ...t, lookup, count: all.size, others: [...all].filter(x => x !== vk && x !== currentKey).slice(0, 5) };
          }).filter(t => t.count > 1 && t.count < 500).sort((a, b) => a.count - b.count).slice(0, 15);
        })() : [];

        return (
          <div key={vk} style={S.verseRow}>
            <div style={{ ...S.verseRowInner, borderRightColor: sharedCount > 2 ? "#f59e0b" : c }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={S.vkLabel}>{v.sn} {v.a}</span>
                  {sharedCount > 1 && <span style={S.sharedBadge}>🔗 {sharedCount} كلمة مشتركة</span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => toggleSub(subKey)} style={{ ...S.tinyBtn, background: isSub ? "#7c3aed22" : "#1e293b", borderColor: isSub ? "#7c3aed" : "#475569", color: isSub ? "#a78bfa" : "#94a3b8" }}>
                    {isSub ? "▲ طي" : "▼ فروع"}
                  </button>
                  <button onClick={() => go(v.s, v.a)} style={{ ...S.tinyBtn, color: "#60a5fa", borderColor: "#1e40af44" }}>
                    انتقل ←
                  </button>
                </div>
              </div>
              <div style={S.verseRowText}>{hlText(v.text, w, shared, searchMode)}</div>
              {sharedCount > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                  {shared.slice(0, 10).map((sw, i) => <span key={i} style={S.sharedChip}>{sw}</span>)}
                </div>
              )}
            </div>

            {/* SUB-CONNECTIONS */}
            {isSub && subWords.length > 0 && (
              <div style={S.subWrap}>
                <div style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, marginBottom: 6 }}>
                  ↳ كلمات هذه الآية وروابطها ({subWords.length} كلمة):
                </div>
                {subWords.map((sw, si) => (
                  <div key={si} style={S.subItem}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, color: freqColor(sw.count), fontSize: 13 }}>{sw.orig}</span>
                      {searchMode === "root" && <span style={{ fontSize: 9, color: "#64748b" }}>({sw.root})</span>}
                      <span style={{ fontSize: 9, color: freqColor(sw.count), background: freqBg(sw.count), padding: "0 5px", borderRadius: 8 }}>{sw.count}</span>
                    </div>
                    {sw.others.map(svk => {
                      const sv = verses[svk];
                      if (!sv) return null;
                      return (
                        <div key={svk} style={S.subVerse}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 9, color: "#64748b" }}>{sv.sn} {sv.a}</span>
                            <button onClick={() => go(sv.s, sv.a)} style={{ ...S.tinyBtn, fontSize: 9, padding: "1px 5px" }}>←</button>
                          </div>
                          <div style={{ fontSize: 12, lineHeight: 1.8, color: "#94a3b8" }}>
                            {sv.text.length > 120 ? sv.text.slice(0, 120) + "..." : sv.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {connected.length > 30 && !showAll && (
        <button onClick={() => setShowAll(true)} style={S.showAllBtn}>
          عرض الكل ({connected.length} آية)
        </button>
      )}
    </div>
  );
}

function hlText(text, w, shared, mode) {
  const words = text.split(/(\s+)/);
  return words.map((wd, i) => {
    if (/^\s+$/.test(wd)) return wd;
    const n = norm(wd);
    const r = extractRoot(wd);
    const target = mode === "root" ? r : n;
    if (target === w.lookup || n === w.norm) {
      return <span key={i} style={{ background: "#ef444444", color: "#fca5a5", borderRadius: 3, padding: "0 2px", fontWeight: 700 }}>{wd}</span>;
    }
    if (shared?.some(s => norm(s) === n)) {
      return <span key={i} style={{ background: "#f59e0b33", color: "#fcd34d", borderRadius: 3, padding: "0 2px" }}>{wd}</span>;
    }
    return wd;
  });
}

const S = {
  root: { height: "100vh", display: "flex", flexDirection: "column", background: "#0f172a", color: "#e2e8f0", fontFamily: "Arial, sans-serif", direction: "rtl" },
  loadWrap: { height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#e2e8f0", fontFamily: "Arial", gap: 12 },
  loadBar: { width: 220, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" },
  loadFill: { width: "60%", height: "100%", background: "#3b82f6", borderRadius: 2 },
  topBar: { background: "#1e293b", borderBottom: "1px solid #334155", padding: "8px 14px", flexShrink: 0 },
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  sel: { background: "#0f172a", color: "#e2e8f0", border: "1px solid #475569", borderRadius: 6, padding: "3px 8px", fontSize: 12, direction: "rtl" },
  backBtn: { background: "#334155", color: "#93c5fd", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11 },
  optRow: { display: "flex", alignItems: "center", gap: 14, marginTop: 5, fontSize: 10, color: "#94a3b8", flexWrap: "wrap" },
  optLabel: { display: "flex", alignItems: "center", gap: 3, cursor: "pointer" },
  modeBtn: { background: "#0f172a", color: "#94a3b8", border: "1px solid #475569", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 10 },
  modeBtnActive: { background: "#1e40af33", color: "#60a5fa", borderColor: "#2563eb" },
  content: { flex: 1, overflow: "auto", padding: 14 },
  verseCard: { background: "#1e293b", borderRadius: 10, padding: 14, marginBottom: 14, border: "1px solid #334155" },
  verseLabel: { fontSize: 11, color: "#64748b", marginBottom: 5 },
  verseText: { fontSize: 20, lineHeight: 2, color: "#f1f5f9", textAlign: "right" },
  verseMeta: { fontSize: 10, color: "#64748b", marginTop: 6 },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 },
  chip: { border: "1.5px solid #334155", borderRadius: 8, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s", direction: "rtl", fontSize: 13 },
  chipBadge: { fontSize: 9, padding: "1px 5px", borderRadius: 10, fontWeight: 700 },
  panel: { background: "#1e293b", borderRadius: 10, padding: 12, marginBottom: 12, border: "1px solid" },
  panelHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 },
  panelBadge: { fontSize: 10, padding: "2px 8px", borderRadius: 10 },
  sortBtn: { background: "#0f172a", color: "#94a3b8", border: "1px solid #475569", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 10 },
  verseRow: { marginBottom: 4 },
  verseRowInner: { background: "#0f172a", padding: "7px 10px", borderRadius: 7, borderRight: "3px solid", display: "flex", flexDirection: "column", gap: 3 },
  vkLabel: { fontSize: 10, color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" },
  sharedBadge: { fontSize: 9, color: "#f59e0b", background: "#f59e0b22", padding: "1px 6px", borderRadius: 8 },
  tinyBtn: { background: "#1e293b", color: "#94a3b8", border: "1px solid #475569", borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontSize: 10 },
  verseRowText: { fontSize: 14, lineHeight: 1.9, color: "#cbd5e1", textAlign: "right" },
  sharedChip: { fontSize: 9, color: "#f59e0b", background: "#f59e0b11", padding: "1px 5px", borderRadius: 4, border: "1px solid #f59e0b33" },
  subWrap: { background: "#0f172a", borderRight: "3px solid #7c3aed44", marginRight: 16, padding: "8px 10px", borderRadius: "0 0 8px 8px" },
  subItem: { marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #1e293b" },
  subVerse: { background: "#1e293b", borderRadius: 6, padding: "4px 8px", marginTop: 3, marginRight: 10 },
  showAllBtn: { width: "100%", background: "#0f172a", color: "#60a5fa", border: "1px solid #1e40af44", borderRadius: 8, padding: "6px", cursor: "pointer", fontSize: 12, marginTop: 6 },
};
