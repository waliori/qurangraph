import { useEffect } from "react";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { exportCsvFile } from "../graph/exportGraph.js";
import { useVirtualRows } from "../hooks/useVirtualRows.js";

/* OccurrencesModal — a scrollable popup listing every āyah a word (or its root)
 * occurs in, the current verse first. Each row is clickable to re-centre the
 * graph on that āyah. Driven by `occ = { lookup, label, mode, keys }`. The list is
 * virtualized (useVirtualRows) so even اللّٰه (~2700 occurrences) opens instantly. */
export function OccurrencesModal({ occ, verseData, searchMode, precision = "loose", theme, onNavigate, onBack, onClose }) {
  const n = occ?.keys?.length || 0;
  const { scrollRef, rowRef, onScroll, start, end, padTop, padBottom } =
    useVirtualRows({ count: n, est: 92, resetKey: `${occ?.lookup}|${occ?.mode}|${n}` });

  // Esc: go back if there's a back target, else close.
  useEffect(() => {
    if (!occ) return;
    const onKey = (e) => { if (e.key === "Escape") { if (occ.back && onBack) onBack(); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [occ, onBack, onClose]);

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
          onClick={() => onNavigate(v.s, v.a)} title="اجعلها مركز الشبكة">
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
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={`الآيات التي ترد فيها ${occ.label}`}
        onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            {occ.back && onBack && <button type="button" className="ag-iconbtn" title="رجوع إلى التوزيع" aria-label="رجوع" onClick={onBack}>→</button>}
            <span className={"ag-badge " + (occ.mode === "root" ? "t-root" : occ.mode === "lemma" ? "t-lemma" : "t-word")}>{occ.mode === "root" ? "جذر" : occ.mode === "lemma" ? "صيغة" : "كلمة"}</span>
            <h2 className="ag-modal-word">{occ.label}</h2>
            <span className="ag-modal-count"><b>{n}</b> آية</span>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <button type="button" className="ag-btn" title="تصدير CSV"
              onClick={() => exportCsvFile([["السورة", "الآية", "المرجع", "النص"], ...keys.map((k) => { const v = verseData[k]; return [v.s, v.a, `${v.sn} ${v.a}`, v.text]; })], `آيات-${occ.label}.csv`)}>⤓ CSV</button>
            <button type="button" className="ag-iconbtn" aria-label="إغلاق" onClick={onClose}>✕</button>
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
