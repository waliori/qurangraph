import { useCallback, useEffect, useRef, useState } from "react";

/* ═══ Undo / redo of exploration ═══
 *
 * Records discrete exploration steps — which verse is the centre, which words /
 * verses are expanded, and what's selected — and lets the user step back and forth
 * through them (Ctrl/⌘+Z, Ctrl+Y or ⌘/Ctrl+Shift+Z). Pan / zoom / hover are NOT
 * history: they aren't passed in here.
 *
 *   useExplorationHistory({ hydrated, surah, ayah, expandedWords, expandedVerses,
 *                           selected, apply })
 *     hydrated — only start recording once initial URL/localStorage state is applied
 *     surah…selected — the tracked state; a change to any pushes a history entry
 *     apply(snap) — restore a snapshot { surah, ayah, ew, ev, selected } into the app
 *
 * The `applying` flag distinguishes a user change (record it) from our own restore
 * (don't), so undo/redo don't recursively create new history.
 */
export function useExplorationHistory({ hydrated, surah, ayah, expandedWords, expandedVerses, selected, apply }) {
  const histRef = useRef({ undo: [], redo: [], present: null, applying: false });
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const sync = () => { const h = histRef.current; setHist({ canUndo: h.undo.length > 0, canRedo: h.redo.length > 0 }); };

  // Record a step whenever the tracked state changes (after hydration). A change we
  // made ourselves via apply() is swallowed (applying flag) so it isn't re-recorded.
  useEffect(() => {
    if (!hydrated) return;
    const h = histRef.current;
    const snap = { surah, ayah, ew: [...expandedWords], ev: [...expandedVerses], selected };
    if (h.applying) { h.applying = false; h.present = snap; return; }
    if (h.present) { h.undo.push(h.present); if (h.undo.length > 120) h.undo.shift(); h.redo = []; }
    h.present = snap;
    sync();
  }, [hydrated, surah, ayah, expandedWords, expandedVerses, selected]);

  const applySnap = useCallback((s) => { histRef.current.applying = true; apply(s); }, [apply]);
  const undo = useCallback(() => { const h = histRef.current; if (!h.undo.length) return; h.redo.push(h.present); applySnap(h.undo.pop()); sync(); }, [applySnap]);
  const redo = useCallback(() => { const h = histRef.current; if (!h.redo.length) return; h.undo.push(h.present); applySnap(h.redo.pop()); sync(); }, [applySnap]);

  // Keyboard: Ctrl/⌘+Z = undo, Ctrl+Y or ⌘/Ctrl+Shift+Z = redo (ignored in inputs).
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return { undo, redo, canUndo: hist.canUndo, canRedo: hist.canRedo };
}
