import { useState } from "react";
import { norm } from "../arabic-utils.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Stop-word editor ═══
 *
 * Makes the hidden-word layer visible and editable. A lit (gold) chip is currently
 * HIDDEN from the graph; click it to show it (and vice-versa) — `hiddenSet` is the
 * effective set the graph applies, so chips always reflect reality. Content
 * defaults (اللّٰه, رب…) and the user's own words apply regardless of the master
 * "hide particles" toggle; particles only hide while that toggle is on.
 */
export function StopWordEditor({ particles, content, hiddenSet, extra, onToggle, onAddExtra, onRemoveExtra, onShowAll, onHideAll }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [showParticles, setShowParticles] = useState(false);
  const isHidden = (w) => hiddenSet.has(norm(w));
  const custom = extra; // show every word the user added, for confirmation
  const hiddenCount = hiddenSet.size;

  const chip = (w, onClick, removable) => (
    <button key={w} type="button" className={"ag-morph-chip" + (isHidden(w) ? " is-on" : "")}
      aria-pressed={isHidden(w)} title={isHidden(w) ? t("stop.chipHidden") : t("stop.chipShown")} onClick={onClick}>
      {w}{removable ? " ✕" : ""}
    </button>
  );
  const add = () => { const n = norm(draft); if (n.length >= 2) { onAddExtra(n); setDraft(""); } };

  return (
    <div className="ag-morph">
      <div className="ag-pop-h-row">
        <h3 className="ag-pop-h" style={{ margin: 0 }}>{t("stop.title")}</h3>
        <span style={{ display: "flex", gap: "var(--space-2)" }}>
          <button type="button" className="ag-btn" onClick={onShowAll} disabled={hiddenCount === 0} title={t("stop.showAllTitle")}>{t("stop.showAll")}</button>
          <button type="button" className="ag-btn" onClick={onHideAll} title={t("stop.hideAllTitle")}>{t("stop.hideAll")}</button>
        </span>
      </div>
      <p className="ag-hint">{t("stop.hint")}</p>

      <div className="ag-morph-grp">
        <span className="ag-range-lab">{t("stop.contentGroup")}</span>
        <div className="ag-morph-chips">{content.map((w) => chip(w, () => onToggle(w)))}</div>
      </div>

      {custom.length > 0 && (
        <div className="ag-morph-grp">
          <span className="ag-range-lab">{t("stop.customGroup")}</span>
          <div className="ag-morph-chips">{custom.map((w) => chip(w, () => onRemoveExtra(w), true))}</div>
        </div>
      )}

      <div className="ag-morph-grp">
        <span className="ag-range-lab">{t("stop.addGroup")}</span>
        <div className="ag-stop-add">
          <input className="ag-input" type="text" value={draft} placeholder={t("stop.inputPlaceholder")}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" className="ag-btn is-gold" onClick={add}>{t("stop.addBtn")}</button>
        </div>
      </div>

      <div className="ag-morph-grp">
        <button type="button" className="ag-btn" aria-expanded={showParticles} onClick={() => setShowParticles((s) => !s)}>
          {t("stop.particlesToggle", { count: particles.length })} {showParticles ? "▲" : "▼"}
        </button>
        {showParticles && (
          <div className="ag-morph-chips ag-stop-particles">{particles.map((w) => chip(w, () => onToggle(w)))}</div>
        )}
      </div>
    </div>
  );
}
