import { useCallback, useSyncExternalStore } from "react";

/* ═══ Search history (local only) ═══
 *
 * Remembers the terms and phrases the reader searched, with a hit count, so the search box
 * can offer "recent" and "most searched" when it's empty. Local (localStorage `qg.searchHistory`),
 * single module-level store like useFields/useProposals — nothing uploaded.
 *
 * An entry: { id, kind:"term"|"phrase", mode?, lookup?, q?, label, count, at }.
 *   term   → { mode, lookup, label }  (re-runs straight to that word/lemma/root's occurrences)
 *   phrase → { q, label }             (re-runs the multi-word verse search) */
const KEY = "qg.searchHistory";
const CAP = 60; // keep the most recent N

function sanitize(v) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (!v || typeof v !== "object") return { items: [] };
  const seen = new Set(), items = [];
  for (const it of arr(v.items)) {
    if (!it || !it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    items.push({ id: it.id, kind: it.kind === "phrase" ? "phrase" : "term", mode: it.mode || null, lookup: it.lookup || null, q: it.q || null, label: typeof it.label === "string" ? it.label : it.id, count: it.count || 1, at: it.at || 0 });
  }
  return { items: items.slice(0, CAP) };
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

// `at` is supplied by the caller (Date.now()) so the store stays pure of time itself.
export function useSearchHistory() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const record = useCallback((entry, at) => {
    if (!entry || !entry.id) return;
    const prev = store.items.find((x) => x.id === entry.id);
    const merged = { ...entry, count: (prev?.count || 0) + 1, at: at || (prev?.at || 0) + 1 };
    const rest = store.items.filter((x) => x.id !== entry.id);
    setStore({ items: [merged, ...rest].slice(0, CAP) });
  }, []);
  const remove = useCallback((id) => setStore({ items: store.items.filter((x) => x.id !== id) }), []);
  const clear = useCallback(() => setStore({ items: [] }), []);

  return { items: snap.items, count: snap.items.length, record, remove, clear };
}
