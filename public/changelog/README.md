# Changelog media

The "What's New" dialog (`src/changelog.js`) is a patch log: dated patches, themes
inside each. A change may carry `media: { desktop, mobile }` — a clip or screenshot.
Missing files hide silently (no broken image, no orphan label), so replace freely.

- Keep the **exact filenames** referenced from `changelog.js`; if you change an
  extension, update its `media:` ref.
- `.mp4` autoplay muted on a loop. Platform labels ("On desktop"/"On phone") show only
  when BOTH a desktop and a mobile asset exist.
- Captured headless via `puppeteer-core` + `ffmpeg`, driving either `vite dev` or the
  running container on :8088. Mobile clips use a 390px viewport (bottom-sheet layout).
  Keyboard clips seed `qg.keyboard='"shown"'` (JSON) so transliteration is active.

## Coverage: 39 of 47 changes have media (1 is a screenshot: `v0.2-roots.png`)

36 video files. Many features reached via the **word inspector** (click a node):
`inspector-desktop` (lexicons / Ibn Fāris / dictionary), `distribution-desktop`
(distribution + direct neighbours). Reader row: `surah-lab-desktop`, `verselab-desktop`,
`fasila-desktop`, `analysislab-desktop`, `minimal-pair-desktop`. Toolbar/modals: claims,
coding, role-lens, pairing, workspace, save, corpus, antonyms, valency, expressions(+idāfa),
sūra-picker, share, lemma, morphfilter, theme, language, tour, intro, notes, graph, etc.
Dual desktop+phone: claims, keyboard, phrase.

## The 8 still TEXT-ONLY (record + add a `media:` ref if wanted)

All genuinely abstract or buried — none has a single clean interaction to film:
- **No single UI moment:** snappier dialogs (1.5) · responsive toolbar (1.0) ·
  works offline / slide-up (0.3) · unified back button (1.6) · oaths & conditionals
  (1.6 — a corpus-explorer tab, no single gesture) · error resilience (1.4 fix).
- **Filmable but fiddly:** Arabic keyboard **draggable badge** (1.6 — the fab didn't read
  as a badge headless; drag the ⌨ edge fab manually) · citation export BibTeX/RIS (1.0 —
  the ⧉ buttons live in the word inspector's lexicon card / distribution modal).
