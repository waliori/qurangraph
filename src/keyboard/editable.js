/* ═══ Editable-element helpers shared by the on-screen keyboard and the physical
 *     typing interceptor ═══
 *
 * Writing to a React-controlled <input>/<textarea> by setting `.value` directly is
 * invisible to React — it tracks the value through its own setter and never re-fires
 * onChange. The fix is the well-known trick: call the NATIVE prototype value setter,
 * then dispatch a bubbling `input` event, which React's synthetic onChange listens for.
 * This makes our inserts behave exactly like real keystrokes for every input in the app,
 * controlled or not, in any modal.
 */

const INPUT_OK = /^(text|search|email|tel|url|password|)$/i;

// A text field we're allowed to drive: a <textarea>, or a text-like <input> that isn't
// read-only/disabled. Number/range/checkbox/etc. are excluded — Arabic text is nonsense
// there. contenteditable is intentionally skipped (the app has none).
export function isEditable(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return INPUT_OK.test(el.type || "");
  return false;
}

function nativeSetValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
}

// Replace [start, end) with `text`, place the caret after it, and notify React.
function splice(el, start, end, text) {
  const v = el.value;
  nativeSetValue(el, v.slice(0, start) + text + v.slice(end));
  const caret = start + text.length;
  try { el.setSelectionRange(caret, caret); } catch { /* type=email/number reject this */ }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Insert `text` at the caret (replacing any selection).
export function insertAtCaret(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  splice(el, start, end, text);
}

// Replace the `count` chars immediately before a collapsed caret with `text`
// (the apostrophe upgrade: ت → ث).
export function replaceBeforeCaret(el, count, text) {
  const caret = el.selectionStart ?? el.value.length;
  splice(el, Math.max(0, caret - count), caret, text);
}

// Delete the selection, or one char before a collapsed caret (the ⌫ key).
export function backspace(el) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start !== end) splice(el, start, end, "");
  else if (start > 0) splice(el, start - 1, start, "");
}
