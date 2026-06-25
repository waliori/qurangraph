import { useEffect, useRef, useState } from "react";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { THEMES } from "../changelog.js";

/* ═══ "What's new" / changelog dialog ═══
 *
 * Renders a patch log (see src/changelog.js): each version is a dated patch whose
 * changes are grouped under THEME headers, game-patch-note style. Each change has a
 * kind-coloured chip · bilingual headline · optional "detail" sentence · optional
 * ordered how-to "steps" · optional per-platform media (desktop / mobile clips).
 *
 * Two modes:
 *  • normal — the deploy gate passes the unseen slice; Help passes the full history.
 *    Just the log + a close button.
 *  • intro (first-run) — this dialog REPLACES the old presentation video. It adds
 *    tour-style chrome: theme / language / text-size tools in the head, and a
 *    "don't show on startup" + Skip + Start-tour footer. `onClose`/`onStartTour`
 *    receive the don't-show choice so the parent can persist qg.introHide.
 *
 * Patch CONTENT (the { ar, en } strings) is data, not i18n keys — it lives with each
 * entry so a release is one self-contained edit. Only the chrome goes through t().
 */
const BASE = import.meta.env.BASE_URL || "./";

// Default glyph + accessible label per change kind. `icon` on an entry overrides
// the glyph; the label always comes from i18n so screen readers stay translated.
const KIND = {
  new: { glyph: "✦", label: "changelog.kindNew" },
  improve: { glyph: "↑", label: "changelog.kindImprove" },
  fix: { glyph: "⚙", label: "changelog.kindFix" },
};

// Text-size control for the intro view — same bounds/key as the tour, so the
// preference is shared between the two onboarding surfaces.
const SCALE_MIN = 0.85, SCALE_MAX = 1.4, SCALE_STEP = 0.1;
const clampScale = (v) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 100) / 100));
const readScale = () => {
  try { const v = parseFloat(localStorage.getItem("qg.tourScale")); return v >= SCALE_MIN && v <= SCALE_MAX ? v : 1; } catch { return 1; }
};

// Resolve a { ar, en } content field for the active language (Arabic is the fallback).
function pick(field, lang) {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return field[lang] ?? field.ar ?? field.en ?? "";
}

// A MISSING file removes its whole figure on the load error (no broken image / orphan label).
const dropOnError = (e) => {
  const fig = e.currentTarget.closest(".ag-cl-media-fig");
  (fig || e.currentTarget).style.display = "none";
};
// Play a clip only WHILE it's scrolled into view. The dialog can hold 40+ clips and
// browsers cap how many <video>s decode/play at once (Safari/mobile especially) — naive
// `autoPlay` on all of them starves the off-screen ones, which then show blank. preload
// "metadata" keeps each box correctly sized without a full decode; an IntersectionObserver
// plays the handful that are visible and pauses the rest.
function ClipVideo({ url, alt }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { el.play?.().catch(() => {}); return; }
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) { if (e.isIntersecting) el.play?.().catch(() => {}); else el.pause?.(); } },
      { rootMargin: "150px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} className="ag-cl-media" src={url} muted loop playsInline preload="metadata" aria-label={alt} onError={dropOnError} />;
}
function Media({ src, alt }) {
  const url = `${BASE}${src}`;
  if (/\.(mp4|webm)$/i.test(src)) return <ClipVideo url={url} alt={alt} />;
  return <img className="ag-cl-media" src={url} alt={alt} loading="lazy" onError={dropOnError} />;
}

// A change's media: a desktop and/or mobile asset. The platform LABEL shows only when
// BOTH exist (so a lone screenshot isn't tagged "Desktop").
function MediaGroup({ media, alt, t }) {
  const items = [];
  if (media.desktop) items.push(["desktop", media.desktop, t("changelog.platDesktop")]);
  if (media.mobile) items.push(["mobile", media.mobile, t("changelog.platMobile")]);
  if (!items.length) return null;
  const showLabels = items.length > 1;
  return (
    <div className="ag-cl-media-group">
      {items.map(([plat, src, label]) => (
        <figure className={`ag-cl-media-fig is-${plat}`} key={plat}>
          {showLabels && <figcaption className="ag-cl-media-label">{label}</figcaption>}
          <Media src={src} alt={alt} />
        </figure>
      ))}
    </div>
  );
}

function Change({ c, t, lang }) {
  const kind = KIND[c.kind] || KIND.new;
  return (
    <li className="ag-cl-item">
      <span className={`ag-cl-kind is-${c.kind || "new"}`} title={t(kind.label)} aria-label={t(kind.label)}>
        {c.icon || kind.glyph}
      </span>
      <div className="ag-cl-itemmain">
        <p className="ag-cl-text">{pick(c.text, lang)}</p>
        {c.detail && <p className="ag-cl-detail">{pick(c.detail, lang)}</p>}
        {c.steps?.length > 0 && (
          <ol className="ag-cl-steps">
            {c.steps.map((s, si) => <li key={si}>{pick(s, lang)}</li>)}
          </ol>
        )}
        {c.media && <MediaGroup media={c.media} alt={pick(c.mediaAlt, lang)} t={t} />}
      </div>
    </li>
  );
}

export function WhatsNewModal({ open, entries, onClose, intro = false, onStartTour, theme, onToggleTheme }) {
  const { t, lang, setLang } = useI18n();
  const list = entries || [];
  const version = list[0]?.id;
  const [dontShow, setDontShow] = useState(false);
  const [scale, setScale] = useState(readScale);
  const bump = (d) => setScale((prev) => {
    const v = clampScale(prev + d);
    try { localStorage.setItem("qg.tourScale", String(v)); } catch { /* private mode */ }
    return v;
  });
  // Closing (X / scrim / Esc / Skip) carries the don't-show choice in intro mode.
  const close = () => onClose(intro ? dontShow : undefined);

  // First-run chrome: tour-style theme / language / text-size tools in the head.
  const tools = intro ? (
    <>
      <button type="button" className="ag-iconbtn" onClick={onToggleTheme} title={t("common.theme")} aria-label={t("common.theme")}>{theme === "dark" ? "☀" : "☾"}</button>
      <button type="button" className="ag-iconbtn" onClick={() => setLang(lang === "ar" ? "en" : "ar")} title={t("common.language")} aria-label={t("common.language")}>{lang === "ar" ? "EN" : "ع"}</button>
      <button type="button" className="ag-iconbtn" onClick={() => bump(-SCALE_STEP)} disabled={scale <= SCALE_MIN} title={t("tour.textSmaller")} aria-label={t("tour.textSmaller")}>A−</button>
      <button type="button" className="ag-iconbtn" onClick={() => bump(SCALE_STEP)} disabled={scale >= SCALE_MAX} title={t("tour.textLarger")} aria-label={t("tour.textLarger")}>A+</button>
    </>
  ) : undefined;

  return (
    <ModalShell open={open} onClose={close} closeLabel={t("changelog.close")} ariaLabel={t("changelog.dialogAria")}
      actions={tools}
      title={<>
        <span className="ag-badge t-verse">{t(intro ? "intro.badge" : "changelog.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{t("changelog.title")}</h2>
        {version && <span className="ag-cl-ver" dir="ltr">v{version}</span>}
      </>}>
      <div className="ag-cl-body" style={intro ? { "--cl-scale": scale } : undefined}>
        {list.length === 0 && <p className="ag-hint">{t("changelog.empty")}</p>}
        {list.map((v) => (
          <section className="ag-cl-version" key={v.id}>
            <header className="ag-cl-vhead">
              <h3 className="ag-cl-vtitle">{pick(v.title, lang) || `v${v.id}`}</h3>
              {v.date && <time className="ag-cl-vdate" dateTime={v.date}>{v.date}</time>}
            </header>
            {(v.groups || []).map((g, gi) => {
              const th = THEMES[g.theme];
              return (
                <div className="ag-cl-group" key={gi}>
                  {th && (
                    <h4 className="ag-cl-theme">
                      <span className="ag-cl-theme-icon" aria-hidden="true">{th.icon}</span>
                      {pick(th.label, lang)}
                    </h4>
                  )}
                  <ul className="ag-cl-list">
                    {(g.changes || []).map((c, i) => <Change key={i} c={c} t={t} lang={lang} />)}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {intro && (
        <div className="ag-cl-introfoot">
          <label className="ag-intro-dont">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            <span>{t("intro.dontShow")}</span>
          </label>
          <div className="ag-intro-nav">
            <button type="button" className="ag-btn" onClick={close}>{t("intro.skip")}</button>
            <span className="ag-intro-spacer" />
            <button type="button" className="ag-btn is-gold" onClick={() => onStartTour(dontShow)}>↗ {t("intro.startTour")}</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
