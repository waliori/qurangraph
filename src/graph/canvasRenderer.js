import { norm } from "../arabic-utils.js";
import { fColor, dColor, eColor, eWidth, eDashArr } from "../theme.js";

/* ═══ Canvas graph renderer ═══
 *
 * Draws the SAME scene GraphLayer draws (nodes/links/loops, with the same colour,
 * size, highlight and dim rules), but onto a single <canvas> instead of thousands of
 * SVG elements — so a very large graph stays smooth (no per-node DOM, no per-frame
 * attribute writes). One pure function: given a 2D context + a scene description it
 * paints a frame. Hit-testing lives in spatialIndex.js; this only draws. SMIL pulse
 * rings aren't reproduced (selection is shown by a static ring) — acceptable, and
 * matches prefers-reduced-motion.
 *
 * scene = { nodes, links, loopLinks, nmap, positions, transform:{x,y,k}, dims:{w,h},
 *           dpr, T, theme, showLoops, hovered, selected, activeWordNodeIds:Set,
 *           highlightSet:Set|null, highlightLinks:Set|null, viewport|null }
 */

const QURAN_FONT = '"Amiri", "Scheherazade New", "Noto Naskh Arabic", serif';
const UI_FONT = 'system-ui, "Segoe UI", sans-serif';
const MONO_FONT = '"DejaVu Sans Mono", ui-monospace, monospace';

// Level-of-detail: text smaller than this many DEVICE-independent screen pixels is
// unreadable clutter and just costs fill time, so it's skipped. A label drawn at world
// font-size `s` appears at `s·k` screen px (k = zoom), so we gate each text on `s·k`.
// Zoomed out, labels drop away and only the node discs remain; zoomed in they return.
const MIN_LABEL_PX = 5.5;

const posOf = (n, positions) => positions[n.id] || { x: n.x, y: n.y };

export function drawScene(ctx, scene) {
  const { nodes, links, loopLinks, nmap, positions, transform, dims, dpr = 1,
    T, theme, showLoops, hovered, selected, activeWordNodeIds, highlightSet, highlightLinks, viewport } = scene;
  const { x: tx, y: ty, k } = transform;
  const L = theme === "light";
  const anyHighlight = !!highlightSet || (activeWordNodeIds && activeWordNodeIds.size > 0);
  const inView = (p) => !viewport || (p.x >= viewport.minX && p.x <= viewport.maxX && p.y >= viewport.minY && p.y <= viewport.maxY);

  // Clear in device pixels, then map world → device: x_dev = (x_world*k + t) * dpr.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, dims.w * dpr, dims.h * dpr);
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, dims.w * dpr, dims.h * dpr);
  ctx.setTransform(k * dpr, 0, 0, k * dpr, tx * dpr, ty * dpr);
  ctx.lineCap = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // ── Links ──
  links.forEach((l, i) => {
    const s = nmap[l.source], t = nmap[l.target];
    if (!s || !t) return;
    const sp = posOf(s, positions), tp = posOf(t, positions);
    if (viewport && !inView(sp) && !inView(tp)) return;
    const isC = s.type === "center" || t.type === "center";
    const onP = highlightLinks ? highlightLinks.has(i) : false;
    const onA = activeWordNodeIds.size > 0 && (activeWordNodeIds.has(l.source) || activeWordNodeIds.has(l.target));
    const bright = onP || onA;
    const rarity = l.weight != null;
    const baseStroke = rarity ? eColor(l.weight, theme) : (L ? "#cbbfa0" : "#243150");
    const baseWidth = rarity ? eWidth(l.weight) : 0.5;
    const baseOp = rarity ? 0.5 : 0.32;
    ctx.globalAlpha = bright ? 0.7 : baseOp;
    ctx.strokeStyle = bright ? (onA ? (L ? "#b45309" : "#fcd34d") : isC ? T.linkCenter : T.link) : baseStroke;
    ctx.lineWidth = bright ? (isC ? 1.8 : 1) : baseWidth;
    // Colour-blind-safe rarity texture, mirroring the SVG renderer (solid bulk; rare
    // tiers dashed). Bright edges stay solid. Dash units are world-space (scale with k).
    ctx.setLineDash(!bright && rarity ? eDashArr(l.weight) : []);
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // ── Loop links (shared-verse back-edges) ──
  if (showLoops) {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#ff6b6b";
    ctx.fillStyle = "#ff6b6b";
    loopLinks.forEach((l) => {
      const s = nmap[l.source], t = nmap[l.target];
      if (!s || !t) return;
      const sp = posOf(s, positions), tp = posOf(t, positions);
      if (viewport && !inView(sp) && !inView(tp)) return;
      const mx = (sp.x + tp.x) / 2, my = (sp.y + tp.y) / 2, dx = tp.x - sp.x, dy = tp.y - sp.y;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.quadraticCurveTo(mx - dy * 0.3, my + dx * 0.3, tp.x, tp.y);
      ctx.stroke();
      // Small arrowhead at the target end.
      const ang = Math.atan2(tp.y - (my + dx * 0.3), tp.x - (mx - dy * 0.3));
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y);
      ctx.lineTo(tp.x - 6 * Math.cos(ang - 0.4), tp.y - 6 * Math.sin(ang - 0.4));
      ctx.lineTo(tp.x - 6 * Math.cos(ang + 0.4), tp.y - 6 * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([4, 3]);
    });
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;

  // ── Nodes ──
  const cGold = L ? "#b45309" : "#fcd34d";
  const cVir = L ? "#0f766e" : "#34d8a8";
  const cPur = L ? "#6d28d9" : "#a78bfa";
  const sel = L ? "#2a2620" : "#fff";

  for (const n of nodes) {
    const p = posOf(n, positions);
    if (viewport && !n.fixed && !inView(p)) continue;
    const isAW = activeWordNodeIds.has(n.id);
    const onP = highlightSet ? highlightSet.has(n.id) : true;
    const dim = !(onP || isAW) && anyHighlight;

    // Overflow meta-node: muted dashed disc + "+N" (the verses the per-word cap hid).
    if (n.type === "overflow") {
      ctx.save();
      ctx.globalAlpha = dim ? 0.42 : 1;
      ctx.translate(p.x, p.y);
      ctx.beginPath(); ctx.arc(0, 0, n.r, 0, Math.PI * 2);
      ctx.fillStyle = (L ? "#9a9077" : "#586a88") + "22";
      ctx.fill();
      ctx.strokeStyle = L ? "#9a9077" : "#8d9bb5";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
      if (9 * k >= MIN_LABEL_PX) {
        ctx.fillStyle = L ? "#6f6757" : "#8d9bb5";
        ctx.font = `bold 9px ${MONO_FONT}`;
        ctx.fillText(n.label, 0, 3);
      }
      ctx.restore();
      continue;
    }

    const isH = hovered === n.id, isS = selected === n.id;
    const isWE = n.type === "word" && n.isExpanded;
    const isVE = n.type === "verse" && n.isExpanded;
    const r = isH ? n.r * 1.35 : isS || isAW ? n.r * 1.2 : n.r;
    const col = n.type === "word" ? fColor(n.count, theme) : n.type === "verse" ? dColor(n.depth, theme) : (L ? "#a16207" : n.color);

    ctx.save();
    ctx.globalAlpha = dim ? 0.42 : 1;
    ctx.translate(p.x, p.y);

    if (isWE || isVE) {
      ctx.globalAlpha = (dim ? 0.42 : 1) * 0.3;
      ctx.strokeStyle = isWE ? cVir : cPur;
      ctx.lineWidth = 2;
      ctx.setLineDash(isVE ? [4, 2] : []);
      ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = dim ? 0.42 : 1;
    }
    if (isS || isAW) {
      ctx.globalAlpha = (dim ? 0.42 : 1) * 0.3;
      ctx.strokeStyle = isAW ? cGold : col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = dim ? 0.42 : 1;
    }

    // Main disc.
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = isAW ? cGold + "44" : isWE ? cVir + "33" : isVE ? cPur + "33" : col + (T.nodeFill || "22");
    ctx.fill();
    ctx.strokeStyle = isS ? sel : isAW ? cGold : isWE ? cVir : isVE ? cPur : isH ? sel : col;
    ctx.lineWidth = n.type === "center" ? 3 : isH || isS || isAW ? 2.5 : isWE || isVE ? 2 : n.type === "word" ? 1.8 : 1;
    ctx.setLineDash(n.uncovered ? [3, 2] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    // Inner count (gated by LOD — 8/7px world text vanishes when zoomed out).
    if (8 * k >= MIN_LABEL_PX) {
      if (n.type === "word") {
        ctx.fillStyle = L ? "#2a2620" : "#fff";
        ctx.font = `bold 8px ${MONO_FONT}`;
        ctx.fillText(String(n.count || ""), 0, 3.5);
      } else if (n.type === "verse" && (n.sharedCount || 0) > 1) {
        ctx.fillStyle = cGold;
        ctx.font = `bold 7px ${MONO_FONT}`;
        ctx.fillText(String(n.sharedCount), 0, 3);
      }
    }

    // Label (LOD: skip when it would render below MIN_LABEL_PX on screen).
    const lsize = n.type === "center" ? 12 : n.type === "word" ? 12 : 8;
    if (lsize * k >= MIN_LABEL_PX) {
      const labelFill = isS || isAW ? sel : n.type === "verse" ? T.textDim : col;
      ctx.fillStyle = labelFill;
      const lweight = n.type !== "verse" ? "bold " : "";
      ctx.font = `${lweight}${lsize}px ${n.type === "verse" ? UI_FONT : QURAN_FONT}`;
      ctx.direction = "rtl";
      ctx.fillText(n.label, 0, n.type === "word" ? -r - 4 : r + 11);
      ctx.direction = "inherit";
    }

    // Root sub-label (LOD-gated, 8px world).
    if (n.type === "word" && n.rootLabel && n.rootLabel !== norm(n.label) && 8 * k >= MIN_LABEL_PX) {
      ctx.globalAlpha = (dim ? 0.42 : 1) * (L ? 0.95 : 0.75);
      ctx.fillStyle = cVir;
      ctx.font = `8px ${UI_FONT}`;
      ctx.direction = "rtl";
      ctx.fillText(`(${n.rootLabel})`, 0, -r - 23);
      ctx.direction = "inherit";
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
