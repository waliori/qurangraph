import { useEffect, useMemo, useState } from "react";
import { verseProfile, similarVerses } from "../analytics/verse.js";
import { formRoman } from "../morphology.js";
import { exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Āya analysis lab ═══
 *
 * The verse-level complement to the word lab: a structural/lexical fingerprint of one āya
 * (Overview) and the āyāt most lexically similar to it by shared roots (Similar verses) —
 * the non-verbatim counterpart to mutashābihāt. `aya = { centerKey, back? }`. A similar
 * verse re-targets the lab onto itself (with a back step) so exploration stays in-dialog;
 * a separate ⌖ jumps the graph to it. Quick-links open the verse's phrases/rhyme/context.
 */
const TABS = ["overview", "similar"];

export function AyaLabModal({ aya, verseData, r2v, morph, onRetarget, onBack, onNavigate, onRoot, onPhrases, onRhyme, onContext, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("overview");
  const centerKey = aya?.centerKey;
  const v = centerKey ? verseData[centerKey] : null;

  const profile = useMemo(() => (centerKey ? verseProfile(centerKey, verseData, r2v, morph) : null), [centerKey, verseData, r2v, morph]);
  // similarVerses scans every verse sharing a root — defer to idle so the dialog paints first.
  const [sim, setSim] = useState(null);
  /* eslint-disable react-hooks/set-state-in-effect */
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

  return (
    <ModalShell open={!!aya} onClose={onClose} closeLabel={t("aya.close")}
      ariaLabel={t("aya.title", { ref })}
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

        {/* quick links to the verse's other views */}
        <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-3)" }}>
          <button type="button" className="ag-btn" onClick={() => onPhrases?.(centerKey)}>⧉ {t("common.insp.phrasesShort")}</button>
          <button type="button" className="ag-btn" onClick={() => onRhyme?.(centerKey)}>♪ {t("common.insp.rhyme")}</button>
          <button type="button" className="ag-btn" onClick={() => onContext?.(centerKey)}>☰ {t("common.insp.context")}</button>
          <button type="button" className="ag-btn is-gold" onClick={() => navTo(centerKey)}>⌖ {t("common.insp.makeCenter")}</button>
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
            {profile.uniqueRoots.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("aya.unique")}</span></div>
              <p className="ag-hint">{t("aya.uniqueHint")}</p>
              <div className="ag-dist-tags">{profile.uniqueRoots.map((r) => <button type="button" className="ag-tag ag-tag-btn" key={r} onClick={() => onRoot?.(r)}>{r}</button>)}</div>
            </>}
            {profile.rarestRoots.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("aya.rarest")}</span></div>
              <div className="ag-dist-tags">{profile.rarestRoots.map((r) => <button type="button" className="ag-tag ag-tag-btn" key={r.root} onClick={() => onRoot?.(r.root)} title={t("aya.rootFreq", { n: r.freq })}>{r.root} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{r.freq}</span></button>)}</div>
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
                        <button type="button" className="ag-modal-row" style={{ flex: 1 }} onClick={() => onRetarget?.(s.vk)} title={t("aya.openRow")}>
                          <span className="ag-ayah-ref"><span className="ag-ayah-surah">{ov.sn}</span><span className="ag-ayah-num">{ov.a}</span></span>
                          <span className="ag-modal-text" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                            <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{[...new Set(s.shared)].slice(0, 8).join("، ")}</span>
                          </span>
                          <span className="ag-dist-num" style={{ color: "var(--gold-400)" }}>{Math.round(s.score * 100)}%</span>
                        </button>
                        <button type="button" className="ag-btn" title={t("common.insp.makeCenter")} aria-label={t("common.insp.makeCenter")} onClick={() => navTo(s.vk)}>⌖</button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
