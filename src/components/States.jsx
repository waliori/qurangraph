import { useI18n } from "../i18n/index.js";

/* ═══ Shared empty / loading / error states ═══
 *
 * Small presentational placeholders so every lazy-loaded list distinguishes the three
 * outcomes instead of conflating them (the old DefinitionModal showed the same blank for
 * "not found" and "failed to load"). All strings come from the ui.* namespace.
 */

export function EmptyState({ message, icon = "∅" }) {
  const { t } = useI18n();
  return (
    <div className="ag-state ag-state-empty" role="status">
      <span className="ag-state-icon" aria-hidden="true">{icon}</span>
      <span className="ag-state-msg">{message || t("ui.empty")}</span>
    </div>
  );
}

export function LoadingState({ message }) {
  const { t } = useI18n();
  return (
    <div className="ag-state ag-state-loading" role="status" aria-live="polite">
      <span className="ag-state-msg">{message || t("ui.loading")}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="ag-state ag-state-error" role="alert">
      <span className="ag-state-icon" aria-hidden="true">⚠</span>
      <span className="ag-state-msg">{message || t("ui.error")}</span>
      {onRetry && <button type="button" className="ag-btn" onClick={onRetry}>{t("ui.retry")}</button>}
    </div>
  );
}
