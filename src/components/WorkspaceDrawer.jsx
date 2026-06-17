import { useRef, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { useI18n } from "../i18n/index.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useAssistantControl } from "../ai/AssistantContext.jsx";
import { exportJsonFile } from "../graph/exportGraph.js";

/* ═══ Workspace drawer ═══
 *
 * The researcher's saved items + notes, persisted in localStorage (useWorkspace).
 * Two tabs: Saved (re-openable result snapshots) and Notes (free text, optionally
 * pinned onto the graph). Open/rename/annotate/reorder/delete; export & import the
 * whole workspace as JSON (localStorage is per-browser, so this is the backup path).
 * `onOpen(item)` restores an item; `onPinNote(id)` pins a note to the current graph.
 */

const TYPE_BADGE = { graph: "t-verse", compare: "t-word", occ: "t-word", dist: "t-lemma", lexicon: "t-root", verse: "t-verse", word: "t-word", phrase: "t-verse" };
// Types offered in the filter row (in display order).
const FILTER_TYPES = ["graph", "compare", "occ", "dist", "lexicon", "verse", "word", "phrase"];

export function WorkspaceDrawer({ open, onClose, onOpen, onPinNote, canPin }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const ai = useAssistantControl();
  const [tab, setTab] = useState("saved");
  const [editing, setEditing] = useState(null); // item id being renamed
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  useModalFocus(open, dialogRef, { onEscape: onClose });

  if (!open) return null;
  const { items, notes } = ws;
  const q = query.trim().toLowerCase();
  const shownItems = items.filter((it) =>
    (typeFilter === "all" || it.type === typeFilter) &&
    (!q || (it.title || "").toLowerCase().includes(q) || (it.note || "").toLowerCase().includes(q)));
  // Only offer type chips that actually have items, so the filter row stays relevant.
  const presentTypes = FILTER_TYPES.filter((ty) => items.some((it) => it.type === ty));

  // Hand the entire saved workspace to the assistant in one go.
  const analyzeAll = () => {
    if (!ai || !items.length) return;
    ai.analyze(items.map((it) => ({ id: "ws:" + it.id, kind: "ws", title: t("ai.attach.saved", { type: t("ws.type." + it.type), name: it.title || "" }), payload: it })));
    onClose();
  };

  const onImportFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((txt) => ws.importJSON(txt, { merge: true }));
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
        </div>

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
                </div>
                {it.type === "lexicon" && it.payload?.gloss && <div className="ag-ws-gloss">{it.payload.gloss}</div>}
                <textarea className="ag-ws-noteinput" placeholder={t("ws.itemNote")} defaultValue={it.note}
                  onBlur={(e) => ws.updateItem(it.id, { note: e.target.value })} rows={1} />
              </div>
            ))
          ) : (
            <>
              <button type="button" className="ag-btn is-gold" style={{ width: "100%", marginBlockEnd: "var(--space-2)" }} onClick={() => ws.addNote({})}>＋ {t("ws.addNote")}</button>
              {notes.length === 0 ? <p className="ag-hint">{t("ws.emptyNotes")}</p> : notes.map((n) => (
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
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="ag-ws-foot">
          {ai && items.length > 0 && (
            <button type="button" className="ag-btn is-gold" title={t("ai.analyzeWorkspace")} onClick={analyzeAll}>✦ {t("ai.analyzeWorkspace")}</button>
          )}
          <button type="button" className="ag-btn" title={t("ws.exportTitle")} onClick={() => exportJsonFile(JSON.parse(ws.exportJSON()), "qurangraph-workspace.json")}>⤓ {t("ws.export")}</button>
          <button type="button" className="ag-btn" title={t("ws.importTitle")} onClick={() => fileRef.current?.click()}>⤒ {t("ws.import")}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onImportFile} />
          <button type="button" className="ag-btn is-warn" onClick={() => { if (window.confirm(t("ws.clearConfirm"))) ws.clearAll(); }}>{t("ws.clear")}</button>
        </div>
      </aside>
    </div>
  );
}
