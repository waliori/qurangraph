import { useState, useEffect } from "react";

/* localStorage-backed state.
 *
 * - Reads the initial value once (lazy), falling back when storage is
 *   unavailable or the stored JSON is corrupt.
 * - An optional `sanitize(value)` runs on both the loaded value and every
 *   update, so out-of-range or malformed persisted data can never reach the UI
 *   (e.g. a stale surah index outside [1, 114]).
 * - Writes are best-effort; a failing setItem (private mode, quota) is ignored.
 */
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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);

  return [value, setValue];
}
