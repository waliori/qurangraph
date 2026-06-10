import { useEffect, useMemo, useRef, useState } from "react";
import { surahProfile, surahKeyness, surahCohesion, surahSelfSimilarity, surahBonds, sharedRoots } from "../analytics/surah.js";
import { exportJsonFile, exportCsvFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Sūra analysis lab ═══
 *
 * The sūra-altitude companion to the word/āya labs, built for the نظم/تلاحم school:
 *   Overview   — profile, keyness (distinctive roots), refrains.
 *   Cohesion   — adjacent-verse connectedness; dips = topic boundaries (rukūʿ/maqāṭiʿ).
 *   Structure  — verse×verse self-similarity heatmap + strongest echoes (ring/panels).
 *   Bonds      — الأواصر: rare words/phrases recurring at distant points in the sūra.
 * `surah = { surahId, back? }`. Heavy lenses defer to idle so the dialog paints first.
 */
const TABS = ["overview", "cohesion", "structure", "bonds"];

export function SurahLabModal({ surah, verseData, r2v, w2v, seedIndex, stopSet, back, onNavigate, onRoot, onBack, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("overview");
  const [preview, setPreview] = useState(null); // array of ayah numbers shown in the inline preview
  const [hover, setHover] = useState(null); // { ai, aj, score } under the cursor on the heatmap
  const sid = surah?.surahId;
  const canvasRef = useRef(null);
  const pxRef = useRef(1); // heatmap cell size in px, for hit-testing clicks/hovers

  // Light lenses — synchronous.
  const profile = useMemo(() => (sid ? surahProfile(sid, verseData) : null), [sid, verseData]);
  const keyness = useMemo(() => (sid ? surahKeyness(sid, verseData, r2v).slice(0, 24) : []), [sid, verseData, r2v]);
  const cohesion = useMemo(() => (sid ? surahCohesion(sid, verseData) : null), [sid, verseData]);

  // Heavy lenses — idle.
  const [sim, setSim] = useState(null);
  const [bonds, setBonds] = useState(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setPreview(null); }, [sid]); // clear the inline preview when the sūra changes
  useEffect(() => {
    if (!sid) return undefined;
    setSim(null); setBonds(null);
    let alive = true;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => {
      if (!alive) return;
      setSim(surahSelfSimilarity(sid, verseData));
      setBonds(surahBonds(sid, verseData, w2v, seedIndex, stopSet));
    }, { timeout: 400 });
    return () => { alive = false; cic(id); };
  }, [sid, verseData, w2v, seedIndex, stopSet]);

  // Draw the self-similarity heatmap when the Structure tab is shown.
  useEffect(() => {
    if (tab !== "structure" || !sim || !canvasRef.current) return;
    const n = sim.size, c = canvasRef.current;
    const px = Math.max(1, Math.min(7, Math.floor(560 / n)));
    pxRef.current = px;
    c.width = n * px; c.height = n * px;
    const ctx = c.getContext("2d");
    // Use the theme-aware gold token (amber on the light theme) so cells stay legible.
    const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold-500").trim() || "#f5b301";
    ctx.fillStyle = gold;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = sim.matrix[i][j];
      if (v <= 0) continue;
      ctx.globalAlpha = Math.min(1, v) ** 0.7;
      ctx.fillRect(j * px, i * px, px, px);
    }
    ctx.globalAlpha = 1;
  }, [tab, sim]);

  if (!surah || !profile) return null;
  const nav = (a) => setPreview({ ayat: [a] }); // click a verse number → read it inline below (no jump, no cascade)
  // Preview a verse PAIR with its similarity score + shared roots (from a matrix cell or echo).
  const previewPair = (ai, aj, score, shared) => setPreview({ ayat: [ai, aj], score, shared: shared || sharedRoots(`${sid}:${ai}`, `${sid}:${aj}`, verseData) });
  const pvAyat = preview?.ayat || [];

  // Map a click/hover on the heatmap to a verse pair.
  const cellAt = (e) => {
    const c = canvasRef.current; if (!c || !sim) return null;
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (c.width / rect.width);
    const y = (e.clientY - rect.top) * (c.height / rect.height);
    const px = pxRef.current || 1;
    const j = Math.floor(x / px), i = Math.floor(y / px);
    if (i < 0 || j < 0 || i >= sim.size || j >= sim.size) return null;
    return { i, j };
  };

  return (
    <ModalShell open={!!surah} onClose={onClose} closeLabel={t("surah.close")}
      ariaLabel={t("surah.title", { name: profile.name })}
      title={<>
        {back && <button type="button" className="ag-btn" title={t("surah.back")} onClick={onBack} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-verse">{t("surah.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{profile.name}</h2>
        <span className="ag-modal-count">{fmtNum(sid)} · {fmtNum(profile.verseCount)} {t("surah.verses")}</span>
      </>}
      actions={<button type="button" className="ag-btn" onClick={() => exportJsonFile({ surah: sid, name: profile.name, profile, keyness, cohesion, echoes: sim?.echoes, bonds }, `surah-${sid}.json`)}>⤓ JSON</button>}>
      <div className="ag-dist-body">
        <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("surah.title", { name: profile.name })} style={{ marginBlockEnd: "var(--space-3)" }}>
          {TABS.map((id) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{t(`surah.tab.${id}`)}</button>)}
        </div>

        {tab === "overview" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-bars">
              <div className="ag-dist-row"><span className="ag-dist-name">{t("surah.verses")}</span><span className="ag-dist-num">{fmtNum(profile.verseCount)}</span><span /></div>
              <div className="ag-dist-row"><span className="ag-dist-name">{t("surah.words")}</span><span className="ag-dist-num">{fmtNum(profile.wordCount)}</span><span /></div>
              <div className="ag-dist-row"><span className="ag-dist-name">{t("surah.roots")}</span><span className="ag-dist-num">{fmtNum(profile.rootCount)}</span><span /></div>
              {profile.dominantRhyme && <div className="ag-dist-row"><span className="ag-dist-name">{t("surah.dominantRhyme")}</span><span className="ag-dist-num" style={{ fontFamily: "var(--font-quran)" }}>{profile.dominantRhyme}</span><span /></div>}
            </div>
            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("surah.keyness")}</span></div>
            <p className="ag-hint">{t("surah.keynessHint")}</p>
            <div className="ag-dist-tags">
              {keyness.length === 0 ? <span className="ag-dist-name">{t("surah.none")}</span> : keyness.map((k) => (
                <button type="button" className="ag-tag ag-tag-btn" key={k.root} onClick={() => onRoot?.(k.root)} title={t("surah.keyChip", { inSura: k.inSura, total: k.total })}>
                  {k.root} <b style={{ color: "var(--gold-400)" }}>{k.inSura}</b>
                </button>
              ))}
            </div>
            {profile.refrains.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("surah.refrains")}</span></div>
              <p className="ag-hint">{t("surah.refrainsHint")}</p>
              <ul className="ag-phrase-list">
                {profile.refrains.slice(0, 12).map((r, i) => (
                  <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8 }}>
                    <span className="ag-dist-num" style={{ color: "var(--gold-400)" }}>×{r.count}</span>
                    <span className="ag-modal-text" style={{ flex: 1, fontFamily: "var(--font-quran)" }}>{r.text}</span>
                    <span style={{ display: "flex", gap: 3 }}>{r.ayat.map((a) => <button type="button" className="ag-tag ag-tag-btn" key={a} onClick={() => nav(a)}>{fmtNum(a)}</button>)}</span>
                  </span></li>
                ))}
              </ul>
            </>}
          </div>
        )}

        {tab === "cohesion" && cohesion && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("surah.cohesion")}</span></div>
            <p className="ag-hint">{t("surah.cohesionHint")}</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 90, overflowX: "auto", padding: "4px 0" }}>
              {cohesion.seq.map((s, i) => {
                const boundary = s.score <= cohesion.mean * 0.4;
                return (
                  <button type="button" key={i} onClick={() => nav(s.b)} title={t("surah.transition", { a: s.a, b: s.b, shared: s.shared.join("، ") || "—" })}
                    style={{ width: 6, minWidth: 6, height: `${Math.max(3, s.score * 100)}%`, background: boundary ? "var(--text-faint)" : "var(--gold-400)", opacity: boundary ? 0.5 : 0.85, border: "none", cursor: "pointer", alignSelf: "flex-end" }} />
                );
              })}
            </div>
            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("surah.boundaries")}</span></div>
            <div className="ag-dist-tags">
              {cohesion.seq.filter((s) => s.score <= cohesion.mean * 0.4).slice(0, 30).map((s, i) => (
                <button type="button" className="ag-tag ag-tag-btn" key={i} onClick={() => nav(s.b)} title={t("surah.boundaryTitle", { a: s.a, b: s.b })}>{fmtNum(s.a)}↓{fmtNum(s.b)}</button>
              ))}
            </div>
          </div>
        )}

        {tab === "structure" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("surah.structure")}</span></div>
            <p className="ag-hint">{t("surah.structureHint")}</p>
            {sim == null ? <span className="ag-dist-name">{t("surah.computing")}</span> : <>
              <p className="ag-hint" style={{ minHeight: "1.4em" }}>
                {hover ? t("surah.cellReadout", { ai: hover.ai, aj: hover.aj, pct: Math.round(hover.score * 100) }) : t("surah.matrixHint")}
              </p>
              <div style={{ overflow: "auto", maxWidth: "100%", border: "1px solid var(--border)", borderRadius: 6 }}>
                <canvas ref={canvasRef} style={{ display: "block", cursor: "crosshair" }}
                  onMouseMove={(ev) => { const c = cellAt(ev); setHover(c ? { ai: sim.ayat[c.i], aj: sim.ayat[c.j], score: sim.matrix[c.i][c.j] } : null); }}
                  onMouseLeave={() => setHover(null)}
                  onClick={(ev) => { const c = cellAt(ev); if (!c) return; if (c.i === c.j) nav(sim.ayat[c.i]); else previewPair(sim.ayat[c.i], sim.ayat[c.j], sim.matrix[c.i][c.j]); }} />
              </div>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("surah.echoes")}</span></div>
              <p className="ag-hint">{t("surah.echoesHint")}</p>
              <div className="ag-dist-tags">
                {sim.echoes.slice(0, 30).map((e, i) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={i} onClick={() => previewPair(e.ai, e.aj, e.score, e.shared)}
                    title={t("surah.echoTitle", { ai: e.ai, aj: e.aj, shared: e.shared.join("، ") })}>
                    {fmtNum(e.ai)} <span style={{ color: "var(--text-faint)" }}>↔</span> {fmtNum(e.aj)}
                  </button>
                ))}
              </div>
            </>}
          </div>
        )}

        {tab === "bonds" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("surah.bonds")}</span>
              {bonds && <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("surah.bondEl"), t("surah.bondGlobal"), t("surah.bondAyat")],
                ...bonds.wordBonds.map((b) => [b.label, b.global, b.ayat.join(" ")]), ...bonds.phraseBonds.map((b) => [b.tokens.join(" "), b.ayat.length, b.ayat.join(" ")])], `bonds-${sid}.csv`)}>⤓ CSV</button>}
            </div>
            <p className="ag-hint">{t("surah.bondsHint")}</p>
            {bonds == null ? <span className="ag-dist-name">{t("surah.computing")}</span>
              : (bonds.wordBonds.length === 0 && bonds.phraseBonds.length === 0) ? <span className="ag-dist-name">{t("surah.none")}</span> : <>
                {bonds.phraseBonds.length > 0 && <>
                  <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-2)" }}><span>{t("surah.phraseBonds")}</span></div>
                  <ul className="ag-phrase-list">
                    {bonds.phraseBonds.slice(0, 40).map((b, i) => (
                      <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8 }}>
                        <span className="ag-modal-text" style={{ flex: 1, fontFamily: "var(--font-quran)" }}>{b.tokens.join(" ")}</span>
                        <span style={{ display: "flex", gap: 3 }}>{b.ayat.map((a) => <button type="button" className="ag-tag ag-tag-btn" key={a} onClick={() => nav(a)}>{fmtNum(a)}</button>)}</span>
                      </span></li>
                    ))}
                  </ul>
                </>}
                {bonds.wordBonds.length > 0 && <>
                  <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("surah.wordBonds")}</span></div>
                  <ul className="ag-phrase-list">
                    {bonds.wordBonds.slice(0, 80).map((b, i) => (
                      <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="ag-modal-text" style={{ flex: 1 }}><b>{b.label}</b> <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{t("surah.bondGlobalN", { n: b.global })}</span></span>
                        <span style={{ display: "flex", gap: 3 }}>{b.ayat.map((a) => <button type="button" className="ag-tag ag-tag-btn" key={a} onClick={() => nav(a)}>{fmtNum(a)}</button>)}</span>
                      </span></li>
                    ))}
                  </ul>
                </>}
              </>}
          </div>
        )}

        {/* Sticky inline preview — clicking a verse (or an echo/cell pair) reads it here, in
            place. Opaque background + shadow so it sits above the list, not through it. */}
        {pvAyat.length > 0 && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, marginBlockStart: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--ink-800)", borderBlockStart: "2px solid var(--gold-500)", borderRadius: "var(--radius-sm)", boxShadow: "0 -10px 22px -10px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBlockEnd: 4 }}>
              <span style={{ fontSize: "var(--text-xs)" }}>
                {pvAyat.length > 1 && <>
                  <b style={{ color: "var(--gold-400)" }}>{t("surah.echoPairLabel")}</b>
                  {preview.score != null && <span style={{ color: "var(--text-muted)", marginInlineStart: 6 }}>{t("surah.pairScore", { pct: Math.round(preview.score * 100) })}</span>}
                </>}
              </span>
              <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} style={{ width: 26, height: 26 }} onClick={() => setPreview(null)}>✕</button>
            </div>
            {pvAyat.length > 1 && preview.shared?.length > 0 && (
              <p className="ag-hint" style={{ marginBlockEnd: 6 }}>{t("surah.pairShared")}: {preview.shared.slice(0, 12).join("، ")}</p>
            )}
            {pvAyat.map((a) => { const verse = verseData[`${sid}:${a}`]; if (!verse) return null; return (
              <div key={a} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBlockEnd: 4 }}>
                <button type="button" className="ag-tag ag-tag-btn" title={t("surah.goTo")} onClick={() => onNavigate?.(sid, a)} style={{ flexShrink: 0 }}>⌖ {fmtNum(a)}</button>
                <div className="ag-modal-text" dir="rtl" style={{ fontFamily: "var(--font-quran)", lineHeight: 1.9 }}>{verse.words.map((w) => w.orig).join(" ")}</div>
              </div>); })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
