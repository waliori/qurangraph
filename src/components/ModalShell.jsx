import { useRef, useState } from "react";
import { useModalFocus } from "../hooks/useModalFocus.js";
import { useBottomSheetDrag } from "../hooks/useBottomSheetDrag.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Shared centered-dialog shell ═══
 *
 * The scrim + focus-trapped dialog + standard head (title group · optional actions
 * cluster · close button) that every centered modal repeats. Centralising it means the
 * a11y contract — role="dialog", aria-modal, the focus trap/restore + Esc via
 * useModalFocus, the click-outside-to-close + stopPropagation — is written ONCE and can't
 * drift between modals. The body is whatever you pass as children (a div, a virtualized
 * <ul>, …). `actions` renders just left of the ✕; `onEscape` defaults to `onClose`.
 *
 * `share`: opt-in copy-link button for the analysis views. The app keeps the URL hash in
 * sync with the open view (see useUrlState / QuranGraph `currentView`), so a modal that
 * IS a shareable view just copies location.href — no need to thread app state down, and it
 * solves the "Copy link in the dock is hidden behind the open modal" problem.
 *
 * `back`: opt-in drill-back. Pass a callback (cross-modal return, or an intra-modal
 * "leave detail view") and ModalShell renders ONE canonical back affordance at the head
 * start and routes Esc to it — so every modal goes back the same way and in the same
 * place, instead of each hand-rolling a ←/→ button. The arrow follows reading direction.
 */
export function ModalShell({ open, onClose, onEscape, ariaLabel, title, actions, closeLabel, back, backLabel, share, children }) {
  const { t, lang } = useI18n();
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const { enabled: sheetEnabled, sheetRef, sheetClass, sheetStyle, gripProps } = useBottomSheetDrag(onClose);
  const setModalEl = (el) => { dialogRef.current = el; sheetRef.current = el; };
  useModalFocus(!!open, dialogRef, { onEscape: onEscape || back || onClose });
  if (!open) return null;
  const copyLink = () => {
    const href = typeof location !== "undefined" ? location.href : "";
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(href).then(flash).catch(flash);
    else flash();
  };
  return (
    <div className="ag-modal-scrim is-open" onClick={onClose}>
      <div className={"ag-modal" + sheetClass} style={sheetStyle} role="dialog" aria-modal="true" aria-label={ariaLabel}
        ref={setModalEl} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {/* Mobile: a grab handle drags the sheet (up→full, down→dismiss; tap toggles). */}
        {sheetEnabled && <button type="button" className="ag-sheet-grab" aria-label={t("common.sheet.resize")} {...gripProps} />}
        {/* Head layout: title (start) · ✕ (end) always share the first row; the actions
            cluster sits between them on wide screens but reflows to its own wrapping
            row(s) below the bottom-sheet breakpoint, so a modal with many actions can
            never push the ✕ off-screen. See .ag-modal-head rules in theme.css. */}
        <div className="ag-modal-head">
          {back && (
            <button type="button" className="ag-iconbtn ag-modal-back" aria-label={backLabel || t("common.back")}
              title={backLabel || t("common.back")} onClick={back}>{lang === "ar" ? "→" : "←"}</button>
          )}
          <div className="ag-modal-title">{title}</div>
          {(actions || share) && (
            <div className="ag-modal-actions">
              {actions}
              {share && (
                <button type="button" className="ag-btn" title={copied ? t("common.dock.linkCopied") : t("common.dock.copyLink")}
                  aria-label={t("common.dock.copyLink")} onClick={copyLink}>{copied ? "✓" : "⎘"}</button>
              )}
            </div>
          )}
          <button type="button" className="ag-iconbtn ag-modal-close" aria-label={closeLabel || t("common.close")} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
