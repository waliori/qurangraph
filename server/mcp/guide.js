/* ═══ What the model is told before it calls anything ═══
 *
 * Two texts, and they are the highest-leverage part of this whole server.
 *
 * `INSTRUCTIONS` goes back on `initialize` and most clients paste it into the system
 * prompt. It is deliberately short: the rules that stop a wrong answer, nothing else.
 *
 * `GUIDE_MD` is the `ayat://guide` resource and the `corpus_info(topic:"conventions")`
 * answer — the fuller briefing, read once when a client wants the background.
 *
 * The Qurʾān is a corpus where a model's failure mode is not "I don't know" but a
 * confidently wrong āya number, an invented vocalization, or a lexicon quotation nobody
 * wrote. Every line below exists to convert one of those into a tool call.
 */

export const INSTRUCTIONS = `آيات.network exposes the Qurʾānic text (Ḥafṣ ʿan ʿĀṣim, from Tanzil), its word-by-word morphology (Quranic Arabic Corpus) and six classical Arabic dictionaries.

Rules for using it:
1. Never state a verse reference, quote Arabic, or give an occurrence count from memory. Get it from a tool call in this conversation, and quote the \`text\` field verbatim — do not re-type or re-vocalize it.
2. Before asserting that a passage is at a given reference, confirm it with \`locate_quotation\`.
3. There is NO translation and NO tafsīr here. Every connection this corpus makes is lexical — a shared surface form, lemma or root. If you offer an interpretation, mark it as yours, not as something the tool said.
4. Counts are token counts unless a field says \`verses\`. An āya using a root twice counts twice.
5. When a term resolves to something you did not expect, check \`term.resolved_from\` and \`term.alternatives\` and say which reading you took.
6. If a result carries \`truncated\` or a \`notes\` entry, the list is incomplete — say so rather than presenting it as exhaustive.
7. Every answer carries a \`ui\` link that opens the same view at ayat.network. Hand it to the user as the citation.`;

export const GUIDE_MD = `# آيات.network — corpus briefing

A read-only research corpus of the Qurʾān: the text, its morphology, its word / lemma / root
network, and six classical Arabic dictionaries. Same data and same computations as the app at
https://ayat.network and the HTTP API at https://ayat.network/api/v1.

## What is in it

| | |
|---|---|
| **Text** | The **Ḥafṣ ʿan ʿĀṣim** reading (the standard Uthmani text), from [Tanzil](https://tanzil.net). 114 sūrahs, 6236 āyāt, with the basmala counted as āyah 1 of al-Fātiḥah (Kufan/Ḥafṣ numbering). |
| **Morphology** | The Quranic Arabic Corpus: per-token root, lemma, part of speech, verb Form (وزن), aspect, voice, mood, person, gender, number, case. |
| **Lexicons** | al-ʿAyn (al-Khalīl b. Aḥmad) · al-Ṣiḥāḥ (al-Jawharī) · Maqāyīs al-Lugha (Ibn Fāris) · al-Muḥkam (Ibn Sīda) · Mufradāt (al-Rāghib) · Lisān al-ʿArab (Ibn Manẓūr). OpenITI digitisations, in Arabic, unglossed and untranslated. |
| **Derived** | Distribution, collocation (PMI / log-likelihood / logDice), adjacency, keyness, rhyme and fawāṣil, iltifāt, munāsabāt, near-identical āyāt (المتشابهات), curated antithesis (طباق), multi-word expressions. |

## What is NOT in it

- **No translation.** Nothing here renders the Qurʾān into English or any other language.
- **No tafsīr, no asbāb al-nuzūl, no hadith, no fiqh.**
- **No interpretive cross-referencing.** When this corpus links two āyāt, the link is *lexical* —
  they share a surface form, a lemma or a root. It is not a claim that they are thematically or
  doctrinally related. That reading is the researcher's to make, and should be attributed to them.
- **No qirāʾāt.** This edition carries the Ḥafṣ word graph only.

## Conventions

- **Verse keys** are \`surah:ayah\` — \`2:255\`. The sūrah half may be a number, its Arabic name
  (\`البقرة\`, or \`بقرة\` without the article), or a transliteration (\`al-baqarah\`, \`baqarah\`).
  Sūrah names are matched **exactly after normalisation, never fuzzily**: an unrecognised name is an
  error listing near spellings, not a guess at a different chapter.
- **\`mode\`** decides what counts as "the same word":
  \`exact\` = this surface spelling · \`lemma\` = this word in any inflection (صيغة) ·
  \`root\` = the whole triliteral family (جذر). Concept-level questions want \`root\`.
- **\`precision\`** — \`loose\` (default) folds orthographic variants such as آية/اية; \`strict\` keeps
  them distinct. Affects \`exact\` keys only.
- **Arabic input** may be vocalized Uthmani (\`ٱلصَّلَوٰة\`), plain imlāʾī (\`الصلاة\`), or Latin
  (\`salat\`, \`rahman\`). It runs through the same forgiving resolver as the app's search bar; a miss
  comes back with near-matches attached.
- **Counts** are *tokens* unless the field is named \`verses\`: an āya using a root twice counts twice.

## Using it accurately

1. **Quote, don't reconstruct.** Copy the \`text\` field exactly. Arabic orthography here is Uthmani
   and differs from conventional spelling in ways that matter (\`ٱلصَّلَوٰة\` vs \`الصلاة\`); re-typing it
   from memory produces a form that is not in the muṣḥaf.
2. **Verify every reference.** \`locate_quotation\` takes Arabic text and returns the āya it is.
   Use it before attributing a passage to a reference.
3. **Read the resolution.** A query is resolved forgivingly, which is what makes Latin and
   unvocalized input work — and what makes a wrong resolution possible. \`term.resolved_from\` shows
   what you typed, \`term.alternatives\` what else it could have been.
4. **Separate evidence from reading.** Government frames, collocations, keyness and semantic
   neighbours are distributional facts. "Therefore the Qurʾān means X" is an argument you are making.
5. **Cite the sources, not the tool.** \`corpus_info(topic:"sources")\` returns the exact upstream
   revisions and checksums this deployment was built from. Those are what a citation should name.

## Licensing

Text: Tanzil (Uthmani Ḥafṣ). Morphology, roots and lemmas: Quranic Arabic Corpus (GPL).
Lexicons: OpenITI digitisations (CC-BY-SA). Attribute them, and cite the revisions reported by
\`corpus_info(topic:"sources")\`.
`;
