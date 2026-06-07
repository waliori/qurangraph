import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePersistedState } from "./usePersistedState.js";

/* ═══ Researcher workspace (localStorage) ═══
 *
 * A persisted notebook for a researcher's session: SAVED ITEMS (re-openable
 * snapshots of results — a graph view, a comparison, an occurrences/distribution
 * result, a definition, a node/verse) and NOTES (free text, optionally pinned to a
 * spot on the graph). One structured store under `qg.workspace`, schema-versioned so
 * it can migrate. Pure CRUD + JSON export/import (localStorage is per-browser, so
 * export is how a researcher backs up or moves their workspace). A tiny transient
 * `toast` gives one-click-save feedback. No data is sent anywhere — it stays local.
 *
 * Item  = { id, type, title, payload, tags[], note, created }
 *   type ∈ graph | compare | occ | dist | lexicon | verse | word
 * Note  = { id, title, body, refs[], pin|null, created, updated }
 *   pin  = { centerKey, nodeId|null, dx, dy }  (canvas-anchored sticky note)
 */

const KEY = "qg.workspace";
const EMPTY = { v: 1, items: [], notes: [] };

function sanitize(v) {
  if (!v || typeof v !== "object") return { v: 1, items: [], notes: [] };
  return {
    v: 1,
    items: Array.isArray(v.items) ? v.items.filter((x) => x && x.id && x.type) : [],
    notes: Array.isArray(v.notes) ? v.notes.filter((x) => x && x.id) : [],
  };
}

// Monotonic-ish id (browser Date.now is fine here; uniqueness within a session via seq).
let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}${(_seq++).toString(36)}`;
const sig = (type, payload) => type + ":" + JSON.stringify(payload ?? null);

// A no-op default so components used without the provider (e.g. unit tests) don't
// crash — they just read empty lists and saving is a no-op.
const NOOP = {
  items: [], notes: [],
  saveItem: () => undefined, updateItem: () => {}, removeItem: () => {}, moveItem: () => {},
  addNote: () => undefined, updateNote: () => {}, removeNote: () => {},
  exportJSON: () => "{}", importJSON: () => false, clearAll: () => {},
  toast: () => {}, toastMsg: null,
};
const Ctx = createContext(NOOP);
export function useWorkspace() { return useContext(Ctx); }

export function WorkspaceProvider({ children }) {
  const [store, setStore] = usePersistedState(KEY, EMPTY, sanitize);
  const [toastMsg, setToastMsg] = useState(null);
  const [toastTick, setToastTick] = useState(0);

  // Transient one-click-save feedback; auto-clears in an effect (bump tick so the
  // same message re-shown back-to-back still restarts the timer).
  const toast = useCallback((msg) => { setToastMsg(msg); setToastTick((n) => n + 1); }, []);
  useEffect(() => {
    if (!toastMsg) return undefined;
    const id = setTimeout(() => setToastMsg(null), 2200);
    return () => clearTimeout(id);
  }, [toastMsg, toastTick]);

  // Save a result. Deduped by (type, payload): an identical save bumps the existing
  // item to the top instead of cluttering the list. Returns the item id.
  const saveItem = useCallback((item) => {
    const s = sig(item.type, item.payload);
    let id = uid("i");
    setStore((st) => {
      const existing = st.items.find((x) => sig(x.type, x.payload) === s);
      if (existing) {
        id = existing.id;
        const rest = st.items.filter((x) => x.id !== existing.id);
        return { ...st, items: [{ ...existing, title: item.title || existing.title, created: Date.now() }, ...rest] };
      }
      return { ...st, items: [{ id, created: Date.now(), tags: [], note: "", ...item }, ...st.items] };
    });
    return id;
  }, [setStore]);

  const updateItem = useCallback((id, patch) => setStore((st) => ({ ...st, items: st.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) })), [setStore]);
  const removeItem = useCallback((id) => setStore((st) => ({ ...st, items: st.items.filter((x) => x.id !== id) })), [setStore]);
  const moveItem = useCallback((id, dir) => setStore((st) => {
    const i = st.items.findIndex((x) => x.id === id);
    if (i < 0) return st;
    const j = i + dir;
    if (j < 0 || j >= st.items.length) return st;
    const items = st.items.slice();
    [items[i], items[j]] = [items[j], items[i]];
    return { ...st, items };
  }), [setStore]);

  const addNote = useCallback((note = {}) => {
    const id = uid("n");
    const now = Date.now();
    setStore((st) => ({ ...st, notes: [{ id, title: "", body: "", refs: [], pin: null, created: now, updated: now, ...note }, ...st.notes] }));
    return id;
  }, [setStore]);
  const updateNote = useCallback((id, patch) => setStore((st) => ({ ...st, notes: st.notes.map((n) => (n.id === id ? { ...n, ...patch, updated: Date.now() } : n)) })), [setStore]);
  const removeNote = useCallback((id) => setStore((st) => ({ ...st, notes: st.notes.filter((n) => n.id !== id) })), [setStore]);

  const exportJSON = useCallback(() => JSON.stringify(store, null, 2), [store]);
  const importJSON = useCallback((text, { merge = false } = {}) => {
    let parsed;
    try { parsed = sanitize(JSON.parse(text)); } catch { return false; }
    setStore((st) => (merge
      ? { v: 1, items: [...parsed.items, ...st.items], notes: [...parsed.notes, ...st.notes] }
      : parsed));
    return true;
  }, [setStore]);
  const clearAll = useCallback(() => setStore({ v: 1, items: [], notes: [] }), [setStore]);

  const value = useMemo(() => ({
    items: store.items, notes: store.notes,
    saveItem, updateItem, removeItem, moveItem,
    addNote, updateNote, removeNote,
    exportJSON, importJSON, clearAll, toast, toastMsg,
  }), [store, saveItem, updateItem, removeItem, moveItem, addNote, updateNote, removeNote, exportJSON, importJSON, clearAll, toast, toastMsg]);

  return createElement(Ctx.Provider, { value }, children);
}
