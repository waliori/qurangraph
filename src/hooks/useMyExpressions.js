import { useCallback, useMemo, useSyncExternalStore } from "react";

/* ═══ User-curated expressions (local only, single source of truth) ═══
 *
 * The 41 idioms we ship are a CURATED seed; this lets each reader build their OWN list on top —
 * by typing a contiguous phrase or by "promoting" any mined expression (a collocation, a
 * compound, a government frame). Everything lives in localStorage (`qg.myExpr`) — like the
 * workspace, NOTHING is uploaded, so it's the reader's private layer. The reader can also
 * "delete" one of OUR idioms: that only hides it from THEIR list (it stays for everyone else).
 *
 * The store is a SINGLE module-level value (not per-component state): every useMyExpressions()
 * call — the explorer AND the root lab — reads the same snapshot via useSyncExternalStore, so an
 * add in one surface is instantly consistent everywhere with no divergence (an earlier
 * per-component usePersistedState duplicated rows when two instances raced on the same key).
 *
 * A "mine" record is render-ready and reopens its leaf with the right highlight span:
 *   { id, kind:"idiom"|"colloc"|"compound"|"frame", display, occ:[[vk,…idx]], count,
 *     spanKind:"run"|"frame", len?, components?[] }
 * `hidden` is the set of curated idiom display strings the reader removed locally.
 */
const KEY = "qg.myExpr";
const keyOf = (kind, display) => `${kind}:${display}`;

function sanitize(v) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (!v || typeof v !== "object") return { mine: [], hidden: [] };
  // Dedup mine by kind:display (defensive — a corrupt import or older build could carry repeats).
  const seen = new Set(), mine = [];
  for (const it of arr(v.mine)) {
    if (!it || typeof it.display !== "string" || !Array.isArray(it.occ)) continue;
    const k = keyOf(it.kind, it.display);
    if (seen.has(k)) continue;
    seen.add(k); mine.push(it);
  }
  return { mine, hidden: [...new Set(arr(v.hidden).filter((x) => typeof x === "string"))] };
}

// Module-level store: one value, a listener set, immutable updates, localStorage-backed.
let store = (() => {
  try { const raw = localStorage.getItem(KEY); return sanitize(raw ? JSON.parse(raw) : null); } catch { return { mine: [], hidden: [] }; }
})();
const listeners = new Set();
const emit = () => { for (const l of listeners) l(); };
function setStore(next) {
  store = next;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode / quota */ }
  emit();
}
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const getSnapshot = () => store;

let counter = 0;
const newId = () => `me-${counter++}-${store.mine.length}`;

export function useMyExpressions() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const mine = snap.mine;
  const mineKeys = useMemo(() => new Set(mine.map((it) => keyOf(it.kind, it.display))), [mine]);
  const hiddenSet = useMemo(() => new Set(snap.hidden), [snap.hidden]);

  const has = useCallback((kind, display) => mineKeys.has(keyOf(kind, display)), [mineKeys]);
  const isHidden = useCallback((display) => hiddenSet.has(display), [hiddenSet]);

  const add = useCallback((rec) => {
    if (mineKeys.has(keyOf(rec.kind, rec.display))) return; // already present — no-op
    setStore({ ...store, mine: [{ ...rec, id: rec.id || newId() }, ...store.mine] });
  }, [mineKeys]);
  const removeMine = useCallback((kind, display) => {
    setStore({ ...store, mine: store.mine.filter((it) => keyOf(it.kind, it.display) !== keyOf(kind, display)) });
  }, []);
  const toggle = useCallback((rec) => { if (mineKeys.has(keyOf(rec.kind, rec.display))) removeMine(rec.kind, rec.display); else add(rec); }, [mineKeys, add, removeMine]);

  const hideCurated = useCallback((display) => { if (!hiddenSet.has(display)) setStore({ ...store, hidden: [...store.hidden, display] }); }, [hiddenSet]);
  const unhide = useCallback((display) => setStore({ ...store, hidden: store.hidden.filter((x) => x !== display) }), []);

  const exportData = useCallback(() => ({ ...store }), []);
  const importData = useCallback((data) => setStore(sanitize(data)), []);

  return { mine, hidden: snap.hidden, hiddenCount: snap.hidden.length, has, isHidden, toggle, add, removeMine, hideCurated, unhide, exportData, importData };
}
