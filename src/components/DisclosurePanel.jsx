import { useId, useState } from "react";

/* ═══ DisclosurePanel ═══
 *
 * A reusable collapsible section: a toggle button (▸/▾ label) revealing `children`.
 * Uncontrolled by default (manages its own open state); pass `open` + `onToggle` to
 * control it. Used for the "Method" disclosure in every analysis lab and for the
 * advanced morphology axes. Accessible: the button carries aria-expanded + aria-controls.
 */
export function DisclosurePanel({ label, children, defaultOpen = false, open, onToggle, className = "" }) {
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;
  const bodyId = useId();
  const toggle = () => { if (onToggle) onToggle(!isOpen); else setInternal((v) => !v); };
  return (
    <div className={"ag-disclosure" + (className ? " " + className : "")}>
      <button type="button" className="ag-disclosure-btn" aria-expanded={isOpen} aria-controls={bodyId} onClick={toggle}>
        <span className="ag-disclosure-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span> {label}
      </button>
      {isOpen && <div className="ag-disclosure-body" id={bodyId}>{children}</div>}
    </div>
  );
}
