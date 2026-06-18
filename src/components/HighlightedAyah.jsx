import { norm, normStrict, groupKey } from "../arabic-utils.js";
import { THEMES } from "../theme.js";

/* Renders verse text with the primary / shared words highlighted, and
 * (optionally) each word clickable to drive the graph. Matching is by the active
 * mode's grouping key (exact surface | lemma | root); exact mode honours the
 * precision setting. primaryWord/activeGraphWord are already lookup keys, so we
 * compare them against each token's key — and emit that same key on click so the
 * handler selects the matching node. On click we emit the word's bare NORM (not a
 * pre-grouped key) so the handler can resolve it to the position-correct lookup
 * against the actual verse (disambiguating homographs); highlight matching here
 * stays on the voted key, which is display-only. */
export function HighlightedAyah({ text, primaryWord, sharedWords = [], highlightIndices, interactive, onWordClick, activeGraphWord, searchMode, precision = "loose", theme = "dark" }) {
  if (!text) return null;
  const T = THEMES[theme];
  const keyOf = (raw) => searchMode === "exact" ? (precision === "strict" ? normStrict(raw) : norm(raw)) : groupKey(norm(raw), searchMode);
  const matchFn = (k) => (primaryWord && k === primaryWord) || (activeGraphWord && k === activeGraphWord);
  const sharedFn = (raw, k) => sharedWords.some((w) => keyOf(w) === k || norm(w) === norm(raw));
  // Position-based highlight (expressions mark specific words, not a matching key). The split
  // interleaves whitespace, so count real words separately to map back to a word index.
  const byIndex = highlightIndices instanceof Set ? highlightIndices : null;
  let wordIdx = -1;

  return (
    // Qur'anic text is always RTL, regardless of the UI language direction.
    <span dir="rtl">{text.split(/(\s+)/).map((p, i) => {
      if (/^\s+$/.test(p)) return <span key={i}> </span>;
      wordIdx++;
      const n = norm(p);
      const k = keyOf(p);
      const isPri = matchFn(k) || (byIndex != null && byIndex.has(wordIdx));
      const isShared = !isPri && sharedFn(p, k);
      const click = interactive && n.length >= 2;
      let bg = "transparent", color = T.text, fw = "normal", bd = "none";
      if (isPri) { bg = theme === "light" ? "#fca5a544" : "#ef444455"; color = theme === "light" ? "#dc2626" : "#fca5a5"; fw = "700"; bd = `1px solid ${theme === "light" ? "#dc262644" : "#ef444488"}`; }
      else if (isShared) { bg = theme === "light" ? "#fbbf2433" : "#f59e0b33"; color = theme === "light" ? "#b45309" : "#fcd34d"; bd = `1px solid ${theme === "light" ? "#fbbf2444" : "#f59e0b44"}`; }
      // Affordance shown on BOTH hover and keyboard focus, so keyboard-only users get
      // the same cue as mouse users (was hover-only before).
      const cueOn = (e) => { if (!isPri && !isShared) { e.target.style.background = theme === "light" ? "#e2e8f044" : "#ffffff15"; e.target.style.borderBottom = `1px dashed ${theme === "light" ? "#3b82f6" : "#60a5fa"}`; } };
      const cueOff = (e) => { if (!isPri && !isShared) { e.target.style.background = "transparent"; e.target.style.borderBottom = "none"; } };
      return (
        <span key={i}
          role={click ? "button" : undefined}
          tabIndex={click ? 0 : undefined}
          aria-label={click ? p : undefined}
          style={{ background: bg, color, fontWeight: fw, borderRadius: 4, padding: bg !== "transparent" ? "1px 4px" : "0", border: bd, cursor: click ? "pointer" : "default", transition: "all 0.15s" }}
          onClick={click ? (e) => { e.stopPropagation(); onWordClick?.(n); } : undefined}
          onKeyDown={click ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onWordClick?.(n); } } : undefined}
          onMouseEnter={click ? cueOn : undefined}
          onMouseLeave={click ? cueOff : undefined}
          onFocus={click ? cueOn : undefined}
          onBlur={click ? cueOff : undefined}
        >{p}</span>
      );
    })}</span>
  );
}
