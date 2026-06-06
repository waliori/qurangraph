import { useMemo } from "react";
import { distributionBySura, collocations } from "../analytics/stats.js";
import { exportCsvFile } from "../graph/exportGraph.js";
import { fColor } from "../theme.js";

/* ═══ Distribution + collocation modal ═══
 *
 * Pure Qur'an-internal stats for a word/lemma/root: how it spreads across the
 * sūrahs (bar list) and which content words it co-occur with inside verses
 * (ranked). Both panels are interactive — a sūrah row jumps the graph to the
 * term's first occurrence there; a neighbour chip opens that word's verses — and
 * exportable to CSV. `dist = { lookup, label, mode }`.
 */
export function DistributionModal({ dist, index, verseData, surahList, stopSet, theme, onNavigate, onPick, onClose }) {
  const data = useMemo(() => {
    if (!dist) return null;
    const distribution = distributionBySura(dist.lookup, index, verseData, surahList).filter((d) => d.count > 0);
    const colloc = collocations(dist.lookup, dist.mode, index, verseData, stopSet).slice(0, 60);
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const max = distribution.reduce((m, d) => Math.max(m, d.count), 1);
    // First occurrence of the term in each sūrah → lets a row jump the graph there.
    const firstInSura = {};
    for (const vk of index[dist.lookup] || []) { const s = verseData[vk]?.s; if (s != null && !firstInSura[s]) firstInSura[s] = vk; }
    return { distribution, colloc, total, max, firstInSura };
  }, [dist, index, verseData, surahList, stopSet]);

  if (!dist || !data) return null;
  const { distribution, colloc, total, max, firstInSura } = data;

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={`توزيع ${dist.label}`} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            <span className={"ag-badge " + (dist.mode === "root" ? "t-root" : dist.mode === "lemma" ? "t-lemma" : "t-word")}>{dist.mode === "root" ? "جذر" : dist.mode === "lemma" ? "صيغة" : "كلمة"}</span>
            <h2 className="ag-modal-word">{dist.label}</h2>
            <span className="ag-modal-count"><b>{total}</b> في <b>{distribution.length}</b> سورة</span>
          </div>
          <button type="button" className="ag-iconbtn" aria-label="إغلاق" onClick={onClose}>✕</button>
        </div>

        <div className="ag-dist-body">
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>التوزيع حسب السورة</span>
              <button type="button" className="ag-btn" onClick={() => exportCsvFile([["السورة", "الاسم", "العدد"], ...distribution.map((d) => [d.sura, d.name, d.count])], `توزيع-${dist.label}.csv`)}>⤓ CSV</button>
            </div>
            <p className="ag-hint">اضغط سورة لتنتقل إلى أول ورودٍ فيها.</p>
            <div className="ag-dist-row ag-dist-head">
              <span className="ag-dist-name">السورة</span>
              <span className="ag-dist-num">العدد</span>
              <span />
            </div>
            <div className="ag-dist-bars">
              {distribution.map((d) => {
                const vk = firstInSura[d.sura]; const v = vk && verseData[vk];
                return (
                  <button type="button" className="ag-dist-row ag-dist-rowbtn" key={d.sura}
                    onClick={() => v && onNavigate?.(v.s, v.a)} title={v ? `انتقل إلى ${d.name} ${v.a}` : undefined}>
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
              <span>الكلمات المجاورة (داخل الآية)</span>
              <button type="button" className="ag-btn" onClick={() => exportCsvFile([["الكلمة", "العدد"], ...colloc.map((c) => [c.label, c.count])], `مجاورات-${dist.label}.csv`)}>⤓ CSV</button>
            </div>
            <p className="ag-hint">الكلمات التي ترد في نفس آيات «{dist.label}»، والعدد هو الآيات المشتركة — اضغط كلمة لعرض آياتها.</p>
            <div className="ag-dist-tags">
              {colloc.length === 0 ? <span className="ag-dist-name">لا توجد</span> : colloc.map((c) => (
                <button type="button" className="ag-tag ag-tag-btn" key={c.key} onClick={() => onPick?.(c.key, c.label)} title={`عرض آيات «${c.label}»`}>
                  {c.label} <b style={{ color: "var(--gold-400)" }}>{c.count}</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
