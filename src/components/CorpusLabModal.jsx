import { useEffect, useMemo, useState } from "react";
import { rootFrequency, hapaxRoots, browseByMorph } from "../analytics/corpus.js";
import { oppositesCatalogue, candidatesCatalogue } from "../analytics/relations.js";
import { rhetoricScan } from "../analytics/rhetoric.js";
import { fieldStats } from "../analytics/field.js";
import { useFields } from "../hooks/useFields.js";
import { morphFilterActive, morphFilterSummary, EMPTY_MORPH_FILTER } from "../morphology.js";
import { exportCsvFile, exportBundle, exportJsonFile } from "../graph/exportGraph.js";
import { loadCoverage, loadMutashabihat } from "../data-loader.js";
import { ModalShell } from "./ModalShell.jsx";
import { MorphologyFilter } from "./MorphologyFilter.jsx";
import { MoreButton } from "./MoreButton.jsx";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { useReveal } from "../hooks/useReveal.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Corpus explorer (كشّاف القرآن) ═══
 *
 * The bird's-eye lexical view, independent of any one verse:
 *   Frequency — every root by token frequency + the hapax legomena (الكلمات المفردة).
 *   Grammar   — a standalone catalogue for the morphology filter, grouped by root/lemma/form.
 *   Opposites — the antithesis catalogue (الطباق); Names — the 99 names by root family.
 *
 * Interaction stays INSIDE the explorer: clicking a term shows its āyāt as an inline list with
 * a ← back button (it does not jump the graph); clicking an āya reads it in the sticky preview
 * at the foot (like the other labs). Only the preview's ⌖ jumps the graph. `open = true|false`.
 */
const TABS = ["frequency", "grammar", "relations", "mutashabihat", "rhetoric", "fields"];
const EMPTY = []; // shared stable empty array (so useReveal keys don't churn)
const CAP = 200; // rows rendered per list (full data still exports)
const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };

export function CorpusLabModal({ open, verseData, r2v, morph, relations, theme, onNavigate, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("frequency");
  const [filter, setFilter] = useState(EMPTY_MORPH_FILTER);
  const [mode, setMode] = useState("root"); // grouping for the grammar catalogue
  const [relView, setRelView] = useState("opposites"); // "opposites" (curated) | "candidates"
  const [detail, setDetail] = useState(null); // { label, keys:[vk…] } — inline āyāt list
  const [preview, setPreview] = useState(null); // vk read in the sticky foot
  const [coverage, setCoverage] = useState(null); // root-coverage manifest (optional)
  useEffect(() => { if (open && !coverage) loadCoverage().then(setCoverage).catch(() => {}); }, [open, coverage]);
  const covPct = coverage ? Math.round(coverage.rootCoverage * 100) : null;
  const [mutab, setMutab] = useState(null); // mutashābihāt catalogue (optional, lazy on tab)
  useEffect(() => { if (open && tab === "mutashabihat" && !mutab) loadMutashabihat().then(setMutab).catch(() => {}); }, [open, tab, mutab]);

  const freq = useMemo(() => (open && tab === "frequency" ? rootFrequency(verseData) : null), [open, tab, verseData]);
  const hapax = useMemo(() => (open && tab === "frequency" ? hapaxRoots(verseData) : null), [open, tab, verseData]);
  const grammar = useMemo(() => (open && tab === "grammar" && morph && morphFilterActive(filter) ? browseByMorph(verseData, morph, filter, mode) : null), [open, tab, verseData, morph, filter, mode]);
  const cat = useMemo(() => (open && tab === "relations" ? (relView === "candidates" ? candidatesCatalogue(relations) : oppositesCatalogue(relations)) : null), [open, tab, relations, relView]);
  const [rhetView, setRhetView] = useState("oath"); // "oath" | "conditional"
  const rhetoric = useMemo(() => (open && tab === "rhetoric" ? rhetoricScan(verseData, morph) : null), [open, tab, verseData, morph]);
  const fieldStore = useFields();
  const [selField, setSelField] = useState(null);
  const surahList = useMemo(() => { const m = new Map(); for (const vk in verseData) { const v = verseData[vk]; if (!m.has(v.s)) m.set(v.s, v.sn); } return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name })); }, [verseData]);
  const activeField = useMemo(() => fieldStore.fields.find((f) => f.id === selField) || null, [fieldStore.fields, selField]);
  const fieldAgg = useMemo(() => (open && tab === "fields" && activeField ? fieldStats(activeField.roots, r2v, verseData, surahList) : null), [open, tab, activeField, r2v, verseData, surahList]);

  // Incremental reveal so rows past the cap stay reachable (was a silent .slice(0,200)).
  const detailR = useReveal(CAP, detail);
  const freqR = useReveal(CAP, freq);
  const hapaxR = useReveal(CAP, hapax);
  const grammarR = useReveal(CAP, grammar);
  const catR = useReveal(CAP, cat);
  const mutR = useReveal(CAP, mutab);
  // Memoise so the reference is STABLE across renders — a fresh [] each render would make
  // useReveal's reset-on-key-change fire setState every render (infinite loop → React #301).
  const rhetList = useMemo(() => (rhetoric ? rhetoric[rhetView] : EMPTY), [rhetoric, rhetView]);
  const rhetR = useReveal(CAP, rhetList);

  if (!open) return null;
  // detail.match = { mode, primary, shared } drives the highlight in the list + preview.
  const showRoot = (r) => { const keys = (r2v && r2v[r]) ? [...r2v[r]].sort(sortVk) : []; setDetail({ label: r, keys, match: { mode: "root", primary: r } }); setPreview(null); };
  const showOcc = (label, keys, match) => { setDetail({ label, keys: keys || [], match: match || null }); setPreview(null); };
  // A field's verses within one sūra — every āya containing ANY of its roots, with all the
  // field's roots highlighted (primary + shared), reusing the inline list + sticky preview.
  const showFieldSura = (field, sura, name) => {
    const set = new Set();
    for (const r of field.roots) for (const vk of (r2v?.[r] || [])) if (+vk.split(":")[0] === sura) set.add(vk);
    const keys = [...set].sort(sortVk);
    showOcc(`${field.name} · ${sura}. ${name}`, keys, { mode: "root", primary: field.roots[0], shared: field.roots.slice(1) });
  };
  const pv = preview ? verseData[preview] : null;
  const m = detail?.match;

  return (
    <ModalShell open={open} share onClose={onClose} closeLabel={t("common.close")} ariaLabel={t("corpus.title")}
      title={<>
        {detail && <button type="button" className="ag-btn" title={t("corpus.back")} onClick={() => { setDetail(null); setPreview(null); }} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-verse">{t("corpus.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{detail ? detail.label : t("corpus.title")}</h2>
        {detail && <span className="ag-modal-count">{fmtNum(detail.keys.length)} {t("corpus.ayat")}</span>}
      </>}
      actions={!detail && (tab === "frequency" && freq
        ? <button type="button" className="ag-btn" onClick={() => exportBundle({ method: "root-frequency", params: { rootCoverage: coverage?.rootCoverage, rootedTokens: coverage?.rootedTokens, contentTokens: coverage?.contentTokens, note: "counts over rooted tokens only; unrooted (particles, proper nouns) excluded" }, data: { frequency: freq, hapax } }, "corpus-frequency.json")}>⤓ JSON</button>
        : tab === "grammar" && grammar
          ? <button type="button" className="ag-btn" onClick={() => exportCsvFile([[t("corpus.colTerm"), t("corpus.colCount"), t("corpus.colVerses")], ...grammar.map((g) => [g.label, g.count, g.verses])], "corpus-grammar.csv")}>⤓ CSV</button>
          : null)}>
      <div className="ag-dist-body">
        {/* ── Inline āyāt list (a term's occurrences), reached from any row ── */}
        {detail ? (
          <div className="ag-dist-sec">
            <p className="ag-hint">{t("corpus.listHint")}</p>
            {detail.keys.length === 0 ? <span className="ag-dist-name">{t("corpus.none")}</span> : (
              <ul className="ag-phrase-list">
                {detail.keys.slice(0, detailR.limit).map((vk) => { const v = verseData[vk]; if (!v) return null; return (
                  <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                    <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                    <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      <HighlightedAyah text={v.text} primaryWord={m?.primary} sharedWords={m?.shared || []} searchMode={m?.mode || "root"} theme={theme} />
                    </span>
                  </button></li>
                ); })}
                <li><MoreButton shown={detailR.limit} total={detail.keys.length} step={CAP} onMore={detailR.more} /></li>
              </ul>
            )}
          </div>
        ) : (<>
        <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("corpus.title")} style={{ marginBlockEnd: "var(--space-3)" }}>
          {TABS.map((id) => <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{t(`corpus.tab.${id}`)}</button>)}
        </div>

        {tab === "frequency" && freq && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("corpus.frequency")} ({fmtNum(freq.length)})</span>
              <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("corpus.colTerm"), t("corpus.colCount"), t("corpus.colVerses")], ...freq.map((r) => [r.root, r.count, r.verses])], "corpus-roots.csv")}>⤓ CSV</button>
            </div>
            <p className="ag-hint">{t("corpus.frequencyHint")}</p>
            {covPct != null && <p className="ag-hint" style={{ color: "var(--text-faint)" }}>ⓘ {t("ui.coverageRoot", { pct: covPct })}</p>}
            <div className="ag-dist-tags">
              {freq.slice(0, freqR.limit).map((r) => (
                <button type="button" className="ag-tag ag-tag-btn" key={r.root} onClick={() => showRoot(r.root)} title={t("corpus.rootChip", { count: r.count, verses: r.verses })}>
                  {r.root} <b style={{ color: "var(--gold-400)" }}>{fmtNum(r.count)}</b>
                </button>
              ))}
            </div>
            <MoreButton shown={freqR.limit} total={freq.length} step={CAP} onMore={freqR.more} />

            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("corpus.hapax")} ({fmtNum(hapax.length)})</span></div>
            <p className="ag-hint">{t("corpus.hapaxHint")}{covPct != null ? " " + t("corpus.hapaxCoverage", { pct: covPct }) : ""}</p>
            <div className="ag-dist-tags">
              {hapax.slice(0, hapaxR.limit).map((h) => (
                <button type="button" className="ag-tag ag-tag-btn" key={h.root} onClick={() => showRoot(h.root)} title={h.vk}>{h.root}</button>
              ))}
            </div>
            <MoreButton shown={hapaxR.limit} total={hapax.length} step={CAP} onMore={hapaxR.more} />
          </div>
        )}

        {tab === "grammar" && (
          <div className="ag-dist-sec">
            <p className="ag-hint">{t("corpus.grammarHint")}</p>
            {!morph && <p className="ag-dist-name">{t("corpus.needsMorph")}</p>}
            <MorphologyFilter filter={filter} onChange={setFilter} />
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("corpus.groupBy")} style={{ margin: "var(--space-2) 0" }}>
              {["root", "lemma", "exact"].map((m) => (
                <button type="button" key={m} className={mode === m ? "is-on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>{t(`corpus.mode.${m}`)}</button>
              ))}
            </div>
            {!morphFilterActive(filter) ? <span className="ag-dist-name">{t("corpus.pickFilter")}</span> : grammar == null ? <span className="ag-dist-name">{t("corpus.needsMorph")}</span> : (<>
              <div className="ag-dist-sec-h"><span>{morphFilterSummary(filter)} ({fmtNum(grammar.length)})</span></div>
              <div className="ag-dist-tags">
                {grammar.slice(0, grammarR.limit).map((g) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={g.key} onClick={() => showOcc(g.label, g.verseKeys, { mode, primary: g.key })} title={t("corpus.termChip", { count: g.count, verses: g.verses })}>
                    {g.label} <b style={{ color: "var(--gold-400)" }}>{fmtNum(g.count)}</b>
                  </button>
                ))}
              </div>
              <MoreButton shown={grammarR.limit} total={grammar.length} step={CAP} onMore={grammarR.more} />
            </>)}
          </div>
        )}

        {tab === "relations" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("corpus.relations")} ({fmtNum((cat || []).length)})</span>
              <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("corpus.colA"), t("corpus.colB"), t("corpus.colContrast"), t("corpus.colRel"), t("corpus.colFramed"), t("corpus.colVerses")], ...(cat || []).map((c) => [c.a, c.b, c.contrast, c.relatedness, c.framed ? 1 : 0, c.verses.join(" ")])], `corpus-${relView}.csv`)}>⤓ CSV</button>
            </div>
            <p className="ag-hint">{relView === "candidates" ? t("corpus.candidatesHint") : t("corpus.relationsHint")}</p>
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("corpus.relations")} style={{ marginBlockEnd: "var(--space-2)" }}>
              <button type="button" className={relView === "opposites" ? "is-on" : ""} aria-pressed={relView === "opposites"} onClick={() => setRelView("opposites")}>{t("corpus.relOpposites")}</button>
              <button type="button" className={relView === "candidates" ? "is-on" : ""} aria-pressed={relView === "candidates"} onClick={() => setRelView("candidates")}>{t("corpus.relCandidates")}</button>
            </div>
            {!relations ? <span className="ag-dist-name">{t("corpus.needsRelations")}</span> : cat.length === 0 ? <span className="ag-dist-name">{t("corpus.none")}</span> : (
              <ul className="ag-phrase-list">
                {cat.slice(0, catR.limit).map((c, i) => (
                  <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-quran)" }}>
                      <button type="button" className="ag-tag ag-tag-btn" onClick={() => showRoot(c.a)}>{c.a}</button>
                      <span style={{ color: "var(--text-faint)", margin: "0 4px" }}>↔</span>
                      <button type="button" className="ag-tag ag-tag-btn" onClick={() => showRoot(c.b)}>{c.b}</button>
                    </span>
                    {c.framed && <span title={t("lab.opp.framedTitle")} style={{ color: "var(--gold-400)", fontSize: "var(--text-xs)" }}>⊶</span>}
                    {c.verses?.length > 0 && <button type="button" className="ag-tag ag-tag-btn" onClick={() => showOcc(`${c.a} ↔ ${c.b}`, c.verses, { mode: "root", primary: c.a, shared: [c.b] })} title={t("corpus.showPair")}>{t("corpus.evidence", { n: c.verses.length })}</button>}
                  </span></li>
                ))}
                <li><MoreButton shown={catR.limit} total={cat.length} step={CAP} onMore={catR.more} /></li>
              </ul>
            )}
          </div>
        )}

        {tab === "mutashabihat" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("corpus.mutashabihat")} ({fmtNum((mutab?.pairs || []).length)})</span>
              {mutab && <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("corpus.colA"), t("corpus.colB"), t("corpus.colChanged")], ...mutab.pairs.map((p) => [p.a, p.b, p.changed])], "mutashabihat.csv")}>⤓ CSV</button>}
            </div>
            <p className="ag-hint">{t("corpus.mutashabihatHint")}</p>
            {!mutab ? <span className="ag-dist-name">{t("ui.loading")}</span> : mutab.pairs.length === 0 ? <span className="ag-dist-name">{t("corpus.none")}</span> : (
              <ul className="ag-phrase-list">
                {mutab.pairs.slice(0, mutR.limit).map((p, i) => {
                  const va = verseData[p.a], vb = verseData[p.b];
                  if (!va || !vb) return null;
                  return (
                    <li key={i}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button type="button" className={"ag-tag ag-tag-btn" + (preview === p.a ? " is-on" : "")} onClick={() => setPreview(p.a)}>{va.sn} {fmtNum(va.a)}</button>
                      <span style={{ color: "var(--text-faint)" }}>≈</span>
                      <button type="button" className={"ag-tag ag-tag-btn" + (preview === p.b ? " is-on" : "")} onClick={() => setPreview(p.b)}>{vb.sn} {fmtNum(vb.a)}</button>
                      <span className="ag-dist-num" style={{ color: "var(--gold-400)", marginInlineStart: "auto" }}>{p.changed === 0 ? t("aya.twinIdentical") : t("aya.twinDiff", { n: p.changed })}</span>
                    </span></li>
                  );
                })}
                <li><MoreButton shown={mutR.limit} total={mutab.pairs.length} step={CAP} onMore={mutR.more} /></li>
              </ul>
            )}
          </div>
        )}

        {tab === "rhetoric" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("corpus.rhetoric")} ({fmtNum(rhetList.length)})</span>
              {rhetoric && <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("corpus.colVerse"), t("corpus.colMarker")], ...rhetList.map((x) => [x.vk, x.marker])], `rhetoric-${rhetView}.csv`)}>⤓ CSV</button>}
            </div>
            <p className="ag-hint">{t("corpus.rhetoricHint")}</p>
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("corpus.rhetoric")} style={{ marginBlockEnd: "var(--space-2)" }}>
              <button type="button" className={rhetView === "oath" ? "is-on" : ""} aria-pressed={rhetView === "oath"} onClick={() => setRhetView("oath")}>{t("corpus.rhetOath")}</button>
              <button type="button" className={rhetView === "conditional" ? "is-on" : ""} aria-pressed={rhetView === "conditional"} onClick={() => setRhetView("conditional")}>{t("corpus.rhetCond")}</button>
            </div>
            {!rhetoric ? <span className="ag-dist-name">{t("ui.loading")}</span> : rhetList.length === 0 ? <span className="ag-dist-name">{t("corpus.none")}</span> : (
              <ul className="ag-phrase-list">
                {rhetList.slice(0, rhetR.limit).map((x) => { const v = verseData[x.vk]; if (!v) return null; return (
                  <li key={x.vk}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button type="button" className={"ag-tag ag-tag-btn" + (preview === x.vk ? " is-on" : "")} onClick={() => setPreview(x.vk)}>{v.sn} {fmtNum(v.a)}</button>
                    <span style={{ fontFamily: "var(--font-quran)", color: "var(--gold-400)" }}>{x.marker}</span>
                  </span></li>
                ); })}
                <li><MoreButton shown={rhetR.limit} total={rhetList.length} step={CAP} onMore={rhetR.more} /></li>
              </ul>
            )}
          </div>
        )}

        {tab === "fields" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("corpus.fields")} ({fmtNum(fieldStore.fields.length)})</span>
              {fieldStore.fields.length > 0 && <button type="button" className="ag-btn" onClick={() => exportJsonFile(fieldStore.exportData(), "semantic-fields.json")}>⤓ JSON</button>}
            </div>
            <p className="ag-hint">{t("corpus.fieldsHint")}</p>
            <form onSubmit={(e) => { e.preventDefault(); const nm = e.currentTarget.elements.fldname.value.trim(); if (nm) { setSelField(fieldStore.create(nm)); e.currentTarget.reset(); } }} style={{ display: "flex", gap: 6, marginBlockEnd: "var(--space-2)" }}>
              <input name="fldname" className="ag-input" type="text" placeholder={t("corpus.fieldNew")} aria-label={t("corpus.fieldNew")} style={{ flex: 1 }} />
              <button type="submit" className="ag-btn">{t("corpus.fieldCreate")}</button>
            </form>
            {fieldStore.fields.length > 0 && (
              <div className="ag-seg ag-seg-sm" role="group" aria-label={t("corpus.fields")} style={{ flexWrap: "wrap", marginBlockEnd: "var(--space-2)" }}>
                {fieldStore.fields.map((f) => (
                  <button type="button" key={f.id} className={selField === f.id ? "is-on" : ""} aria-pressed={selField === f.id} onClick={() => setSelField(f.id)}>{f.name} ({fmtNum(f.roots.length)})</button>
                ))}
              </div>
            )}
            {activeField && <>
              <div className="ag-dist-sec-h"><span>{activeField.name}</span>
                <button type="button" className="ag-btn" title={t("corpus.fieldRemove")} onClick={() => { fieldStore.remove(activeField.id); setSelField(null); }}>🗑</button>
              </div>
              {activeField.roots.length === 0 ? <p className="ag-hint">{t("corpus.fieldEmpty")}</p> : (<>
                <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
                  {activeField.roots.map((r) => (
                    <span key={r} className="ag-tag" style={{ fontFamily: "var(--font-quran)" }}>
                      <button type="button" className="ag-tag-btn" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-quran)" }} onClick={() => showRoot(r)}>{r}</button>
                      <button type="button" title={t("corpus.fieldRemoveRoot")} aria-label={t("corpus.fieldRemoveRoot")} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", marginInlineStart: 4 }} onClick={() => fieldStore.removeRoot(activeField.id, r)}>✕</button>
                    </span>
                  ))}
                </div>
                {fieldAgg && <>
                  <p className="ag-hint">{t("corpus.fieldAgg", { roots: fmtNum(fieldAgg.rootCount), verses: fmtNum(fieldAgg.totalVerses) })}</p>
                  <div className="ag-dist-bars">
                    {fieldAgg.distribution.map((d) => {
                      const max = fieldAgg.distribution.reduce((m, x) => Math.max(m, x.count), 1);
                      return (
                        <button type="button" className="ag-dist-row ag-dist-rowbtn" key={d.sura} onClick={() => showFieldSura(activeField, d.sura, d.name)} title={t("dist.showInSurah", { count: d.count, name: d.name })}>
                          <span className="ag-dist-name">{d.sura}. {d.name}</span>
                          <span className="ag-dist-num">{fmtNum(d.count)}</span>
                          <span className="ag-dist-barwrap"><span className="ag-dist-bar" style={{ width: `${(d.count / max) * 100}%`, background: "var(--gold-500)" }} /></span>
                        </button>
                      );
                    })}
                  </div>
                </>}
              </>)}
            </>}
          </div>
        )}
        </>)}

        {/* Sticky inline preview — read an āya in place; ⌖ jumps the graph. */}
        {pv && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, marginBlockStart: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--ink-800)", borderBlockStart: "2px solid var(--gold-500)", borderRadius: "var(--radius-sm)", boxShadow: "0 -10px 22px -10px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="ag-ayah-ref"><span className="ag-ayah-surah">{pv.sn}</span><span className="ag-ayah-num">{fmtNum(pv.a)}</span></span>
              <span style={{ display: "flex", gap: 4 }}>
                {onNavigate && <button type="button" className="ag-btn is-gold" title={t("aya.goTo")} onClick={() => navTo(preview, onNavigate)}>⌖ {t("aya.goTo")}</button>}
                <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} style={{ width: 26, height: 26 }} onClick={() => setPreview(null)}>✕</button>
              </span>
            </div>
            <div className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", marginBlockStart: 4, lineHeight: 1.9 }}>
              <HighlightedAyah text={pv.text} primaryWord={m?.primary} sharedWords={m?.shared || []} searchMode={m?.mode || "root"} theme={theme} />
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function navTo(vk, onNavigate) { const [s, a] = vk.split(":").map(Number); onNavigate?.(s, a); }
