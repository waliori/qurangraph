/* Strings for the getting-started guided tour (tour.*). Arabic is the source
 * language and the fallback. The tour is a scripted, end-to-end RESEARCH
 * walkthrough on Āyat al-Kursī (2:255): action steps WAIT for the user to do the
 * real thing. Qur'anic words / lexicon names are not translated. */
export const ar = {
  // Navigation / chrome
  "tour.start": "ابدأ الجولة التعريفية",
  "tour.back": "السابق",
  "tour.next": "التالي",
  "tour.done": "تمّ",
  "tour.skip": "تخطّي",
  "tour.skipStep": "تخطّي هذه الخطوة",
  "tour.close": "إغلاق الجولة",
  "tour.yourTurn": "دورك — جرّبها بنفسك",
  "tour.dontShow": "لا تُظهر هذه الجولة عند بدء التشغيل",
  "tour.progress": "{c} من {n}",
  "tour.ariaLabel": "جولة تعريفية بالميزات",

  // 0 — Welcome
  "tour.welcomeTitle": "أهلًا بك في آيات.network",
  "tour.welcomeBody": "هذه أداةٌ تعرض القرآنَ كشبكةٍ من الكلمات: تختار آيةً، فتُظهر لك الآياتِ الأخرى التي تشاركها كلماتها — روابط لغوية فقط، دون ترجمةٍ أو تفسير. لا تحتاج خلفيّةً مسبقة؛ سنمرّ معًا بمثالٍ واحد خطوةً خطوة.",

  // 1 — Basics (plain-language idea + diagram)
  "tour.basicsTitle": "الفكرة باختصار",
  "tour.basicsP1": "كل دائرة هي إمّا آيةٌ أو كلمةٌ واحدة.",
  "tour.basicsP2": "الدائرة الذهبية هي الآية التي اخترت، وحولها كلماتها. اضغط كلمةً فتمتدّ خطوطٌ إلى كل آيةٍ أخرى تَرِد فيها الكلمة نفسها. هكذا تتنقّل من آيةٍ إلى أخرى عبر الكلمات.",
  "tour.basicsVerse": "آية",
  "tour.basicsWord": "كلمة",
  "tour.basicsOther": "آيات أخرى",
  "tour.basicsAlt": "رسمٌ توضيحي: آيةٌ في المركز، وكلمةٌ تربطها بآياتٍ أخرى",

  // 1 — Colours / legend
  "tour.colorsTitle": "ماذا تعني الألوان؟",
  "tour.colorsBody": "قبل أن نبدأ، كل لونٍ في الشبكة يحمل معنى:",
  "tour.colCenter": "المركز — الآية المختارة",
  "tour.colWord": "لون الكلمة: زاهٍ = نادر، باهت = شائع",
  "tour.colVerse": "لون الآية: حسب العمق (بُعدها عن المركز)",
  "tour.colLink": "الرابط: أثخن وأزهى = كلمة أندر",
  "tour.colGreen": "نقطة خضراء = كلمة موسّعة",
  "tour.colPurple": "حلقة بنفسجية = آية موسّعة",

  // 2 — Search (explain)
  "tour.searchTitle": "البحث",
  "tour.searchBody": "هنا تبحث: اكتب كلمةً أو جذرًا أو صيغة، أو رقم آيةٍ مثل «2:255» للانتقال السريع. في الخطوة التالية سنستخدم قائمتي السورة والآية.",

  // 3 — Picker (ACTION: pick 2:255 — waits for both sūrah & āyah)
  "tour.pickerTitle": "اختر الآية المركزية",
  "tour.pickerBody": "اختر السورة ٢ (البقرة) ثم الآية ٢٥٥ من القائمتين لتنتقل إلى آية الكرسي. ستنتظر الجولة حتى تختار الاثنتين معًا.",

  // 4 — Modes (explain, pin Word)
  "tour.modesTitle": "أنماط الربط: كلمة · صيغة · جذر",
  "tour.modesBody": "هذه الأزرار تحدّد كيف تتجمّع الكلمات: «كلمة» (الرسم نفسه)، و«صيغة» (التصاريف)، و«جذر» (كل المشتقّات). سنبدأ بوضع «كلمة» لتكون الأعداد دقيقة.",

  // 5 — Graph intro (pan/zoom)
  "tour.graphTitle": "هذه آية الكرسي",
  "tour.graphBody": "العقدة الذهبية هي الآية، وحولها كلماتها. اسحب الخلفية للتحريك، وكبّر بالعجلة أو بإصبعين. (يمكنك سحب هذه البطاقة من المقبض ⋮⋮ إن غطّت شيئًا.)",

  // 6 — Tap ٱلسَّمَٰوَٰت
  "tour.tapSamawatTitle": "ابدأ بكلمة: ٱلسَّمَٰوَٰت",
  "tour.tapSamawatBody": "اضغط عقدة ٱلسَّمَٰوَٰت المضيئة في الشبكة لتوسيعها إلى آياتها وفتح لوحة تفاصيلها.",

  // 7 — Inspector
  "tour.inspectorTitle": "لوحة التفاصيل",
  "tour.inspectorBody": "ها هي التفاصيل: الجذر س-م-و، والصيغة، والتحليل الصرفي لهذا الموضع، والمعنى من معجمٍ عربيٍّ مع توثيق الطبعة.",

  // 8 — Switch dictionary
  "tour.dictTitle": "بدّل المعجم",
  "tour.dictBody": "غيّر المعجم من هذه القائمة لترى كيف يختلف الشرح بين لسان العرب ومقاييس اللغة والمفردات.",

  // 9 — Distribution
  "tour.distTitle": "أين ترد الكلمة؟",
  "tour.distBody": "اضغط «التوزيع»: ترد ٱلسَّمَٰوَٰت في نحو ١٨٠ آية (في وضع الكلمة)، وأكثر كلمةٍ تجاورها هي ٱلْأَرْض. تصفّح البيانات ثم أغلق النافذة لنُكمل.",

  // 10 — Compare
  "tour.compareTitle": "قارِن مصطلحين",
  "tour.compareBody": "اضغط «قارِن» لتضع ٱلسَّمَٰوَٰت بإزاء مصطلحٍ آخر (جرّب ٱلْأَرْض) عبر السور والمجاورات. أغلق النافذة لنُكمل.",

  // 11 — All verses
  "tour.allversesTitle": "كل الآيات",
  "tour.allversesBody": "اضغط «كل الآيات» لتصفّح كل آيةٍ ترد فيها الكلمة، مع تصدير CSV وكشّاف السياق (KWIC). أغلق النافذة لنُكمل.",

  // 12 — Tap كُرْسِيّ (rare)
  "tour.tapKursiTitle": "كلمة نادرة: كُرْسِيّ",
  "tour.tapKursiBody": "لاحظ كُرْسِيّ المضيئة — لونها زاهٍ لأنها نادرةٌ جدًّا (وردت في آيتين فقط في القرآن كلّه). اضغطها لتوسيعها.",

  // 13 — The other verse (38:34)
  "tour.kursiVerseTitle": "الآية الأخرى الوحيدة",
  "tour.kursiVerseBody": "وردت كُرْسِيّ في آيةٍ واحدةٍ أخرى فقط — «ص ٣٤». اضغط عقدة تلك الآية المضيئة لتفتح تفاصيلها وكلماتها المشتركة، ويمكنك جعلها مركزًا جديدًا.",

  // 14 — Root mode
  "tour.rootModeTitle": "بدّل إلى وضع «جذر»",
  "tour.rootModeBody": "اضغط «جذر». الآن تندمج يَعْلَمُ وعِلْمِه تحت جذرٍ واحد ع-ل-م، وتتّسع الشبكة لتشمل كل مشتقّات الجذر.",

  // 15 — Echoes
  "tour.echoesTitle": "المتشابهات",
  "tour.echoesBody": "افتح «المتشابهات» (⧉): تشارك آية الكرسي عبارة «لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ» مع نحو عشرين آية. أغلقها لنُكمل.",

  // 16 — Context
  "tour.contextTitle": "السياق",
  "tour.contextBody": "افتح «السياق» (☰) لتقرأ الآية داخل سورة البقرة كاملةً مع التمرير. أغلقها لنُكمل.",

  // 17 — Open tools
  "tour.toolsOpenTitle": "افتح قائمة الأدوات",
  "tour.toolsOpenBody": "اضغط زرّ ⚙ لفتح قائمة الأدوات.",

  // 18 — Try a tool
  "tour.toolsTryTitle": "جرّب أداة",
  "tour.toolsTryBody": "فعّل مثلًا «روابط نادرة فقط» لإبراز المفردات المميِّزة — أو بدّل محرّك الرسم. (إن غطّت البطاقةُ القائمةَ فاسحبها من المقبض ⋮⋮.)",

  // 19 — Save the view
  "tour.saveViewTitle": "احفظ المشهد",
  "tour.saveViewBody": "اضغط «✶» في شريط الأدوات السفلي لحفظ لقطةٍ من هذا المشهد. (وفيه أيضًا الملاءمة والتكبير ونسخ رابط الحالة الكاملة والتصدير صورةً.)",

  // 20 — Open workspace
  "tour.wsOpenTitle": "افتح مساحة العمل",
  "tour.wsOpenBody": "اضغط زرّ «✶» في الشريط العلوي لفتح مساحة العمل وترى ما حفظت.",

  // 21 — Workspace detail
  "tour.wsViewTitle": "مساحة العمل",
  "tour.wsViewBody": "ها هي لقطتك محفوظة. تتجمّع هنا كل محفوظاتك (كلمات، مقارنات، توزيعات، لقطات) مع ملاحظاتٍ حرّة وملاحظاتٍ لاصقة على العقد، وكلها في متصفّحك وقابلة للتصدير والاستيراد ملفًّا.",

  // 22 — Theme / language / offline
  "tour.themeTitle": "المظهر واللغة ودون اتصال",
  "tour.themeBody": "أخيرًا، بدّل المظهر بين الفاتح والداكن (واللغة من زرّها المجاور). والتطبيق قابل للتثبيت ويعمل دون إنترنت بعد أول زيارة.",

  // 23 — Finish
  "tour.finishTitle": "أتممت دراسةً كاملة!",
  "tour.finishBody": "بهذا تكون قد تتبّعت آيةً من بحثها اللغوي إلى حفظ نتائجها. أعد فتح الجولة في أيّ وقتٍ من زرّ «؟». استكشف بحرّية.",
};

export const en = {
  // Navigation / chrome
  "tour.start": "Take the tour",
  "tour.back": "Back",
  "tour.next": "Next",
  "tour.done": "Done",
  "tour.skip": "Skip",
  "tour.skipStep": "Skip this step",
  "tour.close": "Close tour",
  "tour.yourTurn": "Your turn — give it a try",
  "tour.dontShow": "Don't show this on startup",
  "tour.progress": "{c} of {n}",
  "tour.ariaLabel": "Feature tour",

  // 0 — Welcome
  "tour.welcomeTitle": "Welcome to آيات.network",
  "tour.welcomeBody": "This tool shows the Qur'an as a network of words: you pick a verse, and it reveals the other verses that share its words — linguistic links only, no translation or exegesis. No background needed; we'll walk through one example together, step by step.",

  // 1 — Basics (plain-language idea + diagram)
  "tour.basicsTitle": "The idea, in plain words",
  "tour.basicsP1": "Every circle is either a verse (āyah) or a single word.",
  "tour.basicsP2": "The gold circle is the verse you picked; the circles around it are its words. Tap a word and lines reach out to every other verse that contains the same word — that's how you travel from verse to verse.",
  "tour.basicsVerse": "verse (āyah)",
  "tour.basicsWord": "word",
  "tour.basicsOther": "other verses",
  "tour.basicsAlt": "Diagram: a centre verse, and a word linking it to other verses",

  // 1 — Colours / legend
  "tour.colorsTitle": "What the colours mean",
  "tour.colorsBody": "Before we start, every colour in the network carries meaning:",
  "tour.colCenter": "Centre — the selected verse",
  "tour.colWord": "Word colour: vivid = rare, muted = common",
  "tour.colVerse": "Verse colour: by depth (distance from centre)",
  "tour.colLink": "Link: thicker & brighter = rarer shared word",
  "tour.colGreen": "Green dot = an expanded word",
  "tour.colPurple": "Purple ring = an expanded verse",

  // 2 — Search (explain)
  "tour.searchTitle": "Search",
  "tour.searchBody": "Search here: type a word, root, or lemma — or a verse number like «2:255» to jump straight there. In the next step we'll use the sūrah/āyah menus.",

  // 3 — Picker (ACTION)
  "tour.pickerTitle": "Pick the centre verse",
  "tour.pickerBody": "Choose Sūrah 2 (al-Baqara), then Āyah 255, from the two menus to go to Āyat al-Kursī. The tour waits until you've picked both.",

  // 4 — Modes (explain, pin Word)
  "tour.modesTitle": "Linking modes: Word · Lemma · Root",
  "tour.modesBody": "These set how words group: «Word» (exact spelling), «Lemma» (inflections), «Root» (all derivatives). We'll start in Word mode so the counts are exact.",

  // 5 — Graph intro
  "tour.graphTitle": "This is Āyat al-Kursī",
  "tour.graphBody": "The gold node is the verse, ringed by its words. Drag the background to pan, zoom with the wheel or two fingers. (Drag this card by its ⋮⋮ handle if it covers anything.)",

  // 6 — Tap heavens
  "tour.tapSamawatTitle": "Start with a word: ٱلسَّمَٰوَٰت",
  "tour.tapSamawatBody": "Click the highlighted ٱلسَّمَٰوَٰت (the heavens) node to expand it into its verses and open its inspector.",

  // 7 — Inspector
  "tour.inspectorTitle": "The inspector",
  "tour.inspectorBody": "Here are the details: root س-م-و, lemma, the morphological analysis for this spot, and the meaning from an Arabic lexicon with an edition citation.",

  // 8 — Switch dictionary
  "tour.dictTitle": "Switch the dictionary",
  "tour.dictBody": "Change the lexicon from this dropdown to see how the gloss differs across Lisān al-ʿArab, Maqāyīs, and Mufradāt.",

  // 9 — Distribution
  "tour.distTitle": "Where does the word occur?",
  "tour.distBody": "Click «Distribution»: ٱلسَّمَٰوَٰت occurs in ~180 verses (in Word mode), and its top neighbour is ٱلْأَرْض (earth). Explore the data, then close the window to continue.",

  // 10 — Compare
  "tour.compareTitle": "Compare two terms",
  "tour.compareBody": "Click «Compare» to set ٱلسَّمَٰوَٰت against another term (try ٱلْأَرْض) across chapters and collocations. Close the window to continue.",

  // 11 — All verses
  "tour.allversesTitle": "All verses",
  "tour.allversesBody": "Click «All verses» to browse every āyah the word occurs in, with CSV export and a KWIC concordance. Close the window to continue.",

  // 12 — Tap كرسي (rare)
  "tour.tapKursiTitle": "A rare word: كُرْسِيّ",
  "tour.tapKursiBody": "Notice كُرْسِيّ — it's vividly coloured because it's very rare (only 2 verses in the whole Qur'an). Click it to expand it.",

  // 13 — The other verse (38:34)
  "tour.kursiVerseTitle": "Its only other verse",
  "tour.kursiVerseBody": "كُرْسِيّ appears in just one other verse — «Ṣād 34». Click that highlighted verse node to open its details and shared words; you can even make it the new centre.",

  // 14 — Root mode
  "tour.rootModeTitle": "Switch to «Root» mode",
  "tour.rootModeBody": "Click «Root». Now يَعْلَمُ and عِلْمِه merge under one root ع-ل-م, and the web widens to include all of the root's derivatives.",

  // 15 — Echoes
  "tour.echoesTitle": "Echoes (المتشابهات)",
  "tour.echoesBody": "Open «Echoes» (⧉): Āyat al-Kursī shares the phrase «لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ» with around twenty verses. Close it to continue.",

  // 16 — Context
  "tour.contextTitle": "Context",
  "tour.contextBody": "Open «Context» (☰) to read the verse within the full sūrat al-Baqara, scrollable. Close it to continue.",

  // 17 — Open tools
  "tour.toolsOpenTitle": "Open the Tools menu",
  "tour.toolsOpenBody": "Click the ⚙ button to open the Tools menu.",

  // 18 — Try a tool
  "tour.toolsTryTitle": "Try a tool",
  "tour.toolsTryBody": "Turn on e.g. «rare links only» to surface distinctive vocabulary — or switch the render engine. (If the card covers the menu, drag it by its ⋮⋮ handle.)",

  // 19 — Save the view
  "tour.saveViewTitle": "Save the view",
  "tour.saveViewBody": "Click «✶» in the bottom dock to save a snapshot of this view. (The dock also has fit/zoom, copy a full-state link, and image export.)",

  // 20 — Open workspace
  "tour.wsOpenTitle": "Open your Workspace",
  "tour.wsOpenBody": "Click the «✶» button in the top bar to open your Workspace and see what you saved.",

  // 21 — Workspace detail
  "tour.wsViewTitle": "Your Workspace",
  "tour.wsViewBody": "There's your snapshot. Everything you save collects here (words, comparisons, distributions, snapshots) with free notes and sticky notes pinned to nodes — all in your browser and exportable/importable as a file.",

  // 22 — Theme / language / offline
  "tour.themeTitle": "Theme, language & offline",
  "tour.themeBody": "Finally, toggle the theme between light and dark (and the language from its neighbouring button). The app is installable and works offline after your first visit.",

  // 23 — Finish
  "tour.finishTitle": "You completed a full study!",
  "tour.finishBody": "You just took a verse from its linguistic research all the way to saving your findings. Reopen the tour anytime from the «?» button. Explore freely.",
};
