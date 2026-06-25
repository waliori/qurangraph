import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/index.js";

/* ═══ Toolbar overflow menu (⋯) ═══
 *
 * On compact/touch layouts the long row of secondary toolbar icons collapses into a
 * single ⋯ button that opens a labelled menu — fewer, bigger tap targets and, unlike
 * the bare glyph buttons, every action carries a text label (titles never appear on
 * touch). Each item is `{ key, glyph, label, active, badge, onClick, href }`; an `href`
 * renders an <a> (external links), otherwise a <button>.
 *
 * The panel is PORTALLED to <body> as a scrimmed bottom sheet. It cannot live in place:
 * .ag-bar has a backdrop-filter, which makes it the containing block for position:fixed
 * descendants, so an in-bar sheet pinned to the toolbar instead of the viewport. Tapping
 * the scrim or the grip — or Escape — closes it.
 */
export function ToolbarMenu({ items, label, glyph = "⋯", dataTour }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const trigLabel = label || t("common.menu.more");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const anyActive = items.some((it) => it.active);
  const close = () => setOpen(false);

  return (
    <div className="ag-tools ag-menu">
      <button type="button" data-tour={dataTour} className={"ag-iconbtn" + (open || anyActive ? " is-active" : "")}
        aria-haspopup="menu" aria-expanded={open} aria-label={trigLabel} title={trigLabel}
        onClick={() => setOpen((o) => !o)}>{glyph}</button>
      {open && createPortal(
        <div className="ag-sheet-scrim" onClick={close}>
          <div className="ag-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ag-sheet-grip" aria-label={t("common.close")} onClick={close} />
            <div className="ag-menu-pop" role="menu" aria-label={t("common.menu.title")}>
              {items.map((it) => {
                const inner = (<>
                  <span className="ag-menu-glyph" aria-hidden="true">{it.glyph}</span>
                  <span className="ag-menu-label">{it.label}</span>
                  {it.badge != null && <span className="ag-ws-badge">{it.badge}</span>}
                </>);
                const cls = "ag-menu-item" + (it.active ? " is-active" : "");
                return it.href ? (
                  <a key={it.key} className={cls} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer"
                    onClick={close}>{inner}</a>
                ) : (
                  <button key={it.key} type="button" className={cls} role="menuitem" aria-pressed={it.active || undefined}
                    onClick={() => { close(); it.onClick?.(); }}>{inner}</button>
                );
              })}
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
