import { useRef } from "react";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { exportCsvFile, exportJsonFile, buildConcordance } from "../graph/exportGraph.js";
import { wordGroupKey } from "../arabic-utils.js";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

/* OccurrencesModal — a scrollable popup listing every āyah a word (or its root)
 * occurs in, the current verse first. Each row is clickable to re-centre the
 * graph on that āyah. Driven by `occ = { lookup, label, mode, keys }`. The list is
 * virtualized (useVirtualRows) so even اللّٰه (~2700 occurrences) opens instantly. */
export function OccurrencesModal({ occ, verseData, searchMode, precision = "loose", theme, onNavigate, onBack, onClose }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const n = occ?.keys?.length || 0;
  const { scrollRef, rowRef, onScroll, start, end, padTop, padBottom } =
    useVirtualRows({ count: n, est: 92, resetKey: `${occ?.lookup}|${occ?.mode}|${n}` });

  // Focus trap + restoration; Esc goes back if there's a back target, else closes.
  const dialogRef = useRef(null);
  useModalFocus(!!occ, dialogRef, { onEscape: () => (occ?.back && onBack ? onBack() : onClose()) });

  if (!occ) return null;
  const primary = occ.lookup;
  const keys = occ.keys;
  const rows = [];
  for (let i = start; i < end; i++) {
    const v = verseData[keys[i]];
    if (!v) continue;
    rows.push(
      <li key={keys[i]} ref={rowRef(i)}>
        <button type="button" className={"ag-modal-row" + (i === 0 ? " is-current" : "")}
          onClick={() => onNavigate(v.s, v.a)} title={t("occ.makeCenter")}>
          <span className="ag-ayah-ref">
            <span className="ag-ayah-surah">{v.sn}</span>
            <span className="ag-ayah-num">{v.a}</span>
          </span>
          <span className="ag-modal-text">
            <HighlightedAyah text={v.text} primaryWord={primary} searchMode={searchMode} precision={precision} theme={theme} />
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={t("occ.title", { label: occ.label })}
        ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            {occ.back && onBack && <button type="button" className="ag-iconbtn" title={t("occ.backToDistribution")} aria-label={t("occ.back")} onClick={onBack}>→</button>}
            <span className={"ag-badge " + (occ.mode === "root" ? "t-root" : occ.mode === "lemma" ? "t-lemma" : "t-word")}>{occ.mode === "root" ? t("occ.badge.root") : occ.mode === "lemma" ? t("occ.badge.lemma") : t("occ.badge.word")}</span>
            <h2 className="ag-modal-word">{occ.label}</h2>
            <span className="ag-modal-count"><b>{n}</b> {t("occ.verses")}</span>
            {occ.morphNote && <span className="ag-chip is-morph" title={t("occ.morphNoteTitle")}>⚙ {occ.morphNote}</span>}
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <button type="button" className="ag-btn" title={t("ws.saveTitle")}
              onClick={() => { ws.saveItem({ type: "occ", title: occ.label, payload: { lookup: occ.lookup, label: occ.label, mode: occ.mode } }); ws.toast(t("ws.saved")); }}>★</button>
            <button type="button" className="ag-btn" title={t("occ.exportCsv")}
              onClick={() => exportCsvFile([["السورة", "الآية", "المرجع", "النص"], ...keys.map((k) => { const v = verseData[k]; return [v.s, v.a, `${v.sn} ${v.a}`, v.text]; })], `آيات-${occ.label}.csv`)}>⤓ CSV</button>
            <button type="button" className="ag-btn" title={t("occ.exportKwic")}
              onClick={() => exportCsvFile(buildConcordance(
                keys,
                (k) => verseData[k]?.words,
                (w) => wordGroupKey(w, occ.mode) === occ.lookup,
                (k) => { const v = verseData[k]; return { s: v.s, a: v.a, ref: `${v.sn} ${v.a}` }; },
              ), `سياق-${occ.label}.csv`)}>⤓ {t("occ.kwicBtn")}</button>
            <button type="button" className="ag-btn" title={t("occ.exportJson")}
              onClick={() => exportJsonFile({
                term: occ.label, lookup: occ.lookup, mode: occ.mode, count: n,
                verses: keys.map((k) => { const v = verseData[k]; return { sura: v.s, ayah: v.a, ref: `${v.sn} ${v.a}`, text: v.text }; }),
              }, `آيات-${occ.label}.json`)}>⤓ JSON</button>
            <button type="button" className="ag-iconbtn" aria-label={t("occ.close")} onClick={onClose}>✕</button>
          </div>
        </div>

        <ul className="ag-modal-list" ref={scrollRef} onScroll={onScroll}>
          <li className="ag-vspace" aria-hidden="true" style={{ height: padTop }} />
          {rows}
          <li className="ag-vspace" aria-hidden="true" style={{ height: padBottom }} />
        </ul>
      </div>
    </div>
  );
}
