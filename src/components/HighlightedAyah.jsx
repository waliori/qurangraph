import { norm, extractRoot } from "../arabic-utils.js";
import { THEMES } from "../theme.js";

/* Renders verse text with the primary / shared words highlighted, and
 * (optionally) each word clickable to drive the graph. */
export function HighlightedAyah({ text, primaryWord, sharedWords = [], interactive, onWordClick, activeGraphWord, searchMode, theme = "dark" }) {
  if (!text) return null;
  const T = THEMES[theme];
  const matchFn = searchMode === "root"
    ? (n) => (primaryWord && extractRoot(n) === primaryWord) || (activeGraphWord && extractRoot(n) === activeGraphWord)
    : (n) => (primaryWord && n === primaryWord) || (activeGraphWord && n === activeGraphWord);
  const sharedFn = searchMode === "root"
    ? (n) => sharedWords.some((w) => extractRoot(norm(w)) === extractRoot(n) || norm(w) === n)
    : (n) => sharedWords.some((w) => norm(w) === n || w === n);

  return (
    <span>{text.split(/(\s+)/).map((p, i) => {
      if (/^\s+$/.test(p)) return <span key={i}> </span>;
      const n = norm(p);
      const isPri = matchFn(n);
      const isShared = !isPri && sharedFn(n);
      const click = interactive && n.length >= 2;
      let bg = "transparent", color = T.text, fw = "normal", bd = "none";
      if (isPri) { bg = theme === "light" ? "#fca5a544" : "#ef444455"; color = theme === "light" ? "#dc2626" : "#fca5a5"; fw = "700"; bd = `1px solid ${theme === "light" ? "#dc262644" : "#ef444488"}`; }
      else if (isShared) { bg = theme === "light" ? "#fbbf2433" : "#f59e0b33"; color = theme === "light" ? "#b45309" : "#fcd34d"; bd = `1px solid ${theme === "light" ? "#fbbf2444" : "#f59e0b44"}`; }
      return (
        <span key={i}
          role={click ? "button" : undefined}
          tabIndex={click ? 0 : undefined}
          aria-label={click ? p : undefined}
          style={{ background: bg, color, fontWeight: fw, borderRadius: 4, padding: bg !== "transparent" ? "1px 4px" : "0", border: bd, cursor: click ? "pointer" : "default", transition: "all 0.15s" }}
          onClick={click ? (e) => { e.stopPropagation(); onWordClick?.(n); } : undefined}
          onKeyDown={click ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onWordClick?.(n); } } : undefined}
          onMouseEnter={click ? (e) => { if (!isPri && !isShared) { e.target.style.background = theme === "light" ? "#e2e8f044" : "#ffffff15"; e.target.style.borderBottom = `1px dashed ${theme === "light" ? "#3b82f6" : "#60a5fa"}`; } } : undefined}
          onMouseLeave={click ? (e) => { if (!isPri && !isShared) { e.target.style.background = "transparent"; e.target.style.borderBottom = "none"; } } : undefined}
        >{p}</span>
      );
    })}</span>
  );
}
