import { useEffect, useState } from "react";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { loadSources } from "../data-loader.js";
import { CURRENT_VERSION } from "../changelog.js";

/* ═══ Help / guide ═══
 * A visual, scrollable guide — opened from the toolbar. Examples are colour-coded
 * and set in the Qur'an face; each section carries a small SVG illustration so the
 * encodings are shown, not just told. Pure content; Esc or backdrop closes it.
 */

// A 33%-opacity border tint that works for both hex colours (#abc → #abc55) and CSS
// custom-property colours (var(--gold-400) → color-mix), so theme-aware tokens render right.
const tint = (c, pct = "33%") => (c.startsWith("var(") ? `color-mix(in oklab, ${c} ${pct}, transparent)` : c + "55");
// Colour-coded example word (Qur'an face) — used inline in descriptions.
const ex = (t, c = "var(--gold-400)") => <span className="ag-help-ex" style={{ color: c, borderColor: tint(c) }}>{t}</span>;
// GOLD is the theme-aware token (the dark "aya" amber on the light parchment); the rest
// are the dark-field jewel tones used in the small illustrations.
const BLUE = "#6aa8ff", GOLD = "var(--gold-400)", GREEN = "#34d8a8", RED = "#fb7185", PURPLE = "#a78bfa";

// A reusable mini-node for illustrations.
function gnode(x, y, r, stroke, label, opts = {}) {
  return (
    <g key={label + x}>
      <circle cx={x} cy={y} r={r} fill={tint(stroke, "15%")} stroke={stroke} strokeWidth={opts.sw || 2} strokeDasharray={opts.dash || "none"} />
      {opts.dot && <circle cx={x + r - 2} cy={y - r + 2} r={3.5} fill={GREEN} stroke="#0d1322" strokeWidth={1.2} />}
      {opts.ring && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={PURPLE} strokeWidth={1.5} opacity={0.6} />}
      {label && <text x={x} y={y - r - 6} textAnchor="middle" fontSize={opts.fs || 11} fontWeight="600" fill={stroke} fontFamily="var(--font-quran)">{label}</text>}
    </g>
  );
}

// Hero: a worked example of the network + the colour key.
function hero(t) {
  return (
    <div className="ag-help-hero">
      <svg viewBox="0 0 420 190" className="ag-help-svg" role="img" aria-label={t("help.heroAria")}>
        <line x1="210" y1="100" x2="95" y2="55" stroke={GOLD} strokeWidth="3.2" strokeOpacity="0.85" />
        <line x1="210" y1="100" x2="335" y2="55" stroke="#3a4a6a" strokeWidth="1" strokeOpacity="0.7" />
        <line x1="95" y1="55" x2="60" y2="150" stroke={GREEN} strokeWidth="2" strokeOpacity="0.7" />
        <circle cx="210" cy="100" r="20" fill={tint(GOLD, "20%")} stroke={GOLD} strokeWidth="3.5" />
        <text x="210" y="138" textAnchor="middle" fontSize="13" fontWeight="600" fill={GOLD} fontFamily="var(--font-display)">{t("help.heroCenter")}</text>
        {gnode(95, 55, 13, RED, t("help.heroRareWord"), { dot: true })}
        {gnode(335, 55, 13, "#8d9bb5", t("help.heroCommon"))}
        {gnode(60, 150, 11, PURPLE, t("help.heroExpandedVerse"), { ring: true })}
      </svg>
      <div className="ag-help-key">
        <span className="ag-help-keyrow"><span className="ag-legend-swatch ag-legend-freq" /> {t("help.keyWordColor")}</span>
        <span className="ag-help-keyrow"><span className="ag-help-dot" style={{ background: GREEN }} /> {t("help.keyGreenDot")}</span>
        <span className="ag-help-keyrow"><span className="ag-legend-ring" /> {t("help.keyPurpleRing")}</span>
        <span className="ag-help-keyrow"><span className="ag-help-line" /> {t("help.keyLink")}</span>
        <span className="ag-help-keyrow">
          {ex(t("help.modeWord"), BLUE)} {ex(t("help.modeLemma"), GOLD)} {ex(t("help.modeRoot"), GREEN)}
        </span>
      </div>
    </div>
  );
}

// Modes illustration — grouping granularity from surface → lemma → root.
function modesIllo(t) {
  return (
    <svg viewBox="0 0 420 96" className="ag-help-illo" role="img" aria-label={t("help.modesAria")}>
      {/* root (broad) */}
      <text x="65" y="14" textAnchor="middle" fontSize="11" fontWeight="600" fill={GREEN}>{t("help.illoRoot", { ex: "غفر" })}</text>
      {gnode(35, 58, 9, GREEN, "استغفر", { fs: 9 })}{gnode(65, 74, 9, GREEN, "مغفرة", { fs: 9 })}{gnode(95, 58, 9, GREEN, "غفور", { fs: 9 })}
      {/* lemma */}
      <text x="210" y="14" textAnchor="middle" fontSize="11" fontWeight="600" fill={GOLD}>{t("help.illoLemma", { ex: "استغفر" })}</text>
      {gnode(190, 64, 10, GOLD, "يستغفر", { fs: 9 })}{gnode(230, 64, 10, GOLD, "استغفروا", { fs: 9 })}
      {/* exact */}
      <text x="350" y="14" textAnchor="middle" fontSize="11" fontWeight="600" fill={BLUE}>{t("help.illoWord", { ex: "يستغفرون" })}</text>
      {gnode(350, 64, 11, BLUE, "يستغفرون", { fs: 9 })}
      <line x1="135" y1="48" x2="160" y2="48" stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="2,2" />
      <line x1="270" y1="48" x2="295" y2="48" stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="2,2" />
    </svg>
  );
}

// A miniature self-similarity matrix: lit diagonal (each verse with itself) + lit
// anti-diagonal (A-B-C-B′-A′ ring), to show what the Structure heatmap reveals.
function semIllo(t) {
  const n = 7, s = 11, ox = 168, oy = 6, cells = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const op = i === j ? 0.92 : i === n - 1 - j ? 0.5 : 0.06;
    cells.push(<rect key={`${i}-${j}`} x={ox + j * s} y={oy + i * s} width={s - 1} height={s - 1} rx={1.5} fill={GOLD} opacity={op} />);
  }
  return (
    <svg viewBox="0 0 420 96" className="ag-help-illo" role="img" aria-label={t("help.semAria")}>
      {cells}
      <text x={ox + (n * s) / 2} y={oy + n * s + 12} textAnchor="middle" fontSize="10" fontWeight="600" fill={GOLD}>{t("help.semIllo")}</text>
    </svg>
  );
}

const sec = (title, illo, items) => (
  <section className="ag-help-sec" key={title}>
    <h3 className="ag-help-h">{title}</h3>
    {illo}
    <dl className="ag-help-dl">
      {items.map(([t, d]) => (
        <div className="ag-help-row" key={t}><dt className="ag-help-t">{t}</dt><dd className="ag-help-d">{d}</dd></div>
      ))}
    </dl>
  </section>
);

export function HelpModal({ open, onClose, onStartTour, onWatchIntro, onWhatsNew }) {
  const { t } = useI18n();
  // Lazy-load the build's source-provenance manifest the first time Help opens; null
  // when the build didn't emit one (older builds), in which case the section is hidden.
  const [sources, setSources] = useState(null);
  useEffect(() => { if (open && !sources) loadSources().then(setSources).catch(() => {}); }, [open, sources]);

  return (
    <ModalShell open={open} onClose={onClose} closeLabel={t("help.close")} ariaLabel={t("help.dialogAria")}
      title={<><span className="ag-badge t-verse">{t("help.badge")}</span><h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{t("help.title")}</h2></>}
      actions={<>
        {onWhatsNew && <button type="button" className="ag-btn" onClick={onWhatsNew}>✦ {t("changelog.openFromHelp")}</button>}
        {onWatchIntro && <button type="button" className="ag-btn" onClick={onWatchIntro}>▶ {t("intro.watch")}</button>}
        {onStartTour && <button type="button" className="ag-btn is-gold" onClick={onStartTour}>↗ {t("tour.start")}</button>}
      </>}>
        <div className="ag-help-body">
          {hero(t)}

          {sec(t("help.modesTitle"), modesIllo(t), [
            [t("help.modeWord"), <>{t("help.modeWordD1")} {ex("يستغفرون", BLUE)} {t("help.modeWordD2")}</>],
            [t("help.modeLemma"), <>{t("help.modeLemmaD1")} {ex("استغفر", GOLD)} + {ex("يستغفرون", GOLD)} {t("help.modeLemmaD2")} {ex("غفور", RED)} {t("help.modeLemmaD3")}</>],
            [t("help.modeRoot"), <>{t("help.modeRootD1")} {ex("غفر", GREEN)}: {ex("استغفر", GREEN)}، {ex("مغفرة", GREEN)}، {ex("غفور", GREEN)}…</>],
          ])}

          {sec(t("help.precisionTitle"), null, [
            [t("help.lenient"), <>{t("help.lenientD1")} {ex("آية", GREEN)} <b style={{ color: GREEN }}>=</b> {ex("اية", GREEN)}{t("help.lenientD2")}{ex("صلاة", GREEN)} <b style={{ color: GREEN }}>=</b> {ex("صلوه", GREEN)}.</>],
            [t("help.strict"), <>{t("help.strictD1")} {ex("آية", RED)} <b style={{ color: RED }}>≠</b> {ex("اية", RED)}.</>],
          ])}

          {sec(t("help.findTitle"), null, [
            [t("help.search"), <>{t("help.searchD1")} {ex("السلام", GOLD)} {t("help.searchFinds")} {ex("ٱلسَّلَٰم", GOLD)}، {ex("الربا", GOLD)} {t("help.searchFinds")} {ex("ٱلرِّبَوٰا", GOLD)}، {ex("الصلاة", GOLD)} {t("help.searchFinds")} {ex("ٱلصَّلَوٰة", GOLD)}. {t("help.searchD2")}</>],
            [t("help.verseRef"), <>{t("help.verseRefD1")} {ex("2:255", "var(--text-body)")} {t("help.verseRefD2")}</>],
          ])}

          {sec(t("help.navTitle"), null, [
            [t("help.expandCollapse"), t("help.expandCollapseD")],
            [t("help.pan"), t("help.panD")],
            [t("help.context"), <>{t("help.contextD1")} {ex("☰", "var(--text-body)")} {t("help.contextD2")}</>],
            [t("help.undoRedo"), <>{ex("Ctrl+Z", "var(--text-body)")} {t("help.undoRedoD1")}{ex("Ctrl+Y", "var(--text-body)")} {t("help.undoRedoD2")}</>],
          ])}

          {sec(t("help.colorsTitle"), null, [
            [t("help.colorCenter"), <><span className="ag-help-dot" style={{ background: GOLD }} /> {t("help.colorCenterD")}</>],
            [t("help.colorWordLemmaRoot"), <><span className="ag-legend-swatch ag-legend-freq" /> {t("help.colorFreqD")}</>],
            [t("help.colorVerse"), <><span className="ag-legend-swatch ag-legend-depth" /> {t("help.colorDepthD")}</>],
            [t("help.colorLinks"), <><span className="ag-help-line" /> {t("help.colorLinksD")}</>],
            [t("help.colorExpanded"), <><span className="ag-help-dot" style={{ background: GREEN }} /> {t("help.colorExpandedD1")} <span className="ag-legend-ring" /> {t("help.colorExpandedD2")}</>],
            [t("help.colorNoRoot"), <><span className="ag-legend-dot ag-legend-dash" /> {t("help.colorNoRootD")}</>],
          ])}

          {sec(t("help.toolsTitle"), null, [
            [t("help.morphFilter"), <>{t("help.morphFilterD1")}{ex(t("help.tVerb"), BLUE)}/{ex(t("help.tNoun"), BLUE)}{t("help.morphFilterD2")}{ex(t("help.tPast"), GOLD)}/{ex(t("help.tPresent"), GOLD)}/{ex(t("help.tImperative"), GOLD)}{t("help.morphFilterD3")}{ex(t("help.tPassive"), RED)}{t("help.morphFilterD4")}</>],
            [t("help.morphSearch"), t("help.morphSearchD")],
            [t("help.rareLinks"), t("help.rareLinksD")],
            [t("help.hiddenWords"), <>{t("help.hiddenWordsD1")}{ex("علي", "var(--text-faint)")} ≠ {ex("عليهم", "var(--text-faint)")}{t("help.hiddenWordsD2")}</>],
            [t("help.versesPerWord"), t("help.versesPerWordD")],
            [t("help.renderer"), t("help.rendererD")],
          ])}

          {sec(t("help.analysisTitle"), null, [
            [t("help.morphAnalysis"), t("help.morphAnalysisD")],
            [t("help.lexicons"), <>{t("help.lexiconsD1")}{ex("العين", GREEN)}، {ex("الصحاح", GREEN)}، {ex("مقاييس", GREEN)}، {ex("المحكم", GREEN)}، {ex("المفردات", GREEN)}، {ex("لسان العرب", GREEN)}{t("help.lexiconsD2")}</>],
            [t("help.distribution"), <>{t("help.distributionD")}{t("help.distributionD2")}</>],
            [t("help.compare"), t("help.compareD")],
            [t("help.allVerses"), t("help.allVersesD")],
            [t("help.opposites"), <>{t("help.oppositesD1")} {ex("صدق", GREEN)} <span style={{ color: "var(--text-faint)" }}>↔</span> {ex("كذب", RED)} {t("help.oppositesD2")}</>],
            [t("help.corpusExplorer"), <>{t("help.corpusExplorerD1")}{ex("الرحمن", GOLD)}، {ex("السلام", GOLD)}{t("help.corpusExplorerD2")}</>],
            [t("help.citations"), t("help.citationsD")],
          ])}

          {sec(t("help.semTitle"), semIllo(t), [
            [t("help.rootLab"), <>{t("help.rootLabD1")}<b style={{ color: GREEN }}>{t("help.rootLabDeriv")}</b>{t("help.rootLabDerivD")}<b style={{ color: GREEN }}>{t("help.rootLabKin")}</b>{t("help.rootLabKinD")}<b style={{ color: RED }}>{t("help.rootLabOpp")}</b>{t("help.rootLabOppD")}<b style={{ color: GOLD }}>{t("help.rootLabLex")}</b>{t("help.rootLabLexD")}<b style={{ color: GREEN }}>{t("help.rootLabSem")}</b>{t("help.rootLabSemD")}
              <span style={{ display: "block", marginBlockStart: 4 }}>
                {ex("عَلِمَ", GREEN)} ← {ex("عالِم", GREEN)} ← {ex("عِلْم", GREEN)} <span style={{ color: "var(--text-faint)" }}>·</span> {ex("بصر", BLUE)} {ex("صبر", BLUE)} {ex("برص", BLUE)} <span style={{ color: "var(--text-faint)" }}>·</span> {ex("رحم", PURPLE)} ⇢ {ex("غفر", PURPLE)}
              </span></>],
            [t("help.ayaLab"), <>{t("help.ayaLabD")}{t("help.ayaLabD2")} <span style={{ color: "var(--text-faint)" }}>—</span> {ex("طلق", GREEN)} {ex("عدد", GREEN)}</>],
            [t("help.rhyme"), <>{t("help.rhymeD")} <span style={{ color: "var(--text-faint)" }}>—</span> {ex("مُبِين", GOLD)} {ex("الرَّحِيم", GOLD)} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{t("help.egRhyme")}</span></>],
            [t("help.phrases"), <>{t("help.phrasesD")} <span style={{ color: "var(--text-faint)" }}>—</span> {ex("فبأيّ آلاء ربكما تكذبان", GOLD)}</>],
            [t("help.surahLab"), <>{t("help.surahLabD1")}<b style={{ color: GREEN }}>{t("help.surahLabKey")}</b>{t("help.surahLabKeyD")}<b style={{ color: GREEN }}>{t("help.surahLabCoh")}</b>{t("help.surahLabCohD")}<b style={{ color: GREEN }}>{t("help.surahLabStruct")}</b>{t("help.surahLabStructD")}<b style={{ color: GREEN }}>{t("help.surahLabBonds")}</b>{t("help.surahLabBondsD")}<b style={{ color: PURPLE }}>{t("help.surahLabIltifat")}</b>{t("help.surahLabIltifatD")}<b style={{ color: PURPLE }}>{t("help.surahLabLetters")}</b>{t("help.surahLabLettersD")}<b style={{ color: PURPLE }}>{t("help.surahLabCompareT")}</b>{t("help.surahLabCompareD")}
              <span style={{ display: "block", marginBlockStart: 4 }}>{ex("تلك أمة قد خلت", GOLD)} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{t("help.egBond")}</span></span></>],
            [t("help.expr"), <>{t("help.exprD")}
              <b style={{ color: GREEN }}>{t("help.exprGov")}</b>{t("help.exprGovD")}<b style={{ color: GREEN }}>{t("help.exprColloc")}</b>{t("help.exprCollocD")}<b style={{ color: GREEN }}>{t("help.exprComp")}</b>{t("help.exprCompD")}<b style={{ color: PURPLE }}>{t("help.exprIdiom")}</b>{t("help.exprIdiomD")}
              <span style={{ display: "block", marginBlockStart: 4 }}>{ex("آمَنَ بـ", GOLD)} {ex("أقام الصلاة", GOLD)} {ex("سبيل الله", GOLD)} <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{t("help.exprWhere")}</span></span></>],
          ])}

          {sec(t("help.shareTitle"), null, [
            [t("help.workspace"), <>{ex("★", GOLD)} {t("help.workspaceD")}</>],
            [t("help.shareLink"), <>{t("help.shareLinkD1")} {ex("⎘", "var(--text-body)")} {t("help.shareLinkD2")}</>],
            [t("help.export"), t("help.exportD")],
            [t("help.offline"), t("help.offlineD")],
            [t("help.language"), t("help.languageD")],
          ])}

          {sec(t("help.methodologyTitle"), null, [
            [t("help.methodCurated"), <>{t("help.methodCuratedD1")}{ex(t("help.corpus"), GREEN)}{t("help.methodCuratedD2")}<b>{t("help.methodCuratedBold")}</b>{t("help.methodCuratedD3")}</>],
            [t("help.homographs"), <>{t("help.homographsD1")}<b>{t("help.homographsBold")}</b>{t("help.homographsD2")}</>],
            [t("help.lenientMatch"), <>{t("help.lenientMatchD1")}{ex("آية", GREEN)}={ex("اية", GREEN)}{t("help.lenientMatchD2")}{ex(t("help.exWordMode"), BLUE)}{t("help.lenientMatchD3")}{ex(t("help.strict"), RED)}.</>],
            [t("help.coverage"), t("help.coverageD")],
          ])}

          {sources?.sources?.length > 0 && (
            <section className="ag-help-sec">
              <h3 className="ag-help-h">{t("help.sourcesTitle")}</h3>
              <p className="ag-hint">{t("help.sourcesIntro")}{sources.builtAt ? t("help.sourcesBuilt", { date: sources.builtAt.slice(0, 10) }) : ""}</p>
              <dl className="ag-help-dl">
                {sources.sources.map((s) => (
                  <div className="ag-help-row" key={s.id}>
                    <dt className="ag-help-t">{s.label}</dt>
                    <dd className="ag-help-d" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", wordBreak: "break-all" }}>
                      {s.skipped ? t("help.sourcesSkipped") : <>
                        <a className="ag-help-srclink"
                          href={s.path ? `https://github.com/${s.repo}/blob/${s.ref}/${s.path}` : `https://github.com/${s.repo}`}
                          target="_blank" rel="noopener noreferrer" title={t("help.sourcesOpen")}>
                          {s.repo}@{String(s.ref).slice(0, 12)}
                        </a>
                        {s.sha256 ? <> · sha256 {s.sha256.slice(0, 12)}…</> : null}
                      </>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <p className="ag-hint" style={{ textAlign: "center", paddingBlock: "var(--space-3)" }}>
            {t("help.footer")}
            <br />
            <span>{t("changelog.version")} </span><span dir="ltr">v{CURRENT_VERSION}</span>
          </p>
        </div>
    </ModalShell>
  );
}
