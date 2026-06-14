import { useMemo, useState } from "react";
import { derivationFamily } from "../analytics/derivation.js";
import { radicalKin } from "../analytics/kinship.js";
import { oppositesOf, candidatesOf } from "../analytics/relations.js";
import { formRoman } from "../morphology.js";
import { exportCsvFile, exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
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
const TABS = ["deriv", "kin", "opp", "lex", "sem"];

export function RootLabModal({ lab, r2v, verseData, morph, semantic, relations, lexAll, lexMeta, back, onRetarget, onVerses, onBack, onClose }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("deriv");
  const root = lab?.root;

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
    } else {
      exportJsonFile({ root, neighbours: (sem || []).map(([r, s]) => ({ root: r, similarity: s })) }, `semantic-${root}.json`);
    }
  };

  return (
    <ModalShell open={!!lab} onClose={onClose} closeLabel={t("lab.close")}
      ariaLabel={t("lab.title", { label: lab.label })}
      title={<>
        {back && <button type="button" className="ag-btn" title={t("lab.back")} onClick={onBack} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-root">{t("common.graphMode.root")}</span>
        <h2 className="ag-modal-word">{lab.label}</h2>
        <span className="ag-modal-count">{t("lab.root")} {root}</span>
      </>}
      actions={<button type="button" className="ag-btn" onClick={exportCurrent}>⤓ {tab === "deriv" ? "CSV" : "JSON"}</button>}>
      <div className="ag-dist-body">
        <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("lab.title", { label: lab.label })} style={{ marginBlockEnd: "var(--space-3)" }}>
          {TABS.map((id) => (
            <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>{t(`lab.tab.${id}`)}</button>
          ))}
        </div>

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
                  <button type="button" className="ag-tag ag-tag-btn" key={c.other} onClick={() => onVerses?.(`${root} ↔ ${c.other}`, c.verses)} title={t("lab.opp.attested", { n: c.contrast })} style={{ fontFamily: "var(--font-quran)", opacity: 0.85 }}>
                    {c.other} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>#{c.contrast}</span>
                  </button>
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
              {/* ── Dictionary layer: the six classical sources, side by side ── */}
              <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-2)" }}><span>{t("lab.lex.dicts")}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lex.entries.map((e) => (
                  <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--gold-400)" }}>{e.label}</span>
                    <span className="ag-dist-name" style={{ fontFamily: "var(--font-quran)", color: e.c ? undefined : "var(--text-faint)", lineHeight: 1.7 }}>
                      {e.c || t("lab.lex.noEntry")}
                    </span>
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
                <div className="ag-dist-tags">
                  {sem.map(([r, s]) => {
                    // Encode confidence: similarity (max ≈ the top neighbour) → border + text opacity,
                    // so a strong tie reads boldly and a weak (possibly coincidental) one fades.
                    const strength = Math.max(0.18, Math.min(1, s / (sem[0]?.[1] || 1)));
                    return (
                      <button type="button" className="ag-tag ag-tag-btn" key={r} onClick={() => onRetarget?.(r)}
                        title={t("lab.sem.chipTitle", { root: r, sim: s })}
                        style={{ borderColor: `color-mix(in srgb, var(--gold-500) ${Math.round(strength * 100)}%, transparent)`, opacity: 0.55 + strength * 0.45 }}>
                        {r} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{s}</span>
                      </button>
                    );
                  })}
                </div>
              </>)}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
