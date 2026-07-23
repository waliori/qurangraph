/* ═══ Shared-link arrival ═══
 *
 * "Did this tab open a link someone SHARED, or did the visitor come to the site
 * itself?" — the answer gates the first-run onboarding (the welcome dialog and the
 * tour), which must never sit on top of the thing a link was sent to show.
 *
 * The hash alone can't answer it: the app mirrors its own state into `#s=…` on every
 * interaction, so reloading a graph you explored yourself looks identical to opening a
 * pasted share link. So we mark the TAB the first time it boots with no link state —
 * that's a direct arrival — and honour the marker for the rest of the session, reloads
 * included. A tab that first booted *with* link state and no marker came from outside.
 *
 * sessionStorage is per-tab and survives reload; it throws in some privacy modes, so
 * every access is guarded. The fallback ("a hash means a shared link") errs on the safe
 * side: at worst a direct visitor misses the intro, never the reverse.
 */

export const DIRECT_VISIT_KEY = "qg.directVisit";

export function arrivedViaSharedLink(hasLinkState) {
  let direct = false;
  try { direct = sessionStorage.getItem(DIRECT_VISIT_KEY) === "1"; } catch { /* private mode */ }
  if (!hasLinkState) {
    // Landed on a bare URL: this tab is a direct visit, now and after any reload.
    if (!direct) { try { sessionStorage.setItem(DIRECT_VISIT_KEY, "1"); } catch { /* private mode */ } }
    return false;
  }
  return !direct;
}
