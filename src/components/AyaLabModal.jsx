import { useEffect, useMemo, useState } from "react";
import { verseProfile, similarVerses } from "../analytics/verse.js";
import { verseDiff } from "../analytics/diff.js";
import { verseAntithesis } from "../analytics/relations.js";
import { formRoman } from "../morphology.js";
import { exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Āya analysis lab ═══
 *
 * A focused report on ONE verse — its fingerprint (Overview) and the verses lexically
 * closest to it by shared roots (Similar). Interaction is deliberately flat: clicking any
 * verse reference just shows that verse's text in the sticky preview at the foot of the
 * dialog (read in place — no graph jump, no cascade of modals); only the explicit ⌖ jumps
 * the graph. `aya = { centerKey, back? }`.
 */
const TABS = ["overview", "similar"];

export function AyaLabModal({ aya, verseData, r2v, morph, relations, onBack, onNavigate, onRoot, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("overview");
  const [preview, setPreview] = useState(null); // verse key shown in the inline preview
  const [showDiff, setShowDiff] = useState(false); // diff the preview against the centre verse
  const centerKey = aya?.centerKey;
  const v = centerKey ? verseData[centerKey] : null;
  // Word-level diff of the previewed verse against the centre (only when they differ).
  const diff = useMemo(() => (preview && preview !== centerKey ? verseDiff(centerKey, preview, verseData) : null), [preview, centerKey, verseData]);

  const profile = useMemo(() => (centerKey ? verseProfile(centerKey, verseData, r2v, morph) : null), [centerKey, verseData, r2v, morph]);
  const antithesis = useMemo(() => (centerKey && relations ? verseAntithesis(centerKey, relations) : []), [centerKey, relations]);
  const [sim, setSim] = useState(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setPreview(centerKey || null); }, [centerKey]); // preview follows the centre verse
  useEffect(() => {
    if (!centerKey) { setSim([]); return undefined; }
    setSim(null);
    let alive = true;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => { const r = similarVerses(centerKey, verseData, r2v, { topN: 40 }); if (alive) setSim(r); }, { timeout: 300 });
    return () => { alive = false; cic(id); };
  }, [centerKey, verseData, r2v]);

  if (!aya || !v) return null;
  const ref = `${v.s}:${v.a}`;
  const navTo = (vk) => { const [s, a] = vk.split(":").map(Number); onNavigate?.(s, a); };
  const pv = preview ? verseData[preview] : null;

  return (
    <ModalShell open={!!aya} onClose={onClose} closeLabel={t("aya.close")}
      ariaLabel={t("aya.title", { ref })}
      aiContext={() => [
        { id: "aya:" + ref, kind: "verse", title: t("ai.attach.verse", { v: ref }), payload: { ref, surahName: v.sn, text: v.text } },
        { id: "aya-an:" + ref, kind: "note", title: t("aya.title", { ref }),
          payload: { title: t("aya.title", { ref }), data: { profile, antithesis, similar: (sim || []).map((s) => ({ verse: s.vk, score: +(+s.score).toFixed(3), shared: [...new Set(s.shared || [])] })) } } },
      ]}
      title={<>
        {aya.back && <button type="button" className="ag-btn" title={t("aya.back")} onClick={onBack} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-verse">{ref}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{v.sn}</h2>
      </>}
      actions={profile && <button type="button" className="ag-btn" onClick={() => exportJsonFile({ ...profile, similar: (sim || []).map((s) => ({ verse: s.vk, score: +s.score.toFixed(3), shared: [...new Set(s.shared)] })) }, `aya-${v.s}-${v.a}.json`)}>⤓ JSON</button>}>
      <div className="ag-dist-body">
        <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("aya.title", { ref })} style={{ marginBlockEnd: "var(--space-3)" }}>
          {TABS.map((id) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{t(`aya.tab.${id}`)}</button>)}
        </div>

        {tab === "overview" && profile && (
          <div className="ag-dist-sec">
            <p className="ag-hint">{t("aya.overviewHint")}</p>
            <div className="ag-dist-bars">
              <div className="ag-dist-row"><span className="ag-dist-name">{t("aya.words")}</span><span className="ag-dist-num">{fmtNum(profile.wordCount)}</span><span /></div>
              <div className="ag-dist-row"><span className="ag-dist-name">{t("aya.letters")}</span><span className="ag-dist-num">{fmtNum(profile.letterCount)}</span><span /></div>
              <div className="ag-dist-row"><span className="ag-dist-name">{t("aya.roots")}</span><span className="ag-dist-num">{fmtNum(profile.rootCount)}</span><span /></div>
              {profile.rhyme && <div className="ag-dist-row"><span className="ag-dist-name">{t("aya.rhyme")}</span><span className="ag-dist-num" style={{ fontFamily: "var(--font-quran)" }}>{profile.rhyme}</span><span /></div>}
            </div>
            {profile.posBreakdown.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("aya.pos")}</span></div>
              <div className="ag-dist-tags">
                {profile.posBreakdown.map((p) => <span className="ag-tag" key={p.pos}>{t(`common.morph.pos.${p.pos}`)} <b style={{ color: "var(--gold-400)" }}>{p.count}</b></span>)}
              </div>
            </>}
            {profile.forms.length > 0 && <p className="ag-hint" style={{ marginBlockStart: "var(--space-2)" }}>{t("aya.forms")}: {profile.forms.map(formRoman).join("، ")}</p>}
            {profile.rarestRoots.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("aya.rarest")}</span></div>
              <p className="ag-hint">{t("aya.rarestHint")}</p>
              <div className="ag-dist-tags">{profile.rarestRoots.map((r) => (
                <button type="button" className="ag-tag ag-tag-btn" key={r.root} onClick={() => onRoot?.(r.root)} title={t(r.freq <= 1 ? "aya.rootUnique" : "aya.rootFreqGo", { n: r.freq })}>
                  {r.root} <b style={{ color: "var(--gold-400)" }}>{fmtNum(r.freq)}</b>
                </button>))}
              </div>
            </>}
            {antithesis.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("aya.antithesis")}</span></div>
              <p className="ag-hint">{t("aya.antithesisHint")}</p>
              <ul className="ag-phrase-list">
                {antithesis.map((c, i) => {
                  const partner = c.verses.filter((vk) => vk !== centerKey); // the other āya(ʾ) of the contrast
                  return (
                    <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-quran)" }}>
                        <button type="button" className="ag-tag ag-tag-btn" onClick={() => onRoot?.(c.a)}>{c.a}</button>
                        <span style={{ color: "var(--text-faint)", margin: "0 4px" }}>↔</span>
                        <button type="button" className="ag-tag ag-tag-btn" onClick={() => onRoot?.(c.b)}>{c.b}</button>
                      </span>
                      {partner.length > 0 && <span style={{ display: "flex", gap: 3 }}>{partner.map((vk) => {
                        const [s, a] = vk.split(":");
                        return <button type="button" className="ag-tag ag-tag-btn" key={vk} onClick={() => setPreview(vk)} title={t("aya.antithesisVerse")}>{`${s}:${a}`}</button>;
                      })}</span>}
                    </span></li>
                  );
                })}
              </ul>
            </>}
          </div>
        )}

        {tab === "similar" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("aya.similar")}</span></div>
            <p className="ag-hint">{t("aya.similarHint")}</p>
            {sim == null ? <span className="ag-dist-name">{t("aya.computing")}</span>
              : sim.length === 0 ? <span className="ag-dist-name">{t("aya.noSimilar")}</span> : (
                <ul className="ag-phrase-list">
                  {sim.map((s) => {
                    const ov = verseData[s.vk]; if (!ov) return null;
                    return (
                      <li key={s.vk} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button type="button" className={"ag-modal-row" + (preview === s.vk ? " is-on" : "")} style={{ flex: 1 }} onClick={() => setPreview(s.vk)} title={t("aya.similarClick")} aria-pressed={preview === s.vk}>
                          <span className="ag-ayah-ref"><span className="ag-ayah-surah">{ov.sn}</span><span className="ag-ayah-num">{fmtNum(ov.a)}</span></span>
                          <span className="ag-modal-text" style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", flex: 1 }}>{[...new Set(s.shared)].slice(0, 8).join("، ")}</span>
                          <span className="ag-dist-num" style={{ color: "var(--gold-400)" }}>{Math.round(s.score * 100)}%</span>
                        </button>
                        <button type="button" className="ag-btn" title={t("aya.goTo")} aria-label={t("aya.goTo")} onClick={() => navTo(s.vk)}>⌖</button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        )}

        {/* Sticky inline preview — clicking any verse fills this; read in place, ⌖ to jump.
            Opaque background + shadow so it sits above the list, not through it. */}
        {pv && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, marginBlockStart: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--ink-800)", borderBlockStart: "2px solid var(--gold-500)", borderRadius: "var(--radius-sm)", boxShadow: "0 -10px 22px -10px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="ag-ayah-ref"><span className="ag-ayah-surah">{pv.sn}</span><span className="ag-ayah-num">{fmtNum(pv.a)}</span></span>
              <span style={{ display: "flex", gap: 4 }}>
                {diff && <button type="button" className={"ag-btn" + (showDiff ? " is-on" : "")} aria-pressed={showDiff} title={t("aya.diffTitle", { ref: `${v.s}:${v.a}` })} onClick={() => setShowDiff((x) => !x)}>⇄ {t("aya.diff")}</button>}
                <button type="button" className="ag-btn is-gold" title={t("aya.goTo")} onClick={() => navTo(preview)}>⌖ {t("aya.goTo")}</button>
                <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} style={{ width: 26, height: 26 }} onClick={() => setPreview(null)}>✕</button>
              </span>
            </div>
            {showDiff && diff ? (
              <div style={{ marginBlockStart: 4 }}>
                {diff.identical
                  ? <p className="ag-hint">{t("aya.diffIdentical", { ref: `${v.s}:${v.a}` })}</p>
                  : <p className="ag-hint">{t("aya.diffLegend", { ref: `${v.s}:${v.a}`, other: `${pv.s}:${pv.a}` })}</p>}
                <div className="ag-modal-text" dir="rtl" style={{ fontFamily: "var(--font-quran)", marginBlockStart: 4, lineHeight: 2 }}>
                  {diff.ops.map((o, i) => o.type === "same"
                    ? <span key={i}>{o.b.orig} </span>
                    : o.type === "del"
                      ? <span key={i} title={t("aya.diffInCentre", { ref: `${v.s}:${v.a}` })} style={{ color: "var(--gold-400)", textDecoration: "line-through", opacity: 0.8 }}>{o.a.orig} </span>
                      : <span key={i} title={t("aya.diffInOther", { ref: `${pv.s}:${pv.a}` })} style={{ color: "var(--teal-400, #3fb6a8)", fontWeight: 700 }}>{o.b.orig} </span>)}
                </div>
              </div>
            ) : (
              <div className="ag-modal-text" dir="rtl" style={{ fontFamily: "var(--font-quran)", marginBlockStart: 4, lineHeight: 1.9 }}>{pv.words.map((w) => w.orig).join(" ")}</div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
