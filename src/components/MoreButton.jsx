import { useI18n } from "../i18n/index.js";

/* A "show N more" button for incrementally-revealed lists (pairs with useReveal).
 * Renders nothing when everything is already shown. `shown`/`total` are counts. */
export function MoreButton({ shown, total, onMore, step = 200 }) {
  const { t, fmtNum } = useI18n();
  if (shown >= total) return null;
  const remaining = total - shown;
  return (
    <button type="button" className="ag-btn ag-more-btn" onClick={onMore}>
      {t("ui.showMore", { n: fmtNum(Math.min(step, remaining)), total: fmtNum(remaining) })}
    </button>
  );
}
