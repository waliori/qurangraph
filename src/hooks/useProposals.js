import { useCallback, useMemo, useSyncExternalStore } from "react";

/* ═══ User-proposed lexical relations (local only) ═══
 *
 * The curated antonym set (data/antonyms.json) is authoritative but finite. This lets a
 * reader PROPOSE a pair — typically by promoting a frame-discovered candidate, or entering
 * one by hand — building a private review queue that exports to JSON the maintainer can fold
 * back into the curated seed. Local-only (localStorage `qg.proposals`), nothing uploaded —
 * the same module-level single-store pattern as useMyExpressions so every surface stays
 * consistent.
 *
 * A proposal: { id, a, b, cat?, note?, created } where a/b are roots (a < b canonicalised). */
const KEY = "qg.proposals";
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function sanitize(v) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (!v || typeof v !== "object") return { items: [] };
  const seen = new Set(), items = [];
  for (const it of arr(v.items)) {
    if (!it || typeof it.a !== "string" || typeof it.b !== "string") continue;
    const k = pairKey(it.a, it.b);
    if (seen.has(k)) continue;
    seen.add(k); items.push({ a: it.a, b: it.b, cat: it.cat || null, note: it.note || "", created: it.created || 0, id: it.id || k });
  }
  return { items };
}

let store = (() => {
  try { const raw = localStorage.getItem(KEY); return sanitize(raw ? JSON.parse(raw) : null); } catch { return { items: [] }; }
})();
const listeners = new Set();
function setStore(next) {
  store = next;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode / quota */ }
  for (const l of listeners) l();
}
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const getSnapshot = () => store;

export function useProposals() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const items = snap.items;
  const keys = useMemo(() => new Set(items.map((it) => pairKey(it.a, it.b))), [items]);

  const has = useCallback((a, b) => keys.has(pairKey(a, b)), [keys]);
  const add = useCallback((a, b, extra = {}) => {
    if (!a || !b || keys.has(pairKey(a, b))) return;
    const id = pairKey(a, b);
    setStore({ items: [{ a, b, cat: extra.cat || null, note: extra.note || "", created: extra.created || 0, id }, ...store.items] });
  }, [keys]);
  const remove = useCallback((a, b) => setStore({ items: store.items.filter((it) => pairKey(it.a, it.b) !== pairKey(a, b)) }), []);
  const toggle = useCallback((a, b, extra) => { if (keys.has(pairKey(a, b))) remove(a, b); else add(a, b, extra); }, [keys, add, remove]);
  const exportData = useCallback(() => ({ note: "User-proposed Qurʾanic relation pairs for review (fold into data/antonyms.json).", ...store }), []);
  const importData = useCallback((data) => setStore(sanitize(data)), []);

  return { items, count: items.length, has, add, remove, toggle, exportData, importData };
}
