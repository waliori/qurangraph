import { useMemo } from "react";
import { rhymeKey, finalWord, suraRhymeScheme, rhymeMates } from "../analytics/rhyme.js";
import { exportCsvFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Verse rhyme / cadence (الفاصلة) ═══
 *
 * The literary-phonological lens on the ĀYA (not the word): every verse's ending sound,
 * the sūrah's prevailing fāṣila, and the verses across the muṣḥaf that close on the same
 * rhyme. `rhyme = { centerKey }`. Chips navigate to a verse.
 */

// Stable colour per distinct ending (golden-angle hue rotation → good separation).
function endingColors(keys) {
  const map = new Map();
  keys.forEach((k, i) => map.set(k, `hsl(${Math.round((i * 137.508) % 360)} 60% 50% / 0.85)`));
  return map;
}

export function RhymeModal({ rhyme, verseData, onNavigate, onClose }) {
  const { t } = useI18n();
  const centerKey = rhyme?.centerKey;
  const v = centerKey ? verseData[centerKey] : null;

  const ending = useMemo(() => (v ? rhymeKey(v.text) : null), [v]);
  const scheme = useMemo(() => (v ? suraRhymeScheme(v.s, verseData) : null), [v, verseData]);
  const mates = useMemo(() => (v ? rhymeMates(ending, verseData, centerKey) : []), [v, ending, verseData, centerKey]);
  const colors = useMemo(() => endingColors((scheme?.scheme || []).map((s) => s.key)), [scheme]);

  if (!rhyme || !v) return null;
  const ref = `${v.s}:${v.a}`;
  const nav = (vk) => { const [s, a] = vk.split(":").map(Number); onNavigate?.(s, a); };

  return (
    <ModalShell open={!!rhyme} onClose={onClose} closeLabel={t("rhyme.close")}
      ariaLabel={t("rhyme.title", { ref })}
      title={<>
        <span className="ag-badge t-verse">{ref}</span>
        <h2 className="ag-modal-word">{finalWord(v.text)}</h2>
        {ending && <span className="ag-modal-count" style={{ background: colors.get(ending), color: "#fff", padding: "0 8px", borderRadius: 6 }}>{ending}</span>}
      </>}
      actions={<button type="button" className="ag-btn"
        onClick={() => exportCsvFile([[t("rhyme.verses"), t("lab.deriv.colForm")], ...(scheme?.seq || []).map((r) => [`${v.s}:${r.a}`, r.key || ""])], `rhyme-${v.s}.csv`)}>⤓ CSV</button>}>
      <div className="ag-dist-body">
        <div className="ag-dist-sec">
          <div className="ag-dist-sec-h"><span>{t("rhyme.scheme")}</span></div>
          <p className="ag-hint">{t("rhyme.hint")}</p>
          {scheme?.dominant && (
            <p className="ag-hint">{t("rhyme.dominant")}: <b style={{ background: colors.get(scheme.dominant), color: "#fff", padding: "0 8px", borderRadius: 6 }}>{scheme.dominant}</b></p>
          )}
          <p className="ag-hint">{t("rhyme.schemeHint")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(scheme?.seq || []).map((r) => (
              <button type="button" key={r.vk} onClick={() => nav(r.vk)} title={`${v.s}:${r.a} — ${r.final} (${r.key || "—"})`}
                aria-current={r.vk === centerKey ? "true" : undefined}
                style={{ minWidth: 30, padding: "2px 6px", borderRadius: 5, border: r.vk === centerKey ? "2px solid var(--gold-400)" : "1px solid transparent",
                  background: r.key ? colors.get(r.key) : "var(--surface-2)", color: r.key ? "#fff" : "var(--text-faint)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                {r.a}
              </button>
            ))}
          </div>
        </div>

        <div className="ag-dist-sec">
          <div className="ag-dist-sec-h">
            <span>{t("rhyme.mates")} ({mates.length})</span>
            <button type="button" data-export className="ag-btn"
              onClick={() => exportCsvFile([[t("rhyme.verses")], ...mates.map((vk) => [vk])], `rhyme-mates-${ending || "x"}.csv`)}>⤓ CSV</button>
          </div>
          <p className="ag-hint">{t("rhyme.matesHint", { key: ending || "—" })}</p>
          <div className="ag-dist-tags">
            {mates.length === 0 ? <span className="ag-dist-name">{t("rhyme.none")}</span> : mates.slice(0, 300).map((vk) => (
              <button type="button" className="ag-tag ag-tag-btn" key={vk} onClick={() => nav(vk)}>{vk}</button>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
