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
const EMPTY = { v: 3, items: [], notes: [], tags: [], tagAssign: {}, claims: [], fields: [], groups: [] };
// Artifact arrays that participate in grouping (a group can hold any of these).
export const GROUPABLE = ["items", "notes", "fields", "tags", "claims"];

// CSS hue palette for new tags — picked round-robin so categories stay visually distinct.
export const TAG_COLORS = ["#e8b04b", "#5ec2c2", "#b06be0", "#e07b7b", "#79c267", "#6aa3e0", "#e0a06a", "#c97fb0"];

// Normalise an artifact's `groups` membership array (strings, deduped).
const grps = (x) => (Array.isArray(x.groups) ? [...new Set(x.groups.filter((g) => typeof g === "string"))] : []);

function sanitize(v) {
  if (!v || typeof v !== "object") return { ...EMPTY };
  const isRef = (r) => r && typeof r.vk === "string";
  const strs = (a) => (Array.isArray(a) ? a.filter((r) => typeof r === "string") : []);
  return {
    v: 3,
    items: Array.isArray(v.items) ? v.items.filter((x) => x && x.id && x.type).map((x) => ({ ...x, groups: grps(x) })) : [],
    notes: Array.isArray(v.notes) ? v.notes.filter((x) => x && x.id).map((x) => ({ ...x, groups: grps(x) })) : [],
    tags: Array.isArray(v.tags) ? v.tags.filter((x) => x && x.id && x.label).map((x) => ({ ...x, groups: grps(x) })) : [],
    tagAssign: v.tagAssign && typeof v.tagAssign === "object"
      ? Object.fromEntries(Object.entries(v.tagAssign).filter(([k, a]) => k && Array.isArray(a)).map(([k, a]) => [k, [...new Set(a)]]))
      : {},
    claims: Array.isArray(v.claims)
      ? v.claims.filter((c) => c && c.id).map((c) => ({
          id: c.id, statement: c.statement || "", note: c.note || "", groups: grps(c),
          support: Array.isArray(c.support) ? c.support.filter(isRef) : [],
          oppose: Array.isArray(c.oppose) ? c.oppose.filter(isRef) : [],
          created: c.created || Date.now(), updated: c.updated || Date.now(),
        }))
      : [],
    // Semantic fields (root sets) — migrated in from the old standalone qg.fields store.
    fields: Array.isArray(v.fields)
      ? v.fields.filter((f) => f && typeof f.id === "string").map((f) => ({
          id: f.id, name: typeof f.name === "string" ? f.name : "—", note: typeof f.note === "string" ? f.note : "",
          roots: [...new Set(strs(f.roots))], groups: grps(f),
        }))
      : [],
    groups: Array.isArray(v.groups) ? v.groups.filter((g) => g && typeof g.id === "string").map((g) => ({ id: g.id, name: g.name || "", color: g.color || TAG_COLORS[0] })) : [],
  };
}

// Monotonic-ish id (browser Date.now is fine here; uniqueness within a session via seq).
let _seq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}${(_seq++).toString(36)}`;
const sig = (type, payload) => type + ":" + JSON.stringify(payload ?? null);

// A no-op default so components used without the provider (e.g. unit tests) don't
// crash — they just read empty lists and saving is a no-op.
const NOOP = {
  items: [], notes: [], tags: [], tagAssign: {}, claims: [], fields: [], groups: [],
  saveItem: () => undefined, updateItem: () => {}, removeItem: () => {}, moveItem: () => {}, findSaved: () => null,
  addNote: () => undefined, updateNote: () => {}, removeNote: () => {},
  addTag: () => undefined, updateTag: () => {}, removeTag: () => {}, toggleTag: () => {},
  tagsForVerse: () => [], tagCounts: () => ({}),
  addClaim: () => undefined, updateClaim: () => {}, removeClaim: () => {}, moveClaim: () => {},
  addClaimRef: () => {}, updateClaimRef: () => {}, removeClaimRef: () => {},
  addField: () => undefined, removeField: () => {}, renameField: () => {}, updateField: () => {}, addFieldRoot: () => {}, removeFieldRoot: () => {},
  addGroup: () => undefined, renameGroup: () => {}, removeGroup: () => {}, toggleGroupMember: () => {},
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
      return { ...st, items: [{ id, created: Date.now(), tags: [], note: "", groups: [], ...item }, ...st.items] };
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
    setStore((st) => ({ ...st, notes: [{ id, title: "", body: "", refs: [], pin: null, groups: [], created: now, updated: now, ...note }, ...st.notes] }));
    return id;
  }, [setStore]);
  const updateNote = useCallback((id, patch) => setStore((st) => ({ ...st, notes: st.notes.map((n) => (n.id === id ? { ...n, ...patch, updated: Date.now() } : n)) })), [setStore]);
  const removeNote = useCallback((id) => setStore((st) => ({ ...st, notes: st.notes.filter((n) => n.id !== id) })), [setStore]);

  // ── Tags (coding scheme) ──────────────────────────────────────────────────
  const addTag = useCallback((label, color) => {
    const id = uid("t");
    setStore((st) => {
      const c = color || TAG_COLORS[st.tags.length % TAG_COLORS.length];
      return { ...st, tags: [...st.tags, { id, label: label || "", color: c, groups: [] }] };
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
    setStore((st) => ({ ...st, claims: [{ id, statement, note: "", support: [], oppose: [], groups: [], created: now, updated: now }, ...st.claims] }));
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

  // ── Semantic fields (root sets) — moved in from the old standalone qg.fields store ──
  const addField = useCallback((name) => {
    const id = uid("fld");
    setStore((st) => ({ ...st, fields: [{ id, name: name || "—", roots: [], note: "", groups: [] }, ...st.fields] }));
    return id;
  }, [setStore]);
  const removeField = useCallback((id) => setStore((st) => ({ ...st, fields: st.fields.filter((f) => f.id !== id) })), [setStore]);
  const renameField = useCallback((id, name) => setStore((st) => ({ ...st, fields: st.fields.map((f) => (f.id === id ? { ...f, name } : f)) })), [setStore]);
  const updateField = useCallback((id, patch) => setStore((st) => ({ ...st, fields: st.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })), [setStore]);
  const addFieldRoot = useCallback((id, root) => setStore((st) => ({ ...st, fields: st.fields.map((f) => (f.id === id && !f.roots.includes(root) ? { ...f, roots: [...f.roots, root] } : f)) })), [setStore]);
  const removeFieldRoot = useCallback((id, root) => setStore((st) => ({ ...st, fields: st.fields.map((f) => (f.id === id ? { ...f, roots: f.roots.filter((r) => r !== root) } : f)) })), [setStore]);

  // ── Groups (named collections that can hold any artifact: item/note/field/tag/claim) ──
  const addGroup = useCallback((name) => {
    const id = uid("g");
    setStore((st) => ({ ...st, groups: [...st.groups, { id, name: name || "", color: TAG_COLORS[st.groups.length % TAG_COLORS.length] }] }));
    return id;
  }, [setStore]);
  const renameGroup = useCallback((id, patch) => setStore((st) => ({ ...st, groups: st.groups.map((g) => (g.id === id ? { ...g, ...(typeof patch === "string" ? { name: patch } : patch) } : g)) })), [setStore]);
  // Deleting a group also strips its id from every artifact's membership.
  const removeGroup = useCallback((id) => setStore((st) => {
    const strip = (arr) => arr.map((x) => (x.groups?.includes(id) ? { ...x, groups: x.groups.filter((g) => g !== id) } : x));
    const next = { ...st, groups: st.groups.filter((g) => g.id !== id) };
    for (const k of GROUPABLE) next[k] = strip(st[k]);
    return next;
  }), [setStore]);
  // Add/remove an artifact (kind ∈ GROUPABLE, by id) to/from a group.
  const toggleGroupMember = useCallback((kind, id, groupId) => setStore((st) => ({
    ...st,
    [kind]: st[kind].map((x) => {
      if (x.id !== id) return x;
      const cur = x.groups || [];
      return { ...x, groups: cur.includes(groupId) ? cur.filter((g) => g !== groupId) : [...cur, groupId] };
    }),
  })), [setStore]);

  const exportJSON = useCallback(() => JSON.stringify(store, null, 2), [store]);
  const importJSON = useCallback((text, { merge = false } = {}) => {
    let parsed;
    try { parsed = sanitize(JSON.parse(text)); } catch { return false; }
    setStore((st) => {
      if (!merge) return parsed;
      // Merge is id-deduplicated across the board — re-importing your own backup must be
      // a no-op, not a duplicate of every item/note/claim — and tag assignments UNION
      // per verse: the old object spread kept only the local array, silently dropping
      // imported codings on any verse that was already tagged locally.
      const byId = (mine, theirs) => [...mine, ...theirs.filter((p) => !mine.some((x) => x.id === p.id))];
      const tagAssign = { ...parsed.tagAssign };
      for (const k in st.tagAssign) {
        tagAssign[k] = tagAssign[k] ? [...new Set([...tagAssign[k], ...st.tagAssign[k]])] : st.tagAssign[k];
      }
      return { v: 3,
        items: byId(st.items, parsed.items), notes: byId(st.notes, parsed.notes),
        tags: byId(st.tags, parsed.tags), tagAssign,
        claims: byId(st.claims, parsed.claims),
        fields: byId(st.fields, parsed.fields),
        groups: byId(st.groups, parsed.groups) };
    });
    return true;
  }, [setStore]);
  const clearAll = useCallback(() => setStore({ ...EMPTY }), [setStore]);

  // One-time migration: fold the legacy standalone semantic-fields store (qg.fields) into
  // the workspace, so fields live alongside everything else and can be grouped.
  useEffect(() => {
    try {
      if (localStorage.getItem("qg.fields.migrated")) return;
      const raw = localStorage.getItem("qg.fields");
      const old = raw ? JSON.parse(raw) : null;
      const oldFields = Array.isArray(old?.fields) ? old.fields : [];
      if (oldFields.length) {
        setStore((st) => ({ ...st, fields: [...oldFields.filter((f) => f && f.id && !st.fields.some((x) => x.id === f.id))
          .map((f) => ({ id: f.id, name: f.name || "—", roots: [...new Set((f.roots || []).filter((r) => typeof r === "string"))], note: f.note || "", groups: [] })), ...st.fields] }));
      }
      localStorage.setItem("qg.fields.migrated", "1");
    } catch { /* ignore */ }
  }, [setStore]);

  const value = useMemo(() => ({
    items: store.items, notes: store.notes, tags: store.tags, tagAssign: store.tagAssign, claims: store.claims,
    fields: store.fields, groups: store.groups,
    saveItem, updateItem, removeItem, moveItem, findSaved,
    addNote, updateNote, removeNote,
    addTag, updateTag, removeTag, toggleTag, tagsForVerse, tagCounts,
    addClaim, updateClaim, removeClaim, moveClaim, addClaimRef, updateClaimRef, removeClaimRef,
    addField, removeField, renameField, updateField, addFieldRoot, removeFieldRoot,
    addGroup, renameGroup, removeGroup, toggleGroupMember,
    exportJSON, importJSON, clearAll, toast, toastMsg,
  }), [store, saveItem, updateItem, removeItem, moveItem, findSaved, addNote, updateNote, removeNote,
    addTag, updateTag, removeTag, toggleTag, tagsForVerse, tagCounts,
    addClaim, updateClaim, removeClaim, moveClaim, addClaimRef, updateClaimRef, removeClaimRef,
    addField, removeField, renameField, updateField, addFieldRoot, removeFieldRoot,
    addGroup, renameGroup, removeGroup, toggleGroupMember,
    exportJSON, importJSON, clearAll, toast, toastMsg]);

  return createElement(Ctx.Provider, { value }, children);
}
