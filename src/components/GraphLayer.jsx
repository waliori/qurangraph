import { memo } from "react";
import { norm } from "../arabic-utils.js";
import { fColor, dColor, eColor, eWidth, eDash } from "../theme.js";
import { useI18n } from "../i18n/index.js";
import { nodeAria } from "./nodeAria.js";

// Evaluated once at load — users rarely toggle the OS setting mid-session, and a
// constant lets the memoized nodes skip it as a dependency. SMIL <animate> is NOT
// covered by the CSS reduced-motion rule, so the pulse ring must be gated here.
const REDUCE_MOTION = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ═══ Memoized SVG graph render ═══
 *
 * Structure & visual flags (hover / selection / theme) go through React; per-frame
 * POSITIONS do not. Each node is a <g> drawn at the origin and translated to its
 * point; each node/link/loop registers its DOM element into `reg` so the rAF loop
 * can write coordinates imperatively via applyPositions() — React never re-renders
 * while the simulation settles. Panning/zooming only changes the parent <g>
 * transform, so React.memo skips this whole layer; a hover/selection re-renders
 * only the handful of nodes whose flags changed.
 */

const GraphNode = memo(function GraphNode({ node: n, x, y, isH, isS, isAW, dim, T, theme, reg, aria, onEnter, onLeave, onClick }) {
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

  // Register this node's <g> so applyPositions() can move it without a re-render.
  const ref = (el) => { if (el) reg.nodes.set(n.id, el); else reg.nodes.delete(n.id); };

  // Overflow meta-node: a muted dashed disc with "+N" — the verses the per-word cap
  // hid. Clicking opens the full occurrences list (handled in QuranGraph onNodeClick).
  if (n.type === "overflow") {
    return (
      <g ref={ref} data-node={n.id} transform={`translate(${x},${y})`}
        style={{ cursor: "pointer", opacity, transition: "opacity 0.25s" }}
        role="button" tabIndex={0} aria-label={aria}
        onMouseEnter={() => onEnter(n)} onMouseLeave={() => onLeave(n)} onClick={(e) => onClick(n, e)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(n, e); } }}>
        <circle cx={0} cy={0} r={r} fill={(L ? "#9a9077" : "#586a88") + "22"} stroke={L ? "#9a9077" : "#8d9bb5"} strokeWidth={1.4} strokeDasharray="3,2" />
        <text x={0} y={3} textAnchor="middle" fontSize={9} fontWeight="bold" fill={L ? "#6f6757" : "#8d9bb5"} style={{ pointerEvents: "none", fontFamily: "var(--font-mono)" }}>{n.label}</text>
      </g>
    );
  }

  return (
    <g ref={ref} data-node={n.id} transform={`translate(${x},${y})`}
      style={{ cursor: "pointer", opacity, transition: "opacity 0.25s" }}
      role={clickable ? "button" : "img"}
      tabIndex={clickable ? 0 : undefined}
      aria-label={aria}
      aria-expanded={(n.type === "word" || n.type === "verse") ? !!n.isExpanded : undefined}
      onMouseEnter={() => onEnter(n)}
      onMouseLeave={() => onLeave(n)}
      onClick={(e) => onClick(n, e)}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(n, e); } } : undefined}>

      {(isWE || isVE) && <circle cx={0} cy={0} r={r + 7} fill="none" stroke={isWE ? cVir : cPur} strokeWidth={2} opacity={0.3} strokeDasharray={isVE ? "4,2" : "none"} />}
      {(isS || isAW) && <circle cx={0} cy={0} r={r + 10} fill="none" stroke={isAW ? cGold : col} strokeWidth={2} opacity={0.3}>{!REDUCE_MOTION && <animate attributeName="r" values={`${r + 8};${r + 14};${r + 8}`} dur="2s" repeatCount="indefinite" />}</circle>}

      <circle cx={0} cy={0} r={r}
        fill={isAW ? cGold + "44" : isWE ? cVir + "33" : isVE ? cPur + "33" : col + T.nodeFill}
        stroke={isS ? sel : isAW ? cGold : isWE ? cVir : isVE ? cPur : isH ? sel : col}
        strokeWidth={n.type === "center" ? 3 : isH || isS || isAW ? 2.5 : isWE || isVE ? 2 : n.type === "word" ? 1.8 : 1}
        strokeDasharray={n.uncovered ? "3,2" : "none"} />

      {n.type === "word" && <text x={0} y={3.5} textAnchor="middle" fontSize={8} fontWeight="bold" fill={L ? "#2a2620" : "#fff"} style={{ pointerEvents: "none", fontFamily: "var(--font-mono)" }}>{n.count || ""}</text>}
      {n.type === "verse" && (n.sharedCount || 0) > 1 && <text x={0} y={3} textAnchor="middle" fontSize={7} fill={cGold} fontWeight="bold" style={{ pointerEvents: "none", fontFamily: "var(--font-mono)" }}>{n.sharedCount}</text>}

      <text x={0} y={n.type === "word" ? -r - 4 : r + 11}
        textAnchor="middle" fontSize={n.type === "center" ? 12 : n.type === "word" ? 12 : 8}
        fontWeight={n.type !== "verse" ? "bold" : "normal"} fill={isS || isAW ? sel : n.type === "verse" ? T.textDim : col}
        direction="rtl" style={{ pointerEvents: "none", fontFamily: n.type === "verse" ? "var(--font-display)" : "var(--font-quran)" }}>{n.label}</text>

      {n.type === "word" && n.rootLabel && n.rootLabel !== norm(n.label) && (
        <text x={0} y={-r - 23} textAnchor="middle" fontSize={8} fill={cVir} opacity={L ? 0.95 : 0.75} direction="rtl" style={{ pointerEvents: "none", fontFamily: "var(--font-ui)" }}>({n.rootLabel})</text>
      )}
      {n.type === "word" && !isWE && n.count > 1 && <text x={r + 3} y={3} fontSize={10} fill={T.textFaint} style={{ pointerEvents: "none" }}>+</text>}
      {isWE && <circle cx={r - 1} cy={-r + 1} r={5} fill={cVir} stroke={T.bg} strokeWidth={1.5} />}
    </g>
  );
});

function GraphLayerInner({ nodes, links, loopLinks, positions, nmap, reg, viewport, highlightSet, highlightLinks, activeWordNodeIds, hovered, selected, showLoops, T, theme, onNodeEnter, onNodeLeave, onNodeClick }) {
  const { t } = useI18n();
  const anyHighlight = !!highlightSet || activeWordNodeIds.size > 0;
  const pos = (n) => positions[n.id] || { x: n.x, y: n.y };
  // Viewport culling (large graphs only — `viewport` is null otherwise, so the
  // common case still skips this and never re-renders on pan). A point is visible
  // if it falls inside the padded world-space rect; a link shows if EITHER endpoint
  // is visible (so edges crossing the screen edge aren't clipped away).
  const inView = (p) => !viewport || (p.x >= viewport.minX && p.x <= viewport.maxX && p.y >= viewport.minY && p.y <= viewport.maxY);

  return (
    <>
      {links.map((l, i) => {
        const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
        const sp = pos(s), tp = pos(t);
        if (viewport && !inView(sp) && !inView(tp)) return null;
        const isC = s.type === "center" || t.type === "center";
        // A link is "bright" only when a selection/active-word actually highlights it.
        // With nothing highlighted, links render in their RESTING (rarity) style — so
        // the rarity encoding is visible by default, not just when something's dimmed.
        const onP = highlightLinks ? highlightLinks.has(i) : false;
        const onA = activeWordNodeIds.size > 0 && (activeWordNodeIds.has(l.source) || activeWordNodeIds.has(l.target));
        const bright = onP || onA;
        // Resting links are coloured & sized by the connecting word's rarity (l.weight).
        const rarity = l.weight != null;
        const baseStroke = rarity ? eColor(l.weight, theme) : (theme === "light" ? "#cbbfa0" : "#243150");
        const baseWidth = rarity ? eWidth(l.weight) : 0.5;
        const baseOp = rarity ? 0.5 : 0.32;
        // Resting rarity edges also carry a colour-blind-safe dash texture (solid for the
        // common bulk; high-signal tiers dashed). Bright/highlighted edges stay solid.
        const dash = !bright && rarity ? eDash(l.weight) : "";
        return <line key={`l${i}`} ref={(el) => { if (el) reg.links.set(i, { el, s: l.source, t: l.target }); else reg.links.delete(i); }}
          x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
          stroke={bright ? (onA ? (theme === "light" ? "#b4530977" : "#fcd34d77") : isC ? T.linkCenter : T.link) : baseStroke}
          strokeWidth={bright ? (isC ? 1.8 : 1) : baseWidth}
          strokeDasharray={dash || undefined}
          strokeOpacity={bright ? 0.7 : baseOp} />;
      })}
      {showLoops && loopLinks.map((l, i) => {
        const s = nmap[l.source], t = nmap[l.target]; if (!s || !t) return null;
        const sp = pos(s), tp = pos(t);
        if (viewport && !inView(sp) && !inView(tp)) return null;
        const mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2, dx = tp.x - sp.x, dy = tp.y - sp.y;
        return <path key={`lp${i}`} ref={(el) => { if (el) reg.loops.set(i, { el, s: l.source, t: l.target }); else reg.loops.delete(i); }}
          d={`M ${sp.x} ${sp.y} Q ${mx - dy * 0.3} ${my + dx * 0.3} ${tp.x} ${tp.y}`} fill="none" stroke="#ff6b6b" strokeWidth={1.2} strokeDasharray="4,3" strokeOpacity={0.4} markerEnd="url(#arrL)" />;
      })}

      {nodes.map((n) => {
        const p = pos(n);
        if (viewport && !n.fixed && !inView(p)) return null; // keep the fixed centre always
        const isAW = activeWordNodeIds.has(n.id);
        const onP = highlightSet ? highlightSet.has(n.id) : true;
        const dim = !(onP || isAW) && anyHighlight;
        return <GraphNode key={n.id} node={n} x={p.x} y={p.y} reg={reg} aria={nodeAria(n, t)}
          isH={hovered === n.id} isS={selected === n.id} isAW={isAW} dim={dim}
          T={T} theme={theme} onEnter={onNodeEnter} onLeave={onNodeLeave} onClick={onNodeClick} />;
      })}
    </>
  );
}

export const GraphLayer = memo(GraphLayerInner);
