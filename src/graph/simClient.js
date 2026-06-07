import { createSimulation } from "./simulation.js";

/* ═══ Simulation client ═══
 *
 * A drop-in stand-in for createSimulation() that runs the physics in a Web Worker
 * (simWorker.js) and streams positions back via `setOnTick(fn)` — `fn(positions,
 * alive)` fires each frame, where positions is { id:{x,y} } and `alive` is false on
 * the settling frame. Same command surface as the engine (sync/place/reheat/
 * setSelected/pin/unpin/stick/clearSticky) so the app code barely changes; it just
 * stops calling step()/getPositions() itself and lets the worker drive painting.
 *
 * Where Worker is unavailable (unit tests / jsdom, or an old runtime) it transparently
 * falls back to running the engine in-process on a requestAnimationFrame loop — same
 * interface, same callback — so nothing else has to branch.
 */

// In-process fallback: the real engine + a rAF stepping loop, exposing the client API.
function createLocalClient(W, H) {
  const sim = createSimulation(W, H);
  let onTick = null, running = false, raf = 0;
  const schedule = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (f) => setTimeout(f, 16);
  const cancel = typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : clearTimeout;
  const step = () => {
    const alive = sim.step();
    onTick?.(sim.getPositions(), alive);
    if (alive) raf = schedule(step); else { running = false; raf = 0; }
  };
  const kick = () => { if (!running) { running = true; raf = schedule(step); } };
  return {
    setOnTick(fn) { onTick = fn; },
    sync(nodes, links) { sim.sync(nodes, links); kick(); },
    place(map) { sim.place(map); kick(); },
    reheat(a) { sim.reheat(a); kick(); },
    setSelected(id, set) { sim.setSelected(id, set); kick(); },
    pin(id, x, y) { sim.pin(id, x, y); kick(); },
    unpin(id) { sim.unpin(id); kick(); },
    stick(id) { sim.stick(id); kick(); },
    clearSticky() { sim.clearSticky(); kick(); },
    terminate() { if (raf) cancel(raf); },
  };
}

// Worker-backed client: posts commands, maps streamed buffers back to { id:{x,y} }.
function createWorkerClient(W, H) {
  const worker = new Worker(new URL("./simWorker.js", import.meta.url), { type: "module" });
  let onTick = null, ids = [], gen = 0;
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type !== "tick" || m.gen !== gen) return; // ignore stale ticks from a prior structure
    const buf = m.buf, pos = {};
    for (let i = 0; i < ids.length; i++) pos[ids[i]] = { x: buf[2 * i], y: buf[2 * i + 1] };
    onTick?.(pos, m.alive);
  };
  const post = (msg) => worker.postMessage(msg);
  return {
    setOnTick(fn) { onTick = fn; },
    sync(nodes, links) {
      gen++;
      ids = nodes.map((n) => n.id);
      post({ type: "sync", gen, W, H,
        nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r, fixed: !!n.fixed })),
        links: links.map((l) => ({ source: l.source, target: l.target, dist: l.dist })) });
    },
    place(map) { post({ type: "place", map }); },
    reheat(a) { post({ type: "reheat", a }); },
    setSelected(id, set) { post({ type: "setSelected", id, gather: [...(set || [])] }); },
    pin(id, x, y) { post({ type: "pin", id, x, y }); },
    unpin(id) { post({ type: "unpin", id }); },
    stick(id) { post({ type: "stick", id }); },
    clearSticky() { post({ type: "clearSticky" }); },
    terminate() { worker.terminate(); },
  };
}

export function createSimClient(W = 1600, H = 1100) {
  if (typeof Worker !== "undefined") {
    try { return createWorkerClient(W, H); } catch { /* fall back to in-process */ }
  }
  return createLocalClient(W, H);
}
