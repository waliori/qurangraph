import { memo } from "react";
import { norm } from "../arabic-utils.js";

/* ═══ Memoized SVG graph render ═══
 *
 * Split out from QuranGraph so panning/zooming (which only changes the parent
 * <g> transform) does NOT re-run this map — React.memo skips it when none of the
 * graph props changed. Each node is itself memoized, so a hover/selection that
 * does re-render this layer only touches the handful of nodes whose visual flags
 * actually changed, not the whole tree.
 */

const GraphNode = memo(function GraphNode({ node: n, x, y, isH, isS, isAW, dim, T, theme, onEnter, onLeave, onClick }) {
  const opacity = dim ? 0.1 : 1;
  const r = isH ? n.r * 1.35 : isS || isAW ? n.r * 1.2 : n.r;
  const isWE = n.type === "word" && n.isExpanded;
  const isVE = n.type === "verse" && n.isExpanded;
  const clickable = n.type !== "center";

  return (
    <g data-node={n.id} style={{ cursor: "pointer", opacity, transition: "opacity 0.25s" }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={n.type === "word" ? `${n.label} (${n.count})` : n.label}
      onMouseEnter={() => onEnter(n)}
      onMouseLeave={() => onLeave(n)}
      onClick={(e) => onClick(n, e)}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(n, e); } } : undefined}>

      {(isWE || isVE) && <circle cx={x} cy={y} r={r + 7} fill="none" stroke={isWE ? "#22c55e" : "#cc5de8"} strokeWidth={2} opacity={0.3} strokeDasharray={isVE ? "4,2" : "none"} />}
      {(isS || isAW) && <circle cx={x} cy={y} r={r + 10} fill="none" stroke={isAW ? "#fcc419" : n.color} strokeWidth={2} opacity={0.3}><animate attributeName="r" values={`${r + 8};${r + 14};${r + 8}`} dur="2s" repeatCount="indefinite" /></circle>}

      <circle cx={x} cy={y} r={r}
        fill={isAW ? "#fcc41944" : isWE ? "#22c55e33" : isVE ? "#cc5de833" : n.color + T.nodeFill}
        stroke={isS ? (theme === "light" ? "#1e293b" : "#fff") : isAW ? "#fcc419" : isWE ? "#22c55e" : isVE ? "#cc5de8" : isH ? (theme === "light" ? "#1e293b" : "#fff") : n.color}
        strokeWidth={n.type === "center" ? 3 : isH || isS || isAW ? 2.5 : isWE || isVE ? 2 : n.type === "word" ? 1.8 : 1} />

      {n.type === "word" && <text x={x} y={y + 3.5} textAnchor="middle" fontSize={8} fontWeight="bold" fill={theme === "light" ? "#1e293b" : "#fff"} style={{ pointerEvents: "none" }}>{n.count || ""}</text>}
      {n.type === "verse" && (n.sharedCount || 0) > 1 && <text x={x} y={y + 3} textAnchor="middle" fontSize={7} fill="#fcc419" fontWeight="bold" style={{ pointerEvents: "none" }}>{n.sharedCount}</text>}

      <text x={x} y={n.type === "word" ? y - r - 4 : y + r + 11}
        textAnchor="middle" fontSize={n.type === "center" ? 12 : n.type === "word" ? 11 : 8}
        fontWeight={n.type !== "verse" ? "bold" : "normal"} fill={isS || isAW ? (theme === "light" ? "#1e293b" : "#fff") : n.type === "verse" ? T.textDim : n.color}
        direction="rtl" style={{ pointerEvents: "none" }}>{n.label}</text>

      {n.type === "word" && n.rootLabel && n.rootLabel !== norm(n.label) && (
        <text x={x} y={y - r - 15} textAnchor="middle" fontSize={8} fill="#22c55e" opacity={0.7} direction="rtl" style={{ pointerEvents: "none" }}>({n.rootLabel})</text>
      )}
      {n.type === "word" && !isWE && n.count > 1 && <text x={x + r + 3} y={y + 3} fontSize={10} fill={T.textFaint} style={{ pointerEvents: "none" }}>+</text>}
      {isWE && <circle cx={x + r - 1} cy={y - r + 1} r={5} fill="#22c55e" stroke={T.bg} strokeWidth={1.5} />}
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
          stroke={bright ? (onA ? "#fcc41955" : isC ? T.linkCenter : T.link) : (theme === "light" ? "#e2e8f0" : "#0a1020")}
          strokeWidth={bright ? (isC ? 1.8 : 1) : 0.3}
          strokeOpacity={bright ? 0.7 : 0.1} />;
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
