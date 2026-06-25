/* ═══ Release changelog — a user-facing patch log ═══
 *
 * The single source of truth for "what's new". This reads like a GAME PATCH NOTE:
 * a chronological spine of dated patches (NEWEST FIRST), and inside each patch the
 * changes are grouped under THEME headers (see THEMES below). Content is written
 * for USERS — "what you can now do and how" — not as a dev changelog.
 *
 * On load the app compares the user's `qg.lastSeenVersion` against this list and
 * shows every patch newer than what they last acknowledged (so skipping a deploy
 * still surfaces the accumulated changes), then records the current id on dismiss.
 *
 * To ship a release: prepend one patch entry before you build/deploy. The service
 * worker reloads open tabs into the new bundle (see main.jsx), so the dialog fires
 * on the next load.
 *
 * Versioning: SemVer. The first entry's id is the current app version and MUST
 * equal package.json's "version" — the build asserts this (vite.config.js).
 *
 * Patch shape
 * ───────────
 *   id      SemVer string; unique; newest first (index 0 = current version)
 *   date    ISO date string, shown in the header
 *   title   { ar, en } — short patch headline (optional)
 *   groups  [ { theme, changes } ]  — theme sections, in display order
 *
 * group.theme    a key into THEMES (icon + bilingual label)
 * group.changes  [ { kind, text, detail?, steps?, media?, mediaAlt?, icon? } ]
 *
 * change.kind    "new" (a capability) | "improve" (a changed/expanded behaviour)
 *                | "fix"  — drives the coloured chip
 * change.text    { ar, en } — headline: what you can do / what changed
 * change.detail  { ar, en } — optional one sentence: why it matters / how to reach it
 * change.steps   [ { ar, en } ] — optional ordered HOW-TO (rendered as <ol>)
 * change.media   { desktop?, mobile? } — optional clips/screenshots under
 *                public/changelog/. Either or both. A platform LABEL is shown only
 *                when BOTH are present (so a lone screenshot isn't tagged "Desktop").
 *                A MISSING file hides its slot silently — ship the entry now, film
 *                later. See public/changelog/README.md.
 * change.mediaAlt { ar, en } — shared caption/alt for the media (a11y)
 */

export const THEMES = {
  workbench:  { icon: "🔬", label: { ar: "ورشة البحث", en: "Research workbench" } },
  ux:         { icon: "📱", label: { ar: "أسلس على كلّ شاشة", en: "Smoother on every screen" } },
  search:     { icon: "🔍", label: { ar: "بحثٌ أذكى", en: "Smarter search" } },
  analysis:   { icon: "📊", label: { ar: "التحليل والنصّ", en: "Analysis & corpus" } },
  graph:      { icon: "🕸", label: { ar: "الرسم", en: "The graph" } },
  lexicons:   { icon: "📖", label: { ar: "المعاجم", en: "Lexicons" } },
  onboarding: { icon: "🚪", label: { ar: "البداية واللغة", en: "Onboarding & language" } },
};

export const CHANGELOG = [
  {
    id: "1.6.0",
    date: "2026-06-23",
    title: { ar: "تحديث ورشة البحث", en: "The research-workbench update" },
    groups: [
      {
        theme: "workbench",
        changes: [
          {
            kind: "new",
            text: { ar: "ابنِ دعوى وادعمها بالشواهد", en: "Build a claim and back it with evidence" },
            detail: {
              ar: "اطرح قراءةً ثمّ أرفِق آياتٍ تؤيّدها أو تعارضها، في مكانٍ واحد.",
              en: "State a reading, then attach āyāt that support or challenge it — all in one place.",
            },
            steps: [
              { ar: "افتح لوحة الدعاوى (⚖) واضغط «+ دعوى جديدة»، ثمّ اكتب نصّ دعواك.", en: "Open the claim board (⚖), tap “+ New claim”, and write your claim." },
              { ar: "ابحث عن كلمةٍ أو جذرٍ لتفتح قائمة مواضعه في المصحف.", en: "Search a word or root to open its list of occurrences." },
              { ar: "عند أيّ آيةٍ اضغط زرّ التثبيت (⚐)، اختر الدعوى، ثمّ «+ ما يؤيّد» أو «+ ما يعارض».", en: "On a verse, tap the pin (⚐), pick your claim, then “+ Supports” or “+ Challenges”." },
              { ar: "ارجع إلى اللوحة لتراجع شواهدك، وأضِف ملاحظةً على كلّ آية.", en: "Back in the board, review your evidence and add a note to each verse." },
            ],
            media: { desktop: "changelog/claims-desktop.mp4", mobile: "changelog/claims-mobile.mp4" },
            mediaAlt: { ar: "إنشاء دعوى وتثبيت آيةٍ مؤيِّدة", en: "Creating a claim and pinning a supporting verse" },
          },
          {
            kind: "new",
            text: { ar: "صنّف الآيات بترميزٍ خاصٍّ بك", en: "Tag verses with your own codes" },
            detail: {
              ar: "أنشئ فئاتٍ موضوعية وامنح كلّ آيةٍ وسومها، مع عدّادٍ حيٍّ لكلّ فئة — من عدسة «الترميز» (🏷) في أيّ قائمة مواضع.",
              en: "Create thematic categories and tag verses into them, with a live count per category — via the Coding (🏷) lens in any occurrences list.",
            },
            media: { desktop: "changelog/coding-desktop.mp4" },
            mediaAlt: { ar: "تفعيل الترميز وإنشاء تصنيفٍ ووسم آية", en: "Enabling coding, creating a category, tagging a verse" },
          },
          {
            kind: "new",
            text: { ar: "اقرأ الآيات عبر عدسات الدور والبناء", en: "Read verses through role & construction lenses" },
            detail: {
              ar: "أظهِر الموقع الإعرابيّ للكلمة في كلّ آية (⚖)، أو صفِّ المواضع ببناءٍ نحويٍّ محدّد (وزن، بناءٌ للمعلوم/المجهول، أداة).",
              en: "Show a word's syntactic role per verse (⚖), or filter occurrences to a specific construction (form, voice, particle).",
            },
            media: { desktop: "changelog/role-lens-desktop.mp4" },
            mediaAlt: { ar: "تفعيل عدسة الإعراب وظهور المواقع التركيبية", en: "The role lens showing syntactic positions" },
          },
          {
            kind: "new",
            text: { ar: "قارِن اقتران الحدود في مصفوفة", en: "Compare how terms co-occur, in a matrix" },
            detail: {
              ar: "ضع جذورًا أو ألفاظًا على محورين وشاهد أين تجتمع في النصّ — والخليّة الفارغة تكشف ما لا يجتمع أبدًا؛ اضغط خليّةً لتقرأ آياتها. (⊞)",
              en: "Put roots or words on two axes and see where they meet in the text — the empty cell reveals what never co-occurs; tap a cell to read its verses. (⊞)",
            },
            steps: [
              { ar: "افتح مصفوفة الاقتران (⊞) من الشريط.", en: "Open the pairing matrix (⊞) from the toolbar." },
              { ar: "أضِف حدودًا إلى الصفوف والأعمدة (أو ازرع محورًا من عائلة جذرٍ أو حقلٍ محفوظ).", en: "Add terms to the rows and columns (or seed an axis from a root's family or a saved field)." },
              { ar: "اقرأ الشبكة: الخلايا المضيئة اقترانٌ، والفارغة غيابٌ دالّ؛ اضغط أيّ خليّة لفتح آياتها المشتركة.", en: "Read the grid: lit cells are co-occurrences, empty ones a telling absence; tap any cell to open its shared verses." },
            ],
            media: { desktop: "changelog/pairing-desktop.mp4" },
            mediaAlt: { ar: "بناء مصفوفة الاقتران وفتح خليّةٍ لقراءة آياتها", en: "Building the pairing matrix and opening a cell" },
          },
          {
            kind: "improve",
            text: { ar: "كلّ ما تحفظه في مساحةٍ واحدة", en: "Everything you save, in one workspace" },
            detail: {
              ar: "العناصر المحفوظة والملاحظات والوسوم والحقول والدعاوى وتعابيرك الخاصّة صارت تُجمَع وتُصنَّف معًا في مساحة العمل (✶)، مع تصدير/استيراد للكلّ بصيغة JSON.",
              en: "Saved items, notes, tags, fields, claims and your own saved expressions are now collected and grouped together in the workspace (✶), with JSON export/import for the lot.",
            },
            media: { desktop: "changelog/workspace-desktop.mp4" },
            mediaAlt: { ar: "مساحة العمل ولوحة الدعاوى", en: "The workspace and claim board" },
          },
        ],
      },
      {
        theme: "ux",
        changes: [
          {
            kind: "improve",
            text: { ar: "كبّر النوافذ بسحب حافّتها العلوية", en: "Drag a dialog's top edge to resize it" },
            detail: {
              ar: "على الهاتف تفتح النوافذ بارتفاعٍ جزئيّ؛ اسحب الشريط العلويّ لأعلى لملئها، أو لأسفل لإغلاقها، أو انقره للتبديل.",
              en: "On a phone, dialogs open at a partial height — drag the top bar up to fill the screen, down to close, or tap it to toggle.",
            },
            steps: [
              { ar: "افتح أيّ نافذة تحليلٍ على الهاتف؛ تظهر بارتفاع «إطلالة».", en: "Open any analysis dialog on a phone; it appears at a “peek” height." },
              { ar: "ضع إصبعك على الشريط العلويّ واسحب لأعلى لتكبيرها حتّى تملأ الشاشة.", en: "Press the top bar and drag up to enlarge it to full screen." },
              { ar: "اسحب لأسفل لتصغيرها أو إغلاقها، أو انقر الشريط للتبديل بين الحالتين.", en: "Drag down to shrink or dismiss, or tap the bar to toggle." },
            ],
            media: { mobile: "changelog/sheet-resize-mobile.mp4" },
            mediaAlt: { ar: "سحب الشريط العلويّ لتكبير النافذة على الهاتف", en: "Dragging the top bar to enlarge a sheet on a phone" },
          },
          {
            kind: "improve",
            text: { ar: "لوحة المفاتيح العربية: ثلاث حالاتٍ وشارةٌ قابلةٌ للسحب", en: "Arabic keyboard: three states and a draggable badge" },
            detail: {
              ar: "بدّل بين: مُطفأة، وظاهرة (مع اللوحة)، ومخفيّة (الكتابة تعمل واللوحة مطويّةٌ إلى شارةٍ على الحافّة). اسحب الشارة لتضعها حيث تشاء.",
              en: "Switch between off, shown (with the panel), and hidden (typing still works, the panel tucked to an edge badge). Drag the badge wherever you like.",
            },
            media: { mobile: "changelog/keyboard-badge-mobile.mp4" },
            mediaAlt: { ar: "إظهار اللوحة ثمّ طيّها إلى شارةٍ على الحافّة", en: "Showing the keyboard panel, then collapsing it to an edge badge" },
          },
          {
            kind: "improve",
            text: { ar: "أدوات الآية في قائمةٍ واحدة (⋯)", en: "Verse tools tucked into one ⋯ menu" },
            detail: {
              ar: "على الشاشات الضيّقة تتجمّع أدوات الآية (تحليل، سورة، عبارات، فاصلة، سياق) خلف زرّ ⋯ لإفساح مساحةٍ أكبر للرسم.",
              en: "On narrow screens the verse tools (analysis, sūra, phrases, rhyme, context) gather behind a ⋯ button to give the graph more room.",
            },
            media: { mobile: "changelog/reader-menu-mobile.mp4" },
            mediaAlt: { ar: "فتح قائمة أدوات الآية على الهاتف", en: "Opening the verse-tools menu on a phone" },
          },
          {
            kind: "improve",
            text: { ar: "أخفِ كلّ الأشرطة وتفرّغ للرسم", en: "Hide every bar and focus on the canvas" },
            detail: {
              ar: "على الهاتف انقر اللسان (▾) أعلى الشاشة ليختفي شريط الأدوات بالكامل فيملأ الرسمُ الشاشة؛ انقره ثانيةً ليعود.",
              en: "On a phone, tap the little tab (▾) at the very top to collapse the whole toolbar — the graph fills the screen; tap it again to bring it back.",
            },
            media: { mobile: "changelog/hide-header-mobile.mp4" },
            mediaAlt: { ar: "إخفاء شريط الأدوات لعرض الرسم بملء الشاشة", en: "Hiding the toolbar for a full-screen canvas" },
          },
          {
            kind: "improve",
            text: { ar: "تبويبات النوافذ تنزلق أفقيًّا عند طولها", en: "Long dialog tab rows slide sideways" },
            detail: {
              ar: "حين تكثر تبويبات نافذةٍ على الهاتف فلا تتزاحم: اسحب صفّ التبويبات يمينًا ويسارًا للوصول إليها كلّها.",
              en: "When a dialog has more tabs than fit on a phone they no longer cram together — swipe the tab row left and right to reach them all.",
            },
            media: { mobile: "changelog/tabs-slide-mobile.mp4" },
            mediaAlt: { ar: "سحب صفّ التبويبات أفقيًّا داخل نافذة", en: "Swiping a dialog's tab row sideways" },
          },
          {
            kind: "improve",
            text: { ar: "زرّ رجوعٍ موحَّدٌ في كلّ النوافذ", en: "One back button, the same in every dialog" },
            detail: {
              ar: "عند التنقّل داخل نافذةٍ أو بينها يظهر سهم رجوعٍ في المكان نفسه دائمًا (→ بالعربية، ← بالإنجليزية)، ويستجيب لمفتاح Esc.",
              en: "Drilling within or between dialogs shows a back arrow in the same spot every time (→ in Arabic, ← in English), and Esc follows it.",
            },
            media: { mobile: "changelog/back-button-mobile.mp4" },
            mediaAlt: { ar: "زرّ الرجوع للعودة من نافذةٍ فُتحت من أخرى", en: "The back button returning from a drilled-in dialog" },
          },
        ],
      },
      {
        theme: "search",
        changes: [
          {
            kind: "new",
            text: { ar: "ابحث بعبارةٍ وشاهدها مُبرَزة، وعُد إلى عمليّاتك الأخيرة", en: "Search a phrase, see it highlighted, and revisit recent searches" },
            detail: {
              ar: "اكتب عدّة كلماتٍ فيبحث في كامل المصحف ويُبرز المطابقات داخل نصّ الآية؛ وحقل البحث الفارغ يعرض آخر عمليّاتك.",
              en: "Type several words to search the whole text; matches light up inside the verse, and the empty search box lists your recent searches.",
            },
            steps: [
              { ar: "اكتب عبارةً من كلمتين فأكثر في حقل البحث (مثل «إذا جاء»).", en: "Type a phrase of two or more words in the search box (e.g. «إذا جاء»)." },
              { ar: "افتح النتائج؛ تظهر الآيات والكلمات المطابقة مُبرَزةً بلونٍ ظاهر.", en: "Open the results; matching verses appear with the words highlighted." },
              { ar: "انقر حقل البحث وهو فارغ لترى آخر عمليّاتك وتعيد تشغيل أيٍّ منها.", en: "Click the empty search box to see recent searches and re-run any of them." },
            ],
            media: { desktop: "changelog/phrase-desktop.mp4", mobile: "changelog/phrase-mobile.mp4" },
            mediaAlt: { ar: "بحثٌ بعبارةٍ مع إبراز النتائج وسجلّ البحث", en: "Phrase search with highlighted results and search history" },
          },
        ],
      },
      {
        theme: "analysis",
        changes: [
          {
            kind: "improve",
            text: { ar: "الفاصلة والالتفات بعدساتٍ أدقّ", en: "Richer rhyme & iltifāt lenses" },
            detail: {
              ar: "أُثريت مختبرات الفاصلة والسورة بمقاييس أدقّ للفواصل (أواخر الآيات) والالتفات (تحوّل الضمير) — من زرّ «السورة» (▦) أو زرّ الفاصلة (♪) في شريط القراءة.",
              en: "The rhyme and sūra labs gained finer metrics for fawāṣil (verse endings) and iltifāt (person shifts) — from the “Sūra” (▦) or rhyme (♪) buttons in the reader dock.",
            },
            media: { desktop: "changelog/fasila-desktop.mp4" },
            mediaAlt: { ar: "نوافذ التحليل المعمّقة", en: "The deepened analysis views" },
          },
          {
            kind: "improve",
            text: { ar: "الآيات المتشابهة لفظًا، أوضح", en: "Look-alike verses, clearer" },
            detail: {
              ar: "صار «تحليل الآية» (⊞) يُبرز الآيات المتقاربة لفظًا والعبارات المشتركة بينها بوضوحٍ أكبر — مع زرّ «⇄» يكشف ما تغيّر بينهما كلمةً كلمة.",
              en: "The verse lab (⊞) now surfaces near-identical verses and the phrases they share more clearly — with a “⇄” toggle that exposes what changes between them, word by word.",
            },
            media: { desktop: "changelog/analysislab-desktop.mp4" },
            mediaAlt: { ar: "العبارات المشتركة بين الآيات", en: "Shared phrases between verses" },
          },
          {
            kind: "new",
            text: { ar: "القَسَم والشرط في مستكشف المدوّنة", en: "Oaths & conditionals, corpus-wide" },
            detail: {
              ar: "تصفّح مواضع القَسَم (تالله، وَالـ…) والشرط (إذا، لو، لولا) عبر المصحف كاملًا — من تبويب «البلاغة» في مستكشف المدوّنة (≣).",
              en: "Browse every oath (تالله، وَالـ…) and conditional (إذا، لو، لولا) across the whole text — from the “Rhetoric” tab in the corpus explorer (≣).",
            },
            media: { desktop: "changelog/oaths-desktop.mp4" },
            mediaAlt: { ar: "تبويب البلاغة: تبديل بين القَسَم والشرط", en: "The rhetoric tab toggling between oaths and conditionals" },
          },
          {
            kind: "new",
            text: { ar: "ابنِ حقلًا دلاليًّا، واقرأ تعدية الفعل", en: "Build a semantic field, and read a verb's valency" },
            detail: {
              ar: "اجمع جذورًا متقاربة المعنى في «حقل» تحفظه في مساحة العمل وتشاهد توزيعه على السور، واقرأ ما يأخذه الفعل من معمولاتٍ وحروف جرّ — من مختبر الجذر وكشّاف التعابير.",
              en: "Group related-meaning roots into a “field” you keep in the workspace and chart across sūras, and read a verb's valency — the objects and prepositions it governs — in the root lab and expressions explorer.",
            },
            media: { desktop: "changelog/valency-desktop.mp4" },
            mediaAlt: { ar: "الحقول الدلالية وتعدية الفعل", en: "Semantic fields and verb valency" },
          },
          {
            kind: "improve",
            text: { ar: "رشّح الصرف بدقّةٍ أكبر", en: "Sharper morphology filter" },
            detail: {
              ar: "ضيّق الرسم إلى صيغٍ بعينها حسب الشخص والعدد والصيغة والإعراب — من «التصفية الصرفية» في قائمة ⚙ الأدوات.",
              en: "Narrow the graph to specific forms by person, number, mood and case — from the morphology filter in the ⚙ tools popover.",
            },
            media: { desktop: "changelog/morphfilter-desktop.mp4" },
            mediaAlt: { ar: "تصفية الرسم بالخصائص الصرفية", en: "Filtering the graph by grammatical form" },
          },
        ],
      },
    ],
  },
  {
    id: "1.5.0",
    date: "2026-06-21",
    title: { ar: "تحسينات البحث والبداية", en: "Search & onboarding polish" },
    groups: [
      {
        theme: "search",
        changes: [
          {
            kind: "new",
            text: { ar: "اختر السورة بالكتابة", en: "Pick a sūra by typing" },
            detail: {
              ar: "اكتب اسم السورة (عربيًّا أو لاتينيًّا) أو رقمها أو مرجعًا مثل «59:7» للقفز إليها مباشرةً.",
              en: "Type a sūra's name (Arabic or Latin), its number, or a reference like “59:7” to jump straight there.",
            },
            media: { desktop: "changelog/sura-picker-desktop.mp4" },
            mediaAlt: { ar: "كتابة اسم السورة للقفز إليها", en: "Typing a sūra name to jump to it" },
          },
        ],
      },
      {
        theme: "workbench",
        changes: [
          {
            kind: "improve",
            text: { ar: "احفظ التعابير والمواضع في مساحة العمل", en: "Save expressions and occurrences to your workspace" },
            detail: {
              ar: "صرت تستطيع حفظ نتائج التعابير والمواضع لتعود إليها لاحقًا من مساحة العمل (✶).",
              en: "You can now save expression and occurrence results to revisit later from the workspace (✶).",
            },
            media: { desktop: "changelog/save-desktop.mp4" },
            mediaAlt: { ar: "حفظ النتائج في مساحة العمل", en: "Saving results to the workspace" },
          },
        ],
      },
      {
        theme: "ux",
        changes: [
          {
            kind: "improve",
            text: { ar: "نوافذ أسرع", en: "Snappier dialogs" },
            detail: {
              ar: "تُحمَّل النوافذ الثقيلة عند فتحها فقط، فيبقى التطبيق سريعًا.",
              en: "Heavy dialogs load only when you open them, keeping the app quick.",
            },
          },
        ],
      },
    ],
  },
  {
    id: "1.4.0",
    date: "2026-06-18",
    title: { ar: "لوحة المفاتيح العربية", en: "The Arabic keyboard" },
    groups: [
      {
        theme: "ux",
        changes: [
          {
            kind: "new",
            text: { ar: "اكتب العربية بحروفٍ لاتينية", en: "Type Arabic with Latin letters" },
            detail: {
              ar: "لوحة مفاتيح عائمةٌ تحوّل ما تكتبه لاتينيًّا إلى عربيٍّ فوريًّا في أيّ حقل، مع لوحةٍ على الشاشة للتشكيل والرموز.",
              en: "A floating keyboard turns your Latin typing into Arabic instantly in any field, with an on-screen panel for diacritics and symbols.",
            },
            steps: [
              { ar: "اضغط زرّ لوحة المفاتيح (⌨) أو Alt+K لتشغيلها.", en: "Tap the keyboard button (⌨) or press Alt+K to switch it on." },
              { ar: "اكتب لاتينيًّا في أيّ حقلٍ فيظهر العربيّ (مثل noor ← نور).", en: "Type Latin in any field and Arabic appears (e.g. noor → نور)." },
              { ar: "للحروف المُعجَمة استعمل الفاصلة العليا (’): t’ ← ث، d’ ← ذ؛ واستخدم اللوحة للتشكيل.", en: "For extra letters use an apostrophe (’): t’ → ث, d’ → ذ; use the panel for diacritics." },
            ],
            media: { desktop: "changelog/keyboard-desktop.mp4", mobile: "changelog/keyboard-mobile.mp4" },
            mediaAlt: { ar: "الكتابة باللاتينية وتحوّلها إلى العربية", en: "Typing Latin and watching it become Arabic" },
          },
          {
            kind: "fix",
            text: { ar: "أمتن عند الأخطاء", en: "Steadier when something goes wrong" },
            detail: {
              ar: "إن تعثّر جزءٌ من الواجهة لم يَعُد يُسقِط التطبيق كلَّه؛ تُعزَل المشكلة وتُسجَّل محلّيًّا لتُعالَج، فتُتابع عملك دون انقطاع.",
              en: "If one panel hits an error it no longer takes the whole app down — the failure is isolated and logged locally so it can be fixed, and you keep working.",
            },
          },
        ],
      },
      {
        theme: "analysis",
        changes: [
          {
            kind: "new",
            text: { ar: "مستكشف التعابير والاقتران", en: "Expressions & collocation explorer" },
            detail: {
              ar: "تصفّح التعابير المركّبة في النصّ وما يقترن من كلماتٍ ببعضها، بجولةٍ ومساعدةٍ خاصّة.",
              en: "Browse multi-word expressions and which words keep company, with its own guide and help.",
            },
            steps: [
              { ar: "افتح كشّاف التعابير (⛓) من الشريط.", en: "Open the expressions explorer (⛓) from the toolbar." },
              { ar: "نقّل بين التبويبات: التعدية (الفعل وحرف جرّه) · المصاحبات · الإضافة · التعابير المصطفاة.", en: "Move between the tabs: government (a verb + its preposition) · collocations · iḍāfa compounds · idioms." },
              { ar: "اضغط أيّ تعبيرٍ (أو خليّةً في مصفوفة التعدية) لتقرأ آياته وتوزّعه على السور.", en: "Click any expression (or a cell in the government matrix) to read its āyāt and its spread across sūras." },
            ],
            media: { desktop: "changelog/expressions-desktop.mp4" },
            mediaAlt: { ar: "مستكشف التعابير", en: "The expressions explorer" },
          },
        ],
      },
    ],
  },
  {
    id: "1.3.0",
    date: "2026-06-17",
    title: { ar: "التعابير المركّبة", en: "Multi-word expressions" },
    groups: [
      {
        theme: "analysis",
        changes: [
          {
            kind: "new",
            text: { ar: "حلِّل التعابير المركّبة", en: "Analyse multi-word expressions" },
            detail: {
              ar: "ادرس أطر الإعمال، وسلاسل الإضافة، والتعابير الاصطلاحية — كيف تتركّب الكلمات عباراتٍ لا مفرداتٍ فقط.",
              en: "Study government frames, iḍāfa (genitive) chains and idioms — how words combine into phrases, not just single tokens.",
            },
            media: { desktop: "changelog/expressions-idafa-desktop.mp4" },
            mediaAlt: { ar: "تبويب الإضافة في كشّاف التعابير", en: "The iḍāfa tab in the expressions explorer" },
          },
          {
            kind: "new",
            text: { ar: "تباين الإعمال في خريطةٍ حرارية", en: "Government contrast as a heatmap" },
            detail: {
              ar: "قارِن كيف يُشكِّل كلُّ عاملٍ معمولَه بلمحةٍ واحدة.",
              en: "Compare how different governors shape their objects at a glance.",
            },
            media: { desktop: "changelog/heatmap-desktop.mp4" },
            mediaAlt: { ar: "خريطة تباين الإعمال", en: "The government-contrast heatmap" },
          },
        ],
      },
    ],
  },
  {
    id: "1.2.0",
    date: "2026-06-13",
    title: { ar: "المستكشف واللسانيات", en: "Corpus explorer & linguistics" },
    groups: [
      {
        theme: "search",
        changes: [
          {
            kind: "improve",
            text: { ar: "بحثٌ متسامح", en: "Forgiving search" },
            detail: {
              ar: "اعثر على الكلمات ولو بكتابةٍ غير دقيقةٍ أو بلا تشكيل.",
              en: "Find words even with loose spelling or no diacritics.",
            },
            media: { desktop: "changelog/search-forgiving-desktop.mp4" },
            mediaAlt: { ar: "بحثٌ يجد الكلمة رغم اختلاف الكتابة", en: "Search finding a word despite loose spelling" },
          },
        ],
      },
      {
        theme: "analysis",
        changes: [
          {
            kind: "new",
            text: { ar: "مستكشف النصّ", en: "The corpus explorer" },
            detail: {
              ar: "لوحةٌ واحدةٌ تجمع تردُّد الجذور والنوادر، وفهرسًا صرفيًّا، والطباق، والمتشابهات، والبلاغة، وحقولك الدلالية (كشّاف القرآن).",
              en: "One panel for root frequency and hapax, a grammar catalogue, opposites, look-alikes, rhetoric, and your semantic fields (the corpus explorer).",
            },
            steps: [
              { ar: "افتح مستكشف المدوّنة (≣) من الشريط.", en: "Open the corpus explorer (≣) from the toolbar." },
              { ar: "اختر تبويبًا: التردُّد · الصرف · الطباق · المتشابهات · البلاغة · الحقول.", en: "Pick a tab: frequency · grammar · opposites · look-alikes · rhetoric · fields." },
              { ar: "اضغط أيّ جذرٍ أو مدخلٍ لتفتح آياته، ثمّ «رجوع» للعودة إلى الفهرس.", en: "Click any root or entry to open its verses, then “back” to return to the index." },
            ],
            media: { desktop: "changelog/corpus-desktop.mp4" },
            mediaAlt: { ar: "مستكشف النصّ", en: "The corpus explorer" },
          },
          {
            kind: "new",
            text: { ar: "الأضداد والطباق، والأسماء الحسنى", en: "Antonyms, ṭibāq, and the divine names" },
            detail: {
              ar: "اطّلع على الأزواج المتقابلة وشواهد الطباق، ومجموعة أسماء الله.",
              en: "See opposing pairs with ṭibāq evidence, and the set of divine names.",
            },
            media: { desktop: "changelog/antonyms-desktop.mp4" },
            mediaAlt: { ar: "الأضداد في مستكشف النصّ", en: "Antonyms in the corpus explorer" },
          },
          {
            kind: "new",
            text: { ar: "ملامح القرآن وبنيته", en: "Qurʾān structure & features" },
            detail: {
              ar: "بيانات السورة، والالتفات، والحروف المقطّعة، ومقارنة الفروق الدقيقة بين الآيات، وتماسك المقاطع، والقافية الوقفية.",
              en: "Sūra metadata, iltifāt, muqaṭṭaʿāt, a minimal-pair diff between verses, passage cohesion and pausal rhyme.",
            },
            media: { desktop: "changelog/minimal-pair-desktop.mp4" },
            mediaAlt: { ar: "مقارنة الفروق الدقيقة بين آيتين", en: "A minimal-pair diff between two verses" },
          },
        ],
      },
      {
        theme: "lexicons",
        changes: [
          {
            kind: "improve",
            text: { ar: "المعجم بجانب النصّ", en: "Dictionary alongside the text" },
            detail: {
              ar: "لوحةٌ تعرض مدخل الكلمة المعجميّ إلى جوار ورودها في القرآن.",
              en: "A panel showing a word's dictionary entry next to its Qurʾānic uses.",
            },
            media: { desktop: "changelog/dictionary-desktop.mp4" },
            mediaAlt: { ar: "المعجم بجانب مواضع الكلمة", en: "The dictionary beside a word's uses" },
          },
        ],
      },
    ],
  },
  {
    id: "1.1.0",
    date: "2026-06-10",
    title: { ar: "مختبرات الآية والسورة", en: "Verse & sūra labs" },
    groups: [
      {
        theme: "analysis",
        changes: [
          {
            kind: "new",
            text: { ar: "مختبر الآية", en: "The verse lab" },
            detail: {
              ar: "قارِن آيةً بغيرها واكشف أقرب نظائرها.",
              en: "Compare a verse against others and surface its closest echoes.",
            },
            steps: [
              { ar: "من شريط القراءة اضغط «تحليل الآية» (⊞)، أو افتحه من عقدة آيةٍ في الشبكة.", en: "In the reader dock tap “Verse” (⊞), or open it from a verse node in the graph." },
              { ar: "اقرأ بصمة الآية (طولها، جذورها، فاصلتها، أندر جذورها)، ثمّ انتقل إلى تبويب «المتشابهة».", en: "Read the verse's fingerprint (length, roots, rhyme, rarest roots), then switch to the “Similar” tab." },
              { ar: "اضغط آيةً مشابهةً، وفعّل زرّ «⇄» لترى بالضبط ما تغيّر بينهما كلمةً كلمة.", en: "Tap a similar verse and toggle “⇄” to see exactly what changes between them, word by word." },
            ],
            media: { desktop: "changelog/verselab-desktop.mp4" },
            mediaAlt: { ar: "مختبر الآية", en: "The verse lab" },
          },
          {
            kind: "new",
            text: { ar: "تحليل السورة بمصفوفة تشابه", en: "Sūra analysis with a similarity matrix" },
            detail: {
              ar: "اطّلع على علاقة آيات السورة بعضها ببعضٍ بلمحة، ودراسة قافيتها.",
              en: "See how a sūra's verses relate to one another at a glance, and study its rhyme.",
            },
            steps: [
              { ar: "من شريط القراءة اضغط «السورة» (▦).", en: "In the reader dock tap “Sūra” (▦)." },
              { ar: "نقّل بين العدسات: الجذور المميِّزة · التماسك · البناء · الالتفات · الأواصر · المقارنة.", en: "Move between the lenses: keyness · cohesion · structure · iltifāt · bonds · compare." },
              { ar: "في «البناء» مرِّر فوق مصفوفة التشابه لتكشف البناء الحلقيّ والأصداء بين الآيات.", en: "In “Structure”, hover the similarity matrix to reveal ring composition and echoes between verses." },
            ],
            media: { desktop: "changelog/surah-lab-desktop.mp4" },
            mediaAlt: { ar: "مختبر تحليل السورة", en: "The sūra-analysis lab" },
          },
        ],
      },
      {
        theme: "lexicons",
        changes: [
          {
            kind: "new",
            text: { ar: "ستّة معاجم كلاسيكية", en: "Six classical lexicons" },
            detail: {
              ar: "أُضيفت العين والصحاح والمحكم لتصير ستّة معاجم تقابل بينها معنى الكلمة.",
              en: "Added al-ʿAyn, al-Ṣiḥāḥ and al-Muḥkam — six lexicons to cross-check a word's meaning.",
            },
            steps: [
              { ar: "اضغط أيّ كلمةٍ في الشبكة لتفتح لوحتها، وانزل إلى بطاقة «المعنى».", en: "Click any word in the graph to open its inspector, and scroll to the “Meaning” card." },
              { ar: "بدّل المعجم من القائمة المنسدلة لتقابل بين تفسيرات الجذر الستّة.", en: "Switch dictionary from the dropdown to compare the root across all six." },
              { ar: "اضغط «اقتبس» (⧉) لتصدير الاستشهاد BibTeX، أو ★ لحفظ المدخل في مساحة العمل.", en: "Tap “Cite” (⧉) to export a BibTeX citation, or ★ to save the entry to your workspace." },
            ],
            media: { desktop: "changelog/lexicons-desktop.mp4" },
            mediaAlt: { ar: "معنى الكلمة في لوحة الكلمة", en: "A word's meaning in the inspector" },
          },
        ],
      },
      {
        theme: "onboarding",
        changes: [
          {
            kind: "improve",
            text: { ar: "جولةٌ أثرى", en: "A richer tour" },
            detail: {
              ar: "صارت الجولة تشمل حجم النصّ والمظهر واللغة والتصدير.",
              en: "The tour now covers text size, theme, language and export.",
            },
            media: { desktop: "changelog/tour-desktop.mp4" },
            mediaAlt: { ar: "جولة البدء التفاعلية", en: "The interactive getting-started tour" },
          },
        ],
      },
      {
        theme: "graph",
        changes: [
          {
            kind: "improve",
            text: { ar: "تباينٌ أعلى في الوضع الفاتح", en: "Higher contrast in light mode" },
            detail: {
              ar: "خطوطٌ وألوانٌ أوضح للرسم.",
              en: "Clearer strokes and colours for the graph.",
            },
            media: { desktop: "changelog/theme-desktop.mp4" },
            mediaAlt: { ar: "تبديل المظهر بين الفاتح والداكن", en: "Toggling between light and dark themes" },
          },
        ],
      },
    ],
  },
  {
    id: "1.0.0",
    date: "2026-06-07",
    title: { ar: "الإطلاق العامّ", en: "Public launch" },
    groups: [
      {
        theme: "onboarding",
        changes: [
          {
            kind: "new",
            text: { ar: "جولةٌ تفاعليةٌ للبدء", en: "An interactive getting-started tour" },
            detail: {
              ar: "تعريفٌ عند أوّل استخدامٍ بالبحث والرسم والتصدير.",
              en: "A first-run walkthrough of search, the graph and export.",
            },
            media: { desktop: "changelog/tour-desktop.mp4" },
            mediaAlt: { ar: "مساحة العمل عند الإطلاق", en: "The workspace at launch" },
          },
          {
            kind: "new",
            text: { ar: "واجهةٌ كاملةٌ بالعربية والإنجليزية", en: "Full Arabic & English interface" },
            detail: {
              ar: "بدّل اللغة في أيّ وقت؛ والعربية هي الأصل.",
              en: "Switch language anytime; Arabic is the source.",
            },
            media: { desktop: "changelog/language-desktop.mp4" },
            mediaAlt: { ar: "تبديل لغة الواجهة", en: "Switching the interface language" },
          },
        ],
      },
      {
        theme: "workbench",
        changes: [
          {
            kind: "new",
            text: { ar: "مساحة عملٍ بملاحظاتٍ لاصقة", en: "A workspace with sticky notes" },
            detail: {
              ar: "ثبّت ملاحظاتٍ بجانب الرسم أثناء بحثك.",
              en: "Pin notes beside the graph as you research.",
            },
            media: { desktop: "changelog/notes-desktop.mp4" },
            mediaAlt: { ar: "مساحة العمل والملاحظات", en: "The workspace and notes" },
          },
          {
            kind: "new",
            text: { ar: "تصدير الاستشهادات (BibTeX / RIS)", en: "Citation export (BibTeX / RIS)" },
            detail: {
              ar: "استشهد بالنصّ مباشرةً في مدير مراجعك.",
              en: "Cite the corpus directly in your reference manager.",
            },
          },
        ],
      },
      {
        theme: "search",
        changes: [
          {
            kind: "new",
            text: { ar: "تحليل الجيران المباشرين", en: "Direct-neighbours analysis" },
            detail: {
              ar: "افحص الكلمات الملاصقة لكلمةٍ ما في النصّ.",
              en: "Examine the words immediately next to a word in the text.",
            },
            media: { desktop: "changelog/distribution-desktop.mp4" },
            mediaAlt: { ar: "الجوار المباشر في نافذة التوزيع", en: "Direct neighbours in the distribution view" },
          },
        ],
      },
      {
        theme: "ux",
        changes: [
          {
            kind: "improve",
            text: { ar: "شريط أدواتٍ متجاوب", en: "A responsive toolbar" },
            detail: {
              ar: "تتراصّ الأدوات بانسيابٍ على الشاشات الضيّقة.",
              en: "Controls reflow cleanly on narrow screens.",
            },
          },
        ],
      },
    ],
  },
  {
    id: "0.3.0",
    date: "2026-06-06",
    title: { ar: "الرسم الحيّ", en: "A living graph" },
    groups: [
      {
        theme: "graph",
        changes: [
          {
            kind: "new",
            text: { ar: "تخطيطٌ حيٌّ موجَّهٌ بالقوى", en: "A live, force-directed layout" },
            detail: {
              ar: "اسحب العُقد وشاهدها تستقرّ، مع أدواتٍ على اللوحة لضبط الحركة.",
              en: "Drag nodes and watch them settle, with on-canvas controls to tune the motion.",
            },
            media: { desktop: "changelog/forcegraph-desktop.mp4" },
            mediaAlt: { ar: "الرسم الحيّ يستقرّ", en: "The live graph settling" },
          },
          {
            kind: "new",
            text: { ar: "تجميعٌ باللفظ والصرف", en: "Grouping by lemma & morphology" },
            detail: {
              ar: "تتجمّع الكلمات بصيغتها المعجمية لا بظاهر رسمها فقط.",
              en: "Words group by their dictionary form, not just surface spelling.",
            },
            media: { desktop: "changelog/lemma-desktop.mp4" },
            mediaAlt: { ar: "البحث بالصيغة المعجمية", en: "Searching by dictionary form" },
          },
        ],
      },
      {
        theme: "search",
        changes: [
          {
            kind: "new",
            text: { ar: "شارِك المشهد وصدّره", en: "Share and export your view" },
            detail: {
              ar: "انسخ رابطًا يفتح المشهد نفسه، وصدّر صورة PNG أو SVG أو جدول CSV.",
              en: "Copy a link that reopens the same view, and export PNG, SVG or CSV.",
            },
            media: { desktop: "changelog/share-desktop.mp4" },
            mediaAlt: { ar: "نسخ رابط المشاركة وتصدير الصورة", en: "Copying a share link and exporting an image" },
          },
        ],
      },
      {
        theme: "analysis",
        changes: [
          {
            kind: "new",
            text: { ar: "التوزيع والاقتران", en: "Distribution & collocation" },
            detail: {
              ar: "اعرف أين تَرِد الكلمة وما الكلمات التي تصاحبها.",
              en: "See where a word occurs and which words keep it company.",
            },
            steps: [
              { ar: "اضغط كلمةً في الشبكة، ثمّ زرّ «التوزيع» في لوحتها.", en: "Click a word in the graph, then the “Distribution” button in its inspector." },
              { ar: "اقرأ شريط كلّ سورة (اضغطه لتفتح مواضعها)، وقائمة المصاحبات مرتّبةً بقوّة الاقتران.", en: "Read the per-sūra bars (tap one to open its occurrences) and the collocates ranked by association strength." },
              { ar: "بدّل ترتيب المصاحبات (تكرار · PMI · الدلالة الإحصائية)، وصدّر النتيجة CSV أو JSON.", en: "Switch the collocate ranking (count · PMI · log-likelihood), and export the result as CSV or JSON." },
            ],
            media: { desktop: "changelog/distribution-desktop.mp4" },
            mediaAlt: { ar: "قراءة الكلمة في سياقها", en: "Reading a word in its context" },
          },
        ],
      },
      {
        theme: "ux",
        changes: [
          {
            kind: "improve",
            text: { ar: "يعمل دون اتصال، ولوحةٌ منزلقةٌ على الجوال", en: "Works offline, with a slide-up panel on mobile" },
            detail: {
              ar: "ثبِّت التطبيق واستعمله دون إنترنت؛ وتنزلق تفاصيل الكلمة من الأسفل على الهاتف.",
              en: "Install it and use it offline; word details slide up from the bottom on a phone.",
            },
          },
        ],
      },
    ],
  },
  {
    id: "0.2.0",
    date: "2026-06-05",
    title: { ar: "أسسٌ جديدة", en: "New foundations" },
    groups: [
      {
        theme: "graph",
        changes: [
          {
            kind: "new",
            text: { ar: "الجذور مستخرجةٌ من النصّ", en: "Roots, extracted from the text" },
            detail: {
              ar: "تُرَدّ كلُّ كلمةٍ إلى جذرها، وتُعرَض الكلمات المشتركة فيه.",
              en: "Each word is traced to its root, and the words sharing it are shown.",
            },
            media: { desktop: "changelog/v0.2-roots.png" },
            mediaAlt: { ar: "تصفية الصرف في المستكشف", en: "The morphology filter" },
          },
        ],
      },
      {
        theme: "lexicons",
        changes: [
          {
            kind: "new",
            text: { ar: "معاني الجذور من ابن فارس", en: "Root meanings from Ibn Fāris" },
            detail: {
              ar: "اطّلع على المعنى الكلاسيكيّ لجذر الكلمة.",
              en: "See the classical sense of a word's root.",
            },
            media: { desktop: "changelog/dictionary-desktop.mp4" },
            mediaAlt: { ar: "معنى الجذر في لوحة الكلمة", en: "A root's meaning in the inspector" },
          },
        ],
      },
    ],
  },
  {
    id: "0.1.0",
    date: "2026-02-23",
    title: { ar: "الخطوات الأولى", en: "First steps" },
    groups: [
      {
        theme: "graph",
        changes: [
          {
            kind: "new",
            text: { ar: "رسمٌ تفاعليٌّ لكلمات القرآن", en: "An interactive graph of the Qurʾān's words" },
            detail: {
              ar: "اختر كلمةً وشاهد كيف ترتبط بغيرها عبر النصّ، من بياناتٍ محلّية.",
              en: "Pick a word and see how it links to others across the text, from local data.",
            },
            media: { desktop: "changelog/graph-desktop.mp4" },
            mediaAlt: { ar: "رسم الكلمات الأوّل", en: "The first word graph" },
          },
        ],
      },
    ],
  },
];

/* The newest entry's id is the current version. null only if the list is empty. */
export const CURRENT_VERSION = CHANGELOG[0]?.id ?? null;

/* Entries the user hasn't acknowledged yet, newest first.
 * - null lastSeen → caller's decision (we return [] so first-run is silent; the
 *   gate baselines the user to CURRENT_VERSION instead of dumping all history).
 * - unknown id (corrupt/older-than-listed) → show everything, so a stale pointer
 *   never hides real changes. */
export function unseenSince(lastSeenId) {
  if (lastSeenId == null) return [];
  const idx = CHANGELOG.findIndex((e) => e.id === lastSeenId);
  return idx === -1 ? CHANGELOG.slice() : CHANGELOG.slice(0, idx);
}
