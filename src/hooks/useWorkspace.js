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
 *   type ∈ graph | compare | occ | dist | lexicon | verse | word | construction | pairing
 * Note  = { id, title, body, refs[], pin|null, created, updated }
 *   pin  = { centerKey, nodeId|null, dx, dy }  (canvas-anchored sticky note)
 *
 * Two analysis-workbench layers added on top (schema v2):
 *   TagDef = { id, label, color }                       — a coding category (شرك في الملك…)
 *   tagAssign : { "s:a": [tagId…] }                     — verses coded into categories (global)
 *   Claim  = { id, statement, support:[Ref], oppose:[Ref], note, created, updated }
 *     Ref  = { vk, note }                               — a pinned verse with a per-pin gloss
 * The claim board is the ما يؤيد / ما يعارض ledger; the tag layer is qualitative coding with live
 * tallies. Both ride in the same exported JSON, so a researcher's whole case travels in one file.
 */

const KEY = "qg.workspace";
const EMPTY = { v: 2, items: [], notes: [], tags: [], tagAssign: {}, claims: [] };

// CSS hue palette for new tags — picked round-robin so categories stay visually distinct.
export const TAG_COLORS = ["#e8b04b", "#5ec2c2", "#b06be0", "#e07b7b", "#79c267", "#6aa3e0", "#e0a06a", "#c97fb0"];

function sanitize(v) {
  if (!v || typeof v !== "object") return { ...EMPTY };
  const isRef = (r) => r && typeof r.vk === "string";
  return {
    v: 2,
    items: Array.isArray(v.items) ? v.items.filter((x) => x && x.id && x.type) : [],
    notes: Array.isArray(v.notes) ? v.notes.filter((x) => x && x.id) : [],
    tags: Array.isArray(v.tags) ? v.tags.filter((x) => x && x.id && x.label) : [],
    tagAssign: v.tagAssign && typeof v.tagAssign === "object"
      ? Object.fromEntries(Object.entries(v.tagAssign).filter(([k, a]) => k && Array.isArray(a)).map(([k, a]) => [k, [...new Set(a)]]))
      : {},
    claims: Array.isArray(v.claims)
      ? v.claims.filter((c) => c && c.id).map((c) => ({
          id: c.id, statement: c.statement || "", note: c.note || "",
          support: Array.isArray(c.support) ? c.support.filter(isRef) : [],
          oppose: Array.isArray(c.oppose) ? c.oppose.filter(isRef) : [],
          created: c.created || Date.now(), updated: c.updated || Date.now(),
        }))
      : [],
  };
}

// Monotonic-ish id (browser Date.now is fine here; uniqueness within a session via seq).
let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}${(_seq++).toString(36)}`;
const sig = (type, payload) => type + ":" + JSON.stringify(payload ?? null);

// A no-op default so components used without the provider (e.g. unit tests) don't
// crash — they just read empty lists and saving is a no-op.
const NOOP = {
  items: [], notes: [], tags: [], tagAssign: {}, claims: [],
  saveItem: () => undefined, updateItem: () => {}, removeItem: () => {}, moveItem: () => {}, findSaved: () => null,
  addNote: () => undefined, updateNote: () => {}, removeNote: () => {},
  addTag: () => undefined, updateTag: () => {}, removeTag: () => {}, toggleTag: () => {},
  tagsForVerse: () => [], tagCounts: () => ({}),
  addClaim: () => undefined, updateClaim: () => {}, removeClaim: () => {}, moveClaim: () => {},
  addClaimRef: () => {}, updateClaimRef: () => {}, removeClaimRef: () => {},
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

  // The saved item matching (type, payload), or null — lets a save control show its state
  // (filled vs outline ★) and toggle off, so feedback lives on the button (the bottom toast
  // can be hidden behind the floating keyboard).
  const findSaved = useCallback((type, payload) => { const s = sig(type, payload); return store.items.find((x) => sig(x.type, x.payload) === s) || null; }, [store.items]);

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

  // ── Tags (coding scheme) ──────────────────────────────────────────────────
  const addTag = useCallback((label, color) => {
    const id = uid("t");
    setStore((st) => {
      const c = color || TAG_COLORS[st.tags.length % TAG_COLORS.length];
      return { ...st, tags: [...st.tags, { id, label: label || "", color: c }] };
    });
    return id;
  }, [setStore]);
  const updateTag = useCallback((id, patch) => setStore((st) => ({ ...st, tags: st.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)) })), [setStore]);
  const removeTag = useCallback((id) => setStore((st) => ({
    ...st,
    tags: st.tags.filter((t) => t.id !== id),
    tagAssign: Object.fromEntries(Object.entries(st.tagAssign).map(([vk, a]) => [vk, a.filter((x) => x !== id)]).filter(([, a]) => a.length)),
  })), [setStore]);
  // Toggle a tag on a verse; drops the verse key entirely when its last tag is removed.
  const toggleTag = useCallback((vk, tagId) => setStore((st) => {
    const cur = st.tagAssign[vk] || [];
    const next = cur.includes(tagId) ? cur.filter((x) => x !== tagId) : [...cur, tagId];
    const ta = { ...st.tagAssign };
    if (next.length) ta[vk] = next; else delete ta[vk];
    return { ...st, tagAssign: ta };
  }), [setStore]);
  const tagsForVerse = useCallback((vk) => store.tagAssign[vk] || [], [store.tagAssign]);
  // tagId → number of verses carrying it (the live tally).
  const tagCounts = useCallback(() => {
    const out = {};
    for (const a of Object.values(store.tagAssign)) for (const id of a) out[id] = (out[id] || 0) + 1;
    return out;
  }, [store.tagAssign]);

  // ── Claims (ما يؤيد / ما يعارض ledger) ────────────────────────────────────
  const addClaim = useCallback((statement = "") => {
    const id = uid("c");
    const now = Date.now();
    setStore((st) => ({ ...st, claims: [{ id, statement, note: "", support: [], oppose: [], created: now, updated: now }, ...st.claims] }));
    return id;
  }, [setStore]);
  const updateClaim = useCallback((id, patch) => setStore((st) => ({ ...st, claims: st.claims.map((c) => (c.id === id ? { ...c, ...patch, updated: Date.now() } : c)) })), [setStore]);
  const removeClaim = useCallback((id) => setStore((st) => ({ ...st, claims: st.claims.filter((c) => c.id !== id) })), [setStore]);
  const moveClaim = useCallback((id, dir) => setStore((st) => {
    const i = st.claims.findIndex((c) => c.id === id);
    if (i < 0) return st;
    const j = i + dir; if (j < 0 || j >= st.claims.length) return st;
    const claims = st.claims.slice(); [claims[i], claims[j]] = [claims[j], claims[i]];
    return { ...st, claims };
  }), [setStore]);
  // side ∈ "support" | "oppose". Pinning the same verse twice on a side is a no-op.
  const addClaimRef = useCallback((id, side, vk, note = "") => setStore((st) => ({
    ...st,
    claims: st.claims.map((c) => {
      if (c.id !== id) return c;
      if ((c[side] || []).some((r) => r.vk === vk)) return c;
      return { ...c, [side]: [...(c[side] || []), { vk, note }], updated: Date.now() };
    }),
  })), [setStore]);
  const updateClaimRef = useCallback((id, side, vk, note) => setStore((st) => ({
    ...st, claims: st.claims.map((c) => (c.id === id ? { ...c, [side]: c[side].map((r) => (r.vk === vk ? { ...r, note } : r)), updated: Date.now() } : c)),
  })), [setStore]);
  const removeClaimRef = useCallback((id, side, vk) => setStore((st) => ({
    ...st, claims: st.claims.map((c) => (c.id === id ? { ...c, [side]: c[side].filter((r) => r.vk !== vk), updated: Date.now() } : c)),
  })), [setStore]);

  const exportJSON = useCallback(() => JSON.stringify(store, null, 2), [store]);
  const importJSON = useCallback((text, { merge = false } = {}) => {
    let parsed;
    try { parsed = sanitize(JSON.parse(text)); } catch { return false; }
    setStore((st) => (merge
      ? { v: 2, items: [...parsed.items, ...st.items], notes: [...parsed.notes, ...st.notes],
          tags: [...st.tags, ...parsed.tags.filter((p) => !st.tags.some((t) => t.id === p.id))],
          tagAssign: { ...parsed.tagAssign, ...st.tagAssign },
          claims: [...parsed.claims, ...st.claims] }
      : parsed));
    return true;
  }, [setStore]);
  const clearAll = useCallback(() => setStore({ ...EMPTY }), [setStore]);

  const value = useMemo(() => ({
    items: store.items, notes: store.notes, tags: store.tags, tagAssign: store.tagAssign, claims: store.claims,
    saveItem, updateItem, removeItem, moveItem, findSaved,
    addNote, updateNote, removeNote,
    addTag, updateTag, removeTag, toggleTag, tagsForVerse, tagCounts,
    addClaim, updateClaim, removeClaim, moveClaim, addClaimRef, updateClaimRef, removeClaimRef,
    exportJSON, importJSON, clearAll, toast, toastMsg,
  }), [store, saveItem, updateItem, removeItem, moveItem, findSaved, addNote, updateNote, removeNote,
    addTag, updateTag, removeTag, toggleTag, tagsForVerse, tagCounts,
    addClaim, updateClaim, removeClaim, moveClaim, addClaimRef, updateClaimRef, removeClaimRef,
    exportJSON, importJSON, clearAll, toast, toastMsg]);

  return createElement(Ctx.Provider, { value }, children);
}
