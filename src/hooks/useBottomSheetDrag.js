import { useCallback, useRef, useState } from "react";
import { useMediaQuery } from "./useMediaQuery.js";

/* ═══ Draggable bottom-sheet behaviour (mobile) ═══
 *
 * Shared by every dialog that becomes a bottom sheet on phones (ModalShell, the inspector)
 * so they all behave identically: open at a PEEK height, drag the grab handle up to go
 * FULL, drag down past a threshold to dismiss, or tap the handle to toggle peek↔full. Snap
 * is HEIGHT-based (not transform) so the scroll region always equals the visible area.
 *
 * The move/up listeners are bound to `document` for the duration of a drag (not relying on
 * pointer capture, which is flaky across engines) — so the gesture keeps tracking even when
 * the finger leaves the small handle. preventDefault on pointermove stops the page/sheet
 * from scrolling mid-drag.
 *
 * Returns props to spread:
 *   sheetRef   → the sheet element (measured for snapping)
 *   sheetClass → " is-full" / " is-dragging" (append to className; only on mobile)
 *   sheetStyle → inline { height } while dragging (else undefined)
 *   gripProps  → { onPointerDown, onClick } for the grab handle
 *   enabled    → whether the sheet layout is active (≤860px)
 */
export function useBottomSheetDrag(onClose) {
  const enabled = useMediaQuery("(max-width: 860px)");
  const [snap, setSnap] = useState("peek");
  const [dragH, setDragH] = useState(null);
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const gestureRef = useRef(false); // a pointer gesture just ran → swallow the trailing click

  const clampH = (d, clientY) => Math.max(96, Math.min(d.vh * 0.96, d.base - (clientY - d.startY)));

  const onPointerDown = useCallback((e) => {
    if (!enabled) return;
    const el = sheetRef.current; if (!el) return;
    gestureRef.current = true;
    const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
    const d = { startY: e.clientY, base: el.offsetHeight || 1, vh, moved: false };
    dragRef.current = d;

    const move = (ev) => {
      if (!dragRef.current) return;
      if (ev.cancelable) ev.preventDefault();
      if (Math.abs(ev.clientY - d.startY) > 5) d.moved = true;
      setDragH(clampH(d, ev.clientY));
    };
    const up = (ev) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      dragRef.current = null;
      setDragH(null);
      if (!d.moved) { setSnap((s) => (s === "full" ? "peek" : "full")); return; } // tap toggles
      const h = clampH(d, ev.clientY);
      if (h < d.vh * 0.28) onClose?.();                  // dragged down small → dismiss
      else if (h > d.vh * 0.66) setSnap("full");          // dragged up tall → full
      else setSnap("peek");                                // settle at peek
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }, [enabled, onClose]);

  // Keyboard / non-pointer activation of the handle toggles peek↔full; a click synthesised
  // right after a pointer gesture is swallowed (the pointerup already handled it).
  const onClick = useCallback(() => {
    if (gestureRef.current) { gestureRef.current = false; return; }
    setSnap((s) => (s === "full" ? "peek" : "full"));
  }, []);

  return {
    enabled,
    sheetRef,
    sheetClass: enabled ? ((snap === "full" ? " is-full" : "") + (dragH != null ? " is-dragging" : "")) : "",
    sheetStyle: enabled && dragH != null ? { height: `${dragH}px` } : undefined,
    gripProps: { onPointerDown, onClick },
  };
}
