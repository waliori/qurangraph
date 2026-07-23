/* ═══ /docs — the API explorer ═══
 *
 * Reads the API's own OpenAPI document and builds the whole page from it: the endpoint
 * list, a typed form per operation, the runnable examples, the curl line, and a viewer
 * for the response. Nothing about the endpoints is hard-coded here — add a route with
 * its metadata (server/params.js → the route table) and it shows up.
 *
 * No framework, no build step, no network beyond this API.
 */

(() => {
  "use strict";

  /* The API base is derived from where this page is served, NOT from the spec's
   * `servers` entry: the spec advertises the production origin, but a request typed here
   * must go to the host the visitor is actually on (localhost, a staging box, a tunnel). */
  const BASE = location.pathname.replace(/\/docs\/?$/, "") || "/api/v1";

  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    for (const k of kids.flat()) n.append(k?.nodeType ? k : document.createTextNode(String(k)));
    return n;
  };
  const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿]/;

  let spec = null;
  let ops = [];            // [{ path, op, id, tag }]
  let current = null;

  /* ── boot ───────────────────────────────────────────────────────────────── */
  init();

  async function init() {
    initTheme();
    try {
      const r = await fetch(BASE + "/openapi.json", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      spec = await r.json();
    } catch (e) {
      $("#main").replaceChildren(el("div", { className: "empty" },
        "Could not load the API description: " + e.message));
      return;
    }

    ops = Object.entries(spec.paths || {}).map(([path, item]) => ({
      path, op: item.get, id: slug(path), tag: (item.get.tags || ["other"])[0],
    })).filter((o) => o.op);

    $("#lnk-spec").href = BASE + "/openapi.json";
    $("#lnk-guide").href = BASE + "/guide";
    const app = spec.info?.contact?.url;
    if (app) $("#lnk-app").href = app; else $("#lnk-app").remove();

    buildNav();
    $("#filter").addEventListener("input", filterNav);
    window.addEventListener("hashchange", route);
    route();
  }

  function initTheme() {
    const saved = localStorage.getItem("ayat.docs.theme");
    if (saved) document.documentElement.dataset.theme = saved;
    $("#theme").addEventListener("click", () => {
      const now = document.documentElement.dataset.theme;
      const dark = now === "dark" || (now === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      const next = dark ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("ayat.docs.theme", next);
    });
  }

  /* ── navigation ─────────────────────────────────────────────────────────── */
  const TAG_ORDER = ["meta", "corpus", "lexical", "analysis", "expressions", "graph"];

  function buildNav() {
    const nav = $("#nav");
    nav.replaceChildren();
    const byTag = new Map();
    for (const o of ops) {
      if (!byTag.has(o.tag)) byTag.set(o.tag, []);
      byTag.get(o.tag).push(o);
    }
    const tags = [...byTag.keys()].sort((a, b) => {
      const ia = TAG_ORDER.indexOf(a), ib = TAG_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const tag of tags) {
      nav.append(el("h3", {}, tag));
      for (const o of byTag.get(tag)) {
        const a = el("a", { href: "#" + o.id, title: o.op.summary || "", id: "nav-" + o.id }, o.path);
        a.dataset.hay = (o.path + " " + (o.op.summary || "")).toLowerCase();
        nav.append(a);
      }
    }
    const c = spec.info?.title || "";
    $("#corpus-note").textContent = c + " · " + (spec.info?.version || "");
  }

  function filterNav() {
    const q = $("#filter").value.trim().toLowerCase();
    for (const a of $("#nav").querySelectorAll("a")) {
      a.style.display = !q || a.dataset.hay.includes(q) ? "" : "none";
    }
    for (const h of $("#nav").querySelectorAll("h3")) {
      let n = h.nextElementSibling, any = false;
      while (n && n.tagName === "A") { if (n.style.display !== "none") any = true; n = n.nextElementSibling; }
      h.style.display = any ? "" : "none";
    }
  }

  function route() {
    const id = location.hash.slice(1);
    const found = ops.find((o) => o.id === id);
    for (const a of $("#nav").querySelectorAll("a")) a.classList.toggle("on", a.getAttribute("href") === "#" + id);
    if (!found) return renderLanding();
    current = found;
    renderOperation(found);
    document.querySelector("#nav a.on")?.scrollIntoView({ block: "nearest" });
    $("#main").scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /* ── landing ────────────────────────────────────────────────────────────── */
  function renderLanding() {
    current = null;
    const info = spec.info || {};
    const wrap = el("div", { className: "land" });
    wrap.append(
      el("h1", {}, el("bdi", {}, "آيات"), ".network — API"),
      el("p", { className: "lede" }, bidiText(info.summary || "")),
    );

    const cards = el("div", { className: "cards" });
    cards.append(
      card(String(ops.length), "endpoints"),
      card("6,236", "āyāt"),
      card("114", "sūrahs"),
      card("6", "classical lexicons"),
    );
    wrap.append(cards);

    wrap.append(el("div", { className: "note" },
      el("b", {}, "Every answer is also a link. "),
      "Each object comes back with a ", el("code", {}, "links"), " block whose ",
      el("code", {}, "ui…"), " entries open the app showing exactly what the response describes — "
      + "the occurrences sheet for a word, the distribution chart for a root, the graph itself. "
      + "Run any request below and they appear as buttons above the JSON.",
    ));

    // Paragraph 0 is the one-line intro and paragraph 1 is the links story, which the
    // callout above already makes; start from what they don't cover.
    for (const para of (info.description || "").split("\n\n").slice(2)) {
      wrap.append(el("p", {}, mdInline(para)));
    }

    wrap.append(el("h2", { className: "sec" }, "Base URL"));
    wrap.append(el("pre", {}, location.origin + BASE));

    wrap.append(el("h2", { className: "sec" }, "Start here"));
    const quick = el("div", { className: "examples" });
    for (const p of ["/search", "/roots/{key}", "/verses/{key}", "/analysis/collocations", "/graph"]) {
      const o = ops.find((x) => x.path === p);
      if (o) quick.append(el("button", { className: "ex", onclick: () => { location.hash = o.id; } }, p));
    }
    wrap.append(quick);

    $("#main").replaceChildren(wrap);
  }

  const card = (big, small) => el("div", { className: "card" }, el("b", {}, big), el("span", {}, small));

  /* ── one endpoint ───────────────────────────────────────────────────────── */
  function renderOperation(entry) {
    const { path, op } = entry;
    const main = $("#main");
    main.replaceChildren();

    const head = el("div", { className: "ep-head" });
    head.append(
      el("div", { className: "ep-path" }, el("span", { className: "verb" }, "GET"), el("h1", {}, path)),
      el("p", { className: "ep-sum" }, bidiText(op.summary || "")),
    );
    if (op.description) head.append(el("p", { className: "ep-desc" }, mdInline(op.description)));
    main.append(head);

    // Parameters. Each row hands back a setter so an example can fill the form IN PLACE —
    // re-rendering instead would detach the very response pane the run is about to write to.
    const params = op.parameters || [];
    const state = new Map();
    const setters = new Map();
    if (params.length) {
      main.append(el("h2", { className: "sec" }, "Parameters"));
      const form = el("div", { className: "params" });
      for (const p of params) {
        const { node, setValue } = paramRow(p, state, () => syncUrl());
        setters.set(p.name, setValue);
        form.append(node);
      }
      main.append(form);
    }

    // Examples — one click fills the form and runs it.
    const examples = op["x-examples"] || [];
    if (examples.length) {
      main.append(el("h2", { className: "sec" }, "Examples"));
      const box = el("div", { className: "examples" });
      for (const ex of examples) {
        box.append(el("button", {
          className: "ex", type: "button",
          onclick: () => { applyExample(ex.url, params, setters); syncUrl(); run(); },
        }, bidiText(ex.label)));
      }
      main.append(box);
    }

    // Run
    const runBtn = el("button", { className: "run", type: "button" }, "▶  Run");
    const copyBtn = el("button", { className: "ghost", type: "button" }, "Copy curl");
    const openBtn = el("a", { className: "ghost", target: "_blank", rel: "noopener" }, "Open raw ↗");
    const bar = el("div", { className: "runbar" }, runBtn, copyBtn, openBtn);
    const urlbar = el("div", { className: "urlbar" });
    const resp = el("div", { className: "resp" });
    main.append(bar, urlbar, resp);

    runBtn.addEventListener("click", run);
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard?.writeText(curlFor(buildUrl()));
      copyBtn.textContent = "Copied ✓";
      setTimeout(() => { copyBtn.textContent = "Copy curl"; }, 1400);
    });

    syncUrl();

    function buildUrl() {
      let p = path;
      const qs = new URLSearchParams();
      for (const par of params) {
        const v = state.get(par.name);
        if (v === undefined || v === "" || v === null) continue;
        if (par.in === "path") { p = p.replace(`{${par.name}}`, encodeURIComponent(v)); continue; }
        // Leave defaults out: the URL in the bar is the one people copy, and a request
        // spelling out every default reads as though each were a deliberate choice.
        const def = par.schema?.default;
        if (def !== undefined && String(def) === v) continue;
        qs.set(par.name, v);
      }
      // A path parameter left blank still has to become something; fall back to its example
      // so the URL stays valid and the Run button always does something sensible.
      for (const par of params.filter((x) => x.in === "path")) {
        if (p.includes(`{${par.name}}`)) p = p.replace(`{${par.name}}`, encodeURIComponent(par.example ?? ""));
      }
      const q = qs.toString();
      return BASE + p + (q ? "?" + q : "");
    }

    function syncUrl() {
      const u = buildUrl();
      urlbar.replaceChildren(el("span", {}, "GET "), el("b", {}, location.origin + u));
      openBtn.href = u;
    }

    async function run() {
      const url = buildUrl();
      runBtn.disabled = true;
      resp.replaceChildren(el("div", { className: "hint" }, "Running…"));
      const t0 = performance.now();
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        const text = await r.text();
        const ms = Math.round(performance.now() - t0);
        renderResponse(resp, r, text, ms, url);
      } catch (e) {
        resp.replaceChildren(el("div", { className: "hint" }, "Request failed: " + e.message));
      } finally {
        runBtn.disabled = false;
      }
    }
  }

  /* One parameter → a labelled control, plus a setter that drives it from outside
   * (used by the example buttons) without rebuilding the DOM. */
  function paramRow(p, state, onChange) {
    const initial = p.schema?.default ?? (p.required ? p.example : undefined);
    if (initial !== undefined) state.set(p.name, String(initial));

    const label = el("label", {},
      el("span", { className: "pname" }, p.name, p.required ? el("span", { className: "req" }, "*") : ""),
      el("span", { className: "pin" }, p.in),
    );

    const ctl = el("div", { className: "pctl" });
    const type = p.schema?.type;
    let setValue;

    const segmented = (values, allowNone) => {
      const seg = el("div", { className: "seg" });
      const opts = allowNone ? ["—", ...values] : values;
      const buttons = new Map();
      for (const v of opts) {
        const val = v === "—" ? "" : v;
        const b = el("button", { type: "button" }, v);
        buttons.set(val, b);
        b.addEventListener("click", () => { select(val); onChange(); });
        seg.append(b);
      }
      const select = (val) => {
        state.set(p.name, val);
        for (const [k, b] of buttons) b.classList.toggle("on", k === val);
      };
      select(String(state.get(p.name) ?? ""));
      ctl.append(seg);
      return select;
    };

    if (p.schema?.enum) {
      setValue = segmented(p.schema.enum, !p.required);
    } else if (type === "boolean") {
      setValue = segmented(["true", "false"], false);
    } else {
      const input = el("input", {
        type: type === "integer" ? "number" : "text",
        value: state.get(p.name) ?? "",
        placeholder: p.example !== undefined ? String(p.example) : "",
      });
      if (p["x-rtl"]) input.classList.add("rtl");
      if (p.schema?.minimum !== undefined) input.min = p.schema.minimum;
      if (p.schema?.maximum !== undefined) input.max = p.schema.maximum;
      input.dataset.param = p.name;
      input.addEventListener("input", () => { state.set(p.name, input.value); onChange(); });
      setValue = (v) => { input.value = v; state.set(p.name, v); };
      ctl.append(input);
    }

    if (p.description) ctl.append(el("div", { className: "phelp" }, mdInline(p.description)));
    return { node: el("div", { className: "row" }, label, ctl), setValue };
  }

  /* Fill the live form from an example URL — in place, so the response pane below it
   * survives and the run that follows has somewhere to write. */
  function applyExample(url, params, setters) {
    const u = new URL(url, location.origin);
    // Path parameters: line the example's segments up with the pattern's.
    const patSegs = current.path.split("/").filter(Boolean);
    const exSegs = decodeURI(u.pathname).split("/").filter(Boolean).slice(-patSegs.length);
    patSegs.forEach((seg, i) => {
      const m = /^\{(.+)\}$/.exec(seg);
      if (m && exSegs[i] !== undefined) setters.get(m[1])?.(exSegs[i]);
    });
    // Query parameters the example omits fall back to their default, so clicking a second
    // example never leaves a stray value behind from the first.
    for (const p of params.filter((x) => x.in === "query")) {
      const v = u.searchParams.has(p.name)
        ? u.searchParams.get(p.name)
        : String(p.schema?.default ?? "");
      setters.get(p.name)?.(v);
    }
  }

  /* ── response ───────────────────────────────────────────────────────────── */
  function renderResponse(host, r, text, ms, url) {
    const cls = r.status < 300 ? "s2" : r.status < 500 ? "s4" : "s5";
    const bits = [`${ms} ms`, fmtBytes(text.length)];
    const rl = r.headers.get("X-RateLimit-Remaining");
    if (rl) bits.push(`${rl} requests left this hour`);

    const head = el("div", { className: "resp-head" },
      el("span", { className: "status " + cls }, String(r.status) + " " + r.statusText),
      el("span", { className: "meta-bits" }, bits.join(" · ")),
    );

    let data = null;
    try { data = JSON.parse(text); } catch { /* csv or html */ }

    host.replaceChildren(el("h2", { className: "sec" }, "Response"), head);

    if (data) {
      const chips = uiChips(data);
      if (chips) host.append(chips);
    }

    const pre = el("pre", { className: "json" });
    if (!data) {
      pre.textContent = text.slice(0, 200_000);
    } else if (text.length > 600_000) {
      pre.textContent = text.slice(0, 200_000) + "\n\n… truncated for display — ";
      pre.append(el("a", { href: url, target: "_blank", rel: "noopener" }, "open the full response ↗"));
    } else {
      pre.append(renderJson(data));
    }
    host.append(pre);
  }

  /* Every `ui…` URL anywhere in the payload, as one-click buttons. This is the feature:
   * an API answer that you can hand to a reader as a page. */
  function uiChips(data) {
    const found = new Map();
    (function walk(v, depth) {
      if (!v || typeof v !== "object" || depth > 4) return;
      if (Array.isArray(v)) { v.slice(0, 3).forEach((x) => walk(x, depth + 1)); return; }
      for (const [k, val] of Object.entries(v)) {
        if (k === "links" && val && typeof val === "object") {
          for (const [lk, lv] of Object.entries(val)) {
            if (lk.startsWith("ui") && typeof lv === "string" && !found.has(lk)) found.set(lk, lv);
          }
        } else walk(val, depth + 1);
      }
    })(data, 0);
    if (!found.size) return null;
    const box = el("div", { className: "uichips" });
    for (const [k, href] of found) {
      box.append(el("a", { className: "uichip", href, target: "_blank", rel: "noopener" },
        el("b", {}, k.replace(/^ui_?/, "") || "open"), "↗"));
    }
    return box;
  }

  /* A foldable node: a clickable label plus a body that is genuinely removed from layout
   * when closed.
   *
   * Deliberately NOT <details>. Inside a <pre> the content box has to be inline or it
   * injects a line break before and after every nested object (stray blank lines,
   * orphaned commas) — but `content-visibility`, which is how the UA actually hides a
   * closed <details>, has no effect on an inline box. So <details> can be laid out
   * correctly or it can collapse, never both. `display:none` does both.
   *
   * The body is built on first open, so a 500-row response costs nothing until asked for. */
  function foldable(label, buildBody, open) {
    const frag = document.createDocumentFragment();
    const tog = el("span", { className: "j-tog", role: "button", tabIndex: 0 });
    const body = el("span", { className: "j-body" });
    let built = false;
    const set = (o) => {
      if (o && !built) { built = true; body.append(buildBody()); }
      tog.textContent = (o ? "▾ " : "▸ ") + label;
      tog.setAttribute("aria-expanded", String(o));
      body.style.display = o ? "inline" : "none";
    };
    tog.addEventListener("click", () => set(body.style.display === "none"));
    tog.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog.click(); }
    });
    set(open);
    frag.append(tog, body);
    return frag;
  }

  /* Pretty JSON: syntax-coloured, Arabic strings set right-to-left in their own script,
   * URLs clickable, and deep or long nodes folded so a big response stays navigable. */
  function renderJson(v, depth = 0, key = null) {
    const frag = document.createDocumentFragment();
    const pad = (n) => "  ".repeat(n);

    if (v === null) return el("span", { className: "j-null" }, "null");
    if (typeof v === "boolean") return el("span", { className: "j-bool" }, String(v));
    if (typeof v === "number") return el("span", { className: "j-num" }, String(v));
    if (typeof v === "string") {
      if (/^https?:\/\//.test(v)) {
        return el("a", { className: "j-str j-link", href: v, target: "_blank", rel: "noopener" }, JSON.stringify(v));
      }
      const s = el("span", { className: "j-str" + (ARABIC.test(v) ? " j-ar" : "") }, JSON.stringify(v));
      return s;
    }

    if (Array.isArray(v)) {
      if (!v.length) return el("span", {}, "[]");
      const CAP = depth === 0 ? 200 : 25;
      const shown = v.slice(0, CAP);
      frag.append(foldable(`[ ${v.length} item${v.length === 1 ? "" : "s"} ]`, () => {
        const body = document.createDocumentFragment();
        body.append("\n");
        shown.forEach((x, i) => {
          body.append(pad(depth + 1));
          body.append(renderJson(x, depth + 1));
          body.append(i < shown.length - 1 ? ",\n" : "\n");
        });
        if (v.length > CAP) body.append(pad(depth + 1), el("span", { className: "j-more" }, `… ${v.length - CAP} more`), "\n");
        body.append(pad(depth), "]");
        return body;
      }, depth < 2));
      return frag;
    }

    const keys = Object.keys(v);
    if (!keys.length) return el("span", {}, "{}");
    // A `links` block is long, repetitive and already surfaced as buttons above the JSON,
    // so it starts folded however shallow it sits.
    frag.append(foldable(`{ ${keys.length} field${keys.length === 1 ? "" : "s"} }`, () => {
      const body = document.createDocumentFragment();
      body.append("\n");
      keys.forEach((k, i) => {
        body.append(pad(depth + 1));
        body.append(el("span", { className: "j-key" }, JSON.stringify(k)));
        body.append(": ");
        body.append(renderJson(v[k], depth + 1, k));
        body.append(i < keys.length - 1 ? ",\n" : "\n");
      });
      body.append(pad(depth), "}");
      return body;
    }, key !== "links" && depth < 3));
    return frag;
  }

  /* ── helpers ────────────────────────────────────────────────────────────── */
  function curlFor(u) {
    return `curl "${location.origin}${u}"`;
  }

  const fmtBytes = (n) =>
    n < 1024 ? n + " B" : n < 1024 * 1024 ? (n / 1024).toFixed(1) + " kB" : (n / 1048576).toFixed(1) + " MB";

  const slug = (p) => p.replace(/[{}]/g, "").replace(/^\//, "").replace(/\//g, "-") || "index";

  /* ── mixed-direction text ──
   *
   * Every label here is English prose with Arabic inside it, and the Unicode bidi
   * algorithm gives the neutral characters around an Arabic run that run's direction:
   * "The root ك-ت-ب — 279 āyāt" comes out as "The root 279 — ك-ت-ب āyāt", with the dash
   * and the number flung to the wrong side. Wrapping each Arabic run in <bdi> isolates
   * it, so the surrounding English keeps its own direction. */
  const AR = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
  const AR_RUN = new RegExp(`[${AR}](?:[${AR}\\s·.\\-]*[${AR}])?`, "gu");

  function bidiText(text) {
    const frag = document.createDocumentFragment();
    let last = 0, m;
    AR_RUN.lastIndex = 0;
    while ((m = AR_RUN.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      frag.append(el("bdi", {}, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }

  /* Just enough markdown for `code` spans and [links](…) in the descriptions, with the
   * plain-text runs bidi-isolated. */
  function mdInline(text) {
    const frag = document.createDocumentFragment();
    const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(bidiText(text.slice(last, m.index)));
      if (m[1] !== undefined) frag.append(el("code", { dir: "auto" }, m[1]));
      else if (m[2] !== undefined) frag.append(el("strong", {}, bidiText(m[2])));
      else frag.append(el("a", { href: m[4], target: "_blank", rel: "noopener" }, m[3]));
      last = re.lastIndex;
    }
    if (last < text.length) frag.append(bidiText(text.slice(last)));
    return frag;
  }
})();
