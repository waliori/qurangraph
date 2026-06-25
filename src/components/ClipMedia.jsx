import { useEffect, useRef } from "react";

/* ═══ Lazy demo clips ═══
 * Shared by the What's-New log and the Help guide. A dialog can hold dozens of
 * <video>s and browsers cap how many decode/play at once (Safari/mobile especially),
 * so naive autoPlay starves the off-screen ones (they show blank). preload="metadata"
 * keeps each box correctly sized without a full decode; an IntersectionObserver plays
 * only the handful in view and pauses the rest. A missing file removes its whole
 * figure on error, so there's never a broken image or an orphan platform label.
 */
const BASE = import.meta.env.BASE_URL || "./";

export const dropOnError = (e) => {
  const fig = e.currentTarget.closest(".ag-cl-media-fig");
  (fig || e.currentTarget).style.display = "none";
};

export function ClipVideo({ url, alt }) {
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

export function Media({ src, alt }) {
  const url = `${BASE}${src}`;
  if (/\.(mp4|webm)$/i.test(src)) return <ClipVideo url={url} alt={alt} />;
  return <img className="ag-cl-media" src={url} alt={alt} loading="lazy" onError={dropOnError} />;
}

// A demo's media: a desktop and/or mobile asset. The platform LABEL shows only when
// BOTH exist (so a lone screenshot isn't tagged "Desktop").
export function MediaGroup({ media, alt, t }) {
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
