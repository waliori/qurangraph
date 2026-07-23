/* ═══ /docs — the human-readable page ═══
 *
 * Self-contained HTML (no CDN, no build step) in the app's own palette, generated from
 * the live router so the endpoint list is never stale.
 */

import { config, keysEnforced } from "./config.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const GROUPS = [
  ["Getting started", /^\/(health|sources|coverage)?$/],
  ["Corpus", /^\/(surahs|verses)/],
  ["Words, lemmas & roots", /^\/(search|words|lemmas|roots|occurrences|lexicons)/],
  ["Analysis", /^\/analysis/],
  ["Expressions", /^\/expressions/],
  ["Graph", /^\/graph/],
];

const EXAMPLES = [
  ["Every āya containing the root كتب", "/search?q=كتب&mode=root"],
  ["…as CSV", "/search?q=كتب&mode=root&format=csv"],
  ["The exact form ٱلصَّلَوٰة (typed the conventional way)", "/words/الصلاة"],
  ["Latin input works too", "/search?q=rahman"],
  ["Āyat al-Kursī, word by word", "/verses/2:255"],
  ["Everything about one root", "/roots/علم"],
  ["Ibn Fāris on that root", "/lexicons/maqayis/علم"],
  ["Where a root falls across the sūrahs", "/analysis/distribution?q=علم&mode=root"],
  ["What co-occurs with it", "/analysis/collocations?q=علم&mode=root&sort=ll"],
  ["Two terms compared", "/analysis/compare?a=علم&b=جهل&mode=root"],
  ["The graph itself", "/graph?verse=2:255&mode=root"],
];

export function docsHtml(router, ctx) {
  const base = ctx.base;
  const rows = router.routes.filter((r) => !["/docs", "/guide", "/openapi.json"].includes(r.pattern));
  const grouped = GROUPS.map(([title, re]) => [title, rows.filter((r) => re.test(r.pattern))]).filter(([, rs]) => rs.length);
  const seen = new Set(grouped.flatMap(([, rs]) => rs.map((r) => r.pattern)));
  const rest = rows.filter((r) => !seen.has(r.pattern));
  if (rest.length) grouped.push(["Other", rest]);

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>آيات.network — API</title>
<style>
  :root{--bg:#e3d9bf;--fg:#3a3322;--mut:#6b6046;--gold:#7a5a00;--card:#efe8d6;--line:#cfc3a4;--code:#f7f2e4}
  @media (prefers-color-scheme:dark){:root{--bg:#070a12;--fg:#c7cbd6;--mut:#8b93a7;--gold:#fcd34d;--card:#0e1422;--line:#1e2740;--code:#0b1120}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.65 "IBM Plex Sans Arabic",system-ui,-apple-system,sans-serif}
  .wrap{max-width:900px;margin:0 auto;padding:40px 22px 90px}
  h1{font-size:30px;margin:0 0 6px;color:var(--gold);font-weight:700}
  h2{font-size:20px;margin:44px 0 12px;color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:7px}
  h3{font-size:15px;margin:26px 0 8px;letter-spacing:.02em}
  p,li{color:var(--fg)}
  .sub{color:var(--mut);margin:0 0 26px}
  code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px}
  code{background:var(--code);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
  pre{background:var(--code);border:1px solid var(--line);border-radius:9px;padding:14px 16px;overflow-x:auto;margin:10px 0}
  pre code{background:none;border:0;padding:0}
  a{color:var(--gold)}
  table{width:100%;border-collapse:collapse;margin:8px 0 4px;display:block;overflow-x:auto}
  td{padding:9px 10px;border-top:1px solid var(--line);vertical-align:top}
  td:first-child{white-space:nowrap}
  td.sum{color:var(--mut);font-size:14.5px}
  .note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:8px;padding:13px 16px;margin:18px 0}
  .ex{display:block;margin:5px 0;direction:ltr;unicode-bidi:embed}
  footer{margin-top:60px;color:var(--mut);font-size:14px;border-top:1px solid var(--line);padding-top:18px}
</style>
</head>
<body><div class="wrap">

<h1>آيات.network — API</h1>
<p class="sub">Read-only HTTP access to the Qurʾānic word · lemma · root network,
its morphology, six classical lexicons, and every analysis the app performs.</p>

<div class="note">
<strong>Want to try it right now?</strong> The <a href="${esc(base)}/docs">interactive explorer</a>
lists every endpoint with its parameters and examples, and runs requests in the browser —
including the Arabic ones, which it encodes for you. This page is the prose reference.
</div>

<div class="note">
<strong>Every answer links back into the app.</strong> Alongside the data, each object carries a
<code>links</code> block whose <code>ui…</code> entries are ready-made URLs that open
<a href="${esc(config.appBase)}">${esc(config.appBase)}</a> showing exactly that thing — the
occurrences popup for a word, the distribution chart for a root, the graph centred on an āya.
Ask the API for the verses containing كتب, hand the <code>ui</code> link to a reader, and they
see the same result on screen.
</div>

<h2>Base URL</h2>
<pre><code>${esc(base)}</code></pre>
<p>${keysEnforced()
    ? `This deployment <strong>requires an API key</strong>. Send it as <code>X-API-Key: …</code> (or <code>?api_key=…</code>). Write to <a href="mailto:waliori@gmail.com">waliori@gmail.com</a> for one.`
    : `<strong>Open access</strong> — no key, no signup. A per-IP rate limit of <strong>${config.rateLimit} requests / ${Math.round(config.rateWindowMs / 60000)} min</strong> applies; the <code>X-RateLimit-*</code> response headers tell you where you stand. If the API is keyed later, existing calls keep working until keys are switched on, and then need only an <code>X-API-Key</code> header.`}</p>

<h2>Try it</h2>
${EXAMPLES.map(([label, path]) => `<div class="ex"><code><a href="${esc(base + path)}">${esc(base + path)}</a></code><br><span class="sum" style="color:var(--mut);font-size:14px">${esc(label)}</span></div>`).join("\n")}

<h2>Response shape</h2>
<pre><code>{
  "api": "v1",
  "data": { … },                     // the payload
  "meta": { "count": 50, "total": 319, "limit": 50, "offset": 0, "has_more": true },
  "links": {
    "self": "…",
    "next": "…",                     // when paginated
    "ui": "https://ayat.network/#s=…",              // open this in the app
    "ui_occurrences": "…", "ui_distribution": "…"   // and the other lenses
  }
}</code></pre>
<p>Errors use the same envelope with an <code>error</code> object
(<code>code</code>, <code>message</code>, and often a <code>hint</code>) and the matching HTTP status.</p>

<h2>Conventions</h2>
<table>
<tr><td><code>verse_key</code></td><td class="sum">Always <code>surah:ayah</code> — <code>2:255</code>. <code>2/255</code> is accepted in paths.</td></tr>
<tr><td><code>mode</code></td><td class="sum"><code>exact</code> (surface form) · <code>lemma</code> (صيغة) · <code>root</code> (جذر). It decides how occurrences are grouped, and it travels into the UI link.</td></tr>
<tr><td><code>precision</code></td><td class="sum"><code>loose</code> (default) folds آية/اية and similar orthographic variants; <code>strict</code> keeps them distinct.</td></tr>
<tr><td>Queries</td><td class="sum">Type Arabic however you like — vocalized Uthmani (<code>ٱلصَّلَوٰة</code>), conventional imlāʾī (<code>الصلاة</code>) or Latin (<code>salat</code>). The same forgiving resolver the search bar uses runs here, and a miss returns near-matches as a hint.</td></tr>
<tr><td>Paging</td><td class="sum"><code>?limit=</code> (max ${config.maxLimit}) and <code>?offset=</code>; <code>meta.total</code> and <code>links.next</code> come back.</td></tr>
<tr><td>CSV</td><td class="sum"><code>?format=csv</code> on any endpoint whose <code>data</code> is a list of rows.</td></tr>
<tr><td>Caching</td><td class="sum">Everything is immutable per build: responses carry an <code>ETag</code>; send <code>If-None-Match</code> and get a 304.</td></tr>
<tr><td>CORS</td><td class="sum">Open (<code>*</code>) — call it straight from a browser.</td></tr>
</table>

<h2>Endpoints</h2>
${grouped.map(([title, rs]) => `
<h3>${esc(title)}</h3>
<table>
${rs.map((r) => `<tr><td><code>GET ${esc(r.pattern)}</code></td><td class="sum">${esc(r.meta.summary || "")}</td></tr>`).join("\n")}
</table>`).join("\n")}

<h2>Machine-readable</h2>
<p><a href="${esc(base)}/openapi.json">OpenAPI 3.1 description</a> ·
<a href="${esc(base)}/docs">interactive explorer</a> ·
<a href="${esc(base)}/">service index</a></p>

<h2>Attribution</h2>
<p>The text is Tanzil's Uthmani Ḥafṣ; roots, lemmas and morphology come from the Quranic Arabic
Corpus (GPL); the lexicons are OpenITI digitisations (CC-BY-SA). <a href="${esc(base)}/sources">/sources</a>
returns the exact revisions and checksums this instance was built from — please cite them
rather than this API alone.</p>

<footer>آيات.network · <a href="${esc(config.appBase)}">${esc(config.appBase)}</a> · <a href="mailto:waliori@gmail.com">waliori@gmail.com</a></footer>
</div></body></html>`;
}
