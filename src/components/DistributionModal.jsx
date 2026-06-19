import { useMemo, useState } from "react";
import { distributionBySura, collocations, directNeighbors } from "../analytics/stats.js";
import { exportCsvFile, exportJsonFile, exportTextFile, buildResultBibtex } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { fColor } from "../theme.js";

/* ═══ Distribution + collocation modal ═══
 *
 * Pure Qur'an-internal stats for a word/lemma/root: how it spreads across the
 * sūrahs (bar list) and which content words it co-occur with inside verses
 * (ranked). Both panels are interactive — a sūrah row opens the list of its
 * āyāt where the term occurs; a neighbour chip opens that word's verses — and
 * exportable to CSV. `dist = { lookup, label, mode }`.
 */
// Ranking of the neighbour list: raw shared-verse count, or one of two
// association measures that correct for how common each word is on its own.
// Labels/titles are resolved per id via t() inside the component (hook scope).
const COLLOC_SORT_IDS = ["count", "ll", "pmi"];
// Which side of the term the direct-neighbour list ranks by.
const NBR_SIDE_IDS = ["before", "after", "both"];

export function DistributionModal({ dist, index, verseData, surahList, stopSet, theme, onSurah, onPick, onCompare, onClose }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [collocSort, setCollocSort] = useState("ll");
  const [nbrSide, setNbrSide] = useState("both");
  const [nbrCross, setNbrCross] = useState(false); // span the āya boundary (recited flow)
  const data = useMemo(() => {
    if (!dist) return null;
    const distribution = distributionBySura(dist.lookup, index, verseData, surahList, dist.mode).filter((d) => d.count > 0);
    const colloc = collocations(dist.lookup, dist.mode, index, verseData, stopSet, 99, { sort: collocSort }).slice(0, 60);
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const max = distribution.reduce((m, d) => Math.max(m, d.count), 1);
    return { distribution, colloc, total, max };
  }, [dist, index, verseData, surahList, stopSet, collocSort]);
  // Adjacency is position-aware but side-independent to compute, so build the full
  // before/after table once and re-rank per side without rescanning the corpus.
  const nbrAll = useMemo(() => (dist ? directNeighbors(dist.lookup, dist.mode, index, verseData, { crossVerse: nbrCross }) : []), [dist, index, verseData, nbrCross]);
  const neighbors = useMemo(() => {
    const metric = nbrSide === "before" ? (n) => n.before : nbrSide === "after" ? (n) => n.after : (n) => n.total;
    return nbrAll.filter((n) => metric(n) > 0).sort((x, y) => metric(y) - metric(x) || x.key.localeCompare(y.key)).slice(0, 60);
  }, [nbrAll, nbrSide]);

  if (!dist || !data) return null;
  const { distribution, colloc, total, max } = data;
  // The association figure shown on each chip tracks the active sort.
  const metricOf = (c) => collocSort === "pmi" ? c.pmi : collocSort === "ll" ? c.ll : null;
  const fmtMetric = (v) => (v == null ? "" : Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));
  // The number shown bold on each neighbour chip = the active side's count.
  const nbrCount = (n) => (nbrSide === "before" ? n.before : nbrSide === "after" ? n.after : n.total);

  return (
    <ModalShell open={!!dist} share onClose={onClose} closeLabel={t("dist.close")}
      ariaLabel={t("dist.title", { label: dist.label })}
      title={<>
        <span className={"ag-badge " + (dist.mode === "root" ? "t-root" : dist.mode === "lemma" ? "t-lemma" : "t-word")}>{t("dist.badge." + (dist.mode === "exact" ? "word" : dist.mode))}</span>
        <h2 className="ag-modal-word">{dist.label}</h2>
        <span className="ag-modal-count"><b>{total}</b> {t("dist.in")} <b>{distribution.length}</b> {t("dist.surahs")}</span>
      </>}
      actions={<>
            <button type="button" className="ag-btn" title={t("ws.saveTitle")} onClick={() => { ws.saveItem({ type: "dist", title: dist.label, payload: { lookup: dist.lookup, label: dist.label, mode: dist.mode } }); ws.toast(t("ws.saved")); }}>★</button>
            {onCompare && <button type="button" className="ag-btn" title={t("dist.compareTitle")} onClick={() => onCompare({ lookup: dist.lookup, label: dist.label, mode: dist.mode })}>⇄ {t("dist.compare")}</button>}
            <button type="button" className="ag-btn" title={t("dist.exportJson")}
              onClick={() => exportJsonFile({
                term: dist.label, mode: dist.mode, total, surahCount: distribution.length, collocationSort: collocSort,
                distribution: distribution.map((d) => ({ sura: d.sura, name: d.name, count: d.count })),
                collocations: colloc.map((c) => ({ word: c.label, sharedVerses: c.count, pmi: c.pmi, logLikelihood: c.ll })),
              }, t("dist.fileAnalysis", { label: dist.label }))}>⤓ JSON</button>
            <button type="button" className="ag-btn" title={t("common.cite.resultTitle")}
              onClick={() => {
                const bib = buildResultBibtex({
                  key: `ayatnet_dist_${(dist.lookup || "term").replace(/[^A-Za-z0-9؀-ۿ]/g, "").slice(0, 16)}`,
                  title: t("common.cite.distTitle", { label: dist.label, mode: t(`common.graphMode.${dist.mode}`) }),
                  note: t("common.cite.note", { count: total }),
                  url: typeof location !== "undefined" ? location.href : "",
                  year: new Date().getFullYear(), keywords: [dist.lookup, dist.label],
                });
                exportTextFile(bib, `cite-dist-${dist.lookup || "term"}.bib`, "application/x-bibtex");
              }}>⧉ {t("common.cite.cite")}</button>
      </>}>
        <div className="ag-dist-body">
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("dist.bySurah")}</span>
              <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("dist.colSurah"), t("dist.colName"), t("dist.colCount")], ...distribution.map((d) => [d.sura, d.name, d.count])], t("dist.fileDistribution", { label: dist.label }))}>⤓ CSV</button>
            </div>
            <p className="ag-hint">{t("dist.clickSurahHint")}</p>
            <div className="ag-dist-row ag-dist-head">
              <span className="ag-dist-name">{t("dist.colSurah")}</span>
              <span className="ag-dist-num">{t("dist.colCount")}</span>
              <span />
            </div>
            <div className="ag-dist-bars">
              {distribution.map((d) => (
                <button type="button" className="ag-dist-row ag-dist-rowbtn" key={d.sura}
                  onClick={() => onSurah?.(d.sura, d.name)} title={t("dist.showInSurah", { count: d.count, name: d.name })}>
                  <span className="ag-dist-name">{d.sura}. {d.name}</span>
                  <span className="ag-dist-num">{d.count}</span>
                  <span className="ag-dist-barwrap"><span className="ag-dist-bar" style={{ width: `${(d.count / max) * 100}%`, background: fColor(d.count, theme) }} /></span>
                </button>
              ))}
            </div>
          </div>

          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("dist.collocates")}</span>
              <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("dist.colWord"), t("dist.colShared"), "PMI", "G²"], ...colloc.map((c) => [c.label, c.count, c.pmi.toFixed(3), c.ll.toFixed(3)])], t("dist.fileColloc", { label: dist.label }))}>⤓ CSV</button>
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

          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("nbr.title")}</span>
              <button type="button" data-export className="ag-btn" title={t("nbr.exportCsv")}
                onClick={() => exportCsvFile([[t("nbr.colWord"), t("nbr.colBefore"), t("nbr.colAfter"), t("nbr.colTotal")], ...neighbors.map((n) => [n.label, n.before, n.after, n.total])], t("nbr.file", { label: dist.label }))}>⤓ CSV</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBlockEnd: "var(--space-2)" }}>
              <div className="ag-seg ag-seg-sm" role="group" aria-label={t("nbr.title")}>
                {NBR_SIDE_IDS.map((id) => (
                  <button type="button" key={id} className={nbrSide === id ? "is-on" : ""} title={t(`nbr.side.${id}.title`)}
                    aria-pressed={nbrSide === id} onClick={() => setNbrSide(id)}>{t(`nbr.side.${id}.label`)}</button>
                ))}
              </div>
              <div className="ag-seg ag-seg-sm" role="group" aria-label={t("nbr.cross.label")}>
                <button type="button" className={nbrCross ? "" : "is-on"} aria-pressed={!nbrCross} onClick={() => setNbrCross(false)} title={t("nbr.cross.withinTitle")}>{t("nbr.cross.within")}</button>
                <button type="button" className={nbrCross ? "is-on" : ""} aria-pressed={nbrCross} onClick={() => setNbrCross(true)} title={t("nbr.cross.title")}>{t("nbr.cross.label")}</button>
              </div>
            </div>
            <p className="ag-hint">{t("nbr.hint", { label: dist.label })}</p>
            <div className="ag-dist-tags">
              {neighbors.length === 0 ? <span className="ag-dist-name">{t("nbr.none")}</span> : neighbors.map((n) => (
                <button type="button" className="ag-tag ag-tag-btn" key={n.key} onClick={() => onPick?.(n.key, n.label)}
                  title={t("nbr.chipTitle", { label: n.label, before: n.before, after: n.after, total: n.total })}>
                  {n.label} <b style={{ color: "var(--gold-400)" }}>{nbrCount(n)}</b>
                  {nbrSide === "both" && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{n.before}·{n.after}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
    </ModalShell>
  );
}
