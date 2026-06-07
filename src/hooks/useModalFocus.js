import { useEffect, useRef } from "react";

/* ═══ Dialog focus management ═══
 *
 * Makes a modal usable by keyboard / screen-reader users, per the WAI-ARIA dialog
 * pattern: when it opens we move focus inside, while it's open Tab is trapped within
 * it (so focus can't leak to the graph behind), Escape closes it, and when it closes
 * focus returns to whatever opened it. Pure DOM + one effect, no dependencies.
 *
 *   useModalFocus(active, ref, { onEscape })
 *     active   — whether the dialog is currently shown
 *     ref      — ref to the dialog container (give it tabIndex={-1})
 *     onEscape — called on Escape (defaults to nothing; pass onClose / a back handler)
 *
 * Escape + Tab are handled on the document in the capture phase so they work no
 * matter where focus currently sits, replacing each modal's own Escape listener.
 */
const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalFocus(active, ref, { onEscape } = {}) {
  // Hold the latest onEscape in a ref so the effect doesn't re-bind (and re-focus)
  // every render just because the parent passed a fresh callback. Written in an
  // effect (never during render) so it stays current without re-running the trap.
  const escRef = useRef(onEscape);
  useEffect(() => { escRef.current = onEscape; });

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const prev = document.activeElement; // restore focus here on close
    // Move focus inside: the first focusable control, else the container itself.
    (node?.querySelector(FOCUSABLE) || node)?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); escRef.current?.(); return; }
      if (e.key !== "Tab" || !node) return;
      const f = Array.from(node.querySelectorAll(FOCUSABLE));
      if (!f.length) { e.preventDefault(); node.focus?.(); return; }
      const first = f[0], last = f[f.length - 1], a = document.activeElement;
      // Wrap at the ends, and pull focus back in if it ever escaped the dialog.
      if (e.shiftKey && (a === first || !node.contains(a))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !node.contains(a))) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [active, ref]);
}
