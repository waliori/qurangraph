/* ═══ Prompts ═══
 *
 * Prompts are USER-controlled — they surface as slash commands or menu entries, invoked
 * deliberately. So they encode workflows rather than facts: the order of calls a careful
 * researcher would make, and the reporting discipline that keeps the answer honest
 * (quote verbatim, separate evidence from reading, name what is missing).
 *
 * Each is a single user-role message. That is enough: the tools are already described, and
 * a long scripted preamble would only compete with them.
 */

const text = (s) => ({ role: "user", content: { type: "text", text: s } });

export function buildPrompts() {
  const prompts = [
    {
      name: "verify_quotation",
      title: "Verify a Qurʾānic quotation",
      description: "Check whether a piece of Arabic really is in the Qurʾān, and if so exactly where.",
      arguments: [
        { name: "text", description: "The Arabic text to verify, in any spelling.", required: true },
      ],
      build: ({ text: t }) => ({
        description: "Locate and verify a quotation",
        messages: [text(
          `Verify this text against the Qurʾān:\n\n${t}\n\n`
          + "1. Call `locate_quotation` with it.\n"
          + "2. Report what came back precisely:\n"
          + "   · If `exact_verse_matches` is 0, say the text is NOT a complete āya, and describe what it "
          + "actually is — a fragment, or a passage spanning more than one āya.\n"
          + "   · If it is greater than 1, list every matching reference: the Qurʾān repeats the wording.\n"
          + "   · If nothing matched at all, say so plainly and do not guess a reference.\n"
          + "3. Quote the corpus `text` field verbatim beside what was given, and point out any difference "
          + "in wording — not merely in vocalization or orthography.\n"
          + "4. Give the `ui` link as the citation.\n\n"
          + "Do not supply a verse number from your own memory at any point.",
        )],
      }),
    },

    {
      name: "root_study",
      title: "Study a triliteral root",
      description: "Build a grounded picture of one root: its lexical sense, its derivational family, and how it is used.",
      arguments: [
        { name: "root", description: "The root, e.g. علم — or any word to resolve one from.", required: true },
        { name: "lexicon", description: "Which dictionary for the full article (ayn, sihah, maqayis, muhkam, mufradat, lisan). Defaults to maqayis.", required: false },
      ],
      build: ({ root, lexicon }) => ({
        description: `Study the root ${root}`,
        messages: [text(
          `Study the root ${root}.\n\n`
          + "1. `root_dossier` with sections [\"overview\", \"lexicons\", \"derivation\", \"distribution\"].\n"
          + `2. \`lexicon_entry\` for the full article — lexicon "${lexicon || "maqayis"}"`
          + (lexicon ? "" : " (Ibn Fāris organises each root around its core semantic principle, which suits this question)")
          + ".\n"
          + "3. `analyze_term` with analysis \"collocations\" to see what it keeps company with.\n"
          + "4. `analyze_term` with analysis \"expressions\" if it is a verb root, for the prepositions it governs.\n\n"
          + "Then write it up:\n"
          + "· Confirm which root the query actually resolved to, and mention any alternatives that were offered.\n"
          + "· Give the lexical sense from the dictionary in its own words. The article is classical Arabic; "
          + "if you translate it, say the translation is yours.\n"
          + "· Describe the derivational family and where the root concentrates in the muṣḥaf.\n"
          + "· Keep distributional evidence (collocation, government) separate from any claim about meaning "
          + "you draw from it.\n"
          + "· Quote every āya verbatim from the tool output, with its reference and `ui` link.",
        )],
      }),
    },

    {
      name: "verse_study",
      title: "Study one āya",
      description: "Read an āya closely: its structure, its rhyme, and its lexical relatives elsewhere in the text.",
      arguments: [
        { name: "verse_key", description: "The āya, e.g. 2:255 or البقرة:255.", required: true },
      ],
      build: ({ verse_key }) => ({
        description: `Study ${verse_key}`,
        messages: [text(
          `Study the āya ${verse_key}.\n\n`
          + "1. `analyze_verse` with sections [\"verse\", \"profile\", \"rhetoric\", \"similar_verses\", "
          + "\"shared_phrases\", \"near_identical\"].\n"
          + "2. `get_verses` for the two āyāt either side, so you can describe it in context.\n"
          + "3. If the profile names an unusual or rare root, follow it with `root_dossier`.\n\n"
          + "Then write it up:\n"
          + "· Quote the āya verbatim and give its reference.\n"
          + "· Describe its structure from the profile — length, parts of speech, verb Forms, rhyme and prosody.\n"
          + "· Report `similar_verses` as LEXICAL similarity (shared roots). Do not present it as thematic.\n"
          + "· Report `near_identical` twins, if any, as the المتشابهات they are.\n"
          + "· Offer no tafsīr. This corpus carries none; anything interpretive is yours and must be labelled so.",
        )],
      }),
    },

    {
      name: "compare_concepts",
      title: "Compare two terms",
      description: "Set two words or roots against each other and report what the text actually does with them.",
      arguments: [
        { name: "a", description: "First term, e.g. علم.", required: true },
        { name: "b", description: "Second term, e.g. جهل.", required: true },
      ],
      build: ({ a, b }) => ({
        description: `Compare ${a} and ${b}`,
        messages: [text(
          `Compare ${a} and ${b} as they are used in the Qurʾān.\n\n`
          + `1. \`compare_terms\` with a="${a}", b="${b}", mode "root".\n`
          + "2. `analyze_term` with analysis \"distribution\" for each, to see whether they cluster in "
          + "different parts of the muṣḥaf.\n"
          + "3. `analyze_term` with analysis \"opposites\" on each, to see whether the pair is already in the "
          + "curated antithesis catalogue.\n\n"
          + "Then write it up:\n"
          + "· Give both frequencies, and say whether they are token or verse counts.\n"
          + "· Quote a few of the shared āyāt verbatim. If there are none, say so — an absence is a finding here.\n"
          + "· Contrast the collocates each attracts that the other does not.\n"
          + "· Be explicit about which statements are counts from the corpus and which are your interpretation.",
        )],
      }),
    },

    {
      name: "surah_overview",
      title: "Overview of a sūrah",
      description: "Characterise a sūrah from its own statistics rather than from recollection.",
      arguments: [
        { name: "surah", description: "Number (1–114), Arabic name, or transliteration.", required: true },
      ],
      build: ({ surah }) => ({
        description: `Overview of sūrah ${surah}`,
        messages: [text(
          `Give an evidence-based overview of sūrah ${surah}.\n\n`
          + "1. `analyze_surah` with sections [\"profile\", \"muqattaat\", \"keyness\", \"cohesion\", "
          + "\"rhyme\", \"munasabat\"].\n"
          + "2. `get_surah` with `include_verses: false` for the header, then read the opening āyāt if the "
          + "sūrah is short enough to quote.\n\n"
          + "Then write it up:\n"
          + "· Report its size, its disjoined opening letters if any, and its rhyme scheme.\n"
          + "· Present the keyness list as what it is: the roots statistically over-represented here against "
          + "the whole Qurʾān. It is a lexical signal, not a statement of theme — say that, then offer your "
          + "own reading separately if you have one.\n"
          + "· Use the cohesion dips to point at where the sūrah changes direction, and quote the āyāt at "
          + "those seams verbatim.\n"
          + "· Report the munāsabāt as the seam evidence they are.",
        )],
      }),
    },
  ];

  return {
    list: () => prompts.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })),
    get(name, args = {}) {
      const p = prompts.find((x) => x.name === name);
      if (!p) return null;
      for (const arg of p.arguments) {
        if (arg.required && !String(args?.[arg.name] ?? "").trim()) {
          const e = new Error(`Prompt "${name}" requires the argument "${arg.name}".`);
          e.validation = true;
          throw e;
        }
      }
      return p.build(args);
    },
    names: () => prompts.map((p) => p.name),
    argsOf: (name) => prompts.find((x) => x.name === name)?.arguments || [],
  };
}
