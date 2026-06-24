import { useMemo, useState } from "react";
import { ModalShell } from "./ModalShell.jsx";
import { DisclosurePanel } from "./DisclosurePanel.jsx";
import { frameOccIndex, headOccurrences, availableFacets, runConstruction, constructionVerses } from "../analytics/construction.js";
import { formRoman } from "../morphology.js";
import { norm } from "../arabic-utils.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Construction-query builder ═══
 *
 * Pins one root to a single construction across four facets — Form, voice, governed particle
 * (authoritative from the mined frames, plus a free field for standalone particles like مع), and
 * object definiteness — previewing the live count + a by-particle split, then handing the filtered,
 * highlighted occurrences to the concordance (onVerses) where role/coding/claim tools apply.
 * `lab = { root, label }`. Pure UI over construction.js. */
export function ConstructionModal({ lab, r2v, verseData, morph, expr, onVerses, onBack, onClose }) {
  const { t, fmtNum } = useI18n();
  const root = lab?.root;
  const [form, setForm] = useState(0);          // verb Form code (0 = any)
  const [voice, setVoice] = useState("");       // "" | act | pass
  const [prepChoice, setPrepChoice] = useState("ignore"); // ignore | any | none | <skeleton> | __custom
  const [customPrep, setCustomPrep] = useState("");
  const [objDef, setObjDef] = useState(null);   // null | true | false

  const keys = useMemo(() => (root && r2v?.[root]) || [], [root, r2v]);
  const frameIdx = useMemo(() => frameOccIndex(expr), [expr]);
  const heads = useMemo(() => headOccurrences(root, "root", keys, verseData, morph), [root, keys, verseData, morph]);
  const facets = useMemo(() => availableFacets(heads, frameIdx), [heads, frameIdx]);

  // Translate the UI choices into a construction spec.
  const spec = useMemo(() => {
    const s = { headFilter: { form: form ? [form] : [], voice: voice ? [voice] : [] }, span: 4 };
    if (prepChoice === "any") s.prep = { set: null, mode: "present", source: "any" };
    else if (prepChoice === "none") s.prep = { set: null, mode: "absent", source: "frame" };
    else if (prepChoice === "__custom") { const k = norm(customPrep); if (k) s.prep = { set: [k], mode: "present", source: "standalone" }; }
    else if (prepChoice !== "ignore") s.prep = { set: [norm(prepChoice)], mode: "present", source: "any" };
    if (objDef != null) s.object = { definite: objDef };
    return s;
  }, [form, voice, prepChoice, customPrep, objDef]);

  const result = useMemo(() => runConstruction({ lookup: root, mode: "root", keys, verseData, M: morph, frameIdx, spec }),
    [root, keys, verseData, morph, frameIdx, spec]);

  // A short Arabic/English label describing the active construction (for the concordance title).
  const summary = useMemo(() => {
    const bits = [lab?.label || root];
    if (form) bits.push(t("cq.form") + " " + formRoman(form));
    if (voice) bits.push(t(`cq.voice.${voice}`));
    if (prepChoice === "any") bits.push(t("cq.prep.any"));
    else if (prepChoice === "none") bits.push(t("cq.prepMode.absent"));
    else if (prepChoice === "__custom" && customPrep) bits.push("+ " + customPrep);
    else if (prepChoice !== "ignore") bits.push("+ " + (expr?.prepDisp?.[prepChoice] || prepChoice));
    if (objDef === true) bits.push(t("cq.object.def"));
    if (objDef === false) bits.push(t("cq.object.indef"));
    return bits.join(" · ");
  }, [lab, root, form, voice, prepChoice, customPrep, objDef, expr, t]);

  const open = () => {
    const cv = constructionVerses(result.occ);
    if (!cv.keys.length) return;
    onVerses(summary, cv.keys, cv.hi);
  };

  if (!lab) return null;
  return (
    <ModalShell open={!!lab} share onClose={onClose} closeLabel={t("occ.close")}
      back={onBack || undefined} backLabel={t("occ.back")}
      ariaLabel={t("cq.title")}
      title={<>
        <span className="ag-badge t-root">{t("occ.badge.root")}</span>
        <h2 className="ag-modal-word">{t("cq.title")}</h2>
        <span className="ag-modal-count">{t("cq.for", { label: lab.label || root })}</span>
      </>}>
      <div className="ag-cq">
        <p className="ag-hint ag-cq-intro">{t("cq.intro")}</p>
        {!morph && <p className="ag-hint is-warn">{t("cq.needMorph")}</p>}
        {!expr && <p className="ag-hint is-warn">{t("cq.needExpr")}</p>}

        <div className="ag-cq-facets">
          {/* Form */}
          <label className="ag-cq-facet">
            <span className="ag-cq-lab">{t("cq.form")}</span>
            <select className="ag-select" value={form} onChange={(e) => setForm(+e.target.value)}>
              <option value={0}>{t("cq.form.any")}</option>
              {facets.forms.map((f) => <option key={f} value={f}>{t("cq.form")} {formRoman(f)}</option>)}
            </select>
          </label>
          {/* Voice */}
          <label className="ag-cq-facet">
            <span className="ag-cq-lab">{t("cq.voice")}</span>
            <select className="ag-select" value={voice} onChange={(e) => setVoice(e.target.value)}>
              <option value="">{t("cq.voice.any")}</option>
              {facets.voices.includes("act") && <option value="act">{t("cq.voice.act")}</option>}
              {facets.voices.includes("pass") && <option value="pass">{t("cq.voice.pass")}</option>}
            </select>
          </label>
          {/* Governed particle */}
          <label className="ag-cq-facet">
            <span className="ag-cq-lab">{t("cq.prep")}</span>
            <select className="ag-select" value={prepChoice} onChange={(e) => setPrepChoice(e.target.value)}>
              <option value="ignore">—</option>
              <option value="any">{t("cq.prep.any")}</option>
              <option value="none">{t("cq.prepMode.absent")}</option>
              {facets.preps.map((p) => <option key={p.prep} value={p.prep}>+ {(expr?.prepDisp?.[p.prep] || p.prep)} ({fmtNum(p.count)})</option>)}
              <option value="__custom">+ …</option>
            </select>
          </label>
          {prepChoice === "__custom" && (
            <label className="ag-cq-facet">
              <span className="ag-cq-lab">&nbsp;</span>
              <input className="ag-input ag-input-sm" value={customPrep} placeholder={t("cq.withPlaceholder")} onChange={(e) => setCustomPrep(e.target.value)} />
            </label>
          )}
          {/* Object definiteness */}
          <label className="ag-cq-facet">
            <span className="ag-cq-lab">{t("cq.object")}</span>
            <select className="ag-select" value={objDef === null ? "" : objDef ? "def" : "indef"}
              onChange={(e) => setObjDef(e.target.value === "" ? null : e.target.value === "def")}>
              <option value="">{t("cq.object.any")}</option>
              <option value="def">{t("cq.object.def")}</option>
              <option value="indef">{t("cq.object.indef")}</option>
            </select>
          </label>
        </div>

        <div className="ag-cq-result">
          <span className="ag-cq-count">{t("cq.results", { n: fmtNum(result.total) })}</span>
          {result.byPrep.size > 0 && (
            <span className="ag-cq-byprep">{t("cq.byPrep")}: {[...result.byPrep.entries()].map(([p, c]) => `${expr?.prepDisp?.[p] || p} ${fmtNum(c)}`).join(" · ")}</span>
          )}
          <button type="button" className="ag-btn is-primary" disabled={!result.total} onClick={open}>{t("cq.open")} →</button>
        </div>

        <p className="ag-hint ag-cq-note">{t("cq.facetsNote")} {t("cq.heuristic")}</p>
        <DisclosurePanel label={t("role.title")}><p className="ag-hint">{t("role.heuristic")}</p></DisclosurePanel>
      </div>
    </ModalShell>
  );
}
