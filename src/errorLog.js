/* ═══ Local-only crash log ═══
 *
 * The app uploads nothing — by design (see FEATURES → "Workspace"/"Offline"). That
 * privacy stance also means a crash that only hit `console.error` left no trace once
 * the user reloaded, so we never learned an in-the-wild break happened. This keeps a
 * small, capped ring buffer of the most recent crashes in localStorage instead: a
 * record a user can read out ("open the console and copy `localStorage['qg.crashes']`")
 * or that a future in-app "report an issue" affordance can attach — never sent anywhere.
 *
 * Everything is wrapped so logging a crash can never itself throw (private-mode /
 * quota-full localStorage, a serialisation cycle, a missing global). */

const KEY = "qg.crashes";
const MAX = 20; // keep only the most recent N — a crash log, not a history book

/* Append one crash record. `source` distinguishes a React render boundary catch
 * ("react") from a global window error ("window") / promise rejection ("promise"). */
export function logCrash(error, { source = "react", info = null } = {}) {
  try {
    const rec = {
      at: new Date().toISOString(),
      source,
      message: String(error?.message || error || "unknown"),
      stack: typeof error?.stack === "string" ? error.stack.slice(0, 4000) : null,
      // React passes a { componentStack } info object; keep it, capped.
      componentStack: typeof info?.componentStack === "string" ? info.componentStack.slice(0, 4000) : null,
      url: typeof location !== "undefined" ? location.href : null,
    };
    const prev = getCrashes();
    const next = [...prev, rec].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* logging must never throw — drop the record */ }
}

/* The stored crashes (most recent last), or [] if none / unreadable. */
export function getCrashes() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function clearCrashes() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/* Capture errors that escape React's render tree too — an async throw, an event
 * handler, a rejected promise. Registered once from main.jsx. Idempotent. */
let installed = false;
export function installGlobalErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => logCrash(e.error || e.message, { source: "window" }));
  window.addEventListener("unhandledrejection", (e) => logCrash(e.reason, { source: "promise" }));
}
