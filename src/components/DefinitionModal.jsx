import { useEffect, useRef, useState } from "react";
import { loadLexicon, loadLexiconFullShard, loadLexiconManifest } from "../data-loader.js";
import { shardOf } from "../lexiconShard.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useI18n } from "../i18n/index.js";
import { buildBibtex, buildRis, exportTextFile } from "../graph/exportGraph.js";

/* ═══ Definition modal ═══
 *
 * A standalone reader for a root's lexicon entry — opened from a SAVED definition in
 * the workspace (where there's no inspector/selected node to host the lexicon card).
 * Loads the concise gloss, offers "read more" to fetch + show the full article (lazy,
 * by shard), and shows the edition + volume/page citation. `def = { root, lexicon }`.
 */
export function DefinitionModal({ def, onClose }) {
  const { t } = useI18n();
  const [manifest, setManifest] = useState(null);
  const [entry, setEntry] = useState(undefined); // concise { c, f, cite } | null (absent) | undefined (loading)
  const [full, setFull] = useState(undefined);   // full article string | undefined
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  useModalFocus(!!def, dialogRef, { onEscape: onClose });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!def) return undefined;
    let live = true;
    setEntry(undefined); setFull(undefined); setOpen(false);
    loadLexiconManifest().then((m) => { if (live) setManifest(m); }).catch(() => {});
    loadLexicon(def.lexicon).then((map) => { if (live) setEntry(map?.[def.root] || null); }).catch(() => { if (live) setEntry(null); });
    return () => { live = false; };
  }, [def]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!def) return null;
  const lex = manifest?.find((L) => L.id === def.lexicon);
  const shards = lex?.fullShards || 0;
  const ed = lex?.edition;
  const cite = entry?.cite;

  const readMore = () => {
    setOpen(true);
    if (full !== undefined || !shards) return;
    loadLexiconFullShard(def.lexicon, shardOf(def.root, shards)).then((mp) => setFull(mp?.[def.root] || "")).catch(() => setFull(""));
  };
  const body = entry ? (open ? (full || entry.f || entry.c) : entry.c) : null;
  const edStr = ed ? [ed.editor && t("common.cite.editor", { name: ed.editor }), ed.publisher, ed.year].filter(Boolean).join(t("common.cite.sep")) : "";
  const citeInfo = { root: def.root, lexLabel: lex?.label || def.lexicon, edition: ed || null, cite: cite || null };
  const exportCite = (kind) => {
    const base = `cite-${def.lexicon}-${def.root}`;
    if (kind === "ris") exportTextFile(buildRis(citeInfo), `${base}.ris`, "application/x-research-info-systems");
    else exportTextFile(buildBibtex(citeInfo), `${base}.bib`, "application/x-bibtex");
  };

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={`${t("ws.type.lexicon")} ${def.root}`} ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            <span className="ag-badge t-root">{t("ws.type.lexicon")}</span>
            <h2 className="ag-modal-word">{def.root}</h2>
            <span className="ag-modal-count">{lex?.label || def.lexicon}</span>
          </div>
          <button type="button" className="ag-iconbtn" aria-label={t("ws.close")} onClick={onClose}>✕</button>
        </div>
        <div className="ag-dist-body">
          <div className="ag-insp-mean" style={!entry ? { color: "var(--text-faint)", fontStyle: "italic" } : { whiteSpace: "pre-wrap" }}>
            {entry === undefined ? t("common.insp.lexLoading")
              : entry ? body
              : t("common.insp.lexNone")}
          </div>
          {entry && (
            <div className="ag-insp-cite" title={t("common.cite.title")}>
              {cite && <span className="ag-insp-cite-pg">{t("common.cite.volPage", { vol: cite.vol, page: cite.page })}</span>}
              {edStr && <span className="ag-insp-cite-ed">{edStr}</span>}
              <span style={{ display: "flex", gap: "var(--space-2)", marginInlineStart: "auto" }}>
                <button type="button" className="ag-btn" title={t("common.cite.bib")} onClick={() => exportCite("bib")}>⧉ BibTeX</button>
                <button type="button" className="ag-btn" title={t("common.cite.ris")} onClick={() => exportCite("ris")}>⧉ RIS</button>
                {shards > 0 && (
                  <button type="button" className="ag-btn is-gold" onClick={() => (open ? setOpen(false) : readMore())}>
                    {open ? t("common.insp.less") : t("common.insp.more")}
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
