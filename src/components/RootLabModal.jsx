import { useMemo, useState } from "react";
import { derivationFamily } from "../analytics/derivation.js";
import { radicalKin } from "../analytics/kinship.js";
import { oppositesOf, candidatesOf } from "../analytics/relations.js";
import { formRoman } from "../morphology.js";
import { sigTier } from "../analytics/assoc.js";
import { exportCsvFile, exportJsonFile } from "../graph/exportGraph.js";
import { expressionsForRoot, occVerses, FRAME_SPAN, spanRun } from "../analytics/expressions.js";
import { valencyProfile } from "../analytics/valency.js";
import { ModalShell } from "./ModalShell.jsx";
import { DisclosurePanel } from "./DisclosurePanel.jsx";
import { SigStars, fmtMetric } from "./Significance.jsx";
import { useMyExpressions } from "../hooks/useMyExpressions.js";
import { useProposals } from "../hooks/useProposals.js";
import { useFields } from "../hooks/useFields.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Root analysis lab ═══
 *
 * Three semantic-linguistic lenses on one root, none of which the form-based graph can
 * show, all Qur'an-internal:
 *   - Derivation (الصرف): the root's derivational family — every derived word, by Form/POS.
 *   - Kinship (الاشتقاق الأكبر): roots built from the same/overlapping radicals.
 *   - Semantic neighbours: roots that occur in similar contexts (distributional meaning).
 * `lab = { root, label }`. Chips/rows call back to explore (open occurrences of a root or
 * an explicit verse list), turning each lens into a jump-off point. `semantic` is the
 * precomputed neighbour map (null while it's still loading).
 */
const TABS = ["deriv", "kin", "opp", "lex", "sem", "expr"];

export function RootLabModal({ lab, r2v, verseData, morph, semantic, relations, lexAll, lexMeta, expr, exprIndex, back, onRetarget, onVerses, onExpressions, onConstruct, onPairing, onBack, onClose }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("deriv");
  const [lexQuery, setLexQuery] = useState(""); // cross-lexicon gloss search (submitted)
  // Search every loaded dictionary's concise gloss for a term → the roots whose entry
  // mentions it, ranked by how many of the six lexicons agree. A cheap cross-reference
  // that turns the dictionaries from per-root lookups into a searchable index.
  const lexSearch = useMemo(() => {
    const q = lexQuery.trim();
    if (q.length < 2 || !lexAll || !lexMeta) return null;
    const hits = new Map(); // root → #lexicons whose gloss mentions q
    for (const L of lexMeta) { const m = lexAll[L.id]; if (!m) continue; for (const r in m) { const c = m[r]?.c; if (c && c.includes(q)) hits.set(r, (hits.get(r) || 0) + 1); } }
    return [...hits.entries()].map(([root, n]) => ({ root, n })).sort((a, b) => b.n - a.n || a.root.localeCompare(b.root)).slice(0, 60);
  }, [lexQuery, lexAll, lexMeta]);
  const root = lab?.root;
  const exprData = useMemo(() => (expr && exprIndex && root ? expressionsForRoot(expr, exprIndex, root) : null), [expr, exprIndex, root]);
  const valency = useMemo(() => valencyProfile(exprData), [exprData]);
  // Open an expression's āyāt with EVERY member word highlighted (not just the root): the occ
  // tuples carry each word's index, so map them through `span` and hand the per-verse highlight
  // set to the occurrences modal. Fixes "only the chosen word lit up" for collocations/compounds.
  const openExpr = (label, occ, span) => {
    const ov = occVerses(occ, verseData, span);
    onVerses?.(label, ov.map((x) => x.vk), Object.fromEntries(ov.map((x) => [x.vk, x.hi])));
  };
  // "+ add to my expressions" toggle, shared with the explorer (same local store).
  const myExpr = useMyExpressions();
  const proposals = useProposals();
  const fieldStore = useFields();
  const promoBtn = (rec) => {
    const added = myExpr.has(rec.kind, rec.display);
    return (
      <button type="button" className="ag-iconbtn" style={{ width: 22, height: 22, fontSize: 12, color: added ? "var(--viridian-400)" : "var(--text-faint)" }}
        title={added ? t("expr.removeMineTitle") : t("expr.addMineTitle")} aria-label={added ? t("expr.removeMine") : t("expr.addMine")}
        onClick={(e) => { e.stopPropagation(); myExpr.toggle(rec); }}>{added ? "−" : "+"}</button>
    );
  };

  const deriv = useMemo(() => (root ? derivationFamily(root, r2v, verseData, morph) : []), [root, r2v, verseData, morph]);
  const kin = useMemo(() => (root ? radicalKin(root, Object.keys(r2v), (r) => (r2v[r] || []).length) : { anagrams: [], shared: [] }), [root, r2v]);
  const sem = useMemo(() => (root && semantic ? semantic[root] || [] : null), [root, semantic]);
  const opp = useMemo(() => (root && relations ? oppositesOf(root, relations) : null), [root, relations]);
  const cand = useMemo(() => (root && relations ? candidatesOf(root, relations) : null), [root, relations]);

  // Dictionary↔corpus: each of the six dictionaries' concise entry for this root, the corpus
  // frequency, and the distinct contrast axes (طباق) the corpus juxtaposes the root with.
  const lex = useMemo(() => {
    if (!root || !lexAll || !lexMeta) return null;
    const entries = lexMeta.map((L) => ({ id: L.id, label: L.label, c: lexAll[L.id]?.[root]?.c || null }));
    const covered = entries.filter((e) => e.c).length;
    const freq = (r2v[root] || []).length;
    const oppList = (root && relations ? oppositesOf(root, relations) : []) || [];
    const axes = {}; // cat → [opposite roots]
    for (const o of oppList) { const k = o.cat || "—"; (axes[k] ||= []).push(o.other); }
    return { entries, covered, freq, axes, axisCount: Object.keys(axes).length, neighbours: (root && semantic ? semantic[root] || [] : []).slice(0, 8) };
  }, [root, lexAll, lexMeta, r2v, relations, semantic]);

  if (!lab) return null;

  // "فعل · الصيغة II · مجهول · ماضٍ" — the derivative's grammatical analysis.
  const morphLabel = (d) => [
    d.pos ? t(`common.morph.pos.${d.pos}`) : null,
    d.vf ? t("common.morph.formVal", { f: formRoman(d.vf) }) : null,
    d.voice === "pass" ? t("common.morph.voice.pass") : null,
    d.aspect ? t(`common.morph.aspect.${d.aspect}`) : null,
  ].filter(Boolean).join(" · ");

  const exportCurrent = () => {
    if (tab === "deriv") {
      exportCsvFile([[t("lab.deriv.colWord"), t("lab.deriv.colForm"), t("lab.deriv.colCount")],
        ...deriv.map((d) => [d.lemma, morphLabel(d), d.count])], `deriv-${root}.csv`);
    } else if (tab === "kin") {
      exportJsonFile({ root, anagrams: kin.anagrams, shared: kin.shared }, `kinship-${root}.json`);
    } else if (tab === "opp") {
      exportJsonFile({ root, opposites: opp || [], candidates: cand || [] }, `relations-${root}.json`);
    } else if (tab === "lex") {
      exportJsonFile({ root, frequency: lex?.freq || 0, dictionaries: (lex?.entries || []).map((e) => ({ source: e.label, entry: e.c })), contrastAxes: lex?.axes || {}, neighbours: (lex?.neighbours || []).map(([r]) => r) }, `dict-corpus-${root}.json`);
    } else if (tab === "expr") {
      exportJsonFile({ root, expressions: exprData }, `expressions-${root}.json`);
    } else {
      exportJsonFile({ root, neighbours: (sem || []).map(([r, s]) => ({ root: r, similarity: s })) }, `semantic-${root}.json`);
    }
  };

  return (
    <ModalShell open={!!lab} share onClose={onClose} closeLabel={t("lab.close")}
      back={back ? onBack : undefined} backLabel={t("lab.back")}
      ariaLabel={t("lab.title", { label: lab.label })}
      title={<>
        <span className="ag-badge t-root">{t("common.graphMode.root")}</span>
        <h2 className="ag-modal-word">{lab.label}</h2>
        <span className="ag-modal-count">{t("lab.root")} {root}</span>
      </>}
      actions={<>
        {onConstruct && <button type="button" className="ag-btn" title={t("work.tools.construction")} onClick={() => onConstruct(root, lab.label)}>⧉ {t("work.tools.construction")}</button>}
        {onPairing && <button type="button" className="ag-btn" title={t("work.tools.pairing")} onClick={() => onPairing(root, lab.label)}>⊞ {t("work.tools.pairing")}</button>}
        {onExpressions && <button type="button" className="ag-btn" title={t("lab.expressions")} onClick={() => onExpressions(root)}>⛓ {t("lab.expressions")}</button>}
        <button type="button" className="ag-btn" onClick={exportCurrent}>⤓ {tab === "deriv" ? "CSV" : "JSON"}</button>
      </>}>
      <div className="ag-dist-body">
        <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("lab.title", { label: lab.label })} style={{ marginBlockEnd: "var(--space-3)" }}>
          {TABS.map((id) => (
            <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{t(`lab.tab.${id}`)}</button>
          ))}
        </div>

        {/* Add this root to a user-built semantic field (concept study). */}
        {root && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBlockEnd: "var(--space-3)" }}>
            <span className="ag-hint" style={{ margin: 0 }}>{t("lab.field.add")}</span>
            {fieldStore.fields.map((f) => (
              <button type="button" key={f.id} className={"ag-tag ag-tag-btn" + (f.roots.includes(root) ? " is-on" : "")} aria-pressed={f.roots.includes(root)}
                title={f.roots.includes(root) ? t("lab.field.in", { name: f.name }) : t("lab.field.to", { name: f.name })}
                onClick={() => (f.roots.includes(root) ? fieldStore.removeRoot(f.id, root) : fieldStore.addRoot(f.id, root))}>
                {f.name}{f.roots.includes(root) ? " ✓" : ""}
              </button>
            ))}
            <button type="button" className="ag-tag ag-tag-btn" title={t("lab.field.create")}
              onClick={() => { const id = fieldStore.create(lab.label); fieldStore.addRoot(id, root); }}>+ {t("lab.field.new")}</button>
          </div>
        )}

        {tab === "deriv" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("lab.deriv.title")}</span></div>
            <p className="ag-hint">{t("lab.deriv.hint")}</p>
            {deriv.length === 0 ? <span className="ag-dist-name">{t("lab.deriv.none")}</span> : (
              <div className="ag-dist-bars">
                {deriv.map((d) => (
                  <button type="button" className="ag-dist-row ag-dist-rowbtn" key={d.key}
                    onClick={() => onVerses?.(d.lemma, d.verses)} title={t("lab.deriv.rowTitle", { label: d.lemma, count: d.count })}>
                    <span className="ag-dist-name" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                      <b>{d.lemma}</b>
                      <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{morphLabel(d) || d.examples.slice(0, 3).join("، ")}</span>
                    </span>
                    <span className="ag-dist-num">{d.count}</span>
                    <span />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "kin" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("lab.kin.title")}</span></div>
            <p className="ag-hint">{t("lab.kin.hint")}</p>
            {kin.anagrams.length === 0 && kin.shared.length === 0 ? <span className="ag-dist-name">{t("lab.kin.none")}</span> : <>
              {kin.anagrams.length > 0 && <>
                <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-2)" }}><span>{t("lab.kin.anagrams")}</span></div>
                <div className="ag-dist-tags">
                  {kin.anagrams.map((a) => (
                    <button type="button" className="ag-tag ag-tag-btn" key={a.root} onClick={() => onRetarget?.(a.root)}
                      title={t("lab.kin.chipTitle", { root: a.root, count: a.count, common: a.common })}>
                      {a.root} <b style={{ color: "var(--gold-400)" }}>{a.count}</b>
                    </button>
                  ))}
                </div>
              </>}
              {kin.shared.length > 0 && <>
                <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("lab.kin.shared")}</span></div>
                <div className="ag-dist-tags">
                  {kin.shared.slice(0, 60).map((s) => (
                    <button type="button" className="ag-tag ag-tag-btn" key={s.root} onClick={() => onRetarget?.(s.root)}
                      title={t("lab.kin.chipTitle", { root: s.root, count: s.count, common: s.common })}>
                      {s.root} <b style={{ color: "var(--gold-400)" }}>{s.count}</b>
                    </button>
                  ))}
                </div>
              </>}
            </>}
          </div>
        )}

        {tab === "opp" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("lab.opp.title")}</span></div>
            <p className="ag-hint">{t("lab.opp.hint")}</p>
            {opp == null ? <span className="ag-dist-name">{t("lab.opp.loading")}</span> : opp.length === 0 ? <span className="ag-dist-name">{t("lab.opp.none")}</span> : (
              <ul className="ag-phrase-list">
                {opp.map((o) => {
                  const split = o.evidence === "near" || o.evidence === "sample";
                  const chip = (vk) => <button type="button" className="ag-tag ag-tag-btn" key={vk} onClick={() => onVerses?.(`${root} ↔ ${o.other}`, [vk])} title={vk}>{vk}</button>;
                  return (
                  <li key={o.other}><span className="ag-modal-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="ag-tag ag-tag-btn" onClick={() => onRetarget?.(o.other)} title={t("lab.opp.go", { root: o.other })} style={{ fontFamily: "var(--font-quran)" }}>{o.other}</button>
                    {o.framed ? <span title={t("lab.opp.framedTitle")} style={{ color: "var(--gold-400)", fontSize: "var(--text-xs)" }}>⊶ {t("lab.opp.framed")}</span>
                      : o.evidence && o.evidence !== "same" ? <span className="ag-dist-name" style={{ fontSize: "var(--text-xs)", fontStyle: "italic" }}>{t(`lab.opp.ev.${o.evidence}`)}</span> : null}
                    <span style={{ flexBasis: "100%", fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>{o.cat ? t("lab.opp.how", { cat: o.cat }) : t("lab.opp.howNoCat")}</span>
                    {split ? (
                      <span style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>{t("lab.opp.appearsSep")}</span>
                        <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontFamily: "var(--font-quran)" }}>{root}</b>{(o.versesSelf || []).slice(0, 6).map(chip)}</span>
                        <span style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}><b style={{ fontFamily: "var(--font-quran)" }}>{o.other}</b>{(o.versesOther || []).slice(0, 6).map(chip)}</span>
                      </span>
                    ) : (o.verses?.length > 0 && (
                      <span style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{o.verses.slice(0, 6).map(chip)}</span>
                    ))}
                  </span></li>
                  );
                })}
              </ul>
            )}
            {cand && cand.length > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("lab.opp.candidates")}</span></div>
              <p className="ag-hint">{t("lab.opp.candidatesHint")}</p>
              <div className="ag-dist-tags">
                {cand.map((c) => (
                  <span key={c.other} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <button type="button" className="ag-tag ag-tag-btn" onClick={() => onVerses?.(`${root} ↔ ${c.other}`, c.verses)} title={t("lab.opp.attested", { n: c.contrast })} style={{ fontFamily: "var(--font-quran)", opacity: 0.85 }}>
                      {c.other} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>#{c.contrast}</span>
                    </button>
                    <button type="button" className={"ag-tag ag-tag-btn" + (proposals.has(root, c.other) ? " is-on" : "")} aria-pressed={proposals.has(root, c.other)}
                      title={proposals.has(root, c.other) ? t("lab.opp.proposed") : t("lab.opp.propose")}
                      onClick={() => proposals.toggle(root, c.other, { cat: c.cat })}>{proposals.has(root, c.other) ? "✓" : "+"}</button>
                  </span>
                ))}
              </div>
            </>}
            {proposals.count > 0 && <>
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}>
                <span>{t("lab.opp.myProposals")} ({proposals.count})</span>
                <button type="button" className="ag-btn" onClick={() => exportJsonFile(proposals.exportData(), "proposed-relations.json")}>⤓ JSON</button>
              </div>
              <p className="ag-hint">{t("lab.opp.myProposalsHint")}</p>
              <div className="ag-dist-tags">
                {proposals.items.map((p) => (
                  <span key={p.id} className="ag-tag" style={{ fontFamily: "var(--font-quran)" }}>
                    <button type="button" className="ag-tag-btn" style={{ fontFamily: "var(--font-quran)", background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => onRetarget?.(p.a === root ? p.b : p.a)}>{p.a} ↔ {p.b}</button>
                    <button type="button" title={t("lab.opp.removeProposal")} aria-label={t("lab.opp.removeProposal")} style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", marginInlineStart: 4 }} onClick={() => proposals.remove(p.a, p.b)}>✕</button>
                  </span>
                ))}
              </div>
            </>}
          </div>
        )}

        {tab === "lex" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("lab.lex.title")}</span></div>
            <p className="ag-hint">{t("lab.lex.hint")}</p>
            {lex == null ? <span className="ag-dist-name">{t("lab.lex.loading")}</span> : (<>
              {/* ── Cross-lexicon search: find roots whose gloss mentions a term ── */}
              <form onSubmit={(e) => { e.preventDefault(); setLexQuery(e.currentTarget.elements.lexq.value); }} role="search" style={{ display: "flex", gap: 6, marginBlockEnd: "var(--space-2)" }}>
                <input name="lexq" className="ag-input" type="search" defaultValue={lexQuery} placeholder={t("lab.lex.searchPh")} aria-label={t("lab.lex.searchAria")} style={{ flex: 1 }} />
                <button type="submit" className="ag-btn">{t("lab.lex.searchGo")}</button>
              </form>
              {lexSearch && (
                lexSearch.length === 0 ? <p className="ag-hint">{t("lab.lex.searchNone")}</p> : (
                  <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
                    {lexSearch.map((h) => (
                      <button type="button" className="ag-tag ag-tag-btn" key={h.root} onClick={() => onRetarget?.(h.root)} style={{ fontFamily: "var(--font-quran)" }}
                        title={t("lab.lex.searchHit", { n: h.n })}>{h.root} <b style={{ color: "var(--gold-400)" }}>{h.n}</b></button>
                    ))}
                  </div>
                )
              )}

              {/* ── Dictionary layer: the six classical sources, side by side ── */}
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-2)" }}><span>{t("lab.lex.dicts")}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lex.entries.map((e) => (
                  <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--gold-400)" }}>{e.label}</span>
                    <div className="ag-lex-gloss" style={{ fontFamily: "var(--font-quran)", color: e.c ? undefined : "var(--text-faint)" }}>
                      {e.c || t("lab.lex.noEntry")}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Corpus layer: frequency, contrast axes, distributional neighbours ── */}
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("lab.lex.corpus")}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>{t("lab.lex.freq", { n: lex.freq })}</span>
                </div>
                {Object.keys(lex.axes).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>{t("lab.lex.axes")}</span>
                    <div className="ag-dist-tags">
                      {Object.entries(lex.axes).map(([cat, others]) => others.map((o) => (
                        <button type="button" className="ag-tag ag-tag-btn" key={cat + o} onClick={() => onRetarget?.(o)} style={{ fontFamily: "var(--font-quran)" }}>
                          {o}<span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{cat}</span>
                        </button>
                      )))}
                    </div>
                  </div>
                )}
                {lex.neighbours.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>{t("lab.lex.neighbours")}</span>
                    <div className="ag-dist-tags">
                      {lex.neighbours.map(([r, s]) => (
                        <button type="button" className="ag-tag ag-tag-btn" key={r} onClick={() => onRetarget?.(r)} style={{ fontFamily: "var(--font-quran)" }}>
                          {r}<span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{s}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Signals: cheap, falsifiable heuristics (no NLP magic) ── */}
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("lab.lex.signals")}</span></div>
              <ul className="ag-hint" style={{ margin: 0, paddingInlineStart: "1.2em", lineHeight: 1.9 }}>
                <li>{t("lab.lex.coverage", { k: lex.covered, n: lex.entries.length })}</li>
                <li>{lex.axisCount > 1 ? t("lab.lex.polysemy", { n: lex.axisCount }) : t("lab.lex.oneAxis")}</li>
              </ul>
              {lex.covered === 0 && lex.freq === 0 && <span className="ag-dist-name">{t("lab.lex.none")}</span>}
            </>)}
          </div>
        )}

        {tab === "sem" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("lab.sem.title")}</span></div>
            <p className="ag-hint">{t("lab.sem.hint")}</p>
            {sem == null ? <span className="ag-dist-name">{t("lab.sem.loading")}</span>
              : sem.length === 0 ? <span className="ag-dist-name">{t("lab.sem.none")}</span> : (<>
                <p className="ag-hint" style={{ color: "var(--text-faint)", fontStyle: "italic" }}>{t("lab.sem.caveat")}</p>
                <DisclosurePanel label={t("ui.method")}><p style={{ margin: 0 }}>{t("lab.sem.methodBody")}</p></DisclosurePanel>
                <div className="ag-dist-tags">
                  {sem.map(([r, s, rel]) => {
                    // Encode confidence: similarity (max ≈ the top neighbour) → border + text opacity,
                    // so a strong tie reads boldly and a weak (possibly coincidental) one fades.
                    const strength = Math.max(0.18, Math.min(1, s / (sem[0]?.[1] || 1)));
                    // rel: paradigmatic (⇄, substitutable — candidate synonym/antonym) vs syntagmatic (·, goes-together).
                    const relMark = rel === "paradigmatic" ? "⇄" : rel === "syntagmatic" ? "·" : "";
                    return (
                      <button type="button" className="ag-tag ag-tag-btn" key={r} onClick={() => onRetarget?.(r)}
                        title={t("lab.sem.chipTitle", { root: r, sim: s }) + (rel ? " — " + t("lab.sem.rel." + rel) : "")}
                        style={{ borderColor: `color-mix(in srgb, var(--gold-500) ${Math.round(strength * 100)}%, transparent)`, opacity: 0.55 + strength * 0.45 }}>
                        {r} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{s}</span>
                        {relMark && <span style={{ color: "var(--text-faint)", marginInlineStart: 3 }} aria-hidden="true">{relMark}</span>}
                      </button>
                    );
                  })}
                </div>
              </>)}
          </div>
        )}

        {tab === "expr" && (
          <div className="ag-dist-sec">
            <p className="ag-hint">{t("lab.expr.hint")}</p>
            {!exprData ? <span className="ag-dist-name">{t("lab.sem.loading")}</span>
              : (exprData.heads.length + exprData.collocations.length + exprData.compounds.length === 0) ? <span className="ag-dist-name">{t("expr.none")}</span> : (<>
                {valency && (valency.preps.length > 0 || valency.objects.length > 0) && <>
                  <div className="ag-dist-sec-h"><span>{t("lab.valency")}</span></div>
                  <p className="ag-hint">{t("lab.valencyHint")}</p>
                  <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
                    {valency.preps.map((p) => { const disp = expr.prepDisp?.[p.prep] || p.prep; return (
                      <span className="ag-tag" key={p.prep} style={{ fontFamily: "var(--font-quran)" }} title={t("lab.valencyPrep", { prep: disp, n: p.count })}>
                        {disp} <b style={{ color: "var(--gold-400)" }}>{p.count}</b>
                      </span>
                    ); })}
                    {valency.objectTotal > 0 && <span className="ag-tag" title={t("lab.valencyObjTitle")}>{t("lab.valencyObj", { n: valency.objectTotal })}</span>}
                  </div>
                </>}
                {exprData.heads.length > 0 && <>
                  <div className="ag-dist-sec-h"><span>{t("expr.tab.frames")}</span></div>
                  <div className="ag-dist-bars">
                    {exprData.heads.map((h) => (
                      <div className="ag-dist-row" key={h.head} style={{ alignItems: "baseline" }}>
                        <span className="ag-dist-name" style={{ fontFamily: "var(--font-quran)" }}>{h.head}</span>
                        <span style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                          {h.preps.map((p) => { const disp = expr.prepDisp?.[p.prep] || p.prep; return (
                            <span key={p.prep} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              <button type="button" className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }}
                                onClick={() => openExpr(`${h.head} ${disp}`, p.occ, FRAME_SPAN)}>{disp} <b style={{ color: "var(--gold-400)" }}>{p.count}</b></button>
                              {promoBtn({ kind: "frame", display: `${h.head} ${disp}`, occ: p.occ, count: p.count, spanKind: "frame" })}
                            </span>
                          ); })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>}
                {exprData.collocations.length > 0 && <>
                  <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("expr.tab.collocations")}</span></div>
                  <div className="ag-dist-tags">
                    {exprData.collocations.map((c, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        <button type="button" className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }}
                          title={c.ll != null ? t("expr.collChipTitle", { count: c.count, ll: c.ll, ld: c.logdice ?? "—" }) : undefined}
                          onClick={() => openExpr(`${c.verb} ${c.noun}`, c.occ, FRAME_SPAN)}>{c.verb} {c.noun} <b style={{ color: "var(--gold-400)" }}>{c.count}</b>
                          {c.logdice != null && <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{fmtMetric(c.logdice)}</span>}
                          {c.ll != null && <SigStars sig={sigTier(c.ll)} />}</button>
                        {promoBtn({ kind: "colloc", display: `${c.verb} ${c.noun}`, occ: c.occ, count: c.count, spanKind: "frame" })}
                      </span>
                    ))}
                  </div>
                </>}
                {exprData.compounds.length > 0 && <>
                  <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}><span>{t("expr.tab.compounds")}</span></div>
                  <div className="ag-dist-tags">
                    {exprData.compounds.map((c, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        <button type="button" className="ag-tag ag-tag-btn" style={{ fontFamily: "var(--font-quran)" }}
                          onClick={() => openExpr(c.words.join(" "), c.occ, spanRun(c.len ?? c.words.length))}>{c.words.join(" ")} <b style={{ color: "var(--gold-400)" }}>{c.count}</b></button>
                        {promoBtn({ kind: "compound", display: c.words.join(" "), occ: c.occ, count: c.count, spanKind: "run", len: c.len ?? c.words.length })}
                      </span>
                    ))}
                  </div>
                </>}
              </>)}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
