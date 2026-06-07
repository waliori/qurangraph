import { useRef } from "react";
import { useI18n } from "../i18n/index.js";

/* ═══ Canvas-anchored sticky notes ═══
 *
 * Notes whose `pin` ties them to the current graph (pin.centerKey === the centre verse)
 * are drawn as small editable cards over the stage, anchored to a node (or the centre)
 * plus a world-space offset (dx,dy). Screen position = world·k + translate, so they
 * track pan/zoom. The grip (⠿) drags the card — that updates the offset (world units)
 * via onMove; it's a real <button>, so keyboard users can nudge the card with the arrow
 * keys (Shift = larger step) too. The title + body are edited inline via onEdit; ✕
 * unpins. Marked data-panel so the stage's own pan/drag handlers ignore pointer events.
 */
const NUDGE = 12; // world-units per arrow-key press (keyboard reposition)

export function StickyNotes({ notes, positions, transform, currentKey, nmap, onMove, onEdit, onUnpin }) {
  const { t } = useI18n();
  const dragRef = useRef(null);

  const onDown = (e, n) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: n.id, startX: e.clientX, startY: e.clientY, dx0: n.pin.dx, dy0: n.pin.dy, k: transform.k };
  };
  const onMoveEvt = (e) => {
    const d = dragRef.current;
    if (!d) return;
    onMove(d.id, d.dx0 + (e.clientX - d.startX) / d.k, d.dy0 + (e.clientY - d.startY) / d.k);
  };
  const onUp = (e) => { if (dragRef.current) { e.currentTarget.releasePointerCapture?.(e.pointerId); dragRef.current = null; } };
  // Keyboard reposition: arrow keys nudge the note's world-space offset.
  const onKey = (e, n) => {
    const v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!v) return;
    e.preventDefault();
    const s = NUDGE * (e.shiftKey ? 4 : 1);
    onMove(n.id, n.pin.dx + v[0] * s, n.pin.dy + v[1] * s);
  };

  return (
    <>
      {notes.map((n) => {
        const anchor = (n.pin.nodeId && (positions[n.pin.nodeId] || nmap[n.pin.nodeId])) || positions["v:" + currentKey] || nmap["v:" + currentKey];
        if (!anchor || !Number.isFinite(anchor.x)) return null;
        const left = (anchor.x + n.pin.dx) * transform.k + transform.x;
        const top = (anchor.y + n.pin.dy) * transform.k + transform.y;
        return (
          <div key={n.id} data-panel="1" className="ag-sticky" style={{ left, top }}>
            <div className="ag-sticky-bar">
              <button type="button" className="ag-sticky-grip" title={t("ws.moveNote")} aria-label={t("ws.moveNote")}
                onPointerDown={(e) => onDown(e, n)} onPointerMove={onMoveEvt} onPointerUp={onUp} onPointerCancel={onUp}
                onKeyDown={(e) => onKey(e, n)}>⠿</button>
              <input className="ag-sticky-titlein" value={n.title} placeholder={t("ws.noteTitlePh")}
                onChange={(e) => onEdit(n.id, { title: e.target.value })} />
              <button type="button" className="ag-sticky-x" aria-label={t("ws.unpin")} title={t("ws.unpin")} onClick={() => onUnpin(n.id)}>✕</button>
            </div>
            <textarea className="ag-sticky-bodyin" value={n.body} placeholder={t("ws.noteBodyPh")} rows={3}
              onChange={(e) => onEdit(n.id, { body: e.target.value })} />
          </div>
        );
      })}
    </>
  );
}
