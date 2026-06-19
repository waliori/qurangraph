import { memo, useCallback, useEffect, useRef, useState } from "react";
import { drawScene } from "../graph/canvasRenderer.js";
import { nodeAria } from "./nodeAria.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Canvas graph view ═══
 *
 * The high-scale alternative to the SVG GraphLayer: one <canvas> instead of N DOM
 * nodes. It is a pure renderer — pan / zoom / drag / hit-testing all stay in the
 * stage's unified pointer handlers (the canvas is pointer-transparent), which call
 * back through the SAME onNode* handlers the SVG path uses. The parent drives
 * repaints imperatively via `apiRef.current.draw()` (once per simulation frame, so
 * the canvas animates without React re-rendering); we also repaint after every React
 * commit (hover / selection / transform / structure change).
 *
 * Accessibility: a canvas has no per-node DOM, so we render a visually-hidden list of
 * focusable buttons mirroring the nodes (translated labels, shared with the SVG path),
 * giving keyboard + screen-reader users the same reach — BUT only up to MIRROR_CAP.
 * Canvas mode exists precisely for huge graphs, where thousands of focusable buttons
 * would both reintroduce the per-node DOM the canvas avoids AND be unusable (thousands
 * of Tab stops). Past the cap we add a FILTER box: typing narrows the live node set to
 * the matches (rendered capped, so the DOM stays small and the Tab stops few), which
 * gives keyboard / SR users reach to ANY node by name instead of a dead-end message.
 */

const MIRROR_CAP = 400;
// Match a node against the filter query on its visible label, lookup key, or root.
const nodeMatches = (n, q) =>
  (n.label || "").includes(q) || (n.lookup || "").includes(q) ||
  (n.wordNorm || "").includes(q) || (n.rootLabel || "").includes(q);

function GraphCanvasInner({ nodes, links, loopLinks, nmap, positionsRef, transform, dims, T, theme,
  showLoops, hovered, selected, activeWordNodeIds, highlightSet, highlightLinks, viewport,
  apiRef, onNodeClick, onNodeEnter, onNodeLeave }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const dprRef = useRef(1);
  const [nodeFilter, setNodeFilter] = useState(""); // a11y mirror filter (only used past MIRROR_CAP)
  // Latest props, read by the imperative draw() so the parent can repaint at any time
  // (written in an effect, never during render — per the rules of refs).
  const propsRef = useRef(null);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const p = propsRef.current;
    if (!cv || !p) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    drawScene(ctx, { ...p, positions: (p.positionsRef && p.positionsRef.current) || {}, dpr: dprRef.current });
  }, []);

  // Size the backing store to the device pixel ratio (crisp on HiDPI), CSS size to dims.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    dprRef.current = dpr;
    cv.width = Math.max(1, Math.round(dims.w * dpr));
    cv.height = Math.max(1, Math.round(dims.h * dpr));
    cv.style.width = dims.w + "px";
    cv.style.height = dims.h + "px";
    draw();
  }, [dims.w, dims.h, draw]);

  // Expose the imperative paint to the parent (sim loop + post-commit calls).
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = { draw };
    return () => { if (apiRef.current?.draw === draw) apiRef.current = null; };
  }, [apiRef, draw]);

  // Refresh the props snapshot then repaint after every commit (hover / selection /
  // transform / structure / theme change). The explicit dep list documents exactly
  // what a repaint depends on (positionsRef is a stable ref — its .current is read live
  // by draw(), and sim ticks repaint through apiRef, so it isn't a dep here).
  useEffect(() => {
    propsRef.current = { nodes, links, loopLinks, nmap, positionsRef, transform, dims, T, theme, showLoops, hovered, selected, activeWordNodeIds, highlightSet, highlightLinks, viewport };
    draw();
  }, [nodes, links, loopLinks, nmap, positionsRef, transform, dims, T, theme, showLoops, hovered, selected, activeWordNodeIds, highlightSet, highlightLinks, viewport, draw]);

  return (
    <>
      <canvas ref={canvasRef} className="ag-canvas" aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      {/* Visually-hidden, focusable mirror of the nodes for keyboard / screen readers.
          Small graphs list every node; large ones add a filter box so any node is still
          reachable by name without thousands of Tab stops. */}
      <div className="ag-sr-only" data-panel="1" role="group" aria-label={t("common.aria.graphGroup", { n: nodes.length })}>
        {(() => {
          const overCap = nodes.length > MIRROR_CAP;
          const q = nodeFilter.trim();
          const pool = overCap && q ? nodes.filter((n) => nodeMatches(n, q)) : nodes;
          const shown = overCap ? pool.slice(0, MIRROR_CAP) : pool;
          return (
            <>
              {overCap && (
                <input type="search" value={nodeFilter} aria-label={t("common.aria.graphFilter")}
                  placeholder={t("common.aria.graphFilterPh")} onChange={(e) => setNodeFilter(e.target.value)} />
              )}
              {shown.map((n) => (
                <button key={n.id} type="button" aria-label={nodeAria(n, t)}
                  aria-expanded={(n.type === "word" || n.type === "verse") ? !!n.isExpanded : undefined}
                  onFocus={() => onNodeEnter(n)} onBlur={() => onNodeLeave(n)}
                  onClick={(e) => onNodeClick(n, e)}>{n.label}</button>
              ))}
              {overCap && (
                <p aria-live="polite">
                  {q && pool.length === 0
                    ? t("common.aria.graphNoMatch", { q })
                    : t("common.aria.graphFiltered", { shown: shown.length, n: nodes.length })}
                </p>
              )}
            </>
          );
        })()}
      </div>
    </>
  );
}

export const GraphCanvas = memo(GraphCanvasInner);
