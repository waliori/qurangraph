/* ═══ Imperative position writer ═══
 *
 * The force simulation ticks once per animation frame. Pushing those positions
 * through React state each frame would re-render the whole GraphLayer 60×/sec.
 * Instead the layer registers its DOM nodes/links/loops into a registry and this
 * function writes coordinates straight to the SVG — no React reconciliation on
 * the hot path. Each node is a <g> translated to its point (children drawn at the
 * origin), so a node update is a single transform write.
 *
 * registry = { nodes: Map<id, gEl>, links: Map<i, {el,s,t}>, loops: Map<i, {el,s,t}> }
 * positions = { id: {x, y} }   (from sim.getPositions())
 */
export function applyPositions(registry, positions) {
  if (!registry || !positions) return;

  for (const [id, el] of registry.nodes) {
    const p = positions[id];
    if (p && el) el.setAttribute("transform", `translate(${p.x},${p.y})`);
  }

  for (const L of registry.links.values()) {
    if (!L?.el) continue;
    const s = positions[L.s], t = positions[L.t];
    if (!s || !t) continue;
    L.el.setAttribute("x1", s.x); L.el.setAttribute("y1", s.y);
    L.el.setAttribute("x2", t.x); L.el.setAttribute("y2", t.y);
  }

  for (const L of registry.loops.values()) {
    if (!L?.el) continue;
    const s = positions[L.s], t = positions[L.t];
    if (!s || !t) continue;
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, dx = t.x - s.x, dy = t.y - s.y;
    L.el.setAttribute("d", `M ${s.x} ${s.y} Q ${mx - dy * 0.3} ${my + dx * 0.3} ${t.x} ${t.y}`);
  }
}
