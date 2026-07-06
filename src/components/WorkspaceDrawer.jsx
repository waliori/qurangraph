import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { useI18n } from "../i18n/index.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { exportJsonFile } from "../graph/exportGraph.js";

/* ═══ Workspace drawer ═══
 *
 * The researcher's saved items + notes, persisted in localStorage (useWorkspace).
 * Two tabs: Saved (re-openable result snapshots) and Notes (free text, optionally
 * pinned onto the graph). Open/rename/annotate/reorder/delete; export & import the
 * whole workspace as JSON (localStorage is per-browser, so this is the backup path).
 * `onOpen(item)` restores an item; `onPinNote(id)` pins a note to the current graph.
 */

const TYPE_BADGE = { graph: "t-verse", compare: "t-word", occ: "t-word", dist: "t-lemma", lexicon: "t-root", verse: "t-verse", word: "t-word", phrase: "t-verse", expr: "t-verse", pairing: "t-root", rasm: "t-verse" };
// Types offered in the filter row (in display order).
const FILTER_TYPES = ["graph", "compare", "occ", "dist", "lexicon", "verse", "word", "phrase", "expr", "pairing", "rasm"];

/* Per-card group membership control: a ⊕N chip that opens a checklist of all groups to
 * toggle this artifact (kind ∈ items/notes/fields/tags/claims) in/out of each. */
function GroupPicker({ ws, kind, id }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [gq, setGq] = useState("");
  const btnRef = useRef(null);
  const mine = (ws[kind]?.find((x) => x.id === id)?.groups) || [];
  // The menu is position:fixed (anchored to the ⊕ button), NOT absolute inside the
  // scrolling drawer body — which used to clip/detach it near the drawer's bottom edge.
  // It flips above when there's no room below, scrolls + filters for many groups, and
  // closes on any scroll/resize/outside-click (it can't follow the body once detached).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e) => { if (!e.target.closest(".ag-ws-grpmenu") && !btnRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); };
  }, [open]);
  if (ws.groups.length === 0) return null;
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      const up = below < 260 && r.top > below;
      setPos({
        right: Math.max(8, Math.min(Math.round(window.innerWidth - r.right), window.innerWidth - 178)),
        top: up ? "auto" : Math.round(r.bottom + 4),
        bottom: up ? Math.round(window.innerHeight - r.top + 4) : "auto",
      });
    }
    setGq(""); setOpen(true);
  };
  const list = gq.trim() ? ws.groups.filter((g) => (g.name || "").includes(gq.trim())) : ws.groups;
  return (
    <div className="ag-ws-grp">
      <button ref={btnRef} type="button" className={"ag-btn ag-btn-xs" + (mine.length ? " is-active" : "")} aria-expanded={open}
        title={t("ws.groups.assign")} onClick={toggle}>⊕{mine.length ? ` ${mine.length}` : ""}</button>
      {open && pos && createPortal(
        // Portaled to <body> so the drawer's backdrop-filter (which makes any fixed
        // descendant resolve against the DRAWER, not the viewport — the "menu shows
        // outside the panel" bug) can't capture it. Now position:fixed is truly viewport-anchored.
        <div className="ag-ws-grpmenu" role="menu" style={{ position: "fixed", left: "auto", right: pos.right, top: pos.top, bottom: pos.bottom }}>
          {ws.groups.length > 8 && (
            <input className="ag-input ag-input-sm ag-ws-grpmenu-filter" value={gq} autoFocus
              placeholder={t("ws.groups.filterPh")} aria-label={t("ws.groups.filterPh")} onChange={(e) => setGq(e.target.value)} />
          )}
          {list.map((g) => (
            <label key={g.id} className="ag-occ-menu-row ag-tag-pick">
              <input type="checkbox" checked={mine.includes(g.id)} onChange={() => ws.toggleGroupMember(kind, id, g.id)} />
              <span className="ag-tag-dot" style={{ background: g.color }} />{g.name || "—"}
            </label>
          ))}
          {list.length === 0 && <span className="ag-hint" style={{ padding: "2px 4px" }}>{t("tag.filterNone")}</span>}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function WorkspaceDrawer({ open, onClose, onOpen, onPinNote, onOpenTag, canPin }) {
  const { t, fmtNum } = useI18n();
  const ws = useWorkspace();
  const [tab, setTab] = useState("saved");
  const [editing, setEditing] = useState(null); // item id being renamed
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newTag, setNewTag] = useState("");
  const [tagQuery, setTagQuery] = useState("");   // filter the tags tab when it grows
  const [noteQuery, setNoteQuery] = useState(""); // filter the notes tab when it grows
  const [groupFilter, setGroupFilter] = useState("all"); // filter the active tab by group
  const [newGroup, setNewGroup] = useState("");
  const [newField, setNewField] = useState("");
  const [fieldRoot, setFieldRoot] = useState({}); // per-field add-root input value
  const FILTER_MIN = 8; // show a search box once a tab list is longer than this
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  useModalFocus(open, dialogRef, { onEscape: onClose });

  if (!open) return null;
  const { items, notes, tags, fields, groups } = ws;
  const tagCounts = ws.tagCounts ? ws.tagCounts() : {};
  const inGroup = (x) => groupFilter === "all" || (x.groups || []).includes(groupFilter);
  const q = query.trim().toLowerCase();
  const shownItems = items.filter((it) => inGroup(it) &&
    (typeFilter === "all" || it.type === typeFilter) &&
    (!q || (it.title || "").toLowerCase().includes(q) || (it.note || "").toLowerCase().includes(q)));
  // Only offer type chips that actually have items, so the filter row stays relevant.
  const presentTypes = FILTER_TYPES.filter((ty) => items.some((it) => it.type === ty));
  const shownTagsList = (tagQuery.trim() ? tags.filter((tg) => (tg.label || "").includes(tagQuery.trim())) : tags).filter(inGroup);
  const nq = noteQuery.trim().toLowerCase();
  const shownNotes = (nq ? notes.filter((n) => (n.title || "").toLowerCase().includes(nq) || (n.body || "").toLowerCase().includes(nq)) : notes).filter(inGroup);
  const shownFields = fields.filter(inGroup);
  const addGroup = (e) => { e.preventDefault(); const v = newGroup.trim(); if (v) { ws.addGroup(v); setNewGroup(""); } };
  const curGroup = groups.find((g) => g.id === groupFilter) || null;
  // How many artifacts in the ACTIVE tab belong to each group — shown on the chip so the
  // group bar reads as a filter (and stays useful when there are many groups).
  const activeList = tab === "saved" ? items : tab === "notes" ? notes : tab === "tags" ? tags : fields;
  const groupCount = (gid) => activeList.reduce((n, x) => n + ((x.groups || []).includes(gid) ? 1 : 0), 0);

  const onImportFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Surface the outcome — a corrupt/wrong file used to fail with zero feedback,
    // leaving the user believing their backup was merged.
    f.text()
      .then((txt) => ws.toast(t(ws.importJSON(txt, { merge: true }) ? "ws.importOk" : "ws.importFail")))
      .catch(() => ws.toast(t("ws.importFail")));
    e.target.value = "";
  };

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <aside data-tour="wsdrawer" className="ag-ws-drawer" role="dialog" aria-modal="true" aria-label={t("ws.title")} ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title"><span className="ag-badge t-verse">✶</span><h2 className="ag-modal-word">{t("ws.title")}</h2></div>
          <button type="button" className="ag-iconbtn" aria-label={t("ws.close")} onClick={onClose}>✕</button>
        </div>

        <div className="ag-seg ag-seg-sm" role="tablist" style={{ padding: "0 var(--space-3)" }}>
          <button type="button" role="tab" aria-selected={tab === "saved"} className={tab === "saved" ? "is-on" : ""} onClick={() => setTab("saved")}>{t("ws.tabs.saved")} {items.length ? `(${items.length})` : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "is-on" : ""} onClick={() => setTab("notes")}>{t("ws.tabs.notes")} {notes.length ? `(${notes.length})` : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "tags"} className={tab === "tags" ? "is-on" : ""} onClick={() => setTab("tags")}>{t("ws.tabs.tags")} {tags.length ? `(${tags.length})` : ""}</button>
          <button type="button" role="tab" aria-selected={tab === "fields"} className={tab === "fields" ? "is-on" : ""} onClick={() => setTab("fields")}>{t("ws.tabs.fields")} {fields.length ? `(${fields.length})` : ""}</button>
        </div>

        {/* Group filter chips: filter the active tab to one group; ＋ adds a group; the
            active group can be renamed/deleted inline. Groups can hold any artifact. */}
        <div className="ag-ws-groupbar">
          <button type="button" className={"ag-tag ag-tag-btn" + (groupFilter === "all" ? " is-on" : "")} onClick={() => setGroupFilter("all")}>{t("ws.groups.all")}</button>
          {groups.map((g) => (
            <button type="button" key={g.id} className={"ag-tag ag-tag-btn" + (groupFilter === g.id ? " is-on" : "")} onClick={() => setGroupFilter(g.id)}>
              <span className="ag-tag-dot" style={{ background: g.color }} />{g.name || "—"}
              {groupCount(g.id) > 0 && <b className="ag-tag-n">{fmtNum(groupCount(g.id))}</b>}
            </button>
          ))}
          <form className="ag-tag-add" onSubmit={addGroup}>
            <input className="ag-input ag-input-sm" value={newGroup} placeholder={t("ws.groups.addPh")} aria-label={t("ws.groups.add")} onChange={(e) => setNewGroup(e.target.value)} />
            <button type="submit" className="ag-btn ag-btn-xs">＋</button>
          </form>
        </div>
        {curGroup && (
          <div className="ag-ws-groupedit">
            <input className="ag-input ag-input-sm" value={curGroup.name} aria-label={t("ws.groups.rename")}
              onChange={(e) => ws.renameGroup(curGroup.id, e.target.value)} />
            <button type="button" className="ag-iconbtn is-warn" title={t("ws.groups.delete")} aria-label={t("ws.groups.delete")}
              onClick={() => { ws.removeGroup(curGroup.id); setGroupFilter("all"); }}>🗑</button>
          </div>
        )}

        {tab === "saved" && items.length > 0 && (
          <div className="ag-ws-filter">
            <input className="ag-input" type="search" value={query} placeholder={t("ws.search")} aria-label={t("ws.search")} onChange={(e) => setQuery(e.target.value)} />
            {presentTypes.length > 1 && (
              <div className="ag-ws-chips">
                <button type="button" className={"ag-tag ag-tag-btn" + (typeFilter === "all" ? " is-on" : "")} onClick={() => setTypeFilter("all")}>{t("ws.filterAll")}</button>
                {presentTypes.map((ty) => (
                  <button type="button" key={ty} className={"ag-tag ag-tag-btn" + (typeFilter === ty ? " is-on" : "")} onClick={() => setTypeFilter(ty)}>{t("ws.type." + ty)}</button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ag-ws-body">
          {tab === "saved" ? (
            items.length === 0 ? <p className="ag-hint">{t("ws.emptySaved")}</p>
              : shownItems.length === 0 ? <p className="ag-hint">{t("ws.noMatch")}</p>
              : shownItems.map((it) => (
              <div className="ag-ws-card" key={it.id}>
                <div className="ag-ws-cardhead">
                  <span className={"ag-badge " + (TYPE_BADGE[it.type] || "t-word")}>{t("ws.type." + it.type)}</span>
                  {editing === it.id
                    ? <input className="ag-input" autoFocus defaultValue={it.title}
                        onBlur={(e) => { ws.updateItem(it.id, { title: e.target.value.trim() || it.title }); setEditing(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                    : <button type="button" className="ag-ws-title" title={t("ws.openItem")} onClick={() => onOpen(it)}>{it.title || t("ws.type." + it.type)}</button>}
                </div>
                <div className="ag-ws-actions">
                  <button type="button" className="ag-btn is-gold" onClick={() => onOpen(it)}>↗ {t("ws.openItem")}</button>
                  <button type="button" className="ag-iconbtn" title={t("ws.rename")} aria-label={t("ws.rename")} onClick={() => setEditing(it.id)}>✎</button>
                  <button type="button" className="ag-iconbtn" title={t("ws.up")} aria-label={t("ws.up")} onClick={() => ws.moveItem(it.id, -1)}>↑</button>
                  <button type="button" className="ag-iconbtn" title={t("ws.down")} aria-label={t("ws.down")} onClick={() => ws.moveItem(it.id, 1)}>↓</button>
                  <button type="button" className="ag-iconbtn is-warn" title={t("ws.delete")} aria-label={t("ws.delete")} onClick={() => ws.removeItem(it.id)}>🗑</button>
                  <GroupPicker ws={ws} kind="items" id={it.id} />
                </div>
                {it.type === "lexicon" && it.payload?.gloss && <div className="ag-ws-gloss">{it.payload.gloss}</div>}
                <textarea className="ag-ws-noteinput" placeholder={t("ws.itemNote")} defaultValue={it.note}
                  onBlur={(e) => ws.updateItem(it.id, { note: e.target.value })} rows={1} />
              </div>
            ))
          ) : tab === "tags" ? (
            <div className="ag-ws-tags">
              <form className="ag-tag-add" style={{ marginBlockEnd: "var(--space-2)" }} onSubmit={(e) => { e.preventDefault(); const v = newTag.trim(); if (v) { ws.addTag(v); setNewTag(""); } }}>
                <input className="ag-input" value={newTag} placeholder={t("ws.tags.newPh")} aria-label={t("ws.tags.add")} onChange={(e) => setNewTag(e.target.value)} />
                <button type="submit" className="ag-btn is-gold">＋ {t("ws.tags.add")}</button>
              </form>
              {tags.length > FILTER_MIN && (
                <input className="ag-input" type="search" value={tagQuery} placeholder={t("tag.filterPh")} aria-label={t("tag.filterAria")}
                  style={{ marginBlockEnd: "var(--space-2)" }} onChange={(e) => setTagQuery(e.target.value)} />
              )}
              {tags.length === 0 ? <p className="ag-hint">{t("ws.tags.empty")}</p>
                : shownTagsList.length === 0 ? <p className="ag-hint">{t("tag.filterNone")}</p>
                : shownTagsList.map((tag) => (
                <div className="ag-ws-card" key={tag.id}>
                  <div className="ag-ws-cardhead">
                    <span className="ag-tag-dot" style={{ background: tag.color }} />
                    {editing === tag.id
                      ? <input className="ag-input" autoFocus defaultValue={tag.label}
                          onBlur={(e) => { ws.updateTag(tag.id, { label: e.target.value.trim() || tag.label }); setEditing(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                      : <button type="button" className="ag-ws-title" onClick={() => onOpenTag?.(tag.id, tag.label)}>{tag.label}</button>}
                    <span className="ag-tag-n">{t("ws.tags.verses", { n: fmtNum(tagCounts[tag.id] || 0) })}</span>
                  </div>
                  <div className="ag-ws-actions">
                    <button type="button" className="ag-btn is-gold" disabled={!tagCounts[tag.id]} onClick={() => onOpenTag?.(tag.id, tag.label)}>↗ {t("ws.tags.openVerses")}</button>
                    <button type="button" className="ag-iconbtn" title={t("ws.rename")} aria-label={t("ws.rename")} onClick={() => setEditing(tag.id)}>✎</button>
                    <button type="button" className="ag-iconbtn is-warn" title={t("ws.delete")} aria-label={t("ws.delete")} onClick={() => ws.removeTag(tag.id)}>🗑</button>
                    <GroupPicker ws={ws} kind="tags" id={tag.id} />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "fields" ? (
            <div className="ag-ws-tags">
              <form className="ag-tag-add" style={{ marginBlockEnd: "var(--space-2)" }} onSubmit={(e) => { e.preventDefault(); const v = newField.trim(); if (v) { ws.addField(v); setNewField(""); } }}>
                <input className="ag-input" value={newField} placeholder={t("ws.fields.newPh")} aria-label={t("ws.fields.add")} onChange={(e) => setNewField(e.target.value)} />
                <button type="submit" className="ag-btn is-gold">＋ {t("ws.fields.add")}</button>
              </form>
              {fields.length === 0 ? <p className="ag-hint">{t("ws.fields.empty")}</p>
                : shownFields.length === 0 ? <p className="ag-hint">{t("ws.groups.noMatch")}</p>
                : shownFields.map((f) => (
                <div className="ag-ws-card" key={f.id}>
                  <div className="ag-ws-cardhead">
                    <span className="ag-badge t-root">⊕</span>
                    {editing === f.id
                      ? <input className="ag-input" autoFocus defaultValue={f.name}
                          onBlur={(e) => { ws.renameField(f.id, e.target.value.trim() || f.name); setEditing(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                      : <button type="button" className="ag-ws-title" onClick={() => setEditing(f.id)}>{f.name || "—"}</button>}
                    <span className="ag-tag-n">{t("ws.fields.count", { n: fmtNum(f.roots.length) })}</span>
                  </div>
                  <div className="ag-ws-chips">
                    {f.roots.map((r) => (
                      <span key={r} className="ag-tag ag-pm-chip t-root" style={{ fontFamily: "var(--font-quran)" }}>
                        {r}<button type="button" className="ag-tag-x" aria-label={t("ws.delete")} onClick={() => ws.removeFieldRoot(f.id, r)}>✕</button>
                      </span>
                    ))}
                  </div>
                  <form className="ag-tag-add" onSubmit={(e) => { e.preventDefault(); const r = (fieldRoot[f.id] || "").trim(); if (r) { ws.addFieldRoot(f.id, r); setFieldRoot((m) => ({ ...m, [f.id]: "" })); } }}>
                    <input className="ag-input ag-input-sm" value={fieldRoot[f.id] || ""} placeholder={t("ws.fields.addRootPh")} aria-label={t("ws.fields.roots")}
                      style={{ fontFamily: "var(--font-quran)" }} onChange={(e) => setFieldRoot((m) => ({ ...m, [f.id]: e.target.value }))} />
                    <button type="submit" className="ag-btn ag-btn-xs">＋</button>
                  </form>
                  <textarea className="ag-ws-noteinput" placeholder={t("ws.fields.notePh")} defaultValue={f.note}
                    onBlur={(e) => ws.updateField(f.id, { note: e.target.value })} rows={1} />
                  <div className="ag-ws-actions">
                    <button type="button" className="ag-iconbtn" title={t("ws.rename")} aria-label={t("ws.rename")} onClick={() => setEditing(f.id)}>✎</button>
                    <button type="button" className="ag-iconbtn is-warn" title={t("ws.delete")} aria-label={t("ws.delete")} onClick={() => ws.removeField(f.id)}>🗑</button>
                    <GroupPicker ws={ws} kind="fields" id={f.id} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <button type="button" className="ag-btn is-gold" style={{ width: "100%", marginBlockEnd: "var(--space-2)" }} onClick={() => ws.addNote({})}>＋ {t("ws.addNote")}</button>
              {notes.length > FILTER_MIN && (
                <input className="ag-input" type="search" value={noteQuery} placeholder={t("ws.searchNotes")} aria-label={t("ws.searchNotes")}
                  style={{ marginBlockEnd: "var(--space-2)" }} onChange={(e) => setNoteQuery(e.target.value)} />
              )}
              {notes.length === 0 ? <p className="ag-hint">{t("ws.emptyNotes")}</p>
                : shownNotes.length === 0 ? <p className="ag-hint">{t("ws.noMatch")}</p>
                : shownNotes.map((n) => (
                <div className="ag-ws-card" key={n.id}>
                  <div className="ag-ws-cardhead">
                    <input className="ag-input" placeholder={t("ws.noteTitlePh")} defaultValue={n.title}
                      onBlur={(e) => ws.updateNote(n.id, { title: e.target.value })} />
                    <button type="button" className="ag-iconbtn is-warn" title={t("ws.delete")} aria-label={t("ws.delete")} onClick={() => ws.removeNote(n.id)}>🗑</button>
                  </div>
                  <textarea className="ag-ws-noteinput" placeholder={t("ws.noteBodyPh")} defaultValue={n.body}
                    onBlur={(e) => ws.updateNote(n.id, { body: e.target.value })} rows={3} />
                  <div className="ag-ws-actions">
                    {n.pin
                      ? <button type="button" className="ag-btn" title={t("ws.unpin")} onClick={() => ws.updateNote(n.id, { pin: null })}>📌 {t("ws.pinned")}</button>
                      : <button type="button" className="ag-btn" title={t("ws.pin")} disabled={!canPin} onClick={() => onPinNote(n.id)}>📌 {t("ws.pin")}</button>}
                    <GroupPicker ws={ws} kind="notes" id={n.id} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="ag-ws-foot">
          <button type="button" className="ag-btn" title={t("ws.exportTitle")} onClick={() => exportJsonFile(JSON.parse(ws.exportJSON()), "qurangraph-workspace.json")}>⤓ {t("ws.export")}</button>
          <button type="button" className="ag-btn" title={t("ws.importTitle")} onClick={() => fileRef.current?.click()}>⤒ {t("ws.import")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onImportFile} />
          <button type="button" className="ag-btn is-warn" onClick={() => { if (window.confirm(t("ws.clearConfirm"))) ws.clearAll(); }}>{t("ws.clear")}</button>
        </div>
      </aside>
    </div>
  );
}
