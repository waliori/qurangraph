import { formRoman } from "../morphology.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Morphology filter ═══
 *
 * Toggle-chip groups (POS / Form / aspect / voice) that constrain which words the
 * graph shows. Each group is a list of allowed codes; an empty group = no
 * constraint. Pure presentational — state lives in QuranGraph (`qg.morphFilter`).
 */

const POS = ["noun", "verb", "particle", "pn", "pron", "adj", "actpcpl", "passpcpl"];
const FORMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Form I–X (XI is vanishingly rare)
const ASPECT = ["perf", "impf", "impv"];
const VOICE = ["act", "pass"];

export function MorphologyFilter({ filter, onChange }) {
  const { t } = useI18n();
  const f = filter || { pos: [], form: [], aspect: [], voice: [] };
  const toggle = (cat, val) => {
    const cur = f[cat] || [];
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    onChange({ ...f, [cat]: next });
  };
  const active = f.pos.length || f.form.length || f.aspect.length || f.voice.length;

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
        {active ? <button type="button" className="ag-btn" onClick={() => onChange({ pos: [], form: [], aspect: [], voice: [] })}>{t("morph.clear")}</button> : null}
      </div>
      {group("pos", t("morph.pos"), POS.map((c) => [c, t("morph.pos." + c)]))}
      {group("form", t("morph.form"), FORMS.map((n) => [n, formRoman(n)]))}
      {group("aspect", t("morph.aspect"), ASPECT.map((c) => [c, t("morph.aspect." + c)]))}
      {group("voice", t("morph.voice"), VOICE.map((c) => [c, t("morph.voice." + c)]))}
    </div>
  );
}
