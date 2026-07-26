# The HTTP API

A read-only JSON API over everything the app knows: the Ḥafṣ text, its morphology, the
word / lemma / root network, six classical lexicons, and every analysis the UI performs.

```
https://ayat.network/api/v1/
```

**[→ Try it in the browser](https://ayat.network/api/v1/docs)** — the interactive explorer:
every endpoint with typed parameters, worked examples and a Run button.

Service index: [`/api/v1/`](https://ayat.network/api/v1/) ·
prose reference: [`/api/v1/guide`](https://ayat.network/api/v1/guide) ·
OpenAPI 3.1: [`/api/v1/openapi.json`](https://ayat.network/api/v1/openapi.json) ·
MCP (for AI agents): [`/api/v1/mcp`](MCP.md)

---

## The idea: answers that are also links

Every object in every response carries a `links` block, and its `ui…` entries are
ready-made URLs into the app showing *exactly what the response describes*:

```bash
curl 'https://ayat.network/api/v1/search/كتب?mode=root&limit=1'
```

```jsonc
{
  "api": "v1",
  "data": {
    "term": {
      "key": "كتب", "label": "كتب", "mode": "root",
      "verses": 279, "occurrences": 319,
      "links": {
        "ui":              "https://ayat.network/#s=…",  // the occurrences sheet
        "ui_occurrences":  "https://ayat.network/#s=…",
        "ui_distribution": "https://ayat.network/#s=…",  // by-sūrah chart
        "ui_graph":        "https://ayat.network/#s=…",  // the network, root mode
        "ui_root_lab":     "https://ayat.network/#s=…",
        "ui_expressions":  "https://ayat.network/#s=…",
        "ui_construction": "https://ayat.network/#s=…"
      }
    },
    "verses": [
      { "verse_key": "2:2", "surah": 2, "surah_name": "البقرة", "ayah": 2,
        "text": "ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ فِيهِ هُدًى لِّلْمُتَّقِينَ",
        "matches": { "word_indices": [1], "count": 1 },
        "links": { "ui": "…", "ui_aya_lab": "…", "ui_context": "…", "ui_phrases": "…",
                   "ui_rhyme": "…", "ui_surah_lab": "…" } }
    ]
  },
  "meta":  { "count": 1, "total": 279, "limit": 1, "offset": 0, "has_more": true },
  "links": { "self": "…", "next": "…", "ui": "…", "ui_distribution": "…" }
}
```

Open `ui_occurrences` in a browser and you get the app with the occurrences sheet already
showing all 279 āyāt for the root كتب. The whole state travels in the URL **fragment**, so
these links work as shares, bookmarks, or citations, and never reach a server log.

The links are built with the app's own encoder (`src/hooks/useUrlState.js`), and the tests
in `server/links.test.js` round-trip every one of them back through the app's decoder — so
a link the API emits is a link the app can read.

> Long lists (collocates, browse pages, the 99 names) carry only the single headline `ui`
> link per row; the object a request is *about* carries the full set. Otherwise a 200-row
> page would be mostly duplicated URLs.

---

## Conventions

| | |
|---|---|
| **Verse keys** | `surah:ayah` — `2:255`. Paths also accept `/verses/2/255`. The sūrah half may be a **name**: `البقرة:255`, `al-baqarah/255`. |
| **Naming a sūrah** | Anywhere a sūrah is taken, it may be a number (`2`), its Arabic name (`البقرة`, or `بقرة` without the article), or a transliteration (`al-baqarah`, `baqarah`, `Al Baqara`). |
| **`mode`** | `exact` (surface form) · `lemma` (صيغة) · `root` (جذر). Decides how occurrences are grouped, and travels into the UI link. |
| **`precision`** | `loose` (default, folds آية/اية) · `strict`. |
| **Queries** | Type Arabic however you like — vocalized Uthmani (`ٱلصَّلَوٰة`), conventional imlāʾī (`الصلاة`), or Latin (`salat`, `rahman`). The API runs the same forgiving resolver as the search bar; a miss returns near-matches as a `hint`. |
| **Arabic from curl** | Use the **path** forms — see [below](#sending-arabic-from-curl). |
| **Paging** | `?limit=` (max 500) `&offset=`. `meta.total` + `links.next` come back. |
| **CSV** | `?format=csv` on any endpoint whose `data` is a list of rows. |
| **Caching** | Per-build immutable: every response has an `ETag`; send `If-None-Match` for a 304. |
| **CORS** | `*` — call it straight from a browser. |
| **Methods** | `GET` only, and every endpoint below is read-only. Anything else is `405`. The one exception is the MCP endpoint ([`POST /mcp`](MCP.md)), which is JSON-RPC and therefore posts — it too only reads. |

**Errors** use the same envelope:

```json
{ "error": { "code": "not_found", "message": "No exact in the Qurʾān matches \"zzzz\".",
             "hint": "Try a different mode (exact | lemma | root), or the bare consonantal form." } }
```

`400 bad_request` · `401 unauthorized` · `404 not_found` · `405 method_not_allowed` ·
`429 rate_limited` · `503 service_unavailable` (API container restarting).

---

## Naming a sūrah

Every route that takes a sūrah takes a name as readily as a number — `/surahs/{id}`,
`/verses/{surah}/{ayah}`, `/verses?surah=`, `/analysis/surah/{id}`, `/analysis/iltifat/{surah}`,
`/analysis/bonds/{surah}`, `/analysis/munasabat?surah=`, and the sūrah half of any verse key:

```bash
curl "$API/verses/البقرة/255"        # Arabic name
curl "$API/verses/al-baqarah/255"    # transliteration
curl "$API/verses/بقرة:255"          # without the definite article
curl "$API/analysis/surah/yasin"     # 36, Yā-Sīn
curl "$API/surahs/الإخلاص"
```

Accepted for each sūrah: the number, the corpus's own Arabic name (normalised, so
`الاخلاص` and `الإخلاص` agree), the same name without `ال`, and a set of curated Latin
spellings with and without the article (`nas`, `an-nas`, `annas`).

**Matching is exact after normalisation — deliberately not fuzzy.** The corpus romanizer
that resolves Latin *word* queries answers يوسف for `yasin`, المسد for `maida` and النساء
for `nas`. That is tolerable when you are hunting a word and can see the candidates; it is
not when you ask for a chapter and get a different chapter with a `200`. So an
unrecognised name is a `404` that lists near spellings, never a guess:

```jsonc
{ "error": {
    "code": "not_found",
    "message": "No sūrah matches \"baqra\".",
    "hint": "Did you mean البقرة (2), الواقعة (56), الحاقة (69)? …" } }
```

A key whose *shape* is wrong (`banana`, `2:255:1`) is a `400`; a well-formed key naming a
sūrah that doesn't exist (`baqra:1`) is a `404`.

The Arabic names are read from the corpus itself, so they cannot drift from the text. Only
the transliterations are curated (`server/surahNames.js`), and the index refuses to build
if any spelling would be ambiguous — an ambiguous table fails the boot, not a request.

> **Alternate traditional names** (المؤمن for 40, بني إسرائيل for 17, براءة for 9) are
> *not* accepted. Choosing which variants to bless is a scholarly judgement with no source
> in this repo to cite; ask if you need them.

---

## Sending Arabic from curl

curl percent-encodes a URL's **path** but passes its **query string** through verbatim. So
this puts raw UTF-8 bytes in the HTTP request line, which nginx and Node's parser both
reject with an empty `400` before the API ever sees it:

```bash
curl "https://ayat.network/api/v1/search?q=كتب&mode=root"     # ✗ empty 400
```

Three ways round it, in order of convenience:

```bash
# 1 · the path form — the term rides in the path, so curl encodes it for you
curl "https://ayat.network/api/v1/search/كتب?mode=root"
curl "https://ayat.network/api/v1/roots/علم"
curl "https://ayat.network/api/v1/verses/البقرة/255"
curl "https://ayat.network/api/v1/lexicons/maqayis/علم"

# 2 · let curl build the query string
curl -G "https://ayat.network/api/v1/search" --data-urlencode "q=كتب" -d "mode=root"

# 3 · encode it yourself
curl "https://ayat.network/api/v1/search?q=%D9%83%D8%AA%D8%A8&mode=root"
```

Browsers, `fetch`, Python `requests` and the explorer at `/docs` all encode automatically —
this is a curl-shaped problem, not an API-shaped one.

---

## Access

**Open — no key, no signup.** A per-IP rate limit applies (600 requests/hour by default);
`X-RateLimit-Limit`, `-Remaining` and `-Reset` come back on every response, and a `429`
carries `Retry-After`.

If traffic ever makes keys necessary, the mechanism is already in place and needs no code
change — see [Turning keys on](#turning-keys-on) below. Clients that already send
`X-API-Key` keep working either way.

---

## Endpoints

### Meta

| | |
|---|---|
| `GET /` | Discovery: every endpoint, the corpus counts, the conventions |
| `GET /health` | Liveness + what data this instance loaded |
| `GET /docs` | **The interactive explorer** — every endpoint, runnable in the browser |
| `GET /guide` | The prose reference (this document, rendered) |
| `GET /openapi.json` | OpenAPI 3.1 |
| `GET /sources` | Provenance: upstream revisions + checksums of every corpus |
| `GET /coverage` | What fraction of tokens carry a root / lemma analysis |

### Corpus

| | |
|---|---|
| `GET /surahs` | All 114, with verse counts and disjoined letters |
| `GET /surahs/{id}` | One sūrah and its āyāt (`?verses=false` for the header only). `{id}` may be a name |
| `GET /verses` | Āyāt in muṣḥaf order — `?surah=&from=&to=` |
| `GET /verses/{s}:{a}` | One āya, with per-word root / lemma / full morphology. `{s}` may be a name |
| `GET /verses/{surah}/{ayah}` | The same, slash-separated — `/verses/البقرة/255` |

### Words, lemmas, roots

| | |
|---|---|
| `GET /search` | **The main entry point.** `?q=&mode=&precision=&words=` → the term + every āya containing it |
| `GET /search/{q}` | The same, with the term in the path — the curl-safe form for Arabic |
| `GET /words/{form}` | Occurrences of an exact surface form |
| `GET /lemmas/{lemma}` | Occurrences of a lemma |
| `GET /roots` | Browse roots — `?q=` substring, `?hapax=true`, `?sort=frequency\|alphabetical` |
| `GET /roots/{root}` | **Full dossier**: occurrences · derivational family · all six lexicon articles · distributional neighbours · curated opposites · expressions · by-sūrah distribution |
| `GET /occurrences` | Just the verse keys — the smallest possible answer |
| `GET /lexicons` | The six dictionaries, with editions and licences |
| `GET /lexicons/{id}/{root}` | One article, concise + full, with BibTeX/RIS citation |

### Analysis

| | |
|---|---|
| `GET /analysis/distribution` | A term across the 114 sūrahs (true token frequency) |
| `GET /analysis/collocations` | Within-verse co-occurrence — PMI, signed log-likelihood, logDice. `?window=&sort=` |
| `GET /analysis/neighbours` | The words immediately before/after, corpus-wide. `?cross_verse=` |
| `GET /analysis/compare` | `?a=&b=` — shared āyāt, shared vs. distinct collocates |
| `GET /analysis/verse/{s}:{a}` | Profile · rhyme + prosody · rhetoric · antithesis · similar āyāt · shared phrases · near-identical pairs |
| `GET /analysis/surah/{id}` | Profile · over-represented roots (keyness) · cohesion · rhyme scheme + fawāṣil · letters · iltifāt · munāsabāt |
| `GET /analysis/rhyme/{s}:{a}` | Every āya sharing that rhyme. `?by=key\|rawiy` |
| `GET /analysis/derivation/{root}` | Every lemma built on the root |
| `GET /analysis/valency/{root}` | Which prepositions and objects a verb root takes |
| `GET /analysis/roles/{root}` | Subject / object / genitive breakdown of its occurrences |
| `GET /analysis/semantic/{root}` | Distributional neighbours (meaning by shared context) |
| `GET /analysis/relations` · `/{root}` | The curated antithesis (طباق) catalogue |
| `GET /analysis/pairing` | `?rows=&cols=` co-occurrence grid — **including the empty cells** |
| `GET /analysis/names` | The 99 names with their roots' corpus footprint |
| `GET /analysis/hapax` | Roots occurring exactly once |
| `GET /analysis/mutashabihat` | Near-identical āyāt (`?verse=` for one āya's pairs) |
| `GET /analysis/munasabat` | Inter-sūra coherence at the seams (`?surah=`) |
| `GET /analysis/iltifat/{surah}` | Grammatical register shifts |
| `GET /analysis/bonds/{surah}` | Rare words/phrases binding distant āyāt |
| `GET /analysis/shared-roots` | `?a=&b=` — the roots two āyāt have in common |
| `GET /analysis/construction/{root}` | Pin a root to ONE construction: Form · voice · governed particle · object definiteness · presence-vs-**absence** |
| `GET /analysis/rasm` | Words the muṣḥaf draws more than one way (`?kind=variants\|orthography`) |
| `GET /analysis/rasm/{id}` | One rasm entry: every spelling, where each is used, where the text switches |

### Expressions (التعابير)

| | |
|---|---|
| `GET /expressions` | Governing heads and their preposition contrast (آمن بـ vs آمن لـ) |
| `GET /expressions/idioms` | Curated Qurʾānic idioms |
| `GET /expressions/compounds` | Iḍāfa constructs |
| `GET /expressions/collocations` | Verb–noun collocations by log-likelihood |
| `GET /expressions/roots/{root}` | Every expression a root takes part in |

Occurrence lists here are sampled — `?verses=N` (0–500, default 5) raises or removes them.

### For AI agents (MCP)

| | |
|---|---|
| `POST /mcp` | The same corpus as a **Model Context Protocol** server — see [MCP.md](MCP.md) |

Streamable HTTP, JSON-RPC 2.0, session-less, open access. Fourteen curated tools over these
endpoints, the corpus briefing as a resource, research workflows as prompts. The tools call
the same route handlers documented above, so an MCP answer and an HTTP answer to the same
question are the same answer. It is the only `POST` on this API; everything else is `GET`.

```bash
curl -s https://ayat.network/api/v1/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

> Arabic needs no special handling here — the query travels in a JSON body, not in a URL, so
> the curl encoding trap described above does not arise.

### Graph

| | |
|---|---|
| `GET /graph` | The network the app draws, as nodes + links. `?verse=&mode=&max_branch=&expand_words=&expand_verses=` |

`expand_words` takes `lookup@verseKey` pairs (e.g. `الكتب@2:255`), comma-separated —
the same identity the app uses. `links.ui` reproduces the whole thing in the browser.

---

## Recipes

```bash
API=https://ayat.network/api/v1

# Every āya containing the root كتب, as CSV
curl "$API/search/كتب?mode=root&limit=500&format=csv" -o kitab.csv

# What co-occurs with علم, by log-likelihood
curl -G "$API/analysis/collocations" --data-urlencode "q=علم" -d "mode=root&sort=ll&limit=20"

# Ibn Fāris on that root
curl "$API/lexicons/maqayis/علم"

# Everything about one āya
curl "$API/analysis/verse/2:255"

# Page through the whole corpus
curl "$API/verses?limit=500&offset=0"
```

Pull an answer *and* a shareable page in one go:

```bash
curl -s "$API/search/نور?mode=root&limit=1" | jq -r '.links.ui_distribution'
# → https://ayat.network/#s=…   (opens the by-sūrah distribution for نور)
```

---

## The explorer

`/api/v1/docs` is generated from the OpenAPI document, which is itself generated from the
route table — so it can never list an endpoint the server doesn't serve, or a parameter it
doesn't accept. No dependencies, no build step: three files in `server/explorer/` inlined
into one self-contained page.

- Every parameter becomes a typed control — segmented buttons for enums and booleans,
  number inputs carrying the real min/max, and **right-to-left text fields for Arabic**.
- Each endpoint carries worked examples; one click fills the form and runs it.
- Responses show status, timing, size and your remaining rate-limit budget, with the JSON
  as a collapsible tree (Arabic set RTL, URLs clickable, `links` folded).
- Every `ui…` link in the response appears as a button above the JSON — so you go from a
  query to the same thing on screen in one click.
- The URL bar shows the exact request with defaults omitted, ready to copy as curl.

## Running it yourself

The API has **no runtime npm dependencies** — it is `node:http` plus the app's own pure
modules (`src/analytics/*`, `src/graph/*`, `src/search.js`), which is what guarantees an
API answer and the on-screen answer are the same computation.

```bash
npm run data:build      # or the subset in README's Quick start — it needs public/data/
npm run api             # → http://localhost:8080/api/v1/
```

Alongside the Vite dev server, `npm run api:dev` points the `ui…` links at
`http://localhost:5173/`, and Vite proxies `/api` through to it — so a dev page and a
`curl` see one URL space.

### Configuration

| Variable | Default | |
|---|---|---|
| `API_PORT` / `API_HOST` | `8080` / `0.0.0.0` | |
| `API_DATA_DIR` | `<repo>/public/data` | Where the derived corpus JSON lives |
| `API_APP_BASE` | `https://ayat.network/` | Where the `ui…` links point |
| `API_PUBLIC_BASE` | `https://ayat.network/api/v1` | Used for `self` links + OpenAPI `servers` |
| `API_KEYS` | *(empty — open)* | Comma-separated `label:key` pairs |
| `API_RATE_LIMIT` | `600` | Per IP per window; `0` disables |
| `API_RATE_LIMIT_KEYED` | `6000` | Budget for requests carrying a valid key |
| `API_RATE_WINDOW_MS` | `3600000` | |
| `API_TRUST_PROXY` | `true` | Read the client IP from `X-Forwarded-For` |
| `API_MAX_LIMIT` / `API_DEFAULT_LIMIT` | `500` / `50` | |
| `API_CACHE_SECONDS` | `3600` | |
| `API_LOG` | `true` | |
| `API_MCP*` | | The MCP endpoint's own knobs — see [MCP.md](MCP.md#configuration) |

### Turning keys on

```bash
npm run api:key -- research-partner
# research-partner:ayat_9tK…
```

Put the whole line (comma-separate several) into `API_KEYS` on the API service and
restart. From then on every request needs `X-API-Key: ayat_9tK…` — the part after the
label — or `Authorization: Bearer …`, or `?api_key=…`. Nothing else changes: the same
paths, the same responses, and `/` reports `access.keys: "required"` so a client can
discover the requirement.

Labels are only for your own attribution in logs; they are not sent by callers.

---

## Attribution

The text is Tanzil's Uthmani Ḥafṣ; roots, lemmas and morphology come from the Quranic
Arabic Corpus (GPL); the lexicons are OpenITI digitisations (CC-BY-SA).
[`/sources`](https://ayat.network/api/v1/sources) returns the exact revisions and
checksums the running instance was built from — please cite those, not this API alone.
