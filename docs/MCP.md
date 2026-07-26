# The MCP server

The same corpus as the [HTTP API](API.md), spoken as **Model Context Protocol** — so an AI
agent can look the Qurʾān up instead of recalling it.

```
POST https://ayat.network/api/v1/mcp
```

Streamable HTTP, JSON-RPC 2.0, session-less. Open access, no key, no signup — it inherits the
API's rate limit (600 requests/hour per IP by default).

---

## Why this exists

An HTTP API is already agent-callable; anything with a fetch tool can hit it. What MCP adds
is **discovery**: the client calls `tools/list` at connect time and receives typed schemas,
instead of a human pasting documentation into a system prompt.

What MCP adds *here* is narrower and more useful. The Qurʾān is a domain where a language
model's failure mode is not "I don't know" — it is a confidently wrong āya number, an
invented vocalization, or a lexicon quotation nobody wrote. Every tool below exists to turn
one of those into a lookup, and `locate_quotation` exists solely so a model can check a
reference before asserting it.

---

## Connecting

### Remote (recommended)

Any client that accepts a remote MCP URL:

```json
{
  "mcpServers": {
    "ayat": { "type": "http", "url": "https://ayat.network/api/v1/mcp" }
  }
}
```

### As a connector in Claude

Settings → Connectors → **Add custom connector**, then paste the URL above. Leave the OAuth
fields empty — there is no sign-in, and the endpoint says so by publishing no authorization
metadata.

To check it took, ask for something the model cannot answer from memory without being wrong,
so a silent fallback to recall is visible:

> Which āya is «إياك نعبد وإياك نستعين»? Use the ayat tools.

It should call `locate_quotation` and come back with **1:5** and a `ui` link. Then something
only the corpus can do:

> Build a co-occurrence grid for the roots نور and ظلم against علم and جهل.

`relate` returns the grid, and the نور × جهل cell is **0** — a pairing the text never makes,
which is the kind of answer no amount of recall produces.

### stdio, for clients that only launch subprocesses

`server/mcp/stdio.js` speaks newline-delimited JSON-RPC on stdin/stdout, in either of two
modes.

**Bridge** — forwards to the remote endpoint. Starts instantly, needs no data locally:

```json
{
  "mcpServers": {
    "ayat": {
      "command": "node",
      "args": ["/path/to/qurangraph/server/mcp/stdio.js", "--url", "https://ayat.network/api/v1/mcp"]
    }
  }
}
```

**Local** — runs the corpus in-process from this checkout. Offline, no rate limit, and it
costs the corpus boot (a few seconds, a few hundred MB of RAM). Needs `public/data/` built
(see the README's Quick start):

```bash
npm run mcp          # local, in-process
npm run mcp:bridge   # bridge to ayat.network
```

If the API has keys turned on, pass one with `--api-key` or `API_KEY=…`.

### From a shell

The endpoint is ordinary HTTP, and unlike the REST API there is **no Arabic-encoding trap** —
the query travels in a JSON body, not in a URL:

```bash
curl -s https://ayat.network/api/v1/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
        "name":"locate_quotation","arguments":{"text":"إياك نعبد وإياك نستعين"}}}'
```

---

## Tools

Fourteen, over the whole HTTP API. Every one is read-only, side-effect free and
closed-world, and says so in its annotations — a client may run them without asking the user
to confirm.

| Tool | For |
|---|---|
| `search_quran` | **The default entry point.** Every āya containing a word, lemma or root |
| `locate_quotation` | **The verification tool.** Which āya is this Arabic text? |
| `get_verses` | Read āyāt you can already name — a list of keys, or a range |
| `get_surah` | One sūrah: header and āyāt |
| `browse_roots` | The root inventory — most frequent, containing given letters, or hapax |
| `root_dossier` | Everything about one root at once, `sections`-selectable |
| `lexicon_entry` | One dictionary's full article for one root, with a citation |
| `analyze_term` | Ten lenses on a term: distribution · collocations · neighbours · semantic_neighbours · opposites · derivation · valency · roles · expressions · **construction** |
| `compare_terms` | Two terms side by side: shared āyāt, shared and distinctive collocates |
| `analyze_verse` | One āya: profile · rhetoric · antithesis · similar · shared phrases · near-identical |
| `analyze_surah` | One sūrah: profile · letters · keyness · cohesion · rhyme · iltifāt · munāsabāt |
| `browse_catalogue` | The corpus-wide lists: idioms · compounds · collocations · government_frames · opposites · near_identical · seams · divine_names · rasm |
| `relate` | Things held against each other: pairing grid · rhyme mates · shared roots · sūrah bonds |
| `corpus_info` | What this corpus is, and where it came from — including the provenance manifest |

### Why fourteen and not fifty

A client loads **every** tool schema into its context before the conversation starts, so the
table is a fixed tax on every turn. Fifty thin tools would cost more *and* choose worse than
fourteen fat ones, so related endpoints fold behind an enum — `analyze_term` carries ten
analyses, `browse_catalogue` nine catalogues, `relate` four relations, `corpus_info` six
documents — and each description says **when** to reach for the tool rather than merely what
it does, because a trigger condition is what actually drives selection.

The enums are not arbitrary groupings. Each answers a different **shape** of question:

| Shape | Tool |
|---|---|
| one term | `analyze_term` |
| one āya | `analyze_verse` |
| one sūrah | `analyze_surah` |
| the corpus as a whole | `browse_catalogue` |
| two things held against each other | `relate` |

A model choosing between five shapes chooses better than one choosing between fifty names.

**Coverage is asserted, not assumed.** `server/mcp.test.js` walks the live route table and
fails if any endpoint is neither reachable from a tool, reachable by an equivalent (the
`/search` query form, `/words/{form}` via `mode`), nor listed with a reason. Adding an HTTP
route without deciding which of the three it is breaks the build — which is what keeps the
two surfaces from drifting apart silently.

One family is deliberately absent, and one is served elsewhere:

- **`/graph`** — the force-directed network. A model cannot render it, the node list is
  large, and every verse answer already carries the `ui` link that draws it in a browser.
  Nothing is lost and several thousand tokens are saved.
- **`/docs`, `/guide`, `/openapi.json`, `/health`** — documentation for humans and HTTP
  clients, plus an ops probe. An MCP client has `tools/list`; the prose lives in the
  `ayat://guide` resource.

---

## Resources

Tools are model-controlled. Resources are **application**-controlled — the client or the user
attaches them. These are the things worth pinning **once** for a whole session:

| URI | |
|---|---|
| `ayat://guide` | The corpus briefing. What is in it, what is **not** (no translation, no tafsīr, no interpretive cross-referencing), the conventions, and how to cite it without overstating it |
| `ayat://corpus/surahs` | All 114 with names, āya counts and disjoined letters |
| `ayat://corpus/sources` | Provenance: upstream revisions and checksums |
| `ayat://corpus/coverage` | What fraction of tokens carry a root analysis — the bound on what any root-based aggregate can claim |
| `ayat://corpus/lexicons` | The six dictionaries, editions and licences |

Two templates let a client cite something specific as an attachment rather than as tool
output: **`ayat://verse/{verse_key}`** (`ayat://verse/2:255`, or `ayat://verse/البقرة:255`)
and **`ayat://root/{root}`** (`ayat://root/علم`).

Attaching `ayat://guide` at the start of a research session is the single cheapest accuracy
intervention this server offers.

---

## Prompts

User-invoked workflows — they surface as slash commands. Each encodes the order of calls a
careful researcher would make, plus the reporting discipline that keeps the answer honest.

| Prompt | Arguments |
|---|---|
| `verify_quotation` | `text` |
| `root_study` | `root`, `lexicon` |
| `verse_study` | `verse_key` |
| `compare_concepts` | `a`, `b` |
| `surah_overview` | `surah` |

Argument completion is supported (`completion/complete`) for lexicon ids, sūrah names, verse
keys and roots — drawn from the live corpus, so a completion can never name something that
isn't there. Al-Ikhlāṣ completes to exactly four āyāt.

---

## Accuracy

This is the part that matters, and most of it is not code.

**`initialize` returns `instructions`**, which most clients paste into the system prompt.
Seven rules, of which the first three are the load-bearing ones: never state a reference,
quote, or count from memory; confirm passages with `locate_quotation`; there is no
translation or tafsīr here, so label any interpretation as your own.

**Errors are written for the model, and reach it.** A tool that fails returns a *successful*
RPC carrying `isError: true` plus the API's own message **and hint** — not a protocol error
the client swallows. That is what lets a model recover on its own turn:

```
No sūrah matches "baqra".
Hint: Did you mean البقرة (2), الواقعة (56), الحاقة (69)? …
```

Argument faults are handled the same way, and name the fix:

```
Invalid arguments for `analyze_verse`: Unknown argument: verse. This tool accepts: verse_key, sections, limit, include_morphology.
```

Only genuine protocol faults — unknown method, malformed params object — become JSON-RPC
errors.

**Notes travel with the answer.** A response says when a forgiving resolver changed the
query (`"rahman" was resolved to ٱلرَّحْمَٰنِ`), when a quotation matched no āya *completely*,
when counts are tokens rather than āyāt, when a similarity is lexical rather than thematic,
and when a list was cut.

**Truncation is never silent.** See below.

---

## Response shaping

The HTTP API is tuned for a browser: seven `ui…` deep links per object, a root dossier
carrying all six dictionary articles, fifty rows a page. That is right for a page and wrong
for a context window. Three passes fix it:

1. **One link per object.** The headline `ui` link survives — it is the citation a model
   hands back to a human — and the six sibling lenses, which are the same URL with a
   different view flag, do not. Rows of long tabular lists drop links entirely.
2. **Per-tool projection.** `sections` on the dossier and the two analysis tools, explicit
   caps on every list, article clipping on `lexicon_entry`, and much smaller default limits
   than the API's.
3. **A hard ceiling** (60 000 characters ≈ 15 000 tokens by default) on one tool result. Over
   it, the answer degrades in a defined order — links, then long strings, then list lengths —
   and **reports what it dropped** in a `truncated` block, because a silently shortened list
   read as complete is exactly how a grounded answer becomes a wrong one.

JSON is serialized compactly. Indentation is whitespace the model pays for by the token, and
nothing downstream reads it by eye.

In practice a typical answer is 1.5–8 KB; only an explicitly maximal request (a 300-āya sūrah,
or 50 āyāt with full morphology) reaches the ceiling.

---

## Security

| | |
|---|---|
| **Origin allow-list** | Browsers attach `Origin` and cannot forge it, so this is the hook for refusing a page by name. **`*` by default, and blank reads the same way.** The DNS-rebinding attack the MCP spec calls out is a *loopback* problem — a hostile page reaching an MCP server running on your own machine, with your files and your ambient authority behind it. This server is public, read-only, sets no cookie and holds no user state, so refusing browser origins protects nothing and locks out hosted clients, which *do* send an `Origin`. Set a list only if you run with `API_KEYS` on; a refused origin then gets `403` *and* an explicit `Access-Control-Allow-Origin: null`, so the API's blanket `*` cannot hand the body back to the page that was turned away. |
| **No batching** | JSON-RPC arrays were removed from MCP in revision 2025-06-18 and are refused. This also closes the hole where one rate-limit token buys five hundred corpus queries. |
| **Body ceiling** | 1 MB, enforced *while reading*, so an oversized body is dropped rather than buffered. |
| **Method allow-list** | `POST` and `OPTIONS`. `GET` is `405` — the endpoint is session-less and offers no server-to-client stream. |
| **Same access control** | The API's key check and per-IP rate limiter, unchanged. An MCP client is not a privileged caller. With keys on, an unauthenticated call gets `401` with `WWW-Authenticate`. |
| **Read-only by construction** | Every tool calls a real `GET` route handler. There is no write path to omit. |
| **Nothing leaks** | A 5xx returns a fixed string; stacks and paths never reach a caller. |
| **No dependencies** | JSON-RPC is ~100 lines on `node:http`. The API's promise of no runtime npm dependencies is what guarantees an MCP answer, an HTTP answer and the on-screen answer are one computation — importing an SDK to save those lines would have cost that. |

---

## Troubleshooting

### "Couldn't register with ayat.network's sign-in service"

A client saying it cannot register with a sign-in service, or asking for an **OAuth Client
ID**, has run MCP authorization discovery and got something it could not parse — not
something that requires a client id.

Before connecting, a client probes for OAuth metadata:

```
/.well-known/oauth-protected-resource            (RFC 9728, optionally + the resource path)
/.well-known/oauth-authorization-server
```

This endpoint requires no authorization, so those paths must **404**. The absence of metadata
is what tells a client to connect anonymously.

The trap is that this API is served from the same host as a single-page app, whose nginx
fallback answers *every* unmatched path with `index.html` and a `200`. The client asks for
authorization metadata, receives a web page, and reports a sign-in service that does not
exist. Check it with:

```bash
curl -si https://ayat.network/.well-known/oauth-protected-resource | head -3
# want: HTTP/1.1 404 …  ·  wrong: HTTP/1.1 200 … text/html
```

`docker/nginx.conf` carries a `location ~ ^/\.well-known/(oauth-|openid-)` block that returns
404 ahead of the SPA fallback. Anyone running this behind their own reverse proxy needs the
equivalent — the same footgun applies to any MCP server hosted alongside an SPA.

### The endpoint answers 405

That is correct for `GET`. This server is session-less and offers no server-to-client event
stream, so only `POST` and `OPTIONS` are accepted. A client that only speaks the deprecated
2024-11-05 HTTP+SSE transport cannot connect; use the stdio bridge for it.

### A browser-based client gets 403

`API_MCP_ORIGINS` is set to a list that does not name it. Add the origin, or `*` for any.
Unset or blank already means `*`.

### A client says it "couldn't register with your sign-in service"

It is not talking about a service you run — it is describing a page it could not parse.

Before connecting, an MCP client asks whether the endpoint is OAuth-protected. It probes
`/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`; finding
no metadata, MCP's 2025-03-26 authorization revision tells it to fall back to fixed default
paths on the issuer — `/authorize`, `/token`, `/register` — and attempt Dynamic Client
Registration at the last of those.

If any of those five paths falls through to an SPA fallback, the client is handed `index.html`
with a `200`, reads a successful registration it cannot parse, and reports a broken sign-in
service that never existed. **The absence of authorization has to be stated, not implied**: all
five must answer a clean `404`. `docker/nginx.conf` does this in two `location` blocks; if you
front the app with your own server, copy them.

**That same message also appears when the request never reached the server at all** — see the
next section. The symptom does not distinguish them, so check both.

### A CDN is challenging the POST

If you front the deployment with Cloudflare or similar, its bot protection will challenge
`POST /api/v1/mcp`, and the client is handed a `Just a moment...` interstitial instead of
JSON-RPC. It cannot parse that either, so it reports the same phantom sign-in service. The
tell is in the body — `cType: 'managed'` and a `cZone` naming your domain.

It is easy to miss because it is **selective**: a `curl` from your own machine often passes
while the same request from a hosted client's datacenter IP is challenged, so the endpoint
looks healthy from where you are testing. Print the body rather than the status:

```bash
curl -s -X POST https://ayat.network/api/v1/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 200
```

On Cloudflare, three settings do it, and they act in this order:

| Setting | What it sends | Fix |
|---|---|---|
| **Bot Fight Mode** | managed challenge | Security → Bots → off. On the Free plan it is zone-wide and **cannot** be skipped by a WAF rule |
| **Browser Integrity Check** / **Security Level** | managed challenge | WAF custom rule, action **Skip**, over `starts_with(http.request.uri.path, "/api/")` |
| **Block AI bots** | `403` block | Rescope off `/api/`, or turn off. It targets exactly the agent user-agents this endpoint exists to serve |

The first masks the others: fix it and the next one surfaces. `starts_with` is a *function*
in Cloudflare's expression language, not an infix operator, and regex `matches` needs a
Business plan.

---

## Protocol details

- **Transport:** Streamable HTTP. One endpoint, `POST` only, no `Mcp-Session-Id` (one arriving
  is ignored). The deprecated 2024-11-05 HTTP+SSE transport is not implemented.
- **Versions:** advertises `2025-06-18`; also accepts `2025-03-26` and `2024-11-05`. A client
  asking for something unknown gets `2025-06-18` back and decides whether it can live with it.
- **Capabilities:** `tools`, `resources` (no subscribe), `prompts`, `completions`.
- **Notifications** are answered `202` with an empty body.
- **Caching:** `Cache-Control: no-store`. Rate-limit headers come back on every response and
  are CORS-exposed.

### Method support

| Method | |
|---|---|
| `initialize` · `ping` | ✅ |
| `tools/list` · `tools/call` | ✅ |
| `resources/list` · `resources/templates/list` · `resources/read` | ✅ |
| `prompts/list` · `prompts/get` | ✅ |
| `completion/complete` | ✅ |
| `resources/subscribe` · `logging/*` · sampling · elicitation · roots | not offered (capability not declared) |

---

## Running it yourself

It is part of the API server; there is nothing extra to start.

```bash
npm run data:build   # or the subset in the README's Quick start
npm run api          # → POST http://localhost:8080/api/v1/mcp
```

Behind the site's nginx it needs no new configuration: `location /api/` already proxies the
whole prefix, POST included.

### Configuration

| Variable | Default | |
|---|---|---|
| `API_MCP` | `true` | Switch the endpoint off entirely |
| `API_MCP_ORIGINS` | `*` | Browser origins allowed to POST. Blank also means any |
| `API_MCP_MAX_RESPONSE` | `60000` | Ceiling on one tool result, in characters |
| `API_MCP_MAX_BODY` | `1000000` | Largest request body, in bytes |
| `API_MCP_STRUCTURED` | `false` | Also return `structuredContent` beside the text block |

Everything else — `API_KEYS`, `API_RATE_LIMIT`, `API_APP_BASE`, `API_DATA_DIR` — is shared
with the HTTP API and documented in [API.md](API.md).

---

## Development

```
server/mcp/
  http.js        Streamable HTTP transport: origin check, ceilings, access control
  stdio.js       stdio transport — local in-process, or bridge to a remote endpoint
  server.js      Method dispatch, protocol negotiation, argument completion
  jsonrpc.js     JSON-RPC 2.0 framing
  invoke.js      Calls a REAL route handler in-process — the one-implementation guarantee
  tools.js       The fourteen tools
  resources.js   Fixed resources + templates
  prompts.js     The five workflows
  guide.js       `instructions` and the corpus briefing
  shape.js       Link slimming, caps, the budget backstop
  validate.js    Argument validation, written to be readable by a model
```

`server/mcp.test.js` runs the whole surface against the real corpus, including the test that
matters most: **an MCP answer and the HTTP answer to the same question are the same answer.**

```bash
npm test -- server/mcp.test.js
npx @modelcontextprotocol/inspector   # then point it at http://localhost:8080/api/v1/mcp
```

---

## Attribution

Text: Tanzil's Uthmani Ḥafṣ. Roots, lemmas and morphology: the Quranic Arabic Corpus (GPL).
Lexicons: OpenITI digitisations (CC-BY-SA). `corpus_info(topic:"sources")` returns the exact
revisions and checksums the running instance was built from — please cite those, not this
server alone.
