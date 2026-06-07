import { useMemo, useState } from "react";
import { norm, normStrict, groupKey } from "../arabic-utils.js";
import { distributionBySura, collocations, mergeCollocations } from "../analytics/stats.js";
import { exportJsonFile, exportTextFile, buildResultBibtex } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

/* ═══ Compare two terms ═══
 *
 * Two terms (each independently a word / lemma / root) set side by side, on the
 * same pure Qur'an-internal stats the distribution modal uses:
 *   - distribution overlay: how each spreads across the sūrahs, bars paired per row
 *     (A gold, B teal) so divergent reach is visible at a glance;
 *   - collocates: which content words each draws into its verses, split into those
 *     SHARED by both vs. those distinct to each (with pmi / signed log-likelihood).
 * `cmp = { A, B }` where A/B are { lookup, label, mode } or null. `indices` maps a
 * mode → its inverted index ({ exact: w2v, root: r2v, lemma: l2v }). Both slots are
 * editable in place, so the modal works whether opened from a term or from scratch.
 */

const MODES = ["exact", "lemma", "root"]; // labels resolved via t("cmp.mode.*") at render
const MODE_BADGE = { exact: "t-word", lemma: "t-lemma", root: "t-root" };
const COLLOC_SORTS = ["count", "ll", "pmi"]; // labels via t("cmp.sort.*")
const A_COLOR = "var(--gold-400)";
const B_COLOR = "var(--viridian-400)";

// Resolve a typed query into a term against the active index, or null if it has no
// occurrences (so an empty slot never claims a non-existent word).
function resolveTerm(query, mode, precision, indices) {
  const q = norm(query || "");
  if (q.length < 2) return null;
  const lookup = mode === "exact" ? (precision === "strict" ? normStrict(query) : q) : groupKey(q, mode);
  const idx = indices?.[mode];
  if (!idx || !(idx[lookup] && idx[lookup].length)) return null;
  return { lookup, label: query.trim(), mode };
}

const fmtMetric = (v) => (v == null ? "" : Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1));

// One editable term slot: a mode segment + a search field, plus the current term.
function TermSlot({ term, color, indices, precision, onSet }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState(term?.mode || "root");
  const [miss, setMiss] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    const resolved = resolveTerm(q, mode, precision, indices);
    if (resolved) { onSet(resolved); setQ(""); setMiss(false); } else setMiss(true);
  };
  return (
    <div className="ag-cmp-slot">
      <div className="ag-cmp-current">
        {term
          ? <><span className={"ag-badge " + MODE_BADGE[term.mode]}>{t("cmp.mode." + term.mode)}</span><span className="ag-cmp-label" style={{ color }}>{term.label}</span></>
          : <span className="ag-cmp-empty">{t("cmp.chooseTerm")}</span>}
      </div>
      <form className="ag-cmp-pick" onSubmit={submit} role="search">
        <div className="ag-seg ag-seg-sm" role="group" aria-label={t("cmp.modeAria")}>
          {MODES.map((m) => (
            <button type="button" key={m} className={mode === m ? "is-on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>{t("cmp.mode." + m)}</button>
          ))}
        </div>
        <div className="ag-cmp-pickrow">
          <input className={"ag-input" + (miss ? " is-miss" : "")} type="search" value={q}
            aria-label={t("cmp.searchAria")}
            placeholder={t("cmp.ph." + mode)}
            onChange={(e) => { setQ(e.target.value); if (miss) setMiss(false); }} />
          <button type="submit" className="ag-btn">{term ? t("cmp.change") : t("cmp.set")}</button>
        </div>
      </form>
    </div>
  );
}

export function CompareModal({ cmp, indices, verseData, surahList, stopSet, precision, onNavigate, onPick, onClose }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [A, setA] = useState(cmp?.A || null);
  const [B, setB] = useState(cmp?.B || null);
  const [sort, setSort] = useState("ll");
  // Re-seed the slots when the modal is (re)opened with a fresh context. `cmp` is a
  // stable object while open, so a new open = a new identity — the React-recommended
  // "adjust state during render" pattern, no effect needed.
  const [seed, setSeed] = useState(cmp);
  if (cmp !== seed) { setSeed(cmp); setA(cmp?.A || null); setB(cmp?.B || null); }

  const data = useMemo(() => {
    if (!A || !B) return null;
    const idxA = indices?.[A.mode] || {}, idxB = indices?.[B.mode] || {};
    const distA = distributionBySura(A.lookup, idxA, verseData, surahList);
    const distB = distributionBySura(B.lookup, idxB, verseData, surahList);
    const colA = collocations(A.lookup, A.mode, idxA, verseData, stopSet, 99, { sort }).slice(0, 80);
    const colB = collocations(B.lookup, B.mode, idxB, verseData, stopSet, 99, { sort }).slice(0, 80);
    const merged = mergeCollocations(colA, colB);
    const rows = []; let max = 1;
    for (let i = 0; i < distA.length; i++) {
      const a = distA[i].count, b = distB[i].count;
      if (a || b) { rows.push({ sura: distA[i].sura, name: distA[i].name, a, b }); max = Math.max(max, a, b); }
    }
    const totalA = distA.reduce((s, d) => s + d.count, 0), totalB = distB.reduce((s, d) => s + d.count, 0);
    const surasA = distA.filter((d) => d.count > 0).length, surasB = distB.filter((d) => d.count > 0).length;
    const firstA = {}, firstB = {};
    for (const vk of idxA[A.lookup] || []) { const s = verseData[vk]?.s; if (s != null && !firstA[s]) firstA[s] = vk; }
    for (const vk of idxB[B.lookup] || []) { const s = verseData[vk]?.s; if (s != null && !firstB[s]) firstB[s] = vk; }
    return { rows, max, merged, totalA, totalB, surasA, surasB, firstA, firstB };
  }, [A, B, indices, verseData, surahList, stopSet, sort]);

  if (!cmp) return null;

  const metricOf = (c) => (sort === "pmi" ? c.pmi : sort === "ll" ? c.ll : null);
  const navRow = (row) => {
    const vk = data.firstA[row.sura] || data.firstB[row.sura];
    const v = vk && verseData[vk];
    if (v) onNavigate?.(v.s, v.a);
  };
  const chip = (c, color, mode) => {
    const mv = metricOf(c);
    return (
      <button type="button" className="ag-tag ag-tag-btn" key={c.key + ":" + mode} onClick={() => onPick?.(c.key, c.label, mode)}
        title={t("cmp.chipTitle", { label: c.label, count: c.count, pmi: c.pmi.toFixed(2), ll: c.ll.toFixed(1) })}>
        {c.label} <b style={{ color }}>{c.count}</b>
        {mv != null && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{fmtMetric(mv)}</span>}
      </button>
    );
  };

  const ready = A && B && data;

  return (
    <ModalShell open={!!cmp} onClose={onClose} closeLabel={t("cmp.close")} ariaLabel={t("cmp.dialogAria")}
      title={<>
        <h2 className="ag-modal-word">{t("cmp.title")}</h2>
        {ready && <span className="ag-modal-count"><b style={{ color: A_COLOR }}>{data.totalA}</b> · <b style={{ color: B_COLOR }}>{data.totalB}</b></span>}
      </>}
      actions={<>
            {ready && (
              <button type="button" className="ag-btn" title={t("ws.saveTitle")}
                onClick={() => { ws.saveItem({ type: "compare", title: `${A.label} ⇄ ${B.label}`, payload: { A, B } }); ws.toast(t("ws.saved")); }}>★ {t("ws.save")}</button>
            )}
            {ready && (
              <button type="button" className="ag-btn" title={t("cmp.exportTitle")}
                onClick={() => exportJsonFile({
                  a: { term: A.label, mode: A.mode, total: data.totalA, surahCount: data.surasA },
                  b: { term: B.label, mode: B.mode, total: data.totalB, surahCount: data.surasB },
                  collocationSort: sort,
                  distribution: data.rows.map((r) => ({ sura: r.sura, name: r.name, a: r.a, b: r.b })),
                  sharedCollocations: data.merged.shared.map((s) => ({ word: s.label, aSharedVerses: s.a.count, bSharedVerses: s.b.count, aLL: s.a.ll, bLL: s.b.ll })),
                  onlyA: data.merged.onlyA.map((c) => ({ word: c.label, sharedVerses: c.count, pmi: c.pmi, logLikelihood: c.ll })),
                  onlyB: data.merged.onlyB.map((c) => ({ word: c.label, sharedVerses: c.count, pmi: c.pmi, logLikelihood: c.ll })),
                }, t("cmp.fileName", { a: A.label, b: B.label }))}>⤓ JSON</button>
            )}
            {ready && (
              <button type="button" className="ag-btn" title={t("common.cite.resultTitle")}
                onClick={() => {
                  const bib = buildResultBibtex({
                    key: `ayatnet_cmp_${(A.label + B.label).replace(/[^A-Za-z0-9؀-ۿ]/g, "").slice(0, 16)}`,
                    title: t("common.cite.cmpTitle", { a: A.label, b: B.label }),
                    note: t("common.cite.note", { count: data.totalA + data.totalB }),
                    url: typeof location !== "undefined" ? location.href : "",
                    year: new Date().getFullYear(), keywords: [A.label, B.label],
                  });
                  exportTextFile(bib, `cite-compare-${A.label}-${B.label}.bib`, "application/x-bibtex");
                }}>⧉ {t("common.cite.cite")}</button>
            )}
      </>}>

        <div className="ag-cmp-slots">
          <TermSlot term={A} color={A_COLOR} indices={indices} precision={precision} onSet={setA} />
          <button type="button" className="ag-iconbtn ag-cmp-swap" title={t("cmp.swap")} aria-label={t("cmp.swapAria")}
            onClick={() => { const tmp = A; setA(B); setB(tmp); }}>⇄</button>
          <TermSlot term={B} color={B_COLOR} indices={indices} precision={precision} onSet={setB} />
        </div>

        {!ready ? (
          <p className="ag-hint" style={{ padding: "var(--space-3)" }}>{t("cmp.pickPrompt")}</p>
        ) : (
          <div className="ag-dist-body">
            <div className="ag-dist-sec">
              <div className="ag-dist-sec-h"><span>{t("cmp.bySurah")}</span></div>
              <p className="ag-hint">
                <span style={{ color: A_COLOR }}>▮ {A.label}</span> · <span style={{ color: B_COLOR }}>▮ {B.label}</span> — {t("cmp.clickSurah")}
              </p>
              <div className="ag-dist-bars">
                {data.rows.map((r) => (
                  <button type="button" className="ag-dist-row ag-dist-rowbtn ag-cmp-row" key={r.sura} onClick={() => navRow(r)} title={t("cmp.rowTitle", { name: r.name, aLabel: A.label, aCount: r.a, bLabel: B.label, bCount: r.b })}>
                    <span className="ag-dist-name">{r.sura}. {r.name}</span>
                    <span className="ag-cmp-bars">
                      <span className="ag-cmp-barline"><span className="ag-dist-bar" style={{ width: `${(r.a / data.max) * 100}%`, background: A_COLOR }} /><b style={{ color: A_COLOR }}>{r.a || ""}</b></span>
                      <span className="ag-cmp-barline"><span className="ag-dist-bar" style={{ width: `${(r.b / data.max) * 100}%`, background: B_COLOR }} /><b style={{ color: B_COLOR }}>{r.b || ""}</b></span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ag-dist-sec">
              <div className="ag-dist-sec-h"><span>{t("cmp.collocates")}</span></div>
              <div className="ag-seg ag-seg-sm" role="group" aria-label={t("cmp.sortGroup")} style={{ marginBlockEnd: "var(--space-2)" }}>
                {COLLOC_SORTS.map((id) => (
                  <button type="button" key={id} className={sort === id ? "is-on" : ""} aria-pressed={sort === id} onClick={() => setSort(id)}>{t("cmp.sort." + id)}</button>
                ))}
              </div>

              <div className="ag-cmp-coll-h">{t("cmp.shared")} <b>{data.merged.shared.length}</b></div>
              <div className="ag-dist-tags">
                {data.merged.shared.length === 0 ? <span className="ag-dist-name">{t("cmp.none")}</span> : data.merged.shared.slice(0, 40).map((s) => {
                  const mv = metricOf(s.a);
                  return (
                    <button type="button" className="ag-tag ag-tag-btn" key={"sh:" + s.key} onClick={() => onPick?.(s.key, s.label, A.mode)}
                      title={t("cmp.sharedChipTitle", { label: s.label, aLabel: A.label, aCount: s.a.count, bLabel: B.label, bCount: s.b.count })}>
                      {s.label} <b style={{ color: A_COLOR }}>{s.a.count}</b><span style={{ color: "var(--text-faint)" }}>/</span><b style={{ color: B_COLOR }}>{s.b.count}</b>
                      {mv != null && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{fmtMetric(mv)}</span>}
                    </button>
                  );
                })}
              </div>

              <div className="ag-cmp-coll-h" style={{ color: A_COLOR }}>{t("cmp.only", { label: A.label })} <b>{data.merged.onlyA.length}</b></div>
              <div className="ag-dist-tags">
                {data.merged.onlyA.length === 0 ? <span className="ag-dist-name">{t("cmp.none")}</span> : data.merged.onlyA.slice(0, 40).map((c) => chip(c, A_COLOR, A.mode))}
              </div>

              <div className="ag-cmp-coll-h" style={{ color: B_COLOR }}>{t("cmp.only", { label: B.label })} <b>{data.merged.onlyB.length}</b></div>
              <div className="ag-dist-tags">
                {data.merged.onlyB.length === 0 ? <span className="ag-dist-name">{t("cmp.none")}</span> : data.merged.onlyB.slice(0, 40).map((c) => chip(c, B_COLOR, B.mode))}
              </div>
            </div>
          </div>
        )}
    </ModalShell>
  );
}
