import { formRoman } from "../morphology.js";

/* ═══ Morphology filter ═══
 *
 * Toggle-chip groups (POS / Form / aspect / voice) that constrain which words the
 * graph shows. Each group is a list of allowed codes; an empty group = no
 * constraint. Pure presentational — state lives in QuranGraph (`qg.morphFilter`).
 */

const POS = [
  ["noun", "اسم"], ["verb", "فعل"], ["particle", "حرف"], ["pn", "علم"],
  ["pron", "ضمير"], ["adj", "صفة"], ["actpcpl", "اسم فاعل"], ["passpcpl", "اسم مفعول"],
];
const FORMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Form I–X (XI is vanishingly rare)
const ASPECT = [["perf", "ماضٍ"], ["impf", "مضارع"], ["impv", "أمر"]];
const VOICE = [["act", "معلوم"], ["pass", "مجهول"]];

export function MorphologyFilter({ filter, onChange }) {
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
        <h3 className="ag-pop-h" style={{ margin: 0 }}>تصفية صرفية</h3>
        {active ? <button type="button" className="ag-btn" onClick={() => onChange({ pos: [], form: [], aspect: [], voice: [] })}>مسح</button> : null}
      </div>
      {group("pos", "نوع الكلمة", POS)}
      {group("form", "الوزن", FORMS.map((n) => [n, formRoman(n)]))}
      {group("aspect", "الزمن", ASPECT)}
      {group("voice", "البناء", VOICE)}
    </div>
  );
}
