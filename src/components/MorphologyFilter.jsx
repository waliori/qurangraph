import { useState } from "react";
import { formRoman, EMPTY_MORPH_FILTER, morphFilterActive } from "../morphology.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Morphology filter ═══
 *
 * Toggle-chip groups that constrain which words the graph shows. The core axes
 * (POS / Form / aspect / voice) are always visible; the agreement + inflection axes
 * (person / number / mood / case) sit under an "advanced" disclosure since they are
 * needed mainly for the iltifāt, oath/conditional and valency lenses. Each group is a
 * list of allowed codes; an empty group = no constraint. Pure presentational — state
 * lives in QuranGraph (`qg.morphFilter`).
 */

const POS = ["noun", "verb", "particle", "pn", "pron", "adj", "actpcpl", "passpcpl"];
const FORMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Form I–X (XI is vanishingly rare)
const ASPECT = ["perf", "impf", "impv"];
const VOICE = ["act", "pass"];
const PERSON = [1, 2, 3];
const NUMBER = ["s", "d", "p"];
const MOOD = ["ind", "subj", "jus"];
const CASE = ["nom", "acc", "gen"];

export function MorphologyFilter({ filter, onChange }) {
  const { t } = useI18n();
  const [showAdv, setShowAdv] = useState(false);
  const f = filter || EMPTY_MORPH_FILTER;
  const toggle = (cat, val) => {
    const cur = f[cat] || [];
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    onChange({ ...f, [cat]: next });
  };
  const active = morphFilterActive(f);
  const advActive = ["person", "number", "mood", "gcase"].some((c) => f[c]?.length);

  const group = (cat, label, items) => (
    <div className="ag-morph-grp" key={cat}>
      <span className="ag-range-lab">{label}</span>
      <div className="ag-morph-chips">
        {items.map(([val, txt]) => (
          <button key={val} type="button"
            className={"ag-morph-chip" + ((f[cat] || []).includes(val) ? " is-on" : "")}
            aria-pressed={(f[cat] || []).includes(val)} onClick={() => toggle(cat, val)}>{txt}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="ag-morph">
      <div className="ag-pop-h-row">
        <h3 className="ag-pop-h" style={{ margin: 0 }}>{t("morph.title")}</h3>
        {active ? <button type="button" className="ag-btn" onClick={() => onChange({ ...EMPTY_MORPH_FILTER })}>{t("morph.clear")}</button> : null}
      </div>
      {group("pos", t("morph.pos"), POS.map((c) => [c, t("morph.pos." + c)]))}
      {group("form", t("morph.form"), FORMS.map((n) => [n, formRoman(n)]))}
      {group("aspect", t("morph.aspect"), ASPECT.map((c) => [c, t("morph.aspect." + c)]))}
      {group("voice", t("morph.voice"), VOICE.map((c) => [c, t("morph.voice." + c)]))}
      <button type="button" className="ag-morph-adv-toggle" aria-expanded={showAdv}
        onClick={() => setShowAdv((v) => !v)}>
        {(showAdv ? "▾ " : "▸ ") + t("morph.advanced")}{!showAdv && advActive ? " •" : ""}
      </button>
      {showAdv && <>
        {group("person", t("morph.person"), PERSON.map((n) => [n, t("morph.person." + n)]))}
        {group("number", t("morph.number"), NUMBER.map((c) => [c, t("morph.number." + c)]))}
        {group("mood", t("morph.mood"), MOOD.map((c) => [c, t("morph.mood." + c)]))}
        {group("gcase", t("morph.case"), CASE.map((c) => [c, t("morph.case." + c)]))}
      </>}
    </div>
  );
}
