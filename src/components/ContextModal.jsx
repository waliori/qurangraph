import { useMemo, useState } from "react";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { useAssistantControl } from "../ai/AssistantContext.jsx";

/* ═══ Context reader ═══
 *
 * Reads the selected āya inside its sūrah: the whole sūrah as one virtualized
 * scroll, opened scrolled to (and highlighting) the centre āya. Same measured-row
 * virtualization as the occurrences list — only visible āyāt render. Driven by
 * `ctx = { centerKey }`; `orderedKeys` is every "s:a" in muṣḥaf order (we slice
 * out the centre's sūrah).
 *
 * Each āya carries a select toggle: tick any number of them and "Analyze selected"
 * hands those verses to the AI assistant (or the header ✦ does the same — falling
 * back to the centre āya when nothing is ticked).
 */
export function ContextModal({ ctx, orderedKeys, verseData, onNavigate, onClose }) {
  const { t } = useI18n();
  const ai = useAssistantControl();
  const [sel, setSel] = useState(() => new Set());
  // A fresh selection whenever the centre āya (and thus the sūrah) changes — done during
  // render (React's recommended pattern) rather than in an effect.
  const [seedKey, setSeedKey] = useState(ctx?.centerKey);
  if (ctx?.centerKey !== seedKey) { setSeedKey(ctx?.centerKey); setSel(new Set()); }
  const toggleSel = (key) => setSel((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  // Build a "verse" attachable (serializeVerse shape) for one "s:a" key.
  const verseItem = (key) => { const v = verseData[key]; return { id: "an:" + key, kind: "verse", title: t("ai.attach.verse", { v: key }), payload: { ref: key, surahName: v?.sn, text: v?.text } }; };
  const selectedItems = () => [...sel].map(verseItem);
  // Header ✦ analyzes the ticked āyāt, or the centre āya when none are ticked.
  const aiCtx = () => (sel.size ? selectedItems() : (ctx ? [verseItem(ctx.centerKey)] : []));
  const analyzeSelected = () => { if (!ai || !sel.size) return; ai.analyze(selectedItems()); onClose(); };
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

  if (!ctx) return null;
  const center = verseData[ctx.centerKey];
  const rows = [];
  for (let i = start; i < end; i++) {
    const key = suraKeys[i];
    const v = verseData[key];
    if (!v) continue;
    const isCenter = key === ctx.centerKey;
    const checked = sel.has(key);
    rows.push(
      <li key={key} ref={rowRef(i)}>
        {i === 0 && <div className="ag-ctx-surahead">{v.s}. {v.sn}</div>}
        <div className="ag-ctx-row" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
          {ai && (
            <button type="button" className={"ag-iconbtn ag-ctx-check" + (checked ? " is-active" : "")}
              role="checkbox" aria-checked={checked} aria-label={t("ai.selectAya", { a: v.a })}
              onClick={() => toggleSel(key)}>{checked ? "☑" : "☐"}</button>
          )}
          <button type="button" className={"ag-ctx-aya" + (isCenter ? " is-center" : "")}
            onClick={() => onNavigate(v.s, v.a)} title={t("ctx.makeCenter")} style={{ flex: 1 }}>
            <span className="ag-ctx-num">{v.a}</span>
            <span className="ag-ctx-text">{v.text}</span>
          </button>
        </div>
      </li>
    );
  }

  return (
    <ModalShell open={!!ctx} onClose={onClose} closeLabel={t("ctx.close")}
      ariaLabel={t("ctx.ariaLabel", { ref: center ? center.sn + " " + center.a : "" })}
      aiContext={aiCtx}
      title={<>
        <span className="ag-badge t-verse">{t("ctx.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{center ? `${center.sn} ${center.a}` : ""}</h2>
      </>}>
      <ul className="ag-modal-list ag-ctx-list" ref={scrollRef} onScroll={onScroll} dir="rtl">
        <li className="ag-vspace" aria-hidden="true" style={{ height: padTop }} />
        {rows}
        <li className="ag-vspace" aria-hidden="true" style={{ height: padBottom }} />
      </ul>
      {ai && (
        <div className="ag-ctx-aibar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", padding: "var(--space-2) var(--space-3)" }}>
          <span className="ag-hint">{t("ai.selectHint")}</span>
          {sel.size > 0 && (
            <span style={{ display: "flex", gap: "var(--space-2)" }}>
              <button type="button" className="ag-btn" onClick={() => setSel(new Set())}>{t("ai.clearSel")}</button>
              <button type="button" className="ag-btn is-gold" onClick={analyzeSelected}>✦ {t("ai.analyzeSel", { n: sel.size })}</button>
            </span>
          )}
        </div>
      )}
    </ModalShell>
  );
}
