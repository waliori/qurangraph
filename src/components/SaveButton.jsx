import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Save-to-workspace toggle ═══
 *
 * One control for every "★ save" across the analysis modals. Feedback lives ON the button —
 * a ✓ flash on save plus a persistent filled/outline state — because the bottom toast can be
 * hidden behind the floating Arabic keyboard. Clicking when already saved removes the item
 * (toggle), so it doubles as the un-save. `item = { type, title, payload }`; the saved state is
 * matched on (type, payload) via the workspace, so it stays in sync if the item is removed
 * elsewhere. `label` (optional) shows text next to the star; otherwise it's icon-only. */
export function SaveButton({ item, label, className = "ag-btn", dataTour }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [flash, setFlash] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const existing = ws.findSaved ? ws.findSaved(item.type, item.payload) : null;
  const saved = !!existing;
  const onClick = () => {
    if (saved) { ws.removeItem(existing.id); return; }
    ws.saveItem(item);
    setFlash(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(false), 1400);
  };
  const star = flash ? "✓" : saved ? "★" : "☆";
  return (
    <button type="button" data-tour={dataTour} className={className + (saved || flash ? " is-gold" : "")} aria-pressed={saved}
      title={saved ? t("ws.savedToggle") : t("ws.saveTitle")} onClick={onClick}>
      {star}{label ? " " + label : ""}
    </button>
  );
}
