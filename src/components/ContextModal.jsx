import { useMemo, useRef, useLayoutEffect } from "react";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";

/* ═══ Context reader ═══
 *
 * Reads the selected āya inside its sūrah: the whole sūrah in one scroll, opened
 * centred on (and highlighting) the chosen āya. Driven by `ctx = { centerKey }`;
 * `orderedKeys` is every "s:a" in muṣḥaf order (we slice out the centre's sūrah).
 *
 * Deliberately NOT virtualized. A sūrah is at most 286 āyāt of plain text, so we render
 * them all and let the browser scroll natively. The virtualized list (used for the
 * thousands-of-rows occurrences view) estimates off-screen row heights and re-measures
 * as you scroll; near variable-height content that measure/re-window/re-scroll cycle
 * fed back on itself and made the reader flicker on open and fight the scroll wheel.
 * A fully-rendered list has none of that — the centre āya is a real element we scroll to.
 */
export function ContextModal({ ctx, orderedKeys, verseData, onNavigate, onClose }) {
  const { t } = useI18n();
  // The centre āya's sūrah, in order — the only context we show.
  const suraKeys = useMemo(() => {
    if (!ctx) return [];
    const s = ctx.centerKey.split(":")[0] + ":";
    return orderedKeys.filter((k) => k.startsWith(s));
  }, [ctx, orderedKeys]);

  const scrollRef = useRef(null);
  const centerRef = useRef(null);

  // Centre the selected āya when the reader opens (or the centre changes). Everything is
  // rendered, so the centre row is a real node — scroll it to the middle of the viewport.
  // A layout effect positions it before the first paint (no flicker); a follow-up rAF
  // re-centres once more in case the Arabic webfont reflows the rows a frame later, and
  // guards the case where Firefox hasn't finalised the scroll range at layout-effect time.
  useLayoutEffect(() => {
    const s = scrollRef.current, c = centerRef.current;
    if (!s || !c) return undefined;
    const centre = () => {
      const cRect = c.getBoundingClientRect(), sRect = s.getBoundingClientRect();
      const target = s.scrollTop + (cRect.top - sRect.top) - (s.clientHeight - cRect.height) / 2;
      s.scrollTop = Math.max(0, target);
    };
    centre();
    const raf = requestAnimationFrame(centre);
    return () => cancelAnimationFrame(raf);
  }, [ctx?.centerKey, suraKeys]);

  if (!ctx) return null;
  const center = verseData[ctx.centerKey];

  return (
    <ModalShell open={!!ctx} share onClose={onClose} closeLabel={t("ctx.close")}
      ariaLabel={t("ctx.ariaLabel", { ref: center ? center.sn + " " + center.a : "" })}
      title={<>
        <span className="ag-badge t-verse">{t("ctx.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{center ? `${center.sn} ${center.a}` : ""}</h2>
      </>}>
      <ul className="ag-modal-list ag-ctx-list" ref={scrollRef} dir="rtl"
        aria-label={t("ctx.ariaLabel", { ref: center ? center.sn + " " + center.a : "" })}>
        {suraKeys.map((key, i) => {
          const v = verseData[key];
          if (!v) return null;
          const isCenter = key === ctx.centerKey;
          return (
            <li key={key} ref={isCenter ? centerRef : undefined}>
              {i === 0 && <div className="ag-ctx-surahead">{v.s}. {v.sn}</div>}
              <button type="button" className={"ag-ctx-aya" + (isCenter ? " is-center" : "")}
                onClick={() => onNavigate(v.s, v.a)} title={t("ctx.makeCenter")}>
                <span className="ag-ctx-num">{v.a}</span>
                <span className="ag-ctx-text">{v.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}
