import { useEffect, useRef, useState } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useI18n } from "../i18n/index.js";

/* ═══ First-run intro / presentation video ═══
 *
 * A language-specific recording (Arabic vs English) shown on first load, before
 * the interactive tour, and re-openable from Help. The MP4s live in public/ and
 * are served by nginx with byte-range support, so the <video> streams and seeks
 * on demand — `preload="none"` means nothing downloads until the user presses
 * play (kind to low-network devices), and the poster frame fills the box until
 * then. Switching language mid-playback swaps the source while preserving the
 * current position and play/pause state, so the user keeps their place.
 *
 * Two callbacks: onClose(dontShow) dismisses; onStartTour(dontShow) hands off to
 * the interactive tour. Both receive the "don't show on startup" choice, which
 * the parent persists (qg.introHide) — independent of the tour's own flag.
 */
const BASE = import.meta.env.BASE_URL || "./";
const MEDIA = {
  en: { src: `${BASE}ayat-features-tour-1080p.mp4`, poster: `${BASE}ayat-features-tour-poster.jpg` },
  ar: { src: `${BASE}ayat-features-tour-ar.mp4`, poster: `${BASE}ayat-features-tour-ar-poster.jpg` },
};

export function IntroVideoModal({ open, onClose, onStartTour }) {
  const { t, lang, dir, setLang } = useI18n();
  const dialogRef = useRef(null);
  const videoRef = useRef(null);
  const [dontShow, setDontShow] = useState(false);
  // Remember the playback position + whether it was playing so a language switch
  // (which swaps the <video> source) resumes exactly where the user left off.
  const lastTimeRef = useRef(0);
  const playingRef = useRef(false);
  const mountedSrcRef = useRef(null);

  useModalFocus(open, dialogRef, { onEscape: () => onClose(dontShow) });

  const media = MEDIA[lang] || MEDIA.en;

  // On a language switch the src changes: restore the saved position and resume
  // if it was playing. Skipped on the very first mount so preload="none" stays
  // lazy — nothing loads until the user actually presses play.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (mountedSrcRef.current === null) { mountedSrcRef.current = media.src; return; }
    if (mountedSrcRef.current === media.src) return;
    mountedSrcRef.current = media.src;
    const at = lastTimeRef.current, resume = playingRef.current;
    const onMeta = () => {
      try { if (at > 0 && at < (v.duration || Infinity)) v.currentTime = at; } catch { /* seek not ready yet */ }
      if (resume) v.play().catch(() => {});
      v.removeEventListener("loadedmetadata", onMeta);
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.load();
  }, [media.src]);

  if (!open) return null;

  const switchLang = () => setLang(lang === "ar" ? "en" : "ar");

  return (
    <div className="ag-modal-scrim is-open" onClick={() => onClose(dontShow)}>
      <div className="ag-modal ag-intro" role="dialog" aria-modal="true" aria-label={t("intro.dialogAria")}
        ref={dialogRef} tabIndex={-1} dir={dir} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            <span className="ag-badge t-verse">{t("intro.badge")}</span>
            <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{t("intro.title")}</h2>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <button type="button" className="ag-btn ag-intro-lang" onClick={switchLang}
              title={t("intro.switchLangAria")} aria-label={t("intro.switchLangAria")}>
              ⇄ {lang === "ar" ? t("intro.switchToEnglish") : t("intro.switchToArabic")}
            </button>
            <button type="button" className="ag-iconbtn" aria-label={t("intro.close")} onClick={() => onClose(dontShow)}>✕</button>
          </div>
        </div>

        <div className="ag-intro-body">
          <p className="ag-intro-sub">{t("intro.subtitle")}</p>
          <div className="ag-intro-frame">
            <video ref={videoRef} className="ag-intro-video" src={media.src} poster={media.poster}
              controls preload="none" playsInline controlsList="nodownload" aria-label={t("intro.title")}
              onTimeUpdate={(e) => { lastTimeRef.current = e.currentTarget.currentTime; }}
              onPlay={() => { playingRef.current = true; }}
              onPause={() => { playingRef.current = false; }} />
          </div>
          <label className="ag-intro-dont">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            <span>{t("intro.dontShow")}</span>
          </label>
          <div className="ag-intro-nav">
            <button type="button" className="ag-btn" onClick={() => onClose(dontShow)}>{t("intro.skip")}</button>
            <span className="ag-intro-spacer" />
            <button type="button" className="ag-btn is-gold" onClick={() => onStartTour(dontShow)}>↗ {t("intro.startTour")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
