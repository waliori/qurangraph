import { useMemo, useRef, useState } from "react";
import { distributionBySura, collocations } from "../analytics/stats.js";
import { exportCsvFile, exportJsonFile } from "../graph/exportGraph.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { fColor } from "../theme.js";

/* ═══ Distribution + collocation modal ═══
 *
 * Pure Qur'an-internal stats for a word/lemma/root: how it spreads across the
 * sūrahs (bar list) and which content words it co-occur with inside verses
 * (ranked). Both panels are interactive — a sūrah row jumps the graph to the
 * term's first occurrence there; a neighbour chip opens that word's verses — and
 * exportable to CSV. `dist = { lookup, label, mode }`.
 */
// Ranking of the neighbour list: raw shared-verse count, or one of two
// association measures that correct for how common each word is on its own.
// Labels/titles are resolved per id via t() inside the component (hook scope).
const COLLOC_SORT_IDS = ["count", "ll", "pmi"];

export function DistributionModal({ dist, index, verseData, surahList, stopSet, theme, onNavigate, onPick, onCompare, onClose }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [collocSort, setCollocSort] = useState("ll");
  const data = useMemo(() => {
    if (!dist) return null;
    const distribution = distributionBySura(dist.lookup, index, verseData, surahList, dist.mode).filter((d) => d.count > 0);
    const colloc = collocations(dist.lookup, dist.mode, index, verseData, stopSet, 99, { sort: collocSort }).slice(0, 60);
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const max = distribution.reduce((m, d) => Math.max(m, d.count), 1);
    // First occurrence of the term in each sūrah → lets a row jump the graph there.
    const firstInSura = {};
    for (const vk of index[dist.lookup] || []) { const s = verseData[vk]?.s; if (s != null && !firstInSura[s]) firstInSura[s] = vk; }
    return { distribution, colloc, total, max, firstInSura };
  }, [dist, index, verseData, surahList, stopSet, collocSort]);

  const dialogRef = useRef(null);
  useModalFocus(!!dist, dialogRef, { onEscape: onClose });

  if (!dist || !data) return null;
  const { distribution, colloc, total, max, firstInSura } = data;
  // The association figure shown on each chip tracks the active sort.
  const metricOf = (c) => collocSort === "pmi" ? c.pmi : collocSort === "ll" ? c.ll : null;
  const fmtMetric = (v) => (v == null ? "" : Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={t("dist.title", { label: dist.label })} ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            <span className={"ag-badge " + (dist.mode === "root" ? "t-root" : dist.mode === "lemma" ? "t-lemma" : "t-word")}>{t("dist.badge." + dist.mode)}</span>
            <h2 className="ag-modal-word">{dist.label}</h2>
            <span className="ag-modal-count"><b>{total}</b> {t("dist.in")} <b>{distribution.length}</b> {t("dist.surahs")}</span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <button type="button" className="ag-btn" title={t("ws.saveTitle")} onClick={() => { ws.saveItem({ type: "dist", title: dist.label, payload: { lookup: dist.lookup, label: dist.label, mode: dist.mode } }); ws.toast(t("ws.saved")); }}>★</button>
            {onCompare && <button type="button" className="ag-btn" title={t("dist.compareTitle")} onClick={() => onCompare({ lookup: dist.lookup, label: dist.label, mode: dist.mode })}>⇄ {t("dist.compare")}</button>}
            <button type="button" className="ag-btn" title={t("dist.exportJson")}
              onClick={() => exportJsonFile({
                term: dist.label, mode: dist.mode, total, surahCount: distribution.length, collocationSort: collocSort,
                distribution: distribution.map((d) => ({ sura: d.sura, name: d.name, count: d.count })),
                collocations: colloc.map((c) => ({ word: c.label, sharedVerses: c.count, pmi: c.pmi, logLikelihood: c.ll })),
              }, t("dist.fileAnalysis", { label: dist.label }))}>⤓ JSON</button>
            <button type="button" className="ag-iconbtn" aria-label={t("dist.close")} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="ag-dist-body">
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("dist.bySurah")}</span>
              <button type="button" className="ag-btn" onClick={() => exportCsvFile([[t("dist.colSurah"), t("dist.colName"), t("dist.colCount")], ...distribution.map((d) => [d.sura, d.name, d.count])], t("dist.fileDistribution", { label: dist.label }))}>⤓ CSV</button>
            </div>
            <p className="ag-hint">{t("dist.clickSurahHint")}</p>
            <div className="ag-dist-row ag-dist-head">
              <span className="ag-dist-name">{t("dist.colSurah")}</span>
              <span className="ag-dist-num">{t("dist.colCount")}</span>
              <span />
            </div>
            <div className="ag-dist-bars">
              {distribution.map((d) => {
                const vk = firstInSura[d.sura]; const v = vk && verseData[vk];
                return (
                  <button type="button" className="ag-dist-row ag-dist-rowbtn" key={d.sura}
                    onClick={() => v && onNavigate?.(v.s, v.a)} title={v ? t("dist.jumpTo", { name: d.name, ayah: v.a }) : undefined}>
                    <span className="ag-dist-name">{d.sura}. {d.name}</span>
                    <span className="ag-dist-num">{d.count}</span>
                    <span className="ag-dist-barwrap"><span className="ag-dist-bar" style={{ width: `${(d.count / max) * 100}%`, background: fColor(d.count, theme) }} /></span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("dist.collocates")}</span>
              <button type="button" className="ag-btn" onClick={() => exportCsvFile([[t("dist.colWord"), t("dist.colShared"), "PMI", "G²"], ...colloc.map((c) => [c.label, c.count, c.pmi.toFixed(3), c.ll.toFixed(3)])], t("dist.fileColloc", { label: dist.label }))}>⤓ CSV</button>
            </div>
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("dist.sortGroup")} style={{ marginBlockEnd: "var(--space-2)" }}>
              {COLLOC_SORT_IDS.map((id) => (
                <button type="button" key={id} className={collocSort === id ? "is-on" : ""} title={t(`dist.sort.${id}.title`)}
                  aria-pressed={collocSort === id} onClick={() => setCollocSort(id)}>{t(`dist.sort.${id}.label`)}</button>
              ))}
            </div>
            <p className="ag-hint">
              {collocSort === "count"
                ? <>{t("dist.hintCount", { label: dist.label })}</>
                : collocSort === "ll"
                ? <>{t("dist.hintLl.a")}<b>{t("dist.hintLl.b1")}</b>{t("dist.hintLl.mid")}<b>{t("dist.hintLl.b2")}</b>{t("dist.hintLl.c")}</>
                : <>{t("dist.hintPmi.a")}<b>{t("dist.hintPmi.b1")}</b>{t("dist.hintPmi.mid")}<b>{t("dist.hintPmi.b2")}</b>{t("dist.hintPmi.c")}</>}
            </p>
            <div className="ag-dist-tags">
              {colloc.length === 0 ? <span className="ag-dist-name">{t("dist.none")}</span> : colloc.map((c) => {
                const mv = metricOf(c);
                return (
                  <button type="button" className="ag-tag ag-tag-btn" key={c.key} onClick={() => onPick?.(c.key, c.label)}
                    title={t("dist.chipTitle", { label: c.label, count: c.count, pmi: c.pmi.toFixed(2), ll: c.ll.toFixed(1) })}>
                    {c.label} <b style={{ color: "var(--gold-400)" }}>{c.count}</b>
                    {mv != null && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{fmtMetric(mv)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
