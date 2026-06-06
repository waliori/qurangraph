import { useMemo, useState } from "react";
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
// Ranking of the neighbour list: raw shared-verse count, or one of two
// association measures that correct for how common each word is on its own.
const COLLOC_SORTS = [
  { id: "count", label: "العدد", title: "ترتيب حسب عدد الآيات المشتركة" },
  { id: "ll", label: "الدلالة", title: "دلالة إحصائية (Dunning G²): التلازم الموثَّق المتكرّر الذي لا تفسّره الصدفة — لا تضخّم النادر" },
  { id: "pmi", label: "PMI", title: "المعلومات المتبادلة النقطية: نسبة المفاجأة — تبرز الاقترانات النادرة الحصرية، وقد تضخّم ما ورد مرّةً" },
];

export function DistributionModal({ dist, index, verseData, surahList, stopSet, theme, onNavigate, onPick, onClose }) {
  const [collocSort, setCollocSort] = useState("ll");
  const data = useMemo(() => {
    if (!dist) return null;
    const distribution = distributionBySura(dist.lookup, index, verseData, surahList).filter((d) => d.count > 0);
    const colloc = collocations(dist.lookup, dist.mode, index, verseData, stopSet, 99, { sort: collocSort }).slice(0, 60);
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const max = distribution.reduce((m, d) => Math.max(m, d.count), 1);
    // First occurrence of the term in each sūrah → lets a row jump the graph there.
    const firstInSura = {};
    for (const vk of index[dist.lookup] || []) { const s = verseData[vk]?.s; if (s != null && !firstInSura[s]) firstInSura[s] = vk; }
    return { distribution, colloc, total, max, firstInSura };
  }, [dist, index, verseData, surahList, stopSet, collocSort]);

  if (!dist || !data) return null;
  const { distribution, colloc, total, max, firstInSura } = data;
  // The association figure shown on each chip tracks the active sort.
  const metricOf = (c) => collocSort === "pmi" ? c.pmi : collocSort === "ll" ? c.ll : null;
  const fmtMetric = (v) => (v == null ? "" : Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));

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
              <button type="button" className="ag-btn" onClick={() => exportCsvFile([["الكلمة", "الآيات المشتركة", "PMI", "G²"], ...colloc.map((c) => [c.label, c.count, c.pmi.toFixed(3), c.ll.toFixed(3)])], `مجاورات-${dist.label}.csv`)}>⤓ CSV</button>
            </div>
            <div className="ag-seg ag-seg-sm" role="group" aria-label="ترتيب المجاورات" style={{ marginBlockEnd: "var(--space-2)" }}>
              {COLLOC_SORTS.map((s) => (
                <button type="button" key={s.id} className={collocSort === s.id ? "is-on" : ""} title={s.title}
                  aria-pressed={collocSort === s.id} onClick={() => setCollocSort(s.id)}>{s.label}</button>
              ))}
            </div>
            <p className="ag-hint">
              {collocSort === "count"
                ? <>الكلمات التي ترد في نفس آيات «{dist.label}»، والعدد هو الآيات المشتركة — اضغط كلمة لعرض آياتها.</>
                : collocSort === "ll"
                ? <>مرتّبة حسب <b>دلالة التلازم إحصائيًّا</b> (نسبة الأرجحية اللوغاريتمية Dunning G²): تُبرز التلازم <b>الموثَّق المتكرّر</b> الذي لا تفسّره الصدفة، دون أن تضخّم النادر. الرقم الذهبي = الآيات المشتركة، والرمادي = قيمة G².</>
                : <>مرتّبة حسب <b>نسبة المفاجأة</b> (PMI): كم يفوق تلازمهما ما تقتضيه الصدفة — تُبرز الاقترانات <b>النادرة الحصرية</b> (وقد تضخّم كلمةً وردت مرّةً واحدة). الرقم الذهبي = الآيات المشتركة، والرمادي = قيمة PMI.</>}
            </p>
            <div className="ag-dist-tags">
              {colloc.length === 0 ? <span className="ag-dist-name">لا توجد</span> : colloc.map((c) => {
                const mv = metricOf(c);
                return (
                  <button type="button" className="ag-tag ag-tag-btn" key={c.key} onClick={() => onPick?.(c.key, c.label)}
                    title={`«${c.label}» — ${c.count} آية مشتركة · PMI ${c.pmi.toFixed(2)} · G² ${c.ll.toFixed(1)}`}>
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
