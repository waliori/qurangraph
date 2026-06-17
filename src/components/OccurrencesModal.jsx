import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { ModalShell } from "./ModalShell.jsx";
import { exportCsvFile, exportJsonFile, exportTextFile, buildConcordance, buildResultBibtex } from "../graph/exportGraph.js";
import { wordGroupKey } from "../arabic-utils.js";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

/* OccurrencesModal — a scrollable popup listing every āyah a word (or its root)
 * occurs in, the current verse first. Each row is clickable to re-centre the
 * graph on that āyah. Driven by `occ = { lookup, label, mode, keys }`. The list is
 * virtualized (useVirtualRows) so even اللّٰه (~2700 occurrences) opens instantly. */
export function OccurrencesModal({ occ, verseData, searchMode, precision = "loose", theme, onNavigate, onBack, onClose }) {
  const { t, tn } = useI18n();
  const ws = useWorkspace();
  const n = occ?.keys?.length || 0;
  const { scrollRef, rowRef, onScroll, start, end, padTop, padBottom } =
    useVirtualRows({ count: n, est: 92, resetKey: `${occ?.lookup}|${occ?.mode}|${n}` });

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
    <ModalShell open={!!occ} onClose={onClose} closeLabel={t("occ.close")}
      onEscape={() => (occ?.back && onBack ? onBack() : onClose())}
      ariaLabel={t("occ.title", { label: occ.label })}
      aiContext={() => [
        { id: "occ:" + occ.lookup + ":" + occ.mode, kind: "word", title: t("ai.attach.word", { w: occ.label }), payload: { label: occ.label, lookup: occ.lookup, mode: occ.mode, count: occ.keys?.length } },
        { id: "occ-an:" + occ.lookup, kind: "note", title: t("occ.title", { label: occ.label }),
          payload: { title: t("occ.title", { label: occ.label }), data: { totalVerses: occ.keys?.length, occurrences: (occ.keys || []).slice(0, 15).map((k) => ({ ref: k, text: verseData[k]?.text })) } } },
      ]}
      title={<>
        {occ.back && onBack && <button type="button" className="ag-iconbtn" title={t("occ.backToDistribution")} aria-label={t("occ.back")} onClick={onBack}>→</button>}
        <span className={"ag-badge " + (occ.mode === "root" ? "t-root" : occ.mode === "lemma" ? "t-lemma" : "t-word")}>{occ.mode === "root" ? t("occ.badge.root") : occ.mode === "lemma" ? t("occ.badge.lemma") : t("occ.badge.word")}</span>
        <h2 className="ag-modal-word">{occ.label}</h2>
        <span className="ag-modal-count">{tn("occ.versesCount", n)}</span>
        {occ.morphNote && <span className="ag-chip is-morph" title={t("occ.morphNoteTitle")}>⚙ {occ.morphNote}</span>}
      </>}
      actions={<>
            <button type="button" className="ag-btn" title={t("ws.saveTitle")}
              onClick={() => { ws.saveItem({ type: "occ", title: occ.label, payload: { lookup: occ.lookup, label: occ.label, mode: occ.mode } }); ws.toast(t("ws.saved")); }}>★</button>
            <button type="button" className="ag-btn" title={t("occ.exportCsv")}
              onClick={() => exportCsvFile([[t("occ.col.sura"), t("occ.col.aya"), t("occ.col.ref"), t("occ.col.text")], ...keys.map((k) => { const v = verseData[k]; return [v.s, v.a, `${v.sn} ${v.a}`, v.text]; })], `${t("occ.file.verses", { label: occ.label })}.csv`)}>⤓ CSV</button>
            <button type="button" className="ag-btn" title={t("occ.exportKwic")}
              onClick={() => exportCsvFile(buildConcordance(
                keys,
                (k) => verseData[k]?.words,
                (w) => wordGroupKey(w, occ.mode) === occ.lookup,
                (k) => { const v = verseData[k]; return { s: v.s, a: v.a, ref: `${v.sn} ${v.a}` }; },
                5,
                [t("occ.col.sura"), t("occ.col.aya"), t("occ.col.ref"), t("occ.col.before"), t("occ.col.word"), t("occ.col.after")],
              ), `${t("occ.file.context", { label: occ.label })}.csv`)}>⤓ {t("occ.kwicBtn")}</button>
            <button type="button" className="ag-btn" title={t("occ.exportJson")}
              onClick={() => exportJsonFile({
                term: occ.label, lookup: occ.lookup, mode: occ.mode, count: n,
                verses: keys.map((k) => { const v = verseData[k]; return { sura: v.s, ayah: v.a, ref: `${v.sn} ${v.a}`, text: v.text }; }),
              }, `${t("occ.file.verses", { label: occ.label })}.json`)}>⤓ JSON</button>
            <button type="button" className="ag-btn" title={t("common.cite.resultTitle")}
              onClick={() => {
                const mode = occ.mode || searchMode;
                const bib = buildResultBibtex({
                  key: `ayatnet_occ_${(occ.lookup || "term").replace(/[^A-Za-z0-9؀-ۿ]/g, "").slice(0, 16)}`,
                  title: t("common.cite.occTitle", { label: occ.label, mode: t(`common.graphMode.${mode}`) }),
                  note: t("common.cite.note", { count: n }),
                  url: typeof location !== "undefined" ? location.href : "",
                  year: new Date().getFullYear(), keywords: [occ.lookup, occ.label],
                });
                exportTextFile(bib, `cite-occ-${occ.lookup || "term"}.bib`, "application/x-bibtex");
              }}>⧉ {t("common.cite.cite")}</button>
      </>}>
        <ul className="ag-modal-list" ref={scrollRef} onScroll={onScroll}>
          <li className="ag-vspace" aria-hidden="true" style={{ height: padTop }} />
          {rows}
          <li className="ag-vspace" aria-hidden="true" style={{ height: padBottom }} />
        </ul>
    </ModalShell>
  );
}
