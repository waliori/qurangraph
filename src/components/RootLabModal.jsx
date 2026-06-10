import { useMemo, useState } from "react";
import { derivationFamily } from "../analytics/derivation.js";
import { radicalKin } from "../analytics/kinship.js";
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
const TABS = ["deriv", "kin", "sem"];

export function RootLabModal({ lab, r2v, verseData, morph, semantic, back, onRetarget, onVerses, onBack, onClose }) {
  const { t } = useI18n();
  const [tab, setTab] = useState("deriv");
  const root = lab?.root;

  const deriv = useMemo(() => (root ? derivationFamily(root, r2v, verseData, morph) : []), [root, r2v, verseData, morph]);
  const kin = useMemo(() => (root ? radicalKin(root, Object.keys(r2v), (r) => (r2v[r] || []).length) : { anagrams: [], shared: [] }), [root, r2v]);
  const sem = useMemo(() => (root && semantic ? semantic[root] || [] : null), [root, semantic]);

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

        {tab === "sem" && (
          <div className="ag-dist-sec">
            <div className="ag-dist-sec-h"><span>{t("lab.sem.title")}</span></div>
            <p className="ag-hint">{t("lab.sem.hint")}</p>
            {sem == null ? <span className="ag-dist-name">{t("lab.sem.loading")}</span>
              : sem.length === 0 ? <span className="ag-dist-name">{t("lab.sem.none")}</span> : (
                <div className="ag-dist-tags">
                  {sem.map(([r, s]) => (
                    <button type="button" className="ag-tag ag-tag-btn" key={r} onClick={() => onRetarget?.(r)}
                      title={t("lab.sem.chipTitle", { root: r, sim: s })}>
                      {r} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 4 }}>{s}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
