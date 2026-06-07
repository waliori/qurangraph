import { useRef } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Shared centered-dialog shell ═══
 *
 * The scrim + focus-trapped dialog + standard head (title group · optional actions
 * cluster · close button) that every centered modal repeats. Centralising it means the
 * a11y contract — role="dialog", aria-modal, the focus trap/restore + Esc via
 * useModalFocus, the click-outside-to-close + stopPropagation — is written ONCE and can't
 * drift between modals. The body is whatever you pass as children (a div, a virtualized
 * <ul>, …). `actions` renders just left of the ✕; `onEscape` defaults to `onClose`.
 */
export function ModalShell({ open, onClose, onEscape, ariaLabel, title, actions, closeLabel, children }) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  useModalFocus(!!open, dialogRef, { onEscape: onEscape || onClose });
  if (!open) return null;
  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className="ag-modal" role="dialog" aria-modal="true" aria-label={ariaLabel} ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="ag-modal-head">
          <div className="ag-modal-title">{title}</div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            {actions}
            <button type="button" className="ag-iconbtn" aria-label={closeLabel || t("common.close")} onClick={onClose}>✕</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
