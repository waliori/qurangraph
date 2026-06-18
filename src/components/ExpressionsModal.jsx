import { useEffect, useMemo, useState } from "react";
import { indexExpressions, headRows, expressionsForRoot, occVerses, distBySura, FRAME_SPAN, spanRun } from "../analytics/expressions.js";
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
const TABS = ["frames", "collocations", "compounds", "idioms"];
const CAP = 200;

export function ExpressionsModal({ open, verseData, expr, theme, focusRoot, onNavigate, onRoot, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("frames");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(focusRoot || null); // root-scoped view
  const [detail, setDetail] = useState(null); // { label, verses:[{vk,hi}] }
  const [preview, setPreview] = useState(null); // vk in the sticky foot
  const [distSura, setDistSura] = useState(null); // distribution bar clicked → filter list to this sūra
  const [distHover, setDistHover] = useState(null); // sūra under the cursor on the distribution
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setFocus(focusRoot || null); setDetail(null); setPreview(null); }, [focusRoot]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const idx = useMemo(() => (expr ? indexExpressions(expr) : null), [expr]);
  const heads = useMemo(() => (idx && tab === "frames" && !focus ? headRows(expr, idx) : null), [idx, expr, tab, focus]);
  const rootView = useMemo(() => (idx && focus ? expressionsForRoot(expr, idx, focus) : null), [idx, expr, focus]);
  // Compounds grouped by their shared head noun (muḍāf), so سبيل الله / رسول الله / كتاب الله
  // cluster. Richest clusters (most distinct constructs) first, then by total frequency.
  const compGroups = useMemo(() => {
    if (!expr || tab !== "compounds" || focus) return null;
    const m = new Map();
    for (const c of expr.compounds || []) { const h = c.words[0]; if (!m.has(h)) m.set(h, { head: h, items: [], total: 0 }); const g = m.get(h); g.items.push(c); g.total += c.count; }
    for (const g of m.values()) g.items.sort((a, b) => b.count - a.count);
    return [...m.values()].sort((a, b) => b.items.length - a.items.length || b.total - a.total);
  }, [expr, tab, focus]);
  // Collocations grouped by their verb (أقام → الصلاة / الوزن …), richest clusters first.
  const colGroups = useMemo(() => {
    if (!expr || tab !== "collocations" || focus) return null;
    const m = new Map();
    for (const c of expr.collocations || []) { if (!m.has(c.verb)) m.set(c.verb, { verb: c.verb, items: [], top: 0 }); const g = m.get(c.verb); g.items.push(c); g.top = Math.max(g.top, c.ll); }
    for (const g of m.values()) g.items.sort((a, b) => b.ll - a.ll);
    return [...m.values()].sort((a, b) => b.top - a.top);
  }, [expr, tab, focus]);
  const q = query.trim();
  const matchHead = (h) => !q || h.head.includes(q) || h.root?.includes(q);
  const matchComp = (c) => !q || c.words.some((w) => w.includes(q));
  const matchColloc = (c) => !q || c.verb.includes(q) || c.noun.includes(q);
  const matchIdiom = (i) => !q || i.display.includes(q);

  if (!open) return null;
  if (!expr) return (
    <ModalShell open={open} onClose={onClose} closeLabel={t("common.close")} ariaLabel={t("expr.title")}
      title={<><span className="ag-badge t-verse">{t("expr.badge")}</span><h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{t("expr.title")}</h2></>}>
      <div className="ag-dist-body"><p className="ag-dist-name">{t("expr.unavailable")}</p></div>
    </ModalShell>
  );

  const showOcc = (label, occ, span, extra) => { setDetail({ label, verses: occVerses(occ, verseData, span), components: extra?.components || null, related: extra?.related || null }); setPreview(null); setDistSura(null); setDistHover(null); };
  // A collocation's rich leaf: its verses, component roots, and the BIDIRECTIONAL contrast —
  // the other verbs that take the same noun (idx.colByRoot is keyed by both roots).
  const openColloc = (c) => showOcc(`${c.verb} ${c.noun}`, c.occ, FRAME_SPAN, {
    components: [{ label: c.verb, root: c.verbRoot }, { label: c.noun, root: c.nounRoot }],
    related: {
      label: t("expr.verbsTaking", { noun: c.noun }),
      items: (idx.colByRoot.get(c.nounRoot) || []).filter((x) => x.nounRoot === c.nounRoot && x.verb !== c.verb).sort((a, b) => b.count - a.count).slice(0, 16),
    },
  });
  const openCompound = (c) => showOcc(c.words.join(" "), c.occ, spanRun(c.len), { components: c.words.map((w, i) => ({ label: w, root: c.roots?.[i] })) });
  const pv = preview ? verseData[preview] : null;
  const pvHi = pv && detail ? detail.verses.find((v) => v.vk === preview)?.hi : null;
  // Interactive distribution: bars per sūra, hover → readout, click → filter the verse list.
  const distData = detail ? distBySura(detail.verses.map((v) => v.vk)) : [];
  const suraNameOf = (s) => { const f = detail?.verses.find((v) => +v.vk.split(":")[0] === s); return f ? verseData[f.vk]?.sn : s; };
  const shownVerses = detail ? (distSura ? detail.verses.filter((v) => +v.vk.split(":")[0] === distSura) : detail.verses) : [];

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
                      <td key={pk} onClick={c ? () => showOcc(`${h.head} ${p.disp}`, p.occ, FRAME_SPAN, { components: [{ label: h.head, root: h.root }] }) : undefined}
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
            {detail.components?.length > 0 && (
              <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
                {detail.components.map((cp, i) => cp.root ? (
                  <button type="button" key={i} className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} title={t("expr.openRoot", { root: cp.root })} onClick={() => onRoot?.(cp.root)}>⚛ {cp.label}</button>
                ) : null)}
              </div>
            )}
            {distData.length >= 2 && (() => {
              const mx = Math.max(...distData.map((x) => x.count));
              const active = distHover ?? distSura;
              return (<>
                <p className="ag-hint" style={{ minHeight: "1.4em", marginBlockEnd: 3 }}>
                  {active != null
                    ? <><b style={{ color: "var(--gold-400)", fontFamily: "var(--font-quran)" }}>{suraNameOf(active)}</b> · {t("expr.occN", { n: distData.find((x) => x.s === active)?.count || 0 })}{distSura != null && <span style={{ color: "var(--text-faint)" }}> — {t("expr.distClear")}</span>}</>
                    : t("expr.distribution")}
                </p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 38, marginBlockEnd: "var(--space-2)" }} onMouseLeave={() => setDistHover(null)}>
                  {distData.map((x) => { const on = distSura === x.s, dim = distSura != null && !on; return (
                    <button type="button" key={x.s} aria-label={`${suraNameOf(x.s)}: ${x.count}`}
                      onMouseEnter={() => setDistHover(x.s)} onFocus={() => setDistHover(x.s)} onBlur={() => setDistHover(null)}
                      onClick={() => setDistSura(on ? null : x.s)}
                      style={{ flex: 1, minWidth: 3, height: `${Math.max(8, (x.count / mx) * 100)}%`, padding: 0, border: "none", cursor: "pointer", borderRadius: 1,
                        background: on ? "var(--gold-300)" : "var(--gold-500)", opacity: dim ? 0.3 : (distHover === x.s ? 1 : 0.72), transition: "opacity .1s" }} />
                  ); })}
                </div>
              </>);
            })()}
            {detail.related?.items?.length > 0 && (<>
              <div className="ag-dist-sec-h"><span>{detail.related.label}</span></div>
              <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
                {detail.related.items.map((c, i) => (
                  <button type="button" key={i} className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }} onClick={() => openColloc(c)}>{c.verb} {c.noun} <b style={{ color: "var(--gold-400)" }}>{fmtNum(c.count)}</b></button>
                ))}
              </div>
            </>)}
            <p className="ag-hint">{t("expr.listHint")}</p>
            {shownVerses.length === 0 ? <span className="ag-dist-name">{t("expr.none")}</span> : (
              <ul className="ag-phrase-list">
                {shownVerses.slice(0, CAP).map(({ vk, hi }) => { const v = verseData[vk]; if (!v) return null; return (
                  <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                    <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                    <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      <HighlightedAyah text={v.text} highlightIndices={new Set(hi)} theme={theme} />
                    </span>
                  </button></li>
                ); })}
                {shownVerses.length > CAP && <li><span className="ag-hint">{t("expr.more", { n: shownVerses.length - CAP })}</span></li>}
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
            {rootView.collocations.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("expr.tab.collocations")}</span></div>
              <div className="ag-dist-tags">
                {rootView.collocations.map((c, i) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={i} style={{ fontFamily: "var(--font-quran)" }}
                    title={t("expr.occN", { n: c.count })} onClick={() => openColloc(c)}>
                    {c.verb} {c.noun} <b style={{ color: "var(--gold-400)" }}>{fmtNum(c.count)}</b>
                  </button>
                ))}
              </div>
            </>}
            {rootView.compounds.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("expr.tab.compounds")}</span></div>
              <div className="ag-dist-tags">
                {rootView.compounds.map((c, i) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={i} style={{ fontFamily: "var(--font-quran)" }}
                    title={t("expr.occN", { n: c.count })} onClick={() => openCompound(c)}>
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
              {renderMatrix(hs)}
            </div>
          ); })()}

          {tab === "collocations" && (() => {
            const groups = colGroups.map((g) => ({ ...g, items: g.items.filter(matchColloc) })).filter((g) => g.items.length);
            return (
              <div className="ag-dist-sec">
                <p className="ag-hint">{t("expr.collocationsHint")}</p>
                {groups.length === 0 ? <span className="ag-dist-name">{t("expr.none")}</span> : groups.map((g) => (
                  <div key={g.verb} style={{ marginBlockEnd: "var(--space-2)" }}>
                    <div className="ag-dist-sec-h"><span style={{ fontFamily: "var(--font-quran)" }}>{g.verb}</span></div>
                    <div className="ag-dist-tags">
                      {g.items.map((c, i) => (
                        <button type="button" className="ag-tag ag-tag-btn" key={i} style={{ fontFamily: "var(--font-quran)" }}
                          title={`${c.verb} ${c.noun} · ${t("expr.occN", { n: c.count })}`} onClick={() => openColloc(c)}>
                          {c.noun} <b style={{ color: "var(--gold-400)" }}>{fmtNum(c.count)}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {tab === "compounds" && (() => {
            const groups = compGroups.map((g) => ({ ...g, items: g.items.filter(matchComp) })).filter((g) => g.items.length).slice(0, CAP);
            return (
              <div className="ag-dist-sec">
                <p className="ag-hint">{t("expr.compoundsHint")}</p>
                {groups.length === 0 ? <span className="ag-dist-name">{t("expr.none")}</span> : groups.map((g) => (
                  <div key={g.head} style={{ marginBlockEnd: "var(--space-2)" }}>
                    <div className="ag-dist-sec-h"><span style={{ fontFamily: "var(--font-quran)" }}>{g.head}</span></div>
                    <div className="ag-dist-tags">
                      {g.items.map((c, i) => (
                        <button type="button" className="ag-tag ag-tag-btn" key={i} style={{ fontFamily: "var(--font-quran)" }}
                          title={`${c.words.join(" ")} · ${t("expr.occN", { n: c.count })}`} onClick={() => openCompound(c)}>
                          {c.words.slice(1).join(" ")} <b style={{ color: "var(--gold-400)" }}>{fmtNum(c.count)}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {compGroups.length > CAP && <p className="ag-hint">{t("expr.more", { n: compGroups.length - CAP })}</p>}
              </div>
            );
          })()}

          {tab === "idioms" && (
            <div className="ag-dist-sec">
              <p className="ag-hint">{t("expr.idiomsHint")}</p>
              <ul className="ag-phrase-list">
                {(expr.idioms || []).filter(matchIdiom).slice(0, CAP).map((it, i) => (
                  <li key={i}>
                    <button type="button" className="ag-modal-row" disabled={it.count === 0}
                      style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline", opacity: it.count === 0 ? 0.5 : 1 }}
                      title={t("expr.occN", { n: it.count })}
                      onClick={() => showOcc(it.display, it.occ, spanRun(it.len || it.skeleton.split(" ").length))}>
                      <span style={{ fontFamily: "var(--font-quran)", flex: 1 }}>{it.display}</span>
                      <span className="ag-dist-num" style={{ color: "var(--gold-400)", flexShrink: 0 }}>{fmtNum(it.count)}</span>
                    </button>
                  </li>
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
