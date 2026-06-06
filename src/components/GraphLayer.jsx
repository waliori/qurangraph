import { memo } from "react";
import { norm } from "../arabic-utils.js";
import { fColor, dColor } from "../theme.js";

/* ═══ Memoized SVG graph render ═══
 *
 * Split out from QuranGraph so panning/zooming (which only changes the parent
 * <g> transform) does NOT re-run this map — React.memo skips it when none of the
 * graph props changed. Each node is itself memoized, so a hover/selection that
 * does re-render this layer only touches the handful of nodes whose visual flags
 * actually changed, not the whole tree.
 */

const GraphNode = memo(function GraphNode({ node: n, x, y, isH, isS, isAW, dim, T, theme, onEnter, onLeave, onClick }) {
  const opacity = dim ? 0.42 : 1;
  const r = isH ? n.r * 1.35 : isS || isAW ? n.r * 1.2 : n.r;
  const isWE = n.type === "word" && n.isExpanded;
  const isVE = n.type === "verse" && n.isExpanded;
  const clickable = n.type !== "center";

  // Recompute the node colour per render so a theme switch instantly recolours the
  // graph (the colour baked at build time is for one theme only). Light mode swaps
  // in deeper, saturated tones that hold up on the parchment field.
  const L = theme === "light";
  const col = n.type === "word" ? fColor(n.count, theme) : n.type === "verse" ? dColor(n.depth, theme) : (L ? "#a16207" : n.color);
  const cGold = L ? "#b45309" : "#fcd34d"; // active-word accent
  const cVir = L ? "#0f766e" : "#34d8a8";  // expanded word
  const cPur = L ? "#6d28d9" : "#a78bfa";  // expanded verse
  const sel = L ? "#2a2620" : "#fff";      // selected / hovered outline

  return (
    <g data-node={n.id} style={{ cursor: "pointer", opacity, transition: "opacity 0.25s" }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={n.type === "word" ? `${n.label} (${n.count})` : n.label}
      onMouseEnter={() => onEnter(n)}
      onMouseLeave={() => onLeave(n)}
      onClick={(e) => onClick(n, e)}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(n, e); } } : undefined}>

      {(isWE || isVE) && <circle cx={x} cy={y} r={r + 7} fill="none" stroke={isWE ? cVir : cPur} strokeWidth={2} opacity={0.3} strokeDasharray={isVE ? "4,2" : "none"} />}
      {(isS || isAW) && <circle cx={x} cy={y} r={r + 10} fill="none" stroke={isAW ? cGold : col} strokeWidth={2} opacity={0.3}><animate attributeName="r" values={`${r + 8};${r + 14};${r + 8}`} dur="2s" repeatCount="indefinite" /></circle>}

      <circle cx={x} cy={y} r={r}
        fill={isAW ? cGold + "44" : isWE ? cVir + "33" : isVE ? cPur + "33" : col + T.nodeFill}
        stroke={isS ? sel : isAW ? cGold : isWE ? cVir : isVE ? cPur : isH ? sel : col}
        strokeWidth={n.type === "center" ? 3 : isH || isS || isAW ? 2.5 : isWE || isVE ? 2 : n.type === "word" ? 1.8 : 1} />

      {n.type === "word" && <text x={x} y={y + 3.5} textAnchor="middle" fontSize={8} fontWeight="bold" fill={L ? "#2a2620" : "#fff"} style={{ pointerEvents: "none", fontFamily: "var(--font-mono)" }}>{n.count || ""}</text>}
      {n.type === "verse" && (n.sharedCount || 0) > 1 && <text x={x} y={y + 3} textAnchor="middle" fontSize={7} fill={cGold} fontWeight="bold" style={{ pointerEvents: "none", fontFamily: "var(--font-mono)" }}>{n.sharedCount}</text>}

      <text x={x} y={n.type === "word" ? y - r - 4 : y + r + 11}
        textAnchor="middle" fontSize={n.type === "center" ? 12 : n.type === "word" ? 12 : 8}
        fontWeight={n.type !== "verse" ? "bold" : "normal"} fill={isS || isAW ? sel : n.type === "verse" ? T.textDim : col}
        direction="rtl" style={{ pointerEvents: "none", fontFamily: n.type === "verse" ? "var(--font-display)" : "var(--font-quran)" }}>{n.label}</text>

      {n.type === "word" && n.rootLabel && n.rootLabel !== norm(n.label) && (
        <text x={x} y={y - r - 15} textAnchor="middle" fontSize={8} fill={cVir} opacity={L ? 0.95 : 0.75} direction="rtl" style={{ pointerEvents: "none", fontFamily: "var(--font-ui)" }}>({n.rootLabel})</text>
      )}
      {n.type === "word" && !isWE && n.count > 1 && <text x={x + r + 3} y={y + 3} fontSize={10} fill={T.textFaint} style={{ pointerEvents: "none" }}>+</text>}
      {isWE && <circle cx={x + r - 1} cy={y - r + 1} r={5} fill={cVir} stroke={T.bg} strokeWidth={1.5} />}
    </g>
  );
});

function GraphLayerInner({ nodes, links, loopLinks, positions, nmap, highlightSet, highlightLinks, activeWordNodeIds, hovered, selected, showLoops, T, theme, onNodeEnter, onNodeLeave, onNodeClick }) {
  const anyHighlight = !!highlightSet || activeWordNodeIds.size > 0;
  const pos = (n) => positions[n.id] || { x: n.x, y: n.y };

  return (
    <>
      {links.map((l, i) => {
        const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
        const sp = pos(s), tp = pos(t);
        const isC = s.type === "center" || t.type === "center";
        const onP = highlightLinks ? highlightLinks.has(i) : true;
        const onA = activeWordNodeIds.size > 0 && (activeWordNodeIds.has(l.source) || activeWordNodeIds.has(l.target));
        const bright = onP || onA;
        return <line key={`l${i}`} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
          stroke={bright ? (onA ? "#fcd34d77" : isC ? T.linkCenter : T.link) : (theme === "light" ? "#cbbfa0" : "#243150")}
          strokeWidth={bright ? (isC ? 1.8 : 1) : 0.5}
          strokeOpacity={bright ? 0.7 : 0.32} />;
      })}
      {showLoops && loopLinks.map((l, i) => {
        const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
        const sp = pos(s), tp = pos(t), mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2, dx = tp.x - sp.x, dy = tp.y - sp.y;
        return <path key={`lp${i}`} d={`M ${sp.x} ${sp.y} Q ${mx - dy * 0.3} ${my + dx * 0.3} ${tp.x} ${tp.y}`} fill="none" stroke="#ff6b6b" strokeWidth={1.2} strokeDasharray="4,3" strokeOpacity={0.4} markerEnd="url(#arrL)" />;
      })}

      {nodes.map((n) => {
        const p = pos(n);
        const isAW = activeWordNodeIds.has(n.id);
        const onP = highlightSet ? highlightSet.has(n.id) : true;
        const dim = !(onP || isAW) && anyHighlight;
        return <GraphNode key={n.id} node={n} x={p.x} y={p.y}
          isH={hovered === n.id} isS={selected === n.id} isAW={isAW} dim={dim}
          T={T} theme={theme} onEnter={onNodeEnter} onLeave={onNodeLeave} onClick={onNodeClick} />;
      })}
    </>
  );
}

export const GraphLayer = memo(GraphLayerInner);
