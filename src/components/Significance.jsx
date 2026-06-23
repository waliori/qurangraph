import { useI18n } from "../i18n/index.js";

/* ═══ Significance stars + metric formatting ═══
 *
 * `SigStars` renders the Dunning-G² significance tier (0..3 from assoc.js) as filled
 * stars with an accessible title (p<.05 / .01 / .001). `fmtMetric` formats a metric
 * value compactly (integers for big magnitudes, one decimal otherwise). Shared by every
 * collocation/keyness view so significance reads the same everywhere.
 */

export function fmtMetric(v) {
  if (v == null || Number.isNaN(v)) return "";
  return Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1);
}

export function SigStars({ sig = 0 }) {
  const { t } = useI18n();
  if (!sig) return null;
  return (
    <span className={"ag-sig ag-sig-" + sig} title={t("ui.sig." + sig)} aria-label={t("ui.sig") + ": " + t("ui.sig." + sig)}>
      {"★".repeat(sig)}
    </span>
  );
}
