import { useEffect, useMemo, useState } from "react";
import { indexExpressions, headRows, expressionsForRoot, occVerses, FRAME_SPAN, spanRun } from "../analytics/expressions.js";
import { exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Expressions explorer (كشّاف التعابير) ═══
 *
 * Multi-word units the parts don't predict, mined offline (build-expressions.js):
 *   Frames    — a head + the ḥarf jarr it governs (آمَنَ بـ "believe IN"). The row IS the
 *               CONTRAST: every preposition the head takes, with the bare residual, so the
 *               sense-shift by government is visible at a glance; click a حرف for its āyāt.
 *   Compounds — إضافة (سبيل الله, يوم القيامة), ranked by log-likelihood.
 *   Idioms    — curated non-compositional expressions (+ their verses).
 *
 * Interaction stays INSIDE the modal like the corpus lab: click a term → its āyāt as an inline
 * list (highlighting the expression's own words); click an āya → the sticky foot preview; only
 * the preview's ⌖ jumps the graph. `focusRoot` opens scoped to one root (root-lab cross-link).
 */
const TABS = ["frames", "compounds", "idioms"];
const CAP = 200;

export function ExpressionsModal({ open, verseData, expr, theme, focusRoot, onNavigate, onRoot, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("frames");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(focusRoot || null); // root-scoped view
  const [detail, setDetail] = useState(null); // { label, verses:[{vk,hi}] }
  const [preview, setPreview] = useState(null); // vk in the sticky foot
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setFocus(focusRoot || null); setDetail(null); setPreview(null); }, [focusRoot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const idx = useMemo(() => (expr ? indexExpressions(expr) : null), [expr]);
  const heads = useMemo(() => (idx && tab === "frames" && !focus ? headRows(expr, idx) : null), [idx, expr, tab, focus]);
  const rootView = useMemo(() => (idx && focus ? expressionsForRoot(expr, idx, focus) : null), [idx, expr, focus]);
  const q = query.trim();
  const matchHead = (h) => !q || h.head.includes(q) || h.root?.includes(q);
  const matchComp = (c) => !q || c.words.some((w) => w.includes(q));
  const matchIdiom = (i) => !q || i.display.includes(q);

  if (!open) return null;
  if (!expr) return (
    <ModalShell open={open} onClose={onClose} closeLabel={t("common.close")} ariaLabel={t("expr.title")}
      title={<><span className="ag-badge t-verse">{t("expr.badge")}</span><h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{t("expr.title")}</h2></>}>
      <div className="ag-dist-body"><p className="ag-dist-name">{t("expr.unavailable")}</p></div>
    </ModalShell>
  );

  const showOcc = (label, occ, span) => { setDetail({ label, verses: occVerses(occ, verseData, span) }); setPreview(null); };
  const pv = preview ? verseData[preview] : null;
  const pvHi = pv && detail ? detail.verses.find((v) => v.vk === preview)?.hi : null;

  // The government CONTRAST as a matrix: rows = heads, fixed columns = the ḥurūf al-jarr (+ a
  // bare column), cells shaded by how often that head takes that preposition. A column scan shows
  // every verb that takes بـ; a row shows one head's whole government profile. Click a cell → āyāt.
  const PREP_COLS = expr.prepDisp ? Object.keys(expr.prepDisp) : [];
  const renderMatrix = (rows) => {
    if (!rows.length) return <span className="ag-dist-name">{t("expr.none")}</span>;
    const max = rows.reduce((m, h) => Math.max(m, ...h.preps.map((p) => p.count)), 1);
    const shade = (c) => Math.round((0.14 + 0.86 * Math.log1p(c) / Math.log1p(max)) * 100);
    const th = { padding: "3px 5px", fontFamily: "var(--font-quran)", color: "var(--text-muted)", fontWeight: 600, position: "sticky", top: 0, background: "var(--ink-800)", zIndex: 1 };
    return (
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "var(--text-xs)" }}>
          <thead><tr>
            <th style={{ ...th, insetInlineStart: 0, zIndex: 2 }} />
            {PREP_COLS.map((pk) => <th key={pk} style={th} title={expr.prepDisp[pk]}>{expr.prepDisp[pk]}</th>)}
            <th style={{ ...th, color: "var(--text-faint)" }} title={t("expr.bare")}>⌀</th>
          </tr></thead>
          <tbody>
            {rows.map((h) => {
              const by = new Map(h.preps.map((p) => [p.prep, p]));
              return (
                <tr key={`${h.pos}|${h.head}`}>
                  <th scope="row" style={{ textAlign: "start", whiteSpace: "nowrap", position: "sticky", insetInlineStart: 0, background: "var(--ink-800)", padding: "1px 4px", zIndex: 1 }}>
                    <button type="button" className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} disabled={!h.root}
                      title={h.root ? t("expr.openRoot", { root: h.root }) : undefined} onClick={() => h.root && onRoot?.(h.root)}>{h.head}</button>
                  </th>
                  {PREP_COLS.map((pk) => {
                    const p = by.get(pk); const c = p ? p.count : 0; const pct = c ? shade(c) : 0;
                    return (
                      <td key={pk} onClick={c ? () => showOcc(`${h.head} ${p.disp}`, p.occ, FRAME_SPAN) : undefined}
                        title={c ? `${h.head} ${p.disp} · ${t("expr.occN", { n: c })}` : undefined}
                        style={{ textAlign: "center", minWidth: 30, height: 26, padding: 0, cursor: c ? "pointer" : "default",
                          background: c ? `color-mix(in oklab, var(--gold-500) ${pct}%, transparent)` : "transparent",
                          color: pct > 55 ? "var(--ink-900)" : "var(--text-body)" }}>{c ? fmtNum(c) : ""}</td>
                    );
                  })}
                  <td style={{ textAlign: "center", color: "var(--text-faint)" }} title={t("expr.bareHint")}>{h.bare ? fmtNum(h.bare) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <ModalShell open={open} onClose={onClose} closeLabel={t("common.close")} ariaLabel={t("expr.title")}
      title={<>
        {(detail || focus) && <button type="button" className="ag-btn" title={t("expr.back")} onClick={() => (detail ? setDetail(null) : setFocus(null))} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-verse">{t("expr.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{detail ? detail.label : focus ? t("expr.ofRoot", { root: focus }) : t("expr.title")}</h2>
        {detail ? <span className="ag-modal-count">{fmtNum(detail.verses.length)} {t("expr.ayat")}</span>
          : !focus && <span className="ag-modal-count">{fmtNum((expr.frames || []).length + (expr.compounds || []).length + (expr.idioms || []).length)}</span>}
      </>}
      actions={!detail && !focus && <button type="button" className="ag-btn" onClick={() => exportJsonFile({ frames: expr.frames, compounds: expr.compounds, idioms: expr.idioms }, "expressions.json")}>⤓ JSON</button>}>
      <div className="ag-dist-body">
        {detail ? (
          <div className="ag-dist-sec">
            <p className="ag-hint">{t("expr.listHint")}</p>
            {detail.verses.length === 0 ? <span className="ag-dist-name">{t("expr.none")}</span> : (
              <ul className="ag-phrase-list">
                {detail.verses.slice(0, CAP).map(({ vk, hi }) => { const v = verseData[vk]; if (!v) return null; return (
                  <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                    <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                    <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      <HighlightedAyah text={v.text} highlightIndices={new Set(hi)} theme={theme} />
                    </span>
                  </button></li>
                ); })}
                {detail.verses.length > CAP && <li><span className="ag-hint">{t("expr.more", { n: detail.verses.length - CAP })}</span></li>}
              </ul>
            )}
          </div>
        ) : focus ? (
          <div className="ag-dist-sec">
            <p className="ag-hint">{t("expr.ofRootHint")}</p>
            {rootView.heads.length === 0 && rootView.compounds.length === 0 && <span className="ag-dist-name">{t("expr.none")}</span>}
            {rootView.heads.length > 0 && <>
              <div className="ag-dist-sec-h"><span>{t("expr.tab.frames")}</span></div>
              {renderMatrix(rootView.heads)}
            </>}
            {rootView.compounds.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("expr.tab.compounds")}</span></div>
              <div className="ag-dist-tags">
                {rootView.compounds.map((c, i) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={i} style={{ fontFamily: "var(--font-quran)" }}
                    title={t("expr.occN", { n: c.count })} onClick={() => showOcc(c.words.join(" "), c.occ, spanRun(c.len))}>
                    {c.words.join(" ")} <b style={{ color: "var(--gold-400)" }}>{fmtNum(c.count)}</b>
                  </button>
                ))}
              </div>
            </>}
          </div>
        ) : (<>
          <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("expr.title")} style={{ marginBlockEnd: "var(--space-2)" }}>
            {TABS.map((id) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{t(`expr.tab.${id}`)}</button>)}
          </div>
          <input className="ag-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("expr.searchPh")} aria-label={t("expr.searchPh")} style={{ width: "100%", marginBlockEnd: "var(--space-2)" }} />

          {tab === "frames" && (() => { const hs = heads.filter(matchHead); return (
            <div className="ag-dist-sec">
              <p className="ag-hint">{t("expr.framesHint")}</p>
              {renderMatrix(hs.slice(0, CAP))}
              {hs.length > CAP && <p className="ag-hint">{t("expr.more", { n: hs.length - CAP })}</p>}
            </div>
          ); })()}

          {tab === "compounds" && (
            <div className="ag-dist-sec">
              <p className="ag-hint">{t("expr.compoundsHint")}</p>
              <div className="ag-dist-tags">
                {(expr.compounds || []).filter(matchComp).slice(0, CAP).map((c, i) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={i} style={{ fontFamily: "var(--font-quran)" }}
                    title={t("expr.occN", { n: c.count })} onClick={() => showOcc(c.words.join(" "), c.occ, spanRun(c.len))}>
                    {c.words.join(" ")} <b style={{ color: "var(--gold-400)" }}>{fmtNum(c.count)}</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "idioms" && (
            <div className="ag-dist-sec">
              <p className="ag-hint">{t("expr.idiomsHint")}</p>
              <ul className="ag-phrase-list">
                {(expr.idioms || []).filter(matchIdiom).slice(0, CAP).map((it, i) => (
                  <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <button type="button" className="ag-tag ag-tag-btn" disabled={it.count === 0} style={{ fontFamily: "var(--font-quran)", fontSize: "1.05em", flex: 1, textAlign: "start" }}
                      onClick={() => showOcc(it.display, it.occ, spanRun(it.len || it.skeleton.split(" ").length))}>{it.display}</button>
                    <span className="ag-dist-num" style={{ color: "var(--gold-400)" }}>{fmtNum(it.count)}</span>
                  </span></li>
                ))}
              </ul>
            </div>
          )}
        </>)}

        {pv && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, marginBlockStart: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--ink-800)", borderBlockStart: "2px solid var(--gold-500)", borderRadius: "var(--radius-sm)", boxShadow: "0 -10px 22px -10px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="ag-ayah-ref"><span className="ag-ayah-surah">{pv.sn}</span><span className="ag-ayah-num">{fmtNum(pv.a)}</span></span>
              <span style={{ display: "flex", gap: 4 }}>
                {onNavigate && <button type="button" className="ag-btn is-gold" title={t("aya.goTo")} onClick={() => { const [s, a] = preview.split(":").map(Number); onNavigate(s, a); }}>⌖ {t("aya.goTo")}</button>}
                <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} style={{ width: 26, height: 26 }} onClick={() => setPreview(null)}>✕</button>
              </span>
            </div>
            <div className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", marginBlockStart: 4, lineHeight: 1.9 }}>
              <HighlightedAyah text={pv.text} highlightIndices={pvHi ? new Set(pvHi) : undefined} theme={theme} />
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
