import { useMemo, useRef } from "react";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Context reader ═══
 *
 * Reads the selected āya inside its sūrah: the whole sūrah as one virtualized
 * scroll, opened scrolled to (and highlighting) the centre āya. Same measured-row
 * virtualization as the occurrences list — only visible āyāt render. Driven by
 * `ctx = { centerKey }`; `orderedKeys` is every "s:a" in muṣḥaf order (we slice
 * out the centre's sūrah).
 */
export function ContextModal({ ctx, orderedKeys, verseData, onNavigate, onClose }) {
  const { t } = useI18n();
  // The centre āya's sūrah, in order — the only context we show.
  const suraKeys = useMemo(() => {
    if (!ctx) return [];
    const s = ctx.centerKey.split(":")[0] + ":";
    return orderedKeys.filter((k) => k.startsWith(s));
  }, [ctx, orderedKeys]);
  const centerIndex = useMemo(
    () => (ctx ? Math.max(0, suraKeys.indexOf(ctx.centerKey)) : 0),
    [ctx, suraKeys]
  );
  const n = ctx ? suraKeys.length : 0;
  const { scrollRef, rowRef, onScroll, start, end, padTop, padBottom } =
    useVirtualRows({ count: n, est: 110, overscan: 8, resetKey: ctx?.centerKey, initialIndex: centerIndex });

  const dialogRef = useRef(null);
  useModalFocus(!!ctx, dialogRef, { onEscape: onClose });

  if (!ctx) return null;
  const center = verseData[ctx.centerKey];
  const rows = [];
  for (let i = start; i < end; i++) {
    const key = suraKeys[i];
    const v = verseData[key];
    if (!v) continue;
    const isCenter = key === ctx.centerKey;
    rows.push(
      <li key={key} ref={rowRef(i)}>
        {i === 0 && <div className="ag-ctx-surahead">{v.s}. {v.sn}</div>}
        <button type="button" className={"ag-ctx-aya" + (isCenter ? " is-center" : "")}
          onClick={() => onNavigate(v.s, v.a)} title={t("ctx.makeCenter")}>
          <span className="ag-ctx-num">{v.a}</span>
          <span className="ag-ctx-text">{v.text}</span>
        </button>
      </li>
    );
  }

  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={t("ctx.ariaLabel", { ref: center ? center.sn + " " + center.a : "" })}
        ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">
            <span className="ag-badge t-verse">{t("ctx.badge")}</span>
            <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{center ? `${center.sn} ${center.a}` : ""}</h2>
          </div>
          <button type="button" className="ag-iconbtn" aria-label={t("ctx.close")} onClick={onClose}>✕</button>
        </div>

        <ul className="ag-modal-list ag-ctx-list" ref={scrollRef} onScroll={onScroll} dir="rtl">
          <li className="ag-vspace" aria-hidden="true" style={{ height: padTop }} />
          {rows}
          <li className="ag-vspace" aria-hidden="true" style={{ height: padBottom }} />
        </ul>
      </div>
    </div>
  );
}
