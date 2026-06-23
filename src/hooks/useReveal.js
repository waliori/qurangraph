import { useState } from "react";

/* ═══ Incremental list reveal ═══
 *
 * Caps a long list at `step` rows and reveals `step` more on demand, so nothing past
 * the cap is silently unreachable (the old `.slice(0, 200)` dropped the tail with only
 * a hint). `resetKey` snaps the limit back to `step` when the underlying data changes —
 * via the "adjust state during render" pattern, so no effect is needed.
 */
export function useReveal(step = 200, resetKey) {
  const [limit, setLimit] = useState(step);
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) { setSeen(resetKey); setLimit(step); }
  return { limit, more: () => setLimit((l) => l + step) };
}
