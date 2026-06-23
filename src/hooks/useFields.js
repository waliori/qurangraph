import { useCallback, useSyncExternalStore } from "react";

/* ═══ User-built semantic fields (الحقول الدلالية) — local only ═══
 *
 * A reader assembles a thematic set of ROOTS by hand (light/darkness, covenant, water…)
 * and the app aggregates the corpus over the whole set. The graph and labs are anchored on
 * one root at a time; this is the concept-study complement, entirely from the corpus. Local
 * (localStorage `qg.fields`), single module-level store (same pattern as useProposals).
 *
 * A field: { id, name, roots:[root…], note }. */
const KEY = "qg.fields";

function sanitize(v) {
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (!v || typeof v !== "object") return { fields: [] };
  const fields = [];
  for (const f of arr(v.fields)) {
    if (!f || typeof f.id !== "string") continue;
    fields.push({ id: f.id, name: typeof f.name === "string" ? f.name : "—", roots: [...new Set(arr(f.roots).filter((r) => typeof r === "string"))], note: typeof f.note === "string" ? f.note : "" });
  }
  return { fields };
}

let store = (() => {
  try { const raw = localStorage.getItem(KEY); return sanitize(raw ? JSON.parse(raw) : null); } catch { return { fields: [] }; }
})();
const listeners = new Set();
let counter = 0;
function setStore(next) {
  store = next;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode / quota */ }
  for (const l of listeners) l();
}
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const getSnapshot = () => store;

export function useFields() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const create = useCallback((name) => {
    const id = `fld-${counter++}-${store.fields.length}`;
    setStore({ fields: [{ id, name: name || "—", roots: [], note: "" }, ...store.fields] });
    return id;
  }, []);
  const remove = useCallback((id) => setStore({ fields: store.fields.filter((f) => f.id !== id) }), []);
  const rename = useCallback((id, name) => setStore({ fields: store.fields.map((f) => (f.id === id ? { ...f, name } : f)) }), []);
  const addRoot = useCallback((id, root) => setStore({ fields: store.fields.map((f) => (f.id === id && !f.roots.includes(root) ? { ...f, roots: [...f.roots, root] } : f)) }), []);
  const removeRoot = useCallback((id, root) => setStore({ fields: store.fields.map((f) => (f.id === id ? { ...f, roots: f.roots.filter((r) => r !== root) } : f)) }), []);
  const exportData = useCallback(() => ({ note: "User-built semantic fields (root sets).", ...store }), []);
  const importData = useCallback((data) => setStore(sanitize(data)), []);

  return { fields: snap.fields, create, remove, rename, addRoot, removeRoot, exportData, importData };
}
