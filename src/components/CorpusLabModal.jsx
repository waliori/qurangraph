import { useMemo, useState } from "react";
import { rootFrequency, hapaxRoots, browseByMorph } from "../analytics/corpus.js";
import { oppositesCatalogue, candidatesCatalogue } from "../analytics/relations.js";
import { divineNames } from "../analytics/names.js";
import { morphFilterActive, morphFilterSummary, EMPTY_MORPH_FILTER } from "../morphology.js";
import { norm, normStrict } from "../arabic-utils.js";
import { exportCsvFile, exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { MorphologyFilter } from "./MorphologyFilter.jsx";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
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
const TABS = ["frequency", "grammar", "relations", "names"];
const CAP = 200; // rows rendered per list (full data still exports)
const sortVk = (x, y) => { const [sa, aa] = x.split(":").map(Number), [sb, ab] = y.split(":").map(Number); return sa - sb || aa - ab; };

export function CorpusLabModal({ open, verseData, r2v, w2v, precision, morph, relations, theme, onNavigate, onClose }) {
  const { t, fmtNum } = useI18n();
  const [tab, setTab] = useState("frequency");
  const [filter, setFilter] = useState(EMPTY_MORPH_FILTER);
  const [mode, setMode] = useState("root"); // grouping for the grammar catalogue
  const [relView, setRelView] = useState("opposites"); // "opposites" (curated) | "candidates"
  const [nameMode, setNameMode] = useState("root"); // divine names: "root" family | "word" exact form
  const [detail, setDetail] = useState(null); // { label, keys:[vk…] } — inline āyāt list
  const [preview, setPreview] = useState(null); // vk read in the sticky foot

  const freq = useMemo(() => (open && tab === "frequency" ? rootFrequency(verseData) : null), [open, tab, verseData]);
  const hapax = useMemo(() => (open && tab === "frequency" ? hapaxRoots(verseData) : null), [open, tab, verseData]);
  const grammar = useMemo(() => (open && tab === "grammar" && morph && morphFilterActive(filter) ? browseByMorph(verseData, morph, filter, mode) : null), [open, tab, verseData, morph, filter, mode]);
  const cat = useMemo(() => (open && tab === "relations" ? (relView === "candidates" ? candidatesCatalogue(relations) : oppositesCatalogue(relations)) : null), [open, tab, relations, relView]);
  const names = useMemo(() => (open && tab === "names" ? divineNames(r2v) : null), [open, tab, r2v]);

  if (!open) return null;
  // detail.match = { mode, primary, shared } drives the highlight in the list + preview.
  const showRoot = (r) => { const keys = (r2v && r2v[r]) ? [...r2v[r]].sort(sortVk) : []; setDetail({ label: r, keys, match: { mode: "root", primary: r } }); setPreview(null); };
  const showOcc = (label, keys, match) => { setDetail({ label, keys: keys || [], match: match || null }); setPreview(null); };
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
        ? <button type="button" className="ag-btn" onClick={() => exportJsonFile({ frequency: freq, hapax }, "corpus-frequency.json")}>⤓ JSON</button>
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
                {detail.keys.slice(0, CAP).map((vk) => { const v = verseData[vk]; if (!v) return null; return (
                  <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                    <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                    <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      <HighlightedAyah text={v.text} primaryWord={m?.primary} sharedWords={m?.shared || []} searchMode={m?.mode || "root"} theme={theme} />
                    </span>
                  </button></li>
                ); })}
                {detail.keys.length > CAP && <li><span className="ag-hint">{t("corpus.more", { n: detail.keys.length - CAP })}</span></li>}
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
            <div className="ag-dist-tags">
              {freq.slice(0, CAP).map((r) => (
                <button type="button" className="ag-tag ag-tag-btn" key={r.root} onClick={() => showRoot(r.root)} title={t("corpus.rootChip", { count: r.count, verses: r.verses })}>
                  {r.root} <b style={{ color: "var(--gold-400)" }}>{fmtNum(r.count)}</b>
                </button>
              ))}
            </div>
            {freq.length > CAP && <p className="ag-hint">{t("corpus.more", { n: freq.length - CAP })}</p>}

            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("corpus.hapax")} ({fmtNum(hapax.length)})</span></div>
            <p className="ag-hint">{t("corpus.hapaxHint")}</p>
            <div className="ag-dist-tags">
              {hapax.slice(0, CAP).map((h) => (
                <button type="button" className="ag-tag ag-tag-btn" key={h.root} onClick={() => showRoot(h.root)} title={h.vk}>{h.root}</button>
              ))}
              {hapax.length > CAP && <span className="ag-hint">{t("corpus.more", { n: hapax.length - CAP })}</span>}
            </div>
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
                {grammar.slice(0, CAP).map((g) => (
                  <button type="button" className="ag-tag ag-tag-btn" key={g.key} onClick={() => showOcc(g.label, g.verseKeys, { mode, primary: g.key })} title={t("corpus.termChip", { count: g.count, verses: g.verses })}>
                    {g.label} <b style={{ color: "var(--gold-400)" }}>{fmtNum(g.count)}</b>
                  </button>
                ))}
                {grammar.length > CAP && <span className="ag-hint">{t("corpus.more", { n: grammar.length - CAP })}</span>}
              </div>
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
                {cat.slice(0, CAP).map((c, i) => (
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
                {cat.length > CAP && <span className="ag-hint">{t("corpus.more", { n: cat.length - CAP })}</span>}
              </ul>
            )}
          </div>
        )}

        {tab === "names" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h">
              <span>{t("corpus.names")} ({fmtNum((names || []).length)})</span>
              {names && <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("corpus.colTerm"), t("corpus.colRoot"), t("corpus.colCount")], ...names.map((n) => [n.name, n.root || "", n.count])], "divine-names.csv")}>⤓ CSV</button>}
            </div>
            <p className="ag-hint">{t("corpus.namesHint")}</p>
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("corpus.nameType")} style={{ marginBlockEnd: "var(--space-2)" }}>
              <button type="button" className={nameMode === "root" ? "is-on" : ""} aria-pressed={nameMode === "root"} onClick={() => setNameMode("root")} title={t("corpus.nameType.rootT")}>{t("corpus.nameType.root")}</button>
              <button type="button" className={nameMode === "word" ? "is-on" : ""} aria-pressed={nameMode === "word"} onClick={() => setNameMode("word")} title={t("corpus.nameType.wordT")}>{t("corpus.nameType.word")}</button>
            </div>
            <div className="ag-dist-tags">
              {(names || []).map((n, i) => {
                // word mode counts/links the exact form (precision-aware); root mode the root family.
                const wkey = precision === "strict" ? normStrict(n.name) : norm(n.name);
                const wCount = (w2v && w2v[wkey]) ? w2v[wkey].length : 0;
                const usable = nameMode === "word" ? wCount > 0 : !!n.root;
                const count = nameMode === "word" ? wCount : n.count;
                const open = () => nameMode === "word"
                  ? showOcc(n.name, [...(w2v[wkey] || [])].sort(sortVk), { mode: "exact", primary: wkey })
                  : showRoot(n.root);
                return (
                  <button type="button" className="ag-tag ag-tag-btn" key={i} disabled={!usable} onClick={usable ? open : undefined}
                    title={usable ? (nameMode === "word" ? t("corpus.nameWordChip", { count: wCount }) : t("corpus.nameChip", { root: n.root, count: n.count })) : t("corpus.nameNoRoot")}
                    style={{ fontFamily: "var(--font-quran)", opacity: usable ? 1 : 0.5 }}>
                    {n.name}<b style={{ color: "var(--gold-400)", marginInlineStart: 4 }}>{fmtNum(count)}</b>
                  </button>
                );
              })}
            </div>
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
