import { memo, useCallback, useEffect, useRef } from "react";
import { drawScene } from "../graph/canvasRenderer.js";

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
 * focusable buttons mirroring the nodes (same labels as the SVG path), giving
 * keyboard + screen-reader users the same reach.
 */

function nodeAria(n) {
  if (n.type === "center") return `الآية المركزية: ${n.label}`;
  if (n.type === "word") {
    const parts = [`كلمة ${n.label}`, `وردت في ${n.count} آية`];
    if (n.rootLabel) parts.push(`جذر ${n.rootLabel}`);
    parts.push(n.isExpanded ? "موسَّعة، اضغط للطي" : "اضغط للتوسيع");
    return parts.join("، ");
  }
  if (n.type === "verse") {
    const parts = [`آية ${n.label}`];
    if (n.connectingWord) parts.push(`متّصلة عبر «${n.connectingWord}»`);
    if (n.sharedCount > 1) parts.push(`تشارك ${n.sharedCount} كلمة`);
    parts.push(n.isExpanded ? "موسَّعة" : "اضغط للتحديد");
    return parts.join("، ");
  }
  return n.label;
}

function GraphCanvasInner({ nodes, links, loopLinks, nmap, positionsRef, transform, dims, T, theme,
  showLoops, hovered, selected, activeWordNodeIds, highlightSet, highlightLinks, viewport,
  apiRef, onNodeClick, onNodeEnter, onNodeLeave }) {
  const canvasRef = useRef(null);
  const dprRef = useRef(1);
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
  // transform / structure / theme change).
  useEffect(() => {
    propsRef.current = { nodes, links, loopLinks, nmap, positionsRef, transform, dims, T, theme, showLoops, hovered, selected, activeWordNodeIds, highlightSet, highlightLinks, viewport };
    draw();
  });

  return (
    <>
      <canvas ref={canvasRef} className="ag-canvas" aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      {/* Visually-hidden, focusable mirror of the nodes for keyboard / screen readers. */}
      <div className="ag-sr-only" data-panel="1" role="group"
        aria-label={`شبكة الآية: ${nodes.length} عقدة. تنقّل بين العقد بمفتاح Tab.`}>
        {nodes.map((n) => (
          <button key={n.id} type="button" aria-label={nodeAria(n)}
            aria-expanded={(n.type === "word" || n.type === "verse") ? !!n.isExpanded : undefined}
            onFocus={() => onNodeEnter(n)} onBlur={() => onNodeLeave(n)}
            onClick={(e) => onNodeClick(n, e)}>{n.label}</button>
        ))}
      </div>
    </>
  );
}

export const GraphCanvas = memo(GraphCanvasInner);
