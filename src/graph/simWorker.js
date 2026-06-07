/* ═══ Force-simulation worker ═══
 *
 * Runs the EXACT same createSimulation() engine, but off the main thread. The page
 * (simClient.js) posts commands (sync / reheat / pin / setSelected / …); this worker
 * steps the physics on its own timer while the layout has energy and streams back
 * settled-or-settling positions as a transferable Float32Array (x,y pairs in the
 * sync node order). The main thread only maps the buffer and paints — the heavy grid
 * repulsion/spring pass no longer blocks rendering or interaction on large graphs.
 *
 * A `gen` counter tags every sync; ticks carry their gen so the client can ignore
 * frames from a previous structure (a tick in flight when the graph was rebuilt).
 */
import { createSimulation } from "./simulation.js";

let sim = null;
let ids = [];
let gen = 0;
let running = false;

function loop() {
  const alive = sim.step();
  const p = sim.getPositions();
  const buf = new Float32Array(ids.length * 2);
  for (let i = 0; i < ids.length; i++) {
    const q = p[ids[i]];
    if (q) { buf[2 * i] = q.x; buf[2 * i + 1] = q.y; }
  }
  postMessage({ type: "tick", gen, buf, alive }, [buf.buffer]);
  if (alive) setTimeout(loop, 16); // ~60fps; workers have no requestAnimationFrame
  else running = false;
}

function kick() { if (!running) { running = true; loop(); } }

onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case "sync":
      if (!sim) sim = createSimulation(m.W, m.H);
      ids = m.nodes.map((n) => n.id);
      gen = m.gen;
      sim.sync(m.nodes, m.links);
      kick();
      break;
    case "place": sim?.place(m.map); kick(); break;
    case "reheat": sim?.reheat(m.a); kick(); break;
    case "setSelected": sim?.setSelected(m.id, new Set(m.gather)); kick(); break;
    case "pin": sim?.pin(m.id, m.x, m.y); kick(); break;
    case "unpin": sim?.unpin(m.id); kick(); break;
    case "stick": sim?.stick(m.id); kick(); break;
    case "clearSticky": sim?.clearSticky(); kick(); break;
    default: break;
  }
};
