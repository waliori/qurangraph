import { useState, useEffect } from "react";

/* localStorage-backed state.
 *
 * - Reads the initial value once (lazy), falling back when storage is
 *   unavailable or the stored JSON is corrupt.
 * - An optional `sanitize(value)` runs on both the loaded value and every
 *   update, so out-of-range or malformed persisted data can never reach the UI
 *   (e.g. a stale surah index outside [1, 114]).
 * - Writes are best-effort, but a failing setItem (private mode, quota) is
 *   announced ONCE per session via a `qg:persist-fail` window event — the
 *   workspace rides on this hook, so a silent failure means research that
 *   looks saved evaporates on reload.
 */
let persistFailAnnounced = false;
const announcePersistFail = () => {
  if (persistFailAnnounced || typeof window === "undefined") return;
  persistFailAnnounced = true;
  try { window.dispatchEvent(new Event("qg:persist-fail")); } catch { /* ignore */ }
};

export function usePersistedState(key, fallback, sanitize) {
  const [value, setValue] = useState(() => {
    let raw = fallback;
    try {
      const v = localStorage.getItem(key);
      if (v != null) raw = JSON.parse(v);
    } catch { /* unavailable or corrupt — use fallback */ }
    return sanitize ? sanitize(raw, fallback) : raw;
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { announcePersistFail(); }
  }, [key, value]);

  return [value, setValue];
}
