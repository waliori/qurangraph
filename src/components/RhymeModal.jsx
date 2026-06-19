import { useMemo, useState } from "react";
import { rhymeKey, rawiyKey, finalWord, suraRhymeScheme, rhymeMates } from "../analytics/rhyme.js";
import { exportCsvFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Verse rhyme / cadence (الفاصلة) ═══
 *
 * The literary-phonological lens on the ĀYA: the verse's ending sound, the sūrah's prevailing
 * fāṣila (a clickable colour legend + scheme strip), and the verses sharing the rhyme. Reading
 * is read-in-place: clicking a strip cell or a mate shows that verse in the sticky preview at the
 * foot, with its FINAL WORD coloured by its ending — then a separate "analyse" re-targets the
 * dialog onto it, and ⌖ jumps the graph. `rhyme = { centerKey, back? }`.
 */

// Stable colour per distinct ending (golden-angle hue rotation → good separation).
function endingColors(keys) {
  const map = new Map();
  keys.forEach((k, i) => map.set(k, `hsl(${Math.round((i * 137.508) % 360)} 60% 50% / 0.9)`));
  return map;
}

// Render a verse with its final content word emphasised in `color` (the rhyme highlight).
function VerseWithEnding({ text, color }) {
  const parts = text.split(/(\s+)/);
  let last = -1;
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i] && !/^\s+$/.test(parts[i])) { last = i; break; }
  return <span dir="rtl">{parts.map((p, i) => /^\s+$/.test(p) ? <span key={i}> </span>
    : <span key={i} style={i === last ? { color, fontWeight: 700, background: "color-mix(in srgb, " + color + " 22%, transparent)", borderRadius: 4, padding: "0 5px" } : undefined}>{p}</span>)}</span>;
}

export function RhymeModal({ rhyme, verseData, theme = "dark", onRetarget, onBack, onNavigate, onClose }) {
  const { t, fmtNum } = useI18n();
  const [scope, setScope] = useState("sura"); // "sura" | "all"
  const [matchBy, setMatchBy] = useState("key"); // "key" (full ending) | "rawiy" (loose)
  const [preview, setPreview] = useState(null); // vk read in the sticky foot
  const [selEnding, setSelEnding] = useState(null); // legend selection → highlights matching strip cells
  const centerKey = rhyme?.centerKey;
  const v = centerKey ? verseData[centerKey] : null;
  const keyer = matchBy === "rawiy" ? rawiyKey : rhymeKey;

  const ending = useMemo(() => (v ? keyer(v.text) : null), [v, matchBy]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheme = useMemo(() => (v ? suraRhymeScheme(v.s, verseData) : null), [v, verseData]);
  const matesAll = useMemo(() => (v ? rhymeMates(ending, verseData, centerKey, { by: matchBy }) : []), [v, ending, matchBy, verseData, centerKey]);
  const mates = useMemo(() => (scope === "sura" ? matesAll.filter((vk) => verseData[vk]?.s === v.s) : matesAll), [matesAll, scope, v, verseData]);
  const activeScheme = useMemo(() => (matchBy === "rawiy" ? (scheme?.rawiyScheme || []) : (scheme?.scheme || [])), [matchBy, scheme]);
  const colors = useMemo(() => endingColors(activeScheme.map((s) => s.key)), [activeScheme]);

  if (!rhyme || !v) return null;
  const ref = `${v.s}:${v.a}`;
  const navTo = (vk) => { const [s, a] = vk.split(":").map(Number); onNavigate?.(s, a); };
  const pv = preview ? verseData[preview] : null;
  const pvEnding = pv ? keyer(pv.text) : null;
  const pvColor = (pvEnding && colors.get(pvEnding)) || "var(--gold-400)";

  return (
    <ModalShell open={!!rhyme} share onClose={onClose} closeLabel={t("rhyme.close")}
      ariaLabel={t("rhyme.title", { ref })}
      title={<>
        {rhyme.back && <button type="button" className="ag-btn" title={t("rhyme.back")} onClick={onBack} style={{ marginInlineEnd: 4 }}>←</button>}
        <span className="ag-badge t-verse">{ref}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-quran)" }}>{finalWord(v.text)}</h2>
        {ending && <span className="ag-modal-count" style={{ background: colors.get(ending) || "var(--surface-2)", color: "#fff", padding: "1px 9px", borderRadius: 6 }}>{ending}</span>}
      </>}
      actions={<button type="button" className="ag-btn"
        onClick={() => exportCsvFile([[t("rhyme.verses"), t("rhyme.endingCol")], ...(scheme?.seq || []).map((r) => [`${v.s}:${r.a}`, (matchBy === "rawiy" ? r.rawiy : r.key) || ""])], `rhyme-${v.s}.csv`)}>⤓ CSV</button>}>
      <div className="ag-dist-body">
        <p className="ag-hint">{t("rhyme.hint")}</p>

        {/* Interactive legend — click an ending to spotlight its āyāt in the strip below. */}
        {activeScheme.length > 0 && (
          <div className="ag-dist-tags" style={{ marginBlockEnd: "var(--space-2)" }}>
            {activeScheme.slice(0, 8).map((s) => (
              <button type="button" className={"ag-tag ag-tag-btn" + (selEnding === s.key ? " is-on" : "")} key={s.key}
                aria-pressed={selEnding === s.key} title={t("rhyme.legendClick")}
                onClick={() => setSelEnding(selEnding === s.key ? null : s.key)}
                style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: colors.get(s.key), display: "inline-block" }} />
                <b style={{ fontFamily: "var(--font-quran)" }}>{s.key}</b> {fmtNum(s.count)}
              </button>
            ))}
          </div>
        )}

        <div className="ag-dist-sec">
          <div className="ag-dist-sec-h"><span>{t("rhyme.scheme")}</span></div>
          <p className="ag-hint">{t("rhyme.schemeHint")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(scheme?.seq || []).map((r) => {
              const ek = matchBy === "rawiy" ? r.rawiy : r.key;
              const dim = selEnding && ek !== selEnding; // spotlight the legend-selected ending
              return (
              <button type="button" key={r.vk} onClick={() => setPreview(r.vk)} title={`${v.s}:${r.a} — ${r.final} (${ek || "—"})`}
                aria-current={r.vk === centerKey ? "true" : undefined} aria-pressed={r.vk === preview}
                style={{ minWidth: 30, padding: "2px 6px", borderRadius: 5, opacity: dim ? 0.25 : 1,
                  border: r.vk === preview ? "2px solid var(--text-strong)" : r.vk === centerKey ? "2px solid var(--gold-400)" : "1px solid transparent",
                  background: ek ? colors.get(ek) : "var(--surface-2)", color: ek ? "#fff" : "var(--text-faint)", fontSize: "var(--text-xs)", cursor: "pointer" }}>
                {fmtNum(r.a)}
              </button>
              );
            })}
          </div>
        </div>

        <div className="ag-dist-sec">
          <div className="ag-dist-sec-h">
            <span>{t("rhyme.mates")} ({fmtNum(mates.length)})</span>
            <button type="button" data-export className="ag-btn"
              onClick={() => exportCsvFile([[t("rhyme.verses")], ...mates.map((vk) => [vk])], `rhyme-mates-${ending || "x"}.csv`)}>⤓ CSV</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBlockEnd: "var(--space-2)" }}>
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("rhyme.scope")}>
              <button type="button" className={scope === "sura" ? "is-on" : ""} aria-pressed={scope === "sura"} onClick={() => setScope("sura")}>{t("rhyme.scopeSura")}</button>
              <button type="button" className={scope === "all" ? "is-on" : ""} aria-pressed={scope === "all"} onClick={() => setScope("all")}>{t("rhyme.scopeAll")}</button>
            </div>
            <div className="ag-seg ag-seg-sm" role="group" aria-label={t("rhyme.match")}>
              <button type="button" className={matchBy === "key" ? "is-on" : ""} aria-pressed={matchBy === "key"} onClick={() => setMatchBy("key")}>{t("rhyme.matchKey")}</button>
              <button type="button" className={matchBy === "rawiy" ? "is-on" : ""} aria-pressed={matchBy === "rawiy"} onClick={() => setMatchBy("rawiy")}>{t("rhyme.matchRawiy")}</button>
            </div>
          </div>
          <p className="ag-hint">{t("rhyme.matesHint", { key: ending || "—" })}</p>
          <div className="ag-dist-tags">
            {mates.length === 0 ? <span className="ag-dist-name">{t("rhyme.none")}</span> : mates.slice(0, 400).map((vk) => (
              <span key={vk} style={{ display: "inline-flex" }}>
                <button type="button" className={"ag-tag ag-tag-btn" + (vk === preview ? " is-on" : "")} onClick={() => setPreview(vk)} title={t("rhyme.matesRowTitle")}>{vk}</button>
                <button type="button" className="ag-tag ag-tag-btn" onClick={() => navTo(vk)} title={t("common.insp.makeCenter")} aria-label={t("common.insp.makeCenter")} style={{ marginInlineStart: -1 }}>⌖</button>
              </span>
            ))}
            {mates.length > 400 && <span className="ag-hint">{t("rhyme.moreMates", { n: mates.length - 400 })}</span>}
          </div>
        </div>

        {/* Sticky preview — read the verse in place, ending coloured; analyse re-targets, ⌖ jumps. */}
        {pv && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, marginBlockStart: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--ink-800)", borderBlockStart: `2px solid ${pvColor}`, borderRadius: "var(--radius-sm)", boxShadow: "0 -10px 22px -10px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="ag-ayah-ref"><span className="ag-ayah-surah">{pv.sn}</span><span className="ag-ayah-num">{fmtNum(pv.a)}</span></span>
                {pvEnding && <span className="ag-modal-count" style={{ background: pvColor, color: "#fff", padding: "1px 8px", borderRadius: 6, fontFamily: "var(--font-quran)" }}>{pvEnding}</span>}
              </span>
              <span style={{ display: "flex", gap: 4 }}>
                {preview !== centerKey && <button type="button" className="ag-btn" title={t("rhyme.analyse")} onClick={() => onRetarget?.(preview)}>{t("rhyme.analyse")}</button>}
                <button type="button" className="ag-btn is-gold" title={t("rhyme.jump")} onClick={() => navTo(preview)}>⌖</button>
                <button type="button" className="ag-iconbtn" title={t("rhyme.close")} aria-label={t("rhyme.close")} style={{ width: 26, height: 26 }} onClick={() => setPreview(null)}>✕</button>
              </span>
            </div>
            <div className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", marginBlockStart: 4, lineHeight: 1.95, fontSize: "var(--text-lg)" }}>
              <VerseWithEnding text={pv.text} color={theme === "light" ? "#b45309" : pvColor} />
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
