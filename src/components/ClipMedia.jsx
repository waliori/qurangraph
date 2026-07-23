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

/* Remove the figure a failed asset lives in — and the group with it, once nothing in
 * that group is left to show, so no empty bordered box survives. */
function hideMedia(node) {
  const fig = node.closest(".ag-cl-media-fig") || node;
  fig.style.display = "none";
  const group = fig.closest(".ag-cl-media-group");
  if (group && ![...group.children].some((c) => c.style.display !== "none")) group.style.display = "none";
}

export const dropOnError = (e) => hideMedia(e.currentTarget);

export function ClipVideo({ url, alt }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A media `error` does not bubble and can fire before React has attached its handler
    // — so re-check the element's own state on mount, and keep a native listener for the
    // late case. Without this a clip that fails (not yet filmed, or a server that answers
    // a missing .mp4 with an HTML page) leaves a permanently empty box.
    const drop = () => hideMedia(el);
    if (el.error || el.networkState === 3 /* NETWORK_NO_SOURCE */) drop();
    el.addEventListener("error", drop);
    if (typeof IntersectionObserver === "undefined") {
      el.play?.().catch(() => {});
      return () => el.removeEventListener("error", drop);
    }
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) { if (e.isIntersecting) el.play?.().catch(() => {}); else el.pause?.(); } },
      { rootMargin: "150px 0px" },
    );
    io.observe(el);
    return () => { io.disconnect(); el.removeEventListener("error", drop); };
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
