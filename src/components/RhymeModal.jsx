import { useMemo, useState } from "react";
import { rhymeKey, finalWord, suraRhymeScheme, rhymeMates } from "../analytics/rhyme.js";
import { exportCsvFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Verse rhyme / cadence (الفاصلة) ═══
 *
 * The literary-phonological lens on the ĀYA: the verse's ending sound, the sūrah's
 * prevailing fāṣila (with a colour legend so the scheme strip is decodable), and the
 * verses that close on the same rhyme. `rhyme = { centerKey, back? }`. Clicking any verse
 * (a strip cell or a mate) RE-TARGETS the dialog onto that verse — so you stay in the
 * rhyme view and can step back — while a separate ⌖ jumps the graph there.
 */

// Stable colour per distinct ending (golden-angle hue rotation → good separation).
function endingColors(keys) {
  const map = new Map();
  keys.forEach((k, i) => map.set(k, `hsl(${Math.round((i * 137.508) % 360)} 60% 50% / 0.9)`));
  return map;
}

export function RhymeModal({ rhyme, verseData, onRetarget, onBack, onNavigate, onClose }) {
  const { t, fmtNum } = useI18n();
  const [scope, setScope] = useState("sura"); // "sura" | "all"
  const centerKey = rhyme?.centerKey;
  const v = centerKey ? verseData[centerKey] : null;

  const ending = useMemo(() => (v ? rhymeKey(v.text) : null), [v]);
  const scheme = useMemo(() => (v ? suraRhymeScheme(v.s, verseData) : null), [v, verseData]);
  const matesAll = useMemo(() => (v ? rhymeMates(ending, verseData, centerKey) : []), [v, ending, verseData, centerKey]);
  const mates = useMemo(() => (scope === "sura" ? matesAll.filter((vk) => verseData[vk]?.s === v.s) : matesAll), [matesAll, scope, v, verseData]);
  const colors = useMemo(() => endingColors((scheme?.scheme || []).map((s) => s.key)), [scheme]);

  if (!rhyme || !v) return null;
  const ref = `${v.s}:${v.a}`;
  const navTo = (vk) => { const [s, a] = vk.split(":").map(Number); onNavigate?.(s, a); };

  return (
    <ModalShell open={!!rhyme} onClose={onClose} closeLabel={t("rhyme.close")}
      ariaLabel={t("rhyme.title", { ref })}
      title={<>
        {rhyme.back && <button type="button" className="ag-btn" title={t("rhyme.back")} onClick={onBack} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-verse">{ref}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-quran)" }}>{finalWord(v.text)}</h2>
        {ending && <span className="ag-modal-count" style={{ background: colors.get(ending) || "var(--surface-2)", color: "#fff", padding: "1px 9px", borderRadius: 6 }}>{ending}</span>}
      </>}
      actions={<button type="button" className="ag-btn"
        onClick={() => exportCsvFile([[t("rhyme.verses"), t("rhyme.endingCol")], ...(scheme?.seq || []).map((r) => [`${v.s}:${r.a}`, r.key || ""])], `rhyme-${v.s}.csv`)}>⤓ CSV</button>}>
      <div className="ag-dist-body">
        <p className="ag-hint">{t("rhyme.hint")}</p>

        {/* Ending legend — what each colour in the strip means. */}
        {scheme?.scheme?.length > 0 && (
          <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
            {scheme.scheme.slice(0, 8).map((s) => (
              <span className="ag-tag" key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: colors.get(s.key), display: "inline-block" }} />
                <b style={{ fontFamily: "var(--font-quran)" }}>{s.key}</b> {fmtNum(s.count)}
              </span>
            ))}
          </div>
        )}

        <div className="ag-dist-sec">
          <div className="ag-dist-sec-h"><span>{t("rhyme.scheme")}</span></div>
          <p className="ag-hint">{t("rhyme.schemeHint")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(scheme?.seq || []).map((r) => (
              <button type="button" key={r.vk} onClick={() => onRetarget?.(r.vk)} title={`${v.s}:${r.a} — ${r.final} (${r.key || "—"})`}
                aria-current={r.vk === centerKey ? "true" : undefined}
                style={{ minWidth: 30, padding: "2px 6px", borderRadius: 5, border: r.vk === centerKey ? "2px solid var(--gold-400)" : "1px solid transparent",
                  background: r.key ? colors.get(r.key) : "var(--surface-2)", color: r.key ? "#fff" : "var(--text-faint)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                {fmtNum(r.a)}
              </button>
            ))}
          </div>
        </div>

        <div className="ag-dist-sec">
          <div className="ag-dist-sec-h">
            <span>{t("rhyme.mates")} ({fmtNum(mates.length)})</span>
            <button type="button" data-export className="ag-btn"
              onClick={() => exportCsvFile([[t("rhyme.verses")], ...mates.map((vk) => [vk])], `rhyme-mates-${ending || "x"}.csv`)}>⤓ CSV</button>
          </div>
          <div className="ag-seg ag-seg-sm" role="group" aria-label={t("rhyme.scope")} style={{ marginBlockEnd: "var(--space-2)" }}>
            <button type="button" className={scope === "sura" ? "is-on" : ""} aria-pressed={scope === "sura"} onClick={() => setScope("sura")}>{t("rhyme.scopeSura")}</button>
            <button type="button" className={scope === "all" ? "is-on" : ""} aria-pressed={scope === "all"} onClick={() => setScope("all")}>{t("rhyme.scopeAll")}</button>
          </div>
          <p className="ag-hint">{t("rhyme.matesHint", { key: ending || "—" })}</p>
          <div className="ag-dist-tags">
            {mates.length === 0 ? <span className="ag-dist-name">{t("rhyme.none")}</span> : mates.slice(0, 400).map((vk) => (
              <span key={vk} style={{ display: "inline-flex" }}>
                <button type="button" className="ag-tag ag-tag-btn" onClick={() => onRetarget?.(vk)} title={t("rhyme.openRow")}>{vk}</button>
                <button type="button" className="ag-tag ag-tag-btn" onClick={() => navTo(vk)} title={t("common.insp.makeCenter")} aria-label={t("common.insp.makeCenter")} style={{ marginInlineStart: -1 }}>⌖</button>
              </span>
            ))}
            {mates.length > 400 && <span className="ag-hint">{t("rhyme.moreMates", { n: mates.length - 400 })}</span>}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
