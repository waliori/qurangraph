/* ═══ Resources ═══
 *
 * Tools are model-controlled — the model decides to call one. Resources are
 * APPLICATION-controlled: the client (or the user) attaches them to the context. The split
 * here follows that distinction rather than convenience.
 *
 * The fixed resources are the things a client should be able to pin ONCE for a whole
 * session and never re-fetch: the briefing on what this corpus is, the 114-sūrah index, the
 * provenance manifest, the lexicon catalogue. Pinning `ayat://guide` at the start of a
 * research session is the single cheapest accuracy intervention available here.
 *
 * The templates (`ayat://verse/{verse_key}`, `ayat://root/{root}`) let a client cite a
 * specific āya or root as an attachment rather than as tool output — which is what a
 * research UI wants when the user pastes a reference.
 */

import { GUIDE_MD } from "./guide.js";
import { seg } from "./invoke.js";
import { bare, slimLinks } from "./shape.js";

const JSON_MIME = "application/json";
const MD_MIME = "text/markdown";

export function buildResources({ invoke }) {
  const json = (v) => JSON.stringify(v, null, 2);

  /* Fixed resources: uri → { name, title, description, mimeType, load() }. */
  const fixed = new Map([
    ["ayat://guide", {
      name: "corpus-guide",
      title: "Corpus briefing — what this is, and how to use it accurately",
      description: "What the corpus contains and (importantly) what it does not: no translation, no "
        + "tafsīr, no interpretive cross-referencing. Also the conventions — verse keys, sūrah naming, "
        + "grouping modes, precision — and the rules for citing it without overstating it. "
        + "Worth attaching once at the start of any session that will quote the Qurʾān.",
      mimeType: MD_MIME,
      load: async () => GUIDE_MD,
    }],
    ["ayat://corpus/surahs", {
      name: "surah-index",
      title: "The 114 sūrahs",
      description: "Every sūrah with its number, Arabic name, āya count and disjoined opening letters. "
        + "Small, and it removes a whole class of numbering mistakes.",
      mimeType: JSON_MIME,
      load: async () => {
        const r = await invoke("/surahs");
        return json(bare(r.data || []));
      },
    }],
    ["ayat://corpus/sources", {
      name: "provenance",
      title: "Provenance — upstream revisions and checksums",
      description: "The exact corpora, revisions and checksums this deployment was built from. This is "
        + "what a citation should name, rather than the API.",
      mimeType: JSON_MIME,
      load: async () => json((await invoke("/sources")).data),
    }],
    ["ayat://corpus/coverage", {
      name: "coverage",
      title: "Morphological coverage",
      description: "What fraction of tokens carry a root or lemma analysis — the bound on what any "
        + "root-based aggregate in this corpus can claim.",
      mimeType: JSON_MIME,
      load: async () => json((await invoke("/coverage")).data),
    }],
    ["ayat://corpus/lexicons", {
      name: "lexicons",
      title: "The six classical dictionaries",
      description: "al-ʿAyn, al-Ṣiḥāḥ, Maqāyīs, al-Muḥkam, Mufradāt and Lisān al-ʿArab, with their "
        + "editions, licences and root coverage.",
      mimeType: JSON_MIME,
      load: async () => json(bare((await invoke("/lexicons")).data)),
    }],
  ]);

  /* A URI's captured variable may or may not be percent-encoded — clients differ, and
   * `ayat://verse/البقرة:255` is perfectly legal written out. A malformed escape is not a
   * server fault, so take the raw text rather than throwing. */
  const unescape = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

  /* Templates. `match` returns the captured variable, or null. */
  const templates = [
    {
      uriTemplate: "ayat://verse/{verse_key}",
      name: "verse",
      title: "One āya",
      description: "A single āya by key — `ayat://verse/2:255`. The sūrah half may be a name "
        + "(`ayat://verse/البقرة:255`). Returns the Uthmani text with per-token root, lemma and morphology.",
      mimeType: JSON_MIME,
      match: (uri) => {
        const m = /^ayat:\/\/verse\/(.+)$/.exec(uri);
        return m ? unescape(m[1]) : null;
      },
      load: async (key) => json(slimLinks((await invoke(`/verses/${seg(key)}`, { words: true })).data)),
    },
    {
      uriTemplate: "ayat://root/{root}",
      name: "root",
      title: "One root's dossier",
      description: "A triliteral root — `ayat://root/علم`. Its counts, its distribution across the "
        + "sūrahs, its derivational family and the concise gloss from each dictionary that has an entry.",
      mimeType: JSON_MIME,
      match: (uri) => {
        const m = /^ayat:\/\/root\/(.+)$/.exec(uri);
        return m ? unescape(m[1]) : null;
      },
      load: async (root) => {
        const r = await invoke(`/roots/${seg(root)}`, { limit: 5 });
        const d = r.data;
        return json(slimLinks({
          term: d.term,
          distribution: bare(d.distribution),
          derivation: bare((d.derivation || []).slice(0, 40)),
          lexicons: bare(d.lexicons),
          sample_verses: d.verses,
        }));
      },
    },
  ];

  return {
    list() {
      return [...fixed.entries()].map(([uri, r]) => ({
        uri, name: r.name, title: r.title, description: r.description, mimeType: r.mimeType,
      }));
    },

    listTemplates() {
      return templates.map(({ uriTemplate, name, title, description, mimeType }) =>
        ({ uriTemplate, name, title, description, mimeType }));
    },

    /* Returns the `contents` array for resources/read, or null when the URI is unknown. */
    async read(uri) {
      const f = fixed.get(uri);
      if (f) return [{ uri, name: f.name, title: f.title, mimeType: f.mimeType, text: await f.load() }];
      for (const t of templates) {
        const captured = t.match(uri);
        if (captured == null) continue;
        return [{ uri, name: `${t.name}:${captured}`, title: t.title, mimeType: t.mimeType, text: await t.load(captured) }];
      }
      return null;
    },

    knownUris: () => [...fixed.keys(), ...templates.map((t) => t.uriTemplate)],
  };
}
