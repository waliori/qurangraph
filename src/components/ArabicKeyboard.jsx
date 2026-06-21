import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/index.js";
import { UPGRADE, LONE_APOSTROPHE, LAYOUT, dottedGlyph, resolveTyped } from "../keyboard/translit.js";
import { isEditable, insertAtCaret, replaceBeforeCaret, backspace } from "../keyboard/editable.js";

/* ═══ Floating phonetic Arabic keyboard ═══
 *
 * Portalled to <body> at a very high z-index so it floats above every dialog/modal/drawer
 * (which top out at z-index 80) and is never clipped by a stacking context. Two ways in:
 *   • Physical typing — a capturing `beforeinput` listener rewrites Latin keystrokes to
 *     Arabic in ANY text field, app-wide, with the apostrophe acting as the upgrade modifier.
 *   • Clicking the on-screen keys — inserts into the last-focused text field. Key presses
 *     use mousedown→preventDefault so the field keeps focus (and its caret) while you click.
 *
 * Draggable by its header; remembers nothing across reloads (it always reopens bottom-centre).
 */
export function ArabicKeyboard({ open, onClose }) {
  const { t } = useI18n();
  const lastEditable = useRef(null);
  const [pos, setPos] = useState(null); // {left, top} once dragged; null → CSS default (bottom-centre)
  const [collapsed, setCollapsed] = useState(false); // show just the header bar, hiding the keys
  const drag = useRef(null);

  // Resolve the field a click should target: the remembered one if it's still live, else
  // whatever's focused right now (covers the very first click before any focusin fired).
  const targetEl = useCallback(() => {
    const el = lastEditable.current;
    if (el && el.isConnected && isEditable(el)) return el;
    const active = document.activeElement;
    return isEditable(active) ? active : null;
  }, []);

  // Physical-keyboard transliteration + focus tracking — only while open.
  useEffect(() => {
    if (!open) return;
    const onFocusIn = (e) => { if (isEditable(e.target)) lastEditable.current = e.target; };
    const onBeforeInput = (e) => {
      const el = e.target;
      if (!isEditable(el) || el.isContentEditable || e.isComposing) return;
      if (e.inputType !== "insertText" || e.data == null || e.data.length !== 1) return;
      const ch = e.data;
      const collapsed = el.selectionStart === el.selectionEnd;
      if (ch === "'") {
        e.preventDefault();
        const prev = collapsed ? el.value[(el.selectionStart ?? 0) - 1] : undefined;
        const up = prev != null ? UPGRADE[prev] : undefined;
        if (up === prev) return;                       // g' etc. — consume, leave letter as-is
        if (up) replaceBeforeCaret(el, 1, up);          // ت → ث
        else insertAtCaret(el, LONE_APOSTROPHE);        // bare hamza
        return;
      }
      const r = resolveTyped(ch);
      if (r === null) return;          // not part of the scheme — let it through
      e.preventDefault();
      if (r) insertAtCaret(el, r);     // r === "" → unmapped scheme letter, swallowed
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
    };
  }, [open]);

  // Keep the panel on-screen after a window resize once it's been dragged.
  useEffect(() => {
    if (!pos) return;
    const clamp = () => setPos((p) => p && ({
      left: Math.min(Math.max(0, p.left), window.innerWidth - 80),
      top: Math.min(Math.max(0, p.top), window.innerHeight - 60),
    }));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [pos]);

  if (!open) return null;

  const insert = (text) => {
    const el = targetEl();
    if (!el) return;
    insertAtCaret(el, text);
    el.focus();
  };
  const onBksp = () => { const el = targetEl(); if (el) { backspace(el); el.focus(); } };

  // Drag from the header. The pointer is captured on press so every move is delivered to the
  // header even when the cursor races ahead of the panel — without that, a fast drag escapes
  // the header element and the panel "drops" mid-move. Actual repositioning still waits for a
  // small movement threshold, so plain clicks/double-clicks (collapse toggle, ✕) fire normally.
  const onDragDown = (e) => {
    if (e.target.closest(".ag-kb-x")) return;
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const base = pos || { left: rect.left, top: rect.top };
    drag.current = { startX: e.clientX, startY: e.clientY, dx: e.clientX - base.left, dy: e.clientY - base.top, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const onDragMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 4) return; // still a click
    d.moved = true;
    setPos({ left: e.clientX - d.dx, top: e.clientY - d.dy });
  };
  const onDragUp = (e) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* */ }
  };

  const style = pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto", transform: "none" } : undefined;

  return createPortal(
    <div className={"ag-keyboard" + (collapsed ? " is-collapsed" : "")} role="group" aria-label={t("keyboard.title")} style={style}
      onMouseDown={(e) => e.preventDefault() /* never steal focus from the input */}>
      <div className="ag-kb-head" onPointerDown={onDragDown} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}
        onDoubleClick={(e) => { if (!e.target.closest(".ag-kb-x")) setCollapsed((c) => !c); }}>
        <button type="button" className="ag-kb-x" aria-expanded={!collapsed}
          aria-label={t(collapsed ? "keyboard.expand" : "keyboard.collapse")} title={t(collapsed ? "keyboard.expand" : "keyboard.collapse")}
          onPointerDown={(e) => e.stopPropagation()} onClick={() => setCollapsed((c) => !c)}>{collapsed ? "▴" : "▾"}</button>
        <span className="ag-kb-title">{t("keyboard.title")}</span>
        <button type="button" className="ag-kb-x" aria-label={t("keyboard.close")} title={t("keyboard.close")}
          onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>✕</button>
      </div>
      {!collapsed && <div className="ag-kb-keys">
        {LAYOUT.map((row, ri) => (
          <div className="ag-kb-row" key={ri}>
            {row.map((key) => (
              <button type="button" key={key.ar + key.hint} className={"ag-kb-key" + (key.combining ? " is-mark" : "")}
                title={key.hint} aria-label={key.ar} onClick={() => insert(key.ar)}>
                <span className="ag-kb-hint" aria-hidden="true">{key.hint}</span>
                <span className="ag-kb-ar">{key.combining ? dottedGlyph(key.ar) : key.ar}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="ag-kb-row ag-kb-ctrl">
          <button type="button" className="ag-kb-key is-wide" onClick={() => insert(" ")}>{t("keyboard.space")}</button>
          <button type="button" className="ag-kb-key" aria-label={t("keyboard.backspace")} title={t("keyboard.backspace")} onClick={onBksp}>⌫</button>
        </div>
      </div>}
    </div>,
    document.body,
  );
}
