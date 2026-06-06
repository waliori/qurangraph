import { useState } from "react";
import { norm } from "../arabic-utils.js";

/* ═══ Stop-word editor ═══
 *
 * Makes the hidden-word layer visible and editable. A lit (gold) chip is currently
 * HIDDEN from the graph; click it to show it (and vice-versa) — `hiddenSet` is the
 * effective set the graph applies, so chips always reflect reality. Content
 * defaults (اللّٰه, رب…) and the user's own words apply regardless of the master
 * "hide particles" toggle; particles only hide while that toggle is on.
 */
export function StopWordEditor({ particles, content, hiddenSet, extra, onToggle, onAddExtra, onRemoveExtra }) {
  const [draft, setDraft] = useState("");
  const [showParticles, setShowParticles] = useState(false);
  const isHidden = (w) => hiddenSet.has(norm(w));
  const custom = extra; // show every word the user added, for confirmation

  const chip = (w, onClick, removable) => (
    <button key={w} type="button" className={"ag-morph-chip" + (isHidden(w) ? " is-on" : "")}
      aria-pressed={isHidden(w)} title={isHidden(w) ? "مخفية — اضغط لإظهارها" : "ظاهرة — اضغط لإخفائها"} onClick={onClick}>
      {w}{removable ? " ✕" : ""}
    </button>
  );
  const add = () => { const n = norm(draft); if (n.length >= 2) { onAddExtra(n); setDraft(""); } };

  return (
    <div className="ag-morph">
      <h3 className="ag-pop-h" style={{ margin: 0 }}>الكلمات المخفية</h3>
      <p className="ag-hint">الكلمة المضيئة مخفية من الشبكة — اضغطها لإظهارها. تُطابق بحروفها دون تشكيل («علي» ≠ «عليهم»). حروف المعاني تُخفى بزرّ «إخفاء حروف المعاني» أعلاه، أو اضغط الحرف هنا لإخفائه وحده.</p>

      <div className="ag-morph-grp">
        <span className="ag-range-lab">كلمات محتوى (مخفية افتراضيًا)</span>
        <div className="ag-morph-chips">{content.map((w) => chip(w, () => onToggle(w)))}</div>
      </div>

      {custom.length > 0 && (
        <div className="ag-morph-grp">
          <span className="ag-range-lab">كلمات أضفتها</span>
          <div className="ag-morph-chips">{custom.map((w) => chip(w, () => onRemoveExtra(w), true))}</div>
        </div>
      )}

      <div className="ag-morph-grp">
        <span className="ag-range-lab">إضافة كلمة لإخفائها</span>
        <div className="ag-stop-add">
          <input className="ag-input" type="text" value={draft} placeholder="كلمة…"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" className="ag-btn is-gold" onClick={add}>إضافة</button>
        </div>
      </div>

      <div className="ag-morph-grp">
        <button type="button" className="ag-btn" aria-expanded={showParticles} onClick={() => setShowParticles((s) => !s)}>
          حروف المعاني ({particles.length}) {showParticles ? "▲" : "▼"}
        </button>
        {showParticles && (
          <div className="ag-morph-chips ag-stop-particles">{particles.map((w) => chip(w, () => onToggle(w)))}</div>
        )}
      </div>
    </div>
  );
}
