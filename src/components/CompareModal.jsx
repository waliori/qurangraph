import { useEffect, useMemo, useRef, useState } from "react";
import { wordGroupKey } from "../arabic-utils.js";
import { looseResolve } from "../search.js";
import { distributionBySura, collocations, mergeCollocations } from "../analytics/stats.js";
import { exportBundle, exportTextFile, buildResultBibtex } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { SaveButton } from "./SaveButton.jsx";
import { DisclosurePanel } from "./DisclosurePanel.jsx";
import { SigStars, fmtMetric } from "./Significance.jsx";
import { useI18n } from "../i18n/index.js";

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
const COLLOC_SORTS = ["count", "ll", "pmi", "logdice"]; // labels via t("cmp.sort.*")
const A_COLOR = "var(--gold-400)";
const B_COLOR = "var(--viridian-400)";

// One editable term slot: a mode segment + a search field, plus the current term. The
// query is resolved forgivingly (looseResolve): a lone match is set straight away, but an
// ambiguous skeleton offers a "did you mean" chooser of the distinct senses — so e.g. جن in
// Lemma mode lets you pick جِنّ (jinn) instead of silently landing on the verb جَنَّ.
function TermSlot({ term, color, indices, precision, searchAlias, searchAliasFuzzy, onSet }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState(term?.mode || "root");
  const [miss, setMiss] = useState(false);
  const [choices, setChoices] = useState(null); // candidate list when the query is ambiguous
  const [editing, setEditing] = useState(false); // once a term is set, collapse the picker (frees space for results)
  const showForm = !term || editing;
  const set = (lookup) => { onSet({ lookup, label: lookup, mode }); setQ(""); setMiss(false); setChoices(null); setEditing(false); };
  const submit = (e) => {
    e.preventDefault();
    const { candidates } = looseResolve(q, mode, precision, indices, searchAlias, searchAliasFuzzy);
    if (!candidates.length) { setMiss(true); setChoices(null); }
    else if (candidates.length === 1) set(candidates[0].lookup);
    else setChoices(candidates);
  };
  return (
    <div className="ag-cmp-slot">
      <div className="ag-cmp-current">
        {term
          ? <>
              <span className={"ag-badge " + MODE_BADGE[term.mode]}>{t("cmp.mode." + term.mode)}</span>
              <span className="ag-cmp-label" style={{ color }}>{term.label}</span>
              {!editing && <button type="button" className="ag-btn ag-btn-xs ag-cmp-edit" onClick={() => setEditing(true)}>{t("cmp.change")}</button>}
            </>
          : <span className="ag-cmp-empty">{t("cmp.chooseTerm")}</span>}
      </div>
      {showForm && (
      <form className="ag-cmp-pick" onSubmit={submit} role="search">
        <div className="ag-seg ag-seg-sm" role="group" aria-label={t("cmp.modeAria")}>
          {MODES.map((m) => (
            <button type="button" key={m} className={mode === m ? "is-on" : ""} aria-pressed={mode === m}
              onClick={() => { setMode(m); setChoices(null); }}>{t("cmp.mode." + m)}</button>
          ))}
        </div>
        <div className="ag-cmp-pickrow">
          <input className={"ag-input" + (miss ? " is-miss" : "")} type="search" value={q}
            aria-label={t("cmp.searchAria")}
            placeholder={t("cmp.ph." + mode)}
            onChange={(e) => { setQ(e.target.value); if (miss) setMiss(false); if (choices) setChoices(null); }} />
          <button type="submit" className="ag-btn">{term ? t("cmp.change") : t("cmp.set")}</button>
        </div>
        {choices && (
          <div className="ag-cmp-choices" role="listbox" aria-label={t("cmp.didYouMean")}
            style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
            <span className="ag-hint" style={{ flexBasis: "100%", margin: 0 }}>{t("cmp.didYouMean")}</span>
            {choices.map((c) => (
              <button type="button" key={c.lookup} role="option" className="ag-tag ag-tag-btn" onClick={() => set(c.lookup)}
                title={t("cmp.choiceTitle", { count: c.count })}>
                <span style={{ fontFamily: "var(--font-quran)" }}>{c.lookup}</span> <b style={{ color }}>{c.count}</b>
              </button>
            ))}
          </div>
        )}
      </form>
      )}
    </div>
  );
}

export function CompareModal({ cmp, indices, searchAlias, searchAliasFuzzy, verseData, surahList, stopSet, precision, onNavigate, onPick, onChange, onClose }) {
  const { t } = useI18n();
  const [A, setA] = useState(cmp?.A || null);
  const [B, setB] = useState(cmp?.B || null);
  const [sort, setSort] = useState("ll");
  const [detail, setDetail] = useState(null); // a clicked sūra's co-occurrence sub-view: { sura, name }
  // Re-seed the slots when the modal is (re)opened with a fresh context. `cmp` is a
  // stable object while open, so a new open = a new identity — the React-recommended
  // "adjust state during render" pattern, no effect needed.
  const [seed, setSeed] = useState(cmp);
  if (cmp !== seed) { setSeed(cmp); setA(cmp?.A || null); setB(cmp?.B || null); setDetail(null); }
  // Editing either term invalidates an open co-occurrence sub-view.
  const onSetA = (term) => { setA(term); setDetail(null); };
  const onSetB = (term) => { setB(term); setDetail(null); };
  const swap = () => { setA(B); setB(A); setDetail(null); };

  // Push in-modal term edits back up so the shared link / saved view reflects the CURRENT
  // comparison, not just the terms it was opened with. Skips the initial mount (those terms
  // are already what the parent holds). Re-seeding above keeps this from looping.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    onChange?.({ A, B });
  }, [A, B, onChange]);

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
    return { rows, max, merged, totalA, totalB, surasA, surasB };
  }, [A, B, indices, verseData, surahList, stopSet, sort]);

  // Every verse in the clicked sūra where EITHER term occurs (their union), in āya order —
  // the sub-view's content. A verse highlights whichever term(s) it carries in that term's
  // colour (e.g. in al-Naml: jānn once, jinn twice → those three verses, each tinted to the
  // word it holds). Each side keeps its own grouping mode.
  const coVerses = useMemo(() => {
    if (!detail || !A || !B) return [];
    const idxA = indices?.[A.mode] || {}, idxB = indices?.[B.mode] || {};
    const set = new Set();
    for (const vk of idxA[A.lookup] || []) if (verseData[vk]?.s === detail.sura) set.add(vk);
    for (const vk of idxB[B.lookup] || []) if (verseData[vk]?.s === detail.sura) set.add(vk);
    return [...set].sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]));
  }, [detail, A, B, indices, verseData]);

  if (!cmp) return null;

  const metricOf = (c) => (sort === "pmi" ? c.pmi : sort === "ll" ? c.ll : sort === "logdice" ? c.logdice : null);
  // A word's highlight colour: A's gold, B's teal, or none — by each term's own mode.
  const wordColor = (w) => (A && wordGroupKey(w, A.mode) === A.lookup ? A_COLOR : B && wordGroupKey(w, B.mode) === B.lookup ? B_COLOR : null);
  const chip = (c, color, mode) => {
    const mv = metricOf(c);
    return (
      <button type="button" className="ag-tag ag-tag-btn" key={c.key + ":" + mode} onClick={() => onPick?.(c.key, c.label, mode)}
        title={t("cmp.chipTitle", { label: c.label, count: c.count, pmi: c.pmi.toFixed(2), ll: c.ll.toFixed(1) })}>
        {c.label} <b style={{ color }}>{c.count}</b>
        {mv != null && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{fmtMetric(mv)}</span>}
        <SigStars sig={c.sig} />
      </button>
    );
  };

  const ready = A && B && data;

  return (
    <ModalShell open={!!cmp} share onClose={onClose} closeLabel={t("cmp.close")} ariaLabel={t("cmp.dialogAria")}
      back={detail ? () => setDetail(null) : undefined} backLabel={t("cmp.back")}
      title={detail ? (<>
        <span className="ag-badge t-verse">{t("ctx.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{detail.sura}. {detail.name}</h2>
      </>) : (<>
        <h2 className="ag-modal-word">{t("cmp.title")}</h2>
        {ready && <span className="ag-modal-count"><b style={{ color: A_COLOR }}>{data.totalA}</b> · <b style={{ color: B_COLOR }}>{data.totalB}</b></span>}
      </>)}
      actions={<>
            {ready && (
              <SaveButton item={{ type: "compare", title: `${A.label} ⇄ ${B.label}`, payload: { A, B } }} label={t("ws.save")} />
            )}
            {ready && (
              <button type="button" className="ag-btn" title={t("cmp.exportTitle")}
                onClick={() => exportBundle({
                  method: "compare-terms",
                  params: { a: { term: A.lookup, label: A.label, mode: A.mode }, b: { term: B.lookup, label: B.label, mode: B.mode }, collocationModel: "verse-document", sort },
                  data: {
                    a: { total: data.totalA, surahCount: data.surasA },
                    b: { total: data.totalB, surahCount: data.surasB },
                    distribution: data.rows.map((r) => ({ sura: r.sura, name: r.name, a: r.a, b: r.b })),
                    sharedCollocations: data.merged.shared.map((s) => ({ word: s.label, aCount: s.a.count, bCount: s.b.count, aLL: s.a.ll, bLL: s.b.ll, aLogDice: s.a.logdice, bLogDice: s.b.logdice })),
                    onlyA: data.merged.onlyA.map((c) => ({ word: c.label, count: c.count, pmi: c.pmi, logLikelihood: c.ll, logDice: c.logdice, significance: c.sig })),
                    onlyB: data.merged.onlyB.map((c) => ({ word: c.label, count: c.count, pmi: c.pmi, logLikelihood: c.ll, logDice: c.logdice, significance: c.sig })),
                  },
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

        {detail ? (
          <div className="ag-dist-body">
            <p className="ag-hint">
              <span style={{ color: A_COLOR }}>▮ {A.label}</span> · <span style={{ color: B_COLOR }}>▮ {B.label}</span> — {t("cmp.coEach", { name: detail.name })}
            </p>
            {coVerses.length === 0 ? (
              <p className="ag-dist-name" style={{ padding: "var(--space-3)" }}>{t("cmp.coNone")}</p>
            ) : (
              <ul className="ag-modal-list">
                {coVerses.map((vk) => {
                  const v = verseData[vk];
                  if (!v) return null;
                  return (
                    <li key={vk}>
                      <button type="button" className="ag-modal-row" onClick={() => onNavigate?.(v.s, v.a)} title={t("cmp.recenter")}>
                        <span className="ag-ayah-ref"><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{v.a}</span></span>
                        <span className="ag-modal-text" dir="rtl" style={{ fontFamily: "var(--font-quran)" }}>
                          {v.words.map((w, i) => { const c = wordColor(w); return <span key={i} style={c ? { color: c, fontWeight: 700 } : undefined}>{w.orig} </span>; })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (<>
        <div className={"ag-cmp-slots" + (ready ? " is-ready" : "")}>
          <TermSlot term={A} color={A_COLOR} indices={indices} precision={precision} searchAlias={searchAlias} searchAliasFuzzy={searchAliasFuzzy} onSet={onSetA} />
          <button type="button" className="ag-iconbtn ag-cmp-swap" title={t("cmp.swap")} aria-label={t("cmp.swapAria")}
            onClick={swap}>⇄</button>
          <TermSlot term={B} color={B_COLOR} indices={indices} precision={precision} searchAlias={searchAlias} searchAliasFuzzy={searchAliasFuzzy} onSet={onSetB} />
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
                  <button type="button" className="ag-dist-row ag-dist-rowbtn ag-cmp-row" key={r.sura} onClick={() => setDetail({ sura: r.sura, name: r.name })} title={t("cmp.rowTitle", { name: r.name, aLabel: A.label, aCount: r.a, bLabel: B.label, bCount: r.b })}>
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
              <DisclosurePanel label={t("ui.method")}><p style={{ margin: 0 }}>{t("cmp.methodBody")}</p></DisclosurePanel>

              <div className="ag-cmp-coll-h">{t("cmp.shared")} <b>{data.merged.shared.length}</b></div>
              <div className="ag-dist-tags">
                {data.merged.shared.length === 0 ? <span className="ag-dist-name">{t("cmp.none")}</span> : data.merged.shared.slice(0, 40).map((s) => {
                  const mv = metricOf(s.a);
                  return (
                    <button type="button" className="ag-tag ag-tag-btn" key={"sh:" + s.key} onClick={() => onPick?.(s.key, s.label, A.mode)}
                      title={t("cmp.sharedChipTitle", { label: s.label, aLabel: A.label, aCount: s.a.count, bLabel: B.label, bCount: s.b.count })}>
                      {s.label} <b style={{ color: A_COLOR }}>{s.a.count}</b><span style={{ color: "var(--text-faint)" }}>/</span><b style={{ color: B_COLOR }}>{s.b.count}</b>
                      {mv != null && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{fmtMetric(mv)}</span>}
                      <SigStars sig={Math.min(s.a.sig, s.b.sig)} />
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
        </>)}
    </ModalShell>
  );
}
