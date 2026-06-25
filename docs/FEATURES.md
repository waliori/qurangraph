# Features — a user's guide

This is the end-user reference for **آيات.network / QuranGraph**. It walks through
the graph, the toolbar, every panel and modal, and the analysis views. For how
it's built, see [ARCHITECTURE.md](ARCHITECTURE.md); for where the data comes from,
[DATA.md](DATA.md).

---

## The core idea

You start on a **centre verse** (default 2:228). Its content words ring it as
**word nodes**. Click a word to *expand* it: every other verse that shares that
word (by the active mode) appears as a **verse node** linked to it. Expand a verse
to show *its* words, and keep going. The result is a live network of where the
Qurʾān reuses the same lexical material.

All links are lexical and reversible — nothing here is interpretive or a
translation.

### Node types

| Node | Looks like | Meaning |
|------|-----------|---------|
| **Centre** | gold, fixed at the middle | the current verse |
| **Word** | coloured by frequency | a content word of an expanded verse; a green dot marks it as expanded |
| **Verse** | coloured by depth (hops from centre) | a verse sharing the connecting word |
| **Overflow** (`+N`) | dashed aggregate | the verses the per-word cap hid — click to open the full occurrences list |

Edges are **rarity-weighted**: a rarer shared word draws a stronger, brighter
edge (it's a more meaningful link than sharing a very common word). Rarity is also
carried by stroke **width** and, for the high-signal tiers, a **dash** texture — so the
encoding reads without relying on colour.

---

## Grouping modes

Three buttons in the toolbar (Word · Lemma · Root) decide what "shares the same
word" means:

- **Word (exact surface form)** — links verses that contain the identical token.
- **Lemma (صيغة)** — groups inflections of one lemma (e.g. all forms of a verb)
  but keeps distinct derivations of a shared root apart.
- **Root (جذر)** — groups every word from the same triliteral root.

Roots and lemmas are **precomputed, not guessed** — they come from the Quranic
Arabic Corpus, aligned per occurrence. Words with no root (particles, proper
nouns) are shown but left ungrouped in root mode.

**Precision** (in the ⚙ tools popover) tunes exact matching: *loose* folds
near-identical spellings (آية/اية, ة↔ه, ى↔ي); *strict* keeps them distinct.

> Switching mode or precision resets the current exploration (it changes what the
> links *mean*).

---

## Toolbar

- **Brand / home** — recentres the view and clears the selection.
- **Search** — type a word, or a root/lemma in those modes, and jump to its
  occurrences. A direct verse reference works too (`2:255`, `٢:٢٥٥`, `2.255`,
  `2 255`). On a near-miss it offers a "did you mean …" suggestion instead of
  silently matching a different word.
- **Mode** — Word / Lemma / Root (above).
- **Sūrah / Āyah** selectors — pick the centre verse. The sūrah picker is a
  searchable combobox: type a number, an Arabic name, a Latin name, or a reference
  like `59:7`.
- **⚙ Tools** popover — see below.
- **Corpus-wide buttons** — **≣ Corpus explorer**, **⛓ Expressions explorer**,
  **⊞ Pairing matrix**, and **⚖ Claim board** (the claim badge shows its count).
  On narrow screens these (and the secondary tools) collapse into a single **⋯
  overflow menu** with labelled rows.
- **⌨ Arabic keyboard** — toggle the phonetic Latin→Arabic keyboard (also `Alt+K`);
  see *Arabic keyboard* below.
- **✶ Workspace** — open the saved-items + notes drawer (badge shows the count).
- **؟ Help** — the illustrated visual guide.
- **Language** — toggle Arabic ⇄ English (flips the whole UI RTL↔LTR).
- **Theme** — light ⇄ dark.

### ⚙ Tools popover

- **Verses per word** slider — caps how many āyāt each word fans out to. The
  ceiling tracks the busiest word on screen; beyond a soft cap (300) you must
  opt in to large fan-outs (they can tax weak devices).
- **Hide particles** (إخفاء حروف المعاني) — hide grammatical glue words.
- **Show loops** — draw the extra "loop" links when an already-placed verse also
  shares the current word.
- **Rare links only** — keep only the high-signal (rare-word) edges.
- **Precision** — loose / strict (above).
- **Morphology filter** — limit the graph to chosen parts of speech, verb Forms
  (I–X), aspects (perfect/imperfect/imperative), and voice (active/passive).
  An empty group means "no constraint". The active filter also prunes search and
  occurrence results.
- **Renderer** — SVG (default) or Canvas (faster for very large graphs).
- **Stop-word editor** — make the hidden-word layer visible and editable. Three
  groups: high-frequency **content** defaults (الله, رب…), your own **custom**
  words, and grammatical **particles** (only hidden when the master toggle is on).
  A gold chip = currently hidden; click to toggle. Add custom words inline.

### Arabic keyboard

A floating **phonetic keyboard** lets you type Arabic with Latin letters in *any*
field (search, filters, note bodies) — `noor → نور`. It has **three states**: off,
shown (the on-screen panel for diacritics and symbols is visible), and hidden
(typing still transliterates, but the panel folds to a small **edge badge** you can
**drag** anywhere). Toggle it with the **⌨** button or `Alt+K`. For the dotted
letters use an apostrophe: `t’ → ث`, `d’ → ذ`.

---

## On-canvas controls (bottom dock)

Fit-to-content · zoom in/out · clear selection · **undo / redo** exploration ·
collapse all · the expanded-words list · save graph to workspace · copy share
link · export **PNG** · export **SVG**. Buttons appear only when relevant (e.g.
undo only when there's history).

### Navigating

- **Drag background** — pan. **Wheel / pinch** — zoom. **Drag a node** — move it
  (it sticks where you drop it; its neighbours re-cluster around it live).
- **Click a word** (in the graph or in a verse) — expand it; click again to
  collapse it and its branches.
- **Click a verse node** — select it (shows the inspector); click again to expand
  its words.
- Mouse, touch, and pen are all supported.

### HUD & legend

Top-left chips show the node/link counts, the active mode, any morphology filter,
whether the graph is still *refining* (morphology loading), and whether the graph
is too big to embed an exact layout in a share link. The legend explains the
colour encodings.

---

## Inspector (selected node)

Selecting a node opens the inspector — a side panel on desktop, a slide-up sheet
on mobile.

**For a word**, it shows:

- Occurrence **count** and buttons: **all verses** (occurrences modal),
  **distribution**, **compare**, and **save** to workspace.
- **Lexicon meaning** — the active dictionary's gloss for the word's root, concise
  by default with a **show more** for the full article. A lexicon **switcher**
  lets you compare dictionaries; an edition **citation** (volume/page + editor/
  publisher) appears with a **⧉ Cite** button that exports BibTeX. Save the entry
  to the workspace with ★.
- **Morphology** — the corpus's per-occurrence analysis (POS, root, Form, aspect,
  voice, mood, person/gender/number/case, lemma). If this occurrence's root
  differs from the grouping root, a **homograph** note flags it.
- **Expressions** — the multi-word units this word's root takes part in (government
  frames, collocations, iḍāfa compounds) with counts; "see all" opens the
  Expressions explorer scoped to the root.
- The **source verse** the word was expanded from.

**For a verse**, it shows the highlighted text, the shared words, and actions:
show/collapse its words, **read in context**, **shared phrases**, **make centre**,
and **save**.

---

## Reading & analysis views

### Reader dock
The centre verse always sits in a dock at the bottom, with its words clickable.
Buttons: **⧉ shared phrases** and **☰ read in context**.

### Occurrences modal
Every āyah a word/root/lemma occurs in (current verse first, then muṣḥaf order),
virtualised so even thousands of hits scroll smoothly. Click a row to recentre.
Exports: verse list **CSV**, **KWIC** concordance CSV (key-word-in-context, ±5
words), and **JSON**.

### Context modal
Reads the whole sūrah with the centre verse highlighted; click any verse to
recentre.

### Distribution modal
How a term spreads across the 114 sūrahs (true token frequency — three hits in one
āyah count as three). A bar per sūrah (click to list that sūrah's occurrences),
plus a ranked **collocates** section (neighbouring words by count / PMI / signed
log-likelihood / log-dice, with a window control — whole-verse, ±1, or ±5 tokens,
and a left/right/symmetric asymmetry toggle; click to drill in), and a **direct
neighbours** section — the word
sitting *immediately* before / after / either side of the term across the whole
corpus (true adjacency / bigram frequency, counted per occurrence; particles kept,
since the immediate grammatical neighbour is the point here). Save to workspace;
export CSV/JSON.

### Compare modal
Two terms side by side (A ⇄ B), each with its own pick + mode. Paired
distribution bars per sūrah, and collocates split into shared / unique-to-A /
unique-to-B. Swap, save, export JSON.

### Phrases modal (المتشابهات)
Every maximal multi-word run the centre verse shares verbatim with other verses,
longest first, with the count of verses per phrase. Click to recentre; export CSV;
save to workspace.

### Definition modal
Opens a saved lexicon entry as a standalone reader: concise gloss, lazy-loaded
full article, citation, and BibTeX/RIS export.

---

## The analysis labs

Deeper, evidenced lenses — each surfaces **candidates** (every claim links to its verses);
the reader judges. Reached from a word/verse/sūra or the toolbar.

### Rhyme (الفاصلة)
A verse's ending sound, the sūrah's rhyme scheme strip, and the verses sharing it — matched
by the **full ending** or, more loosely, by the **rawiy** (الروي) consonant alone.

### Root lab
Lenses on one root: **derivation** (الصرف — derived words by Form/POS), **letter kinship**
(الاشتقاق الأكبر — anagram / shared-radical roots), **opposites** (الطباق — roots the Qurʾān sets
in antithesis, each evidenced by its verses, plus distributional near-synonyms), **semantic
neighbours** (shared-context meaning, with a small-corpus confidence cue), and **expressions**
(التعابير — the government frames, collocations, and iḍāfa constructs the root takes part in, each
opening its āyāt).

### Āya lab
A verse fingerprint (length, roots, POS mix, Forms, rhyme, rarest roots), the **most similar
verses** by shared-root cosine — with a **diff** toggle that shows exactly what a near-identical
verse changes — the **antithesis** attested at the verse (e.g. صدّق ↔ كذّب across 75:31–32), and
the **expressions in this verse** (the government / collocation / iḍāfa / idiom units it contains,
each highlighted in place).

### Sūra lab
Sūra altitude: profile (length, distinct roots, dominant rhyme, and the disjoined-letter
**muqaṭṭaʿāt** over-representation); **keyness** (distinctive roots vs the whole Qurʾān);
**cohesion** (topic boundaries); **structure** (verse×verse self-similarity heatmap + echoes);
**iltifāt** (the person/number-shift contour and turns); **bonds** (الأواصر); and **compare**
with another sūra.

### Corpus explorer (≣)
The bird's-eye view, six facets:

- **Frequency** — every root by token count, plus the **hapax legomena** (roots that
  occur once); switch between word / lemma / root matching.
- **Grammar** — a morphology catalogue ("every Form VIII verb", "every passive"),
  with the same advanced person/number/mood/case constraints as the graph filter.
- **Relations** — the **opposites** (ṭibāq) catalogue: all antithesis pairs, with a
  toggle between the curated list and machine-found **candidates**.
- **Look-alikes** (المتشابهات) — near-identical verse pairs across the whole corpus.
- **Rhetoric** — corpus-wide **oaths** (قسم) and **conditionals** (الشرط), each with
  its markers and verses.
- **Fields** — your saved **semantic fields**, each aggregated into one sūra-by-sūra
  distribution.

The **divine-names** (asmāʾ) index links the 99 names to their roots. Everything
exports (CSV / JSON).

### Expressions explorer (⛓)
Multi-word units, not single words — mined offline from the corpus morphology, four facets:

- **Government** (التعدية) — a head (verb / noun) and the **preposition** it governs, drawn as a
  heatmap matrix (rows = heads, columns = the nine ḥurūf al-jarr + a *bare* column, cells shaded by
  frequency). The sense shifts with the ḥarf — آمَنَ **بـ** "believe IN" vs آمَنَ **لـ**. Click a
  cell for its āyāt.
- **Collocations** (المصاحبات) — a verb and the nouns that recur with it (أقام الصلاة, آتى الزكاة,
  ملكت الأيمان), ranked by log-likelihood so tight units rise above diffuse pairings; grouped by verb.
- **Compounds** (الإضافة) — genitive constructs, including multi-word chains (مالك يوم الدين),
  grouped by their head noun.
- **Idioms** — a small **curated**, reviewed list of non-compositional expressions, matched to
  their verses.

Clicking any expression opens its leaf: the **āyāt** (the expression's own words highlighted), an
interactive **sūra-distribution** bar (hover to read a sūra, click to filter the list to it), the
**component roots** (open each in the root lab), and a **bidirectional** contrast (e.g. the other
verbs that take this noun). No translation anywhere — the occurrences carry the sense. The same
expressions also surface **inline** in the word inspector, the root lab, and the āya lab (below).

---

## Analysis workbench

Four tools that turn browsing into an argument — each built strictly on the corpus,
each evidenced by its verses.

- **Construction query** (الاستعلام التركيبي) — opened from the **Root lab** (⧉). Pin a
  root to ONE construction across four facets: verb **Form** (وزن), **voice**
  (معلوم↔مجهول), the **governed particle** it takes (بـ vs مع vs bare — the preposition
  inventory comes from the mined frames, with a free field for standalone particles like
  مع), and **object definiteness** (نكرة↔معرفة). It previews the live count and a
  by-particle split, then opens just those tokens in the concordance. This is the
  أشرك+بـ vs أشرك مع vs شركاء distinction in a few clicks.
- **Syntactic role** (الموقع التركيبي) — a toggle (⚖) on any occurrence list. Adds a
  per-row role chip and an aggregate breakdown (مضاف إليه · مفعول به · مرفوع · معطوف ·
  منادى · مجرور بحرف), inferred from the corpus's case tags plus local adjacency. It is
  an honest **heuristic** (the data ships case, not a full dependency treebank), labelled
  as such — for distinguishing, not deciding. Answers "is جنّ ever the muḍāf / the object
  of خلق?".
- **Pairing matrix** (مصفوفة الاقتران) — toolbar (⊞). A co-occurrence grid over a chosen
  set of terms, so the **empty cell is visible** — the جنّ↔إنس, جِنّة↔ناس, blank-جنّ↔جانّ
  move. Two axes (rows × cols) or a symmetric square; seed an axis from a **root's lemmas**
  or a saved **semantic field** in one click (field-vs-field co-occurrence). Every cell
  opens its shared verses with both terms highlighted.
- **Coding** (الترميز) — a toggle (🏷) on any occurrence list. Define categories (شرك في
  الملك / في العبادة …) and tag each verse, with live tallies per category. Your coding
  scheme travels in the workspace export.
- **Claim board** (لوحة الدعاوى) — toolbar (⚖). The ما يؤيد / ما يعارض ledger every study
  ends in: each claim a statement with two columns — **supporting** and **challenging**
  verses — every pin carrying its own gloss. Drop verses in from any concordance (⚐), then
  export the whole case to Markdown or JSON.

---

## Workspace (the notebook)

Everything is stored locally in your browser — nothing is ever uploaded. The drawer
has tabs for **Saved**, **Notes**, **Tags**, **Fields**, and **Groups**, and an
**export / import** of the whole workspace as **JSON** (backup or sharing).

- **Saved items** — graph snapshots, comparisons, occurrence lists, distributions,
  lexicon entries, verses, words, phrases, expressions, and pairing matrices. Filter
  by type, search by title/note, annotate, rename, reorder, delete, and re-open
  (each type reopens its own view).
- **Notes** — free-text title + body. **Pin** a note to the current graph and it
  becomes a **sticky note** floating over the canvas, anchored to a node (or the
  centre), tracking pan/zoom. Drag its grip, or nudge it with arrow keys; edit
  inline; ✕ unpins.
- **Tags** — colour-coded categories you create and assign to saved items and notes
  (the same scheme drives the **Coding** lens, below).
- **Fields** — named **semantic fields** (sets of roots) you build, reusable as an
  axis seed in the pairing matrix and as a facet in the corpus explorer.
- **Groups** — colour-coded folders to organise items, notes, tags, and fields.
- **Claims** from the claim board live here too, with their support/challenge
  ledgers, and travel in the JSON export.

---

## Sharing, history, offline

- **Copy link** encodes the entire state — centre verse, mode, precision, theme,
  lexicon, toggles, morphology filter, stop-word edits, the expanded set, the
  selection, the view transform, any **open analysis view** (a distribution, compare,
  lab, or explorer — so "distribution of ق-و-ل" is itself shareable), and (on small
  enough graphs) the **exact node positions** — into the URL hash. Open it elsewhere to
  reproduce the view. Saving a graph to the workspace captures the open analysis too.
- **Undo / redo** covers discrete exploration steps (centre, selection,
  expand/collapse) — `Ctrl/⌘+Z` / `Ctrl+Y`. Pan/zoom/hover are deliberately not
  recorded.
- **Offline** — after the first visit the app and any data you've touched are
  cached; it works without a network and is installable to the home screen.

## Accessibility

Modals trap focus and close on Escape; nodes carry descriptive screen-reader
labels (in both renderers); the UI is fully keyboard-navigable and respects the
active language's direction. The long occurrence/context lists are reachable
end-to-end by keyboard (arrow/Home/End/PageUp·Down move a roving cursor through the
virtualized rows), and on very large canvas graphs a filter box lets keyboard and
screen-reader users find any node by name.
