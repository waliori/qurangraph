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
  "tour.textSmaller": "نص أصغر",
  "tour.textLarger": "نص أكبر",
  "tour.minimize": "تصغير البطاقة (للتفاعل مع التطبيق)",
  "tour.expand": "إعادة فتح البطاقة",
  "tour.yourTurn": "دورك — جرّبها بنفسك",
  "tour.dragHint": "💡 اسحب هذه البطاقة من شريطها العلويّ لتحريكها، أو صغّرها بزرّ «—» للتفاعل مع التطبيق ثم أعِدها.",
  "tour.dontShow": "لا تعرض هذه الجولة عند فتح التطبيق",
  "tour.progress": "{c} من {n}",
  "tour.ariaLabel": "جولة تعريفية بالميزات",

  // 0 — Welcome
  "tour.welcomeTitle": "أهلًا بك في آيات.network",
  "tour.welcomeBody": "هذه الأداة تعرض القرآن كشبكة من الكلمات: تختار آية، فتظهر لك الآيات الأخرى التي تشترك معها في الكلمات — روابط لغوية فقط، بلا ترجمة أو تفسير. لا تحتاج إلى معرفة سابقة؛ سنشرح كل شيء بمثال واحد. وحين تفتح الجولة نافذةً، فهي للاطّلاع فقط: اقرأها ثم أغلقها (✕) لتُكمل. ويمكنك سحب هذه البطاقة من شريطها العلوي إن غطّت شيئًا، ومن الأعلى أيضًا تبدّل السمة واللغة وحجم النص.",

  // 1 — Basics (plain-language idea + diagram)
  "tour.basicsTitle": "الفكرة باختصار",
  "tour.basicsP1": "كل دائرة هي آية أو كلمة واحدة.",
  "tour.basicsP2": "الدائرة الذهبية هي الآية التي اخترتها، والدوائر حولها كلماتها. اضغط على كلمة، فتظهر خطوط تصل إلى كل آية أخرى ترد فيها الكلمة نفسها. هكذا تنتقل من آية إلى أخرى عبر الكلمات.",
  "tour.basicsVerse": "آية",
  "tour.basicsWord": "كلمة",
  "tour.basicsOther": "آيات أخرى",
  "tour.basicsAlt": "رسمٌ توضيحي: آيةٌ في المركز، وكلمةٌ تربطها بآياتٍ أخرى",

  // 1 — Colours / legend
  "tour.colorsTitle": "ماذا تعني الألوان؟",
  "tour.colorsBody": "قبل أن نبدأ، لكل لون في الشبكة معنى:",
  "tour.colCenter": "المركز — الآية المختارة",
  "tour.colWord": "لون الكلمة: زاهٍ = نادر، باهت = شائع",
  "tour.colVerse": "لون الآية: حسب بُعدها عن المركز",
  "tour.colLink": "الرابط: كلما كان أعرض وأزهى كانت الكلمة أندر",
  "tour.colGreen": "نقطة خضراء = كلمة موسّعة",
  "tour.colPurple": "حلقة بنفسجية = آية موسّعة",

  // 2 — Search (explain; read-only during the tour)
  "tour.searchTitle": "البحث",
  "tour.searchBody": "هذا شريط البحث: تكتب فيه كلمة أو جذرًا أو رقم آية مثل «2 255» أو «2:255» للانتقال إليها مباشرة. وهو معطّل الآن في الجولة — سنستخدم قائمتَي السورة والآية في الخطوة التالية.",

  // 3 — Picker (ACTION: pick 2:255 — waits for both sūrah & āyah)
  "tour.pickerTitle": "اختر الآية المركزية",
  "tour.pickerBody": "اختر السورة ٢ (البقرة)، ثم الآية ٢٥٥ من القائمتين، لتنتقل إلى آية الكرسي. لن تُكمل الجولة حتى تختار الاثنتين.",

  // 4 — Modes (explain, pin Word)
  "tour.modesTitle": "أنماط الربط: كلمة · صيغة · جذر",
  "tour.modesBody": "هذه الأزرار تحدّد طريقة تجميع الكلمات: «كلمة» (الرسم نفسه)، و«صيغة» (التصاريف)، و«جذر» (كل المشتقّات). سنبدأ بوضع «كلمة» لتكون الأعداد دقيقة.",

  // 5 — Graph intro (pan/zoom)
  "tour.graphTitle": "هذه آية الكرسي",
  "tour.graphBody": "العقدة الذهبية هي الآية، والكلمات حولها. اسحب الخلفية لتحريك الشبكة، وكبّرها بعجلة الفأرة أو بإصبعين. (إن غطّت هذه البطاقة شيئًا، فاسحبها من شريطها العلوي.)",

  // 6 — Tap ٱلْأَرْض (select)
  "tour.tapEarthTitle": "ابدأ بكلمة: ٱلْأَرْض",
  "tour.tapEarthBody": "اضغط على عقدة ٱلْأَرْض المضيئة لتحديدها وفتح لوحة تفاصيلها.",

  // 6b — Re-click to fan out its verses
  "tour.fanOutTitle": "فرّع آياتها",
  "tour.fanOutBody": "اضغط على ٱلْأَرْض مرّةً أخرى لتتفرّع آياتها حولها وتظهر في الشبكة.",

  // 6c — Drag the earth node (children follow)
  "tour.dragZoomTitle": "اسحب ٱلْأَرْض",
  "tour.dragZoomBody": "صغّرنا العرض قليلًا لترى آيات ٱلْأَرْض المتفرّعة. الآن اسحب عقدة ٱلْأَرْض نفسها لتحريكها، فتتحرّك معها آياتها المتفرّعة عنها.",

  // 7 — Inspector
  "tour.inspectorTitle": "لوحة التفاصيل",
  "tour.inspectorBody": "هذه هي التفاصيل: الجذر أ-ر-ض، والصيغة، والتحليل الصرفي في هذا الموضع، والمعنى من معجم عربي مع ذكر الطبعة.",

  // 8 — Switch dictionary
  "tour.dictTitle": "بدّل المعجم",
  "tour.dictBody": "بدّل المعجم من هذه القائمة لترى اختلاف الشرح بين لسان العرب ومقاييس اللغة والمفردات.",

  // 9 — Distribution
  "tour.distTitle": "أين ترد الكلمة؟",
  "tour.distBody": "اضغط على «التوزيع»: ترد ٱلْأَرْض في نحو ٢٧٥ آية (في وضع الكلمة)، وأكثر كلمة تجاورها هي ٱلسَّمَٰوَٰت. تصفّح البيانات، ثم أغلق النافذة لنُكمل.",

  // 10 — Compare
  "tour.compareTitle": "قارِن مصطلحين",
  "tour.compareBody": "اضغط على «قارِن» لتفتح نافذة المقارنة، ثم اكتب «ٱلسَّمَٰوَٰت» في خانة المصطلح الثاني واضغط «تعيين» لتقارنها بـ ٱلْأَرْض عبر السور والكلمات المجاورة. تصفّح النتيجة، ثم أغلق النافذة لنُكمل.",

  // 11 — All verses
  "tour.allversesTitle": "كل الآيات",
  "tour.allversesBody": "اضغط على «كل الآيات» لتصفّح كل آية ترد فيها الكلمة، مع إمكانية تصدير CSV وكشّاف السياق (KWIC). أغلق النافذة لنُكمل.",

  // 12 — Tap كُرْسِيّ (rare)
  "tour.tapKursiTitle": "كلمة نادرة: كُرْسِيّ",
  "tour.tapKursiBody": "لاحظ كلمة كُرْسِيّ المضيئة — لونها زاهٍ لأنها نادرة جدًّا (وردت في آيتين فقط في القرآن كلّه). اضغط عليها لتتوسّع.",

  // 13 — The other verse (38:34)
  "tour.kursiVerseTitle": "الآية الأخرى الوحيدة",
  "tour.kursiVerseBody": "وردت كُرْسِيّ في آية واحدة أخرى فقط — «ص ٣٤». اضغط على عقدة تلك الآية المضيئة لتفتحها.",
  "tour.kursiVerseDetailTitle": "تفاصيل الآية الأخرى",
  "tour.kursiVerseDetailBody": "هذه تفاصيل «ص ٣٤»: نصّها، والكلمة المشتركة (كُرْسِيّ)، وزرّ «اجعلها مركزًا» لتبدأ استكشافًا جديدًا منها. اضغط «التالي» حين تنتهي.",

  // 14 — Root mode
  "tour.rootModeTitle": "بدّل إلى وضع «جذر»",
  "tour.rootModeBody": "اضغط على «جذر». الآن تندمج يَعْلَمُ وعِلْمِه تحت جذر واحد ع-ل-م، وتتّسع الشبكة لتشمل كل مشتقّات الجذر.",

  // 15 — Echoes
  "tour.echoesTitle": "المتشابهات",
  "tour.echoesBody": "افتح «المتشابهات» (⧉): تشترك آية الكرسي في عبارة «لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ» مع نحو عشرين آية. أغلقها لنُكمل.",

  // 16 — Context
  "tour.contextTitle": "السياق",
  "tour.contextBody": "افتح «السياق» (☰) لتقرأ الآية داخل سورة البقرة كاملة، مع إمكانية التمرير. أغلقها لنُكمل.",
  "tour.exprTitle": "كشّاف التعابير",
  "tour.exprBody": "افتح كشّاف التعابير (⛓): التراكيب لا الكلمات المفردة — تعدية الأفعال بحروف الجر (مصفوفة)، والمصاحبات، والإضافات، والتعابير الثابتة. وتظهر أيضًا في بطاقة الكلمة ومختبر الجذر والآية. أغلقها لنُكمل.",

  // 17 — Open tools
  "tour.toolsOpenTitle": "افتح قائمة الأدوات",
  "tour.toolsOpenBody": "اضغط زرّ ⚙ لفتح قائمة الأدوات.",

  // 18 — Try a tool
  "tour.toolsTryTitle": "جرّب أداة",
  "tour.toolsTryBody": "فعّل مثلًا «روابط نادرة فقط» لإبراز الكلمات المميّزة — أو بدّل محرّك الرسم. (إن غطّت البطاقة القائمة، فاسحبها من شريطها العلوي.)",

  // 19 — Save the view
  "tour.saveViewTitle": "احفظ المشهد",
  "tour.saveViewBody": "اضغط على «✶» في الشريط السفلي لحفظ لقطة من هذا المشهد إلى مساحة العمل. وسنتعرّف على بقية أزرار الشريط بعد قليل.",

  // 19b — Share a state link (+ the dock buttons)
  "tour.shareLinkTitle": "شارِك المشهد برابط",
  "tour.shareLinkBody": "الشريط السفلي يضبط العرض: الملاءمة (⤢)، والتكبير (＋ －)، وحفظ المشهد (✶). واضغط زرّ الرابط (⎘) لنسخ رابطٍ يفتح هذه الحالة بالضبط، فتشاركه ليرى غيرُك ما تراه. اضغطه الآن.",

  // 19c — Download an image
  "tour.downloadTitle": "نزّل صورة",
  "tour.downloadBody": "اضغط زرّ التنزيل (⤓) لحفظ صورة PNG للشبكة على جهازك (وزرّ «❖» يصدّرها SVG متّجهة). جرّبه الآن.",

  // 20 — Open workspace
  "tour.wsOpenTitle": "مساحة العمل",
  "tour.wsOpenBody": "هذه مساحة العمل: كلّ ما تحفظه — كلمات وتعابير ودعاوى وملاحظات — يتجمّع هنا، ويمكنك تصديره أو استيراده لاحقًا.",

  // 21 — Workspace detail
  "tour.wsViewTitle": "مساحة العمل",
  "tour.wsViewBody": "ها هي لقطتك محفوظة. تتجمّع هنا كل محفوظاتك (كلمات، ومقارنات، وتوزيعات، ولقطات) مع ملاحظات حرّة وملاحظات لاصقة على العقد. لا خادمَ هنا ولا حساب: كل شيء يُحفظ في متصفّحك وحده — فإن مسحت بيانات المتصفّح زالت محفوظاتك. لذا صدّرها ملفًّا للاحتفاظ بها أو نقلها إلى جهاز آخر.",

  // 21b — Help dialog (open & close)
  "tour.helpTitle": "المساعدة والدليل",
  "tour.helpBody": "اضغط زرّ «؟» لفتح دليل الاستخدام السريع، ثم أغلقه لنُكمل. تجد فيه شرحًا موجزًا، ومنه تعيد فتح هذه الجولة في أيّ وقت.",

  // 22 — Theme / language / offline
  "tour.themeTitle": "المظهر واللغة ودون اتصال",
  "tour.themeBody": "أخيرًا، بدّل المظهر بين الفاتح والداكن (وبدّل اللغة من الزرّ المجاور). والتطبيق قابل للتثبيت، ويعمل دون إنترنت بعد أول زيارة.",

  // Mobile-only: describe the word panel's analysis (no modal chain on phones)
  "tour.dictMTitle": "معجم الكلمة وتحليلها",
  "tour.dictMBody": "لوحة الكلمة تعرض معناها من ستّة معاجم كلاسيكية (اضغط «المقالة كاملة» للنصّ الكامل)، مع أزرار: توزيعها على السور، ومقارنتها بكلمةٍ أخرى، وكلّ آياتها. ومن شريط القراءة بالأسفل: العبارات المشتركة (المتشابهات)، والفاصلة، والسياق.",
  // Mobile show-&-tell: the tour opens each of these for you
  "tour.corpusTitle": "كشّاف القرآن",
  "tour.corpusBody": "هذه نافذة «كشّاف القرآن»: تصفّح تكرار الكلمات وصرفها وأضدادها، والآيات المتشابهة، والقَسَم والشرط عبر المصحف كاملًا. (فتحناها لك من القائمة المنسدلة.)",
  "tour.claimsTitle": "لوحة الدعاوى",
  "tour.claimsBody": "وهذه «لوحة الدعاوى»: اطرح قراءةً ثمّ أرفِق آياتٍ تؤيّدها أو تعارضها لبناء حجّةٍ بالشواهد.",
  "tour.mMenusTitle": "قوائم منزلقة على الهاتف",
  "tour.mMenusBody": "على الهاتف تتجمّع الأدوات الإضافية خلف زرّ «المزيد»، وتنزلق القوائم من الأسفل. منها تصل إلى مصفوفة الاقتران والكشّافات ولوحة الدعاوى.",
  "tour.mKeyboardTitle": "لوحة المفاتيح العربية",
  "tour.mKeyboardBody": "اكتب العربية بحروفٍ لاتينية في أيّ حقل: تظهر لوحةٌ على الشاشة وتُحوَّل كتابتك فورًا (مثل noor ← نور).",
  "tour.mSheetTitle": "نوافذ قابلة للتكبير",
  "tour.mSheetBody": "تفتح النوافذ بارتفاعٍ جزئيّ على الهاتف؛ اسحب شريطها العلويّ لأعلى لملء الشاشة، أو لأسفل لإغلاقها.",

  // Mobile-only variants — the show-and-tell tour reuses several desktop steps, but their
  // copy was written for clicking/hovering; these phrasings fit the phone (auto-advance,
  // touch, the «More» menu) without changing the desktop tour's wording.
  "tour.welcomeMTitle": "أهلًا بك في آيات.network",
  "tour.welcomeMBody": "هذه الأداة تعرض القرآن كشبكةٍ من الكلمات: تختار آية، فتظهر الآيات الأخرى التي تشاركها كلماتها — روابط لغويّة فقط، بلا ترجمةٍ أو تفسير. لا تحتاج خلفيّةً مسبقة؛ سنمرّ معًا على مثالٍ واحد. حين تفتح الجولة شيئًا فهو للاطّلاع فقط — اقرأه ثمّ انقر «التالي». اسحب هذه البطاقة من شريطها العلويّ أو صغّرها (—) للوصول إلى التطبيق تحتها؛ ومن الأعلى تبدّل السمة واللغة وحجم النصّ.",
  "tour.searchMTitle": "البحث",
  "tour.searchMBody": "حقل البحث: اكتب كلمةً أو جذرًا أو رقم آيةٍ مثل «2:255» للانتقال إليها مباشرةً. (حمّلنا لك آية الكرسيّ.)",
  "tour.graphMTitle": "هذه آية الكرسي",
  "tour.graphMBody": "العقدة الذهبية هي الآية، تحيط بها كلماتها. اسحب الخلفية للتحريك، وقرّب بإصبعين للتكبير.",
  "tour.exprMTitle": "كشّاف التعابير",
  "tour.exprMBody": "كشّاف التعابير: وحداتٌ من عدّة كلماتٍ لا كلماتٍ مفردة — الأفعال وحروف جرّها (كمصفوفة)، والمصاحبات، والإضافات، والتعابير الاصطلاحية. وتظهر أيضًا داخل بطاقة الكلمة وكشّاف الجذر وكشّاف الآية.",
  "tour.workbenchMTitle": "ورشة البحث",
  "tour.workbenchMBody": "هناك ورشة بحثٍ كاملة — لوحة الدعاوى (⚖)، وعدسات الترميز والإعراب داخل قوائم المواضع، ومصفوفة الاقتران (⊞)، وكشّاف القرآن (≣). تصل إليها من قائمة «المزيد».",

  // Research workbench (newer features, summarised)
  "tour.workbenchTitle": "ورشة البحث",
  "tour.workbenchBody": "وراء ما رأيت، يقدّم التطبيق ورشةً أعمق: «لوحة الدعاوى» (⚖) لبناء حجّةٍ بشواهد مؤيِّدة ومعارِضة، وعدسات الترميز والإعراب في قوائم المواضع، و«مصفوفة الاقتران» (⊞)، و«كشّاف القرآن» (≣) لتصفّح التكرار والصرف والأضداد والقَسَم والشرط عبر المصحف. جرّبها من شريط الأدوات.",

  // 23 — Finish
  "tour.finishTitle": "أتممت دراسة كاملة!",
  "tour.finishBody": "بهذا تكون قد تتبّعت آية من بحثها اللغوي إلى حفظ نتائجها. أعد فتح الجولة في أيّ وقت من زرّ «؟». واصل الاستكشاف بحرّية.",
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
  "tour.textSmaller": "Smaller text",
  "tour.textLarger": "Larger text",
  "tour.minimize": "Minimize card (to use the app)",
  "tour.expand": "Reopen the card",
  "tour.yourTurn": "Your turn — give it a try",
  "tour.dragHint": "💡 Drag this card by its top bar to move it — or tap «—» to minimize it, use the app, then bring it back.",
  "tour.dontShow": "Don't show this on startup",
  "tour.progress": "{c} of {n}",
  "tour.ariaLabel": "Feature tour",

  // 0 — Welcome
  "tour.welcomeTitle": "Welcome to آيات.network",
  "tour.welcomeBody": "This tool shows the Qur'an as a network of words: you pick a verse, and it reveals the other verses that share its words — linguistic links only, no translation or exegesis. No background needed; we'll walk through one example. When the tour opens a window, it's just to look at — read it, then close it (✕) to continue. You can drag this card by its top bar if it covers anything — and from the top you can also switch theme, language, and text size.",

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

  // 2 — Search (explain; read-only during the tour)
  "tour.searchTitle": "Search",
  "tour.searchBody": "This is the search bar: you'd type a word, root, or a verse number like «2:255» to jump straight there. It's disabled here in the tour — we'll use the sūrah/āyah menus in the next step.",

  // 3 — Picker (ACTION)
  "tour.pickerTitle": "Pick the centre verse",
  "tour.pickerBody": "Choose Sūrah 2 (al-Baqara), then Āyah 255, from the two menus to go to Āyat al-Kursī. The tour waits until you've picked both.",

  // 4 — Modes (explain, pin Word)
  "tour.modesTitle": "Linking modes: Word · Lemma · Root",
  "tour.modesBody": "These set how words group: «Word» (exact spelling), «Lemma» (inflections), «Root» (all derivatives). We'll start in Word mode so the counts are exact.",

  // 5 — Graph intro
  "tour.graphTitle": "This is Āyat al-Kursī",
  "tour.graphBody": "The gold node is the verse, ringed by its words. Drag the background to pan, zoom with the wheel or two fingers. (Drag this card by its top bar if it covers anything.)",

  // 6 — Tap ٱلْأَرْض (select)
  "tour.tapEarthTitle": "Start with a word: ٱلْأَرْض",
  "tour.tapEarthBody": "Click the highlighted ٱلْأَرْض (the earth) node to select it and open its details panel.",

  // 6b — Re-click to fan out its verses
  "tour.fanOutTitle": "Fan out its verses",
  "tour.fanOutBody": "Click ٱلْأَرْض again to fan out its verses around it in the network.",

  // 6c — Drag the earth node (children follow)
  "tour.dragZoomTitle": "Drag ٱلْأَرْض",
  "tour.dragZoomBody": "We've zoomed out a little so you can see ٱلْأَرْض's fanned-out verses. Now drag the ٱلْأَرْض node itself to move it — its branching verses move along with it.",

  // 7 — Inspector
  "tour.inspectorTitle": "The inspector",
  "tour.inspectorBody": "Here are the details: root أ-ر-ض, lemma, the morphological analysis for this spot, and the meaning from an Arabic lexicon with an edition citation.",

  // 8 — Switch dictionary
  "tour.dictTitle": "Switch the dictionary",
  "tour.dictBody": "Change the lexicon from this dropdown to see how the gloss differs across Lisān al-ʿArab, Maqāyīs, and Mufradāt.",

  // 9 — Distribution
  "tour.distTitle": "Where does the word occur?",
  "tour.distBody": "Click «Distribution»: ٱلْأَرْض occurs in ~275 verses (in Word mode), and its top neighbour is ٱلسَّمَٰوَٰت (the heavens). Explore the data, then close the window to continue.",

  // 10 — Compare
  "tour.compareTitle": "Compare two terms",
  "tour.compareBody": "Click «Compare» to open the window, then type «ٱلسَّمَٰوَٰت» in the second term box and click «Set» to compare it with ٱلْأَرْض across chapters and collocations. Browse the result, then close the window to continue.",

  // 11 — All verses
  "tour.allversesTitle": "All verses",
  "tour.allversesBody": "Click «All verses» to browse every āyah the word occurs in, with CSV export and a KWIC concordance. Close the window to continue.",

  // 12 — Tap كرسي (rare)
  "tour.tapKursiTitle": "A rare word: كُرْسِيّ",
  "tour.tapKursiBody": "Notice كُرْسِيّ — it's vividly coloured because it's very rare (only 2 verses in the whole Qur'an). Click it to expand it.",

  // 13 — The other verse (38:34)
  "tour.kursiVerseTitle": "Its only other verse",
  "tour.kursiVerseBody": "كُرْسِيّ appears in just one other verse — «Ṣād 34». Click that highlighted verse node to open it.",
  "tour.kursiVerseDetailTitle": "The other verse's details",
  "tour.kursiVerseDetailBody": "Here are the details of «Ṣād 34»: its text, the shared word (كُرْسِيّ), and a «Make centre» button to start a fresh exploration from it. Click «Next» when you're done.",

  // 14 — Root mode
  "tour.rootModeTitle": "Switch to «Root» mode",
  "tour.rootModeBody": "Click «Root». Now يَعْلَمُ and عِلْمِه merge under one root ع-ل-م, and the web widens to include all of the root's derivatives.",

  // 15 — Echoes
  "tour.echoesTitle": "Echoes (المتشابهات)",
  "tour.echoesBody": "Open «Echoes» (⧉): Āyat al-Kursī shares the phrase «لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ» with around twenty verses. Close it to continue.",

  // 16 — Context
  "tour.contextTitle": "Context",
  "tour.contextBody": "Open «Context» (☰) to read the verse within the full sūrat al-Baqara, scrollable. Close it to continue.",
  "tour.exprTitle": "Expressions explorer",
  "tour.exprBody": "Open the Expressions explorer (⛓): multi-word units, not single words — verbs' governed prepositions (as a matrix), collocations, iḍāfa constructs, and idioms. They also appear inline in the word card, the root lab, and the āya lab. Close it to continue.",

  // 17 — Open tools
  "tour.toolsOpenTitle": "Open the Tools menu",
  "tour.toolsOpenBody": "Click the ⚙ button to open the Tools menu.",

  // 18 — Try a tool
  "tour.toolsTryTitle": "Try a tool",
  "tour.toolsTryBody": "Turn on e.g. «rare links only» to surface distinctive vocabulary — or switch the render engine. (If the card covers the menu, drag it by its top bar.)",

  // 19 — Save the view
  "tour.saveViewTitle": "Save the view",
  "tour.saveViewBody": "Click «✶» in the bottom dock to save a snapshot of this view to your Workspace. We'll cover the rest of the dock's buttons next.",

  // 19b — Share a state link (+ the dock buttons)
  "tour.shareLinkTitle": "Share the view as a link",
  "tour.shareLinkBody": "The bottom dock controls the view: fit (⤢), zoom (＋ －), and save the view (✶). Click the link button (⎘) to copy a link that reopens this exact state — share it and others see what you see. Click it now.",

  // 19c — Download an image
  "tour.downloadTitle": "Download an image",
  "tour.downloadBody": "Click the download button (⤓) to save a PNG image of the network to your device («❖» exports a vector SVG). Try it now.",

  // 20 — Open workspace
  "tour.wsOpenTitle": "Your Workspace",
  "tour.wsOpenBody": "This is your Workspace: everything you save — words, expressions, claims and notes — collects here, ready to export or import later.",

  // 21 — Workspace detail
  "tour.wsViewTitle": "Your Workspace",
  "tour.wsViewBody": "There's your snapshot. Everything you save collects here (words, comparisons, distributions, snapshots) with free notes and sticky notes pinned to nodes. There's no backend and no account: it all lives in your browser alone — so clearing your browser data erases it. Export it as a file to keep a backup or move it to another device.",

  // 21b — Help dialog (open & close)
  "tour.helpTitle": "Help & guide",
  "tour.helpBody": "Click the «؟» button to open the quick guide, then close it to continue. It holds a short overview, and you can relaunch this tour from there anytime.",

  // 22 — Theme / language / offline
  "tour.themeTitle": "Theme, language & offline",
  "tour.themeBody": "Finally, toggle the theme between light and dark (and the language from its neighbouring button). The app is installable and works offline after your first visit.",

  // Mobile-only: describe the word panel's analysis (no modal chain on phones)
  "tour.dictMTitle": "A word's dictionary & analysis",
  "tour.dictMBody": "The word panel shows its meaning from six classical lexicons (tap “Full article” for the whole entry), plus buttons for its distribution across sūras, comparison with another word, and all of its verses. From the reader dock below: look-alike phrases (mutashābihāt), rhyme, and context.",
  // Mobile show-&-tell: the tour opens each of these for you
  "tour.corpusTitle": "Corpus explorer",
  "tour.corpusBody": "This is the Corpus explorer: browse word frequency, morphology and antonyms, look-alike verses, and oaths & conditionals across the whole text. (We opened it for you from the slide-up menu.)",
  "tour.claimsTitle": "Claim board",
  "tour.claimsBody": "And this is the Claim board: state a reading, then attach āyāt that support or challenge it to build an argument from evidence.",
  "tour.mMenusTitle": "Slide-up menus on phones",
  "tour.mMenusBody": "On a phone the extra tools tuck behind a “More” button, and menus slide up from the bottom. From here you reach the pairing matrix, the explorers, and the claim board.",
  "tour.mKeyboardTitle": "The Arabic keyboard",
  "tour.mKeyboardBody": "Type Arabic with Latin letters in any field: an on-screen keyboard appears and your typing converts instantly (e.g. noor → نور).",
  "tour.mSheetTitle": "Resizable sheets",
  "tour.mSheetBody": "Dialogs open at a partial height on a phone — drag their top bar up to fill the screen, or down to dismiss.",

  // Mobile-only variants of a few shared steps (auto-advance, touch, the «More» menu).
  "tour.welcomeMTitle": "Welcome to آيات.network",
  "tour.welcomeMBody": "This tool shows the Qur'an as a network of words: you pick a verse, and it reveals the other verses that share its words — linguistic links only, no translation or exegesis. No background needed; we'll walk through one example. When the tour opens something, it's just to look at — read it, then tap Next. Drag this card by its top bar, or minimize it (—), to reach the app underneath; from the top you can also switch theme, language, and text size.",
  "tour.searchMTitle": "Search",
  "tour.searchMBody": "The search bar — type a word, a root, or a verse number like «2:255» to jump straight there. (We've loaded Āyat al-Kursī for you.)",
  "tour.graphMTitle": "This is Āyat al-Kursī",
  "tour.graphMBody": "The gold node is the verse, ringed by its words. Drag the background to pan, and pinch with two fingers to zoom.",
  "tour.exprMTitle": "Expressions explorer",
  "tour.exprMBody": "The Expressions explorer — multi-word units, not single words: verbs and their governed prepositions (as a matrix), collocations, iḍāfa constructs, and idioms. They also surface inside the word card, the root lab, and the āya lab.",
  "tour.workbenchMTitle": "Research workbench",
  "tour.workbenchMBody": "There's a full research workbench — the Claim board (⚖), the Coding & Parsing lenses inside occurrence lists, the Pairing matrix (⊞), and the Corpus explorer (≣). Reach them from the «More» menu.",

  // Research workbench (newer features, summarised)
  "tour.workbenchTitle": "Research workbench",
  "tour.workbenchBody": "Beyond what you've seen, there's a deeper workbench: the Claim board (⚖) to argue a reading with supporting & challenging āyāt, the Coding & Parsing lenses inside occurrence lists, the Pairing matrix (⊞), and the Corpus explorer (≣) for frequency, morphology, antonyms, and oaths & conditionals across the whole text. Try them from the toolbar.",

  // 23 — Finish
  "tour.finishTitle": "You completed a full study!",
  "tour.finishBody": "You just took a verse from its linguistic research all the way to saving your findings. Reopen the tour anytime from the «?» button. Explore freely.",
};
