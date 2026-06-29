import { useMemo, useState } from "react";
import { rasmVariants, rasmProfile, rasmOrthography, orthoProfile, ORTHO_CATEGORIES } from "../analytics/rasm.js";
import { norm } from "../arabic-utils.js";
import { reconcileCanon } from "../analytics/rasmCanon.js";
import { exportCsvFile, exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { MoreButton } from "./MoreButton.jsx";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { SaveButton } from "./SaveButton.jsx";
import { useVerseFilter } from "./VerseFilter.jsx";
import { useReveal } from "../hooks/useReveal.js";
import { usePersistedState } from "../hooks/usePersistedState.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Rasm explorer (الرسم) — two tabs ═══
 *
 * A) Internal variants — words the muṣḥaf draws more than one way for ONE spoken word (إبرٰهم vs
 *    إبرٰهيم, كتب vs كتاب). Profile: the spellings with counts/ratio, by-sūra distribution, the
 *    muṣḥaf-order TIMELINE (the run of one spelling then the switch to another — "إبرٰهم through
 *    al-Baqarah, then إبرٰهيم after"), longest runs, switch-points, each spelling's highlighted āyāt.
 * B) Long-vowel rasm — the OTHER axis: where the muṣḥaf leaves a long ā unwritten (صلوة، السموت)
 *    AND modern writes it in full. These DON'T vary inside the muṣḥaf, so the comparison is against
 *    the spelled-out (imlāʾī) form, generated for display only. Grouped by device (ā-as-wāw /
 *    omitted-alif), each with the drawn→plene pair, by-sūra, and highlighted āyāt. (Maqṣūra and the
 *    modern-defective closed class are excluded — modern spells them the same, so they don't differ.)
 *
 * Engine in analytics/rasm.js. `onNavigate(s,a)` jumps the graph in exact-spelling (رسم) mode.
 */
const CAP = 150;
const ORTHO_CAP = 80; // rows per ortho category (filter narrows; full set still exports)
const EMPTY = []; // stable empty ref (keeps memo/useReveal keys from churning)
// per-form colours for the timeline strip / bars (cycled; ≥2 forms, usually 2)
const FORM_COLORS = ["var(--gold-500)", "#34d8a8", "var(--rubric-400)", "#60a5fa", "#c084fc"];

export function RasmLabModal({ open, verseData, morph, theme, focusId, onNavigate, onClose }) {
  const { t, fmtNum, lang } = useI18n();
  // Localised canon labels: rule/group name and definition follow the app language (Arabic source,
  // English overrides where present). The Arabic name always rides along as a secondary script.
  const en = lang === "en";
  const rn = (o) => (en && o.en) ? o.en : o.ar;        // localised name
  const rd = (o) => (en && o.defEn) ? o.defEn : o.def; // localised definition
  const [tab, setTab] = useState("internal"); // "internal" (A) | "ortho" (auto long-vowel B) | "canon" (six rules)
  const [sel, setSel] = useState(focusId || null); // selected id (A/ortho profile) | null
  const [canonSel, setCanonSel] = useState(null); // selected canon entry (six-rules tab) | null
  const [canonRule, setCanonRule] = useState(null); // drilled-into rule id (canon tab) | null = overview
  const [canonGroup, setCanonGroup] = useState(null); // drilled-into sub-group id within a rule | null
  const [orthoCat, setOrthoCat] = useState(null); // drilled-into device category (long-vowel tab) | null = overview
  const [formSel, setFormSel] = useState(null); // selected spelling (internal tab); null = all spellings
  const [profileView, setProfileView] = useState("verses"); // internal profile sub-tab: verses | sura | timeline
  const [suraFilter, setSuraFilter] = useState(null); // clicked sūra in the by-sūra chart → filters the āyāt list
  const [preview, setPreview] = useState(null); // vk read in the sticky foot
  const [q, setQ] = useState(""); // catalogue filter box
  const [showHelp, setShowHelp] = usePersistedState("qg.rasm.help", false); // explanatory blurbs on/off (persisted; off by default)
  const [prevFocus, setPrevFocus] = useState(focusId);

  // Sync the parent's focus request into local selection WITHOUT an effect — the sanctioned
  // render-time state-adjustment pattern. A fresh focusId selects that word and resets the view.
  if (focusId !== prevFocus) { setPrevFocus(focusId); if (focusId) { setTab(focusId.startsWith("o|") ? "ortho" : "internal"); setSel(focusId); setCanonSel(null); setCanonRule(null); setCanonGroup(null); setFormSel(null); setProfileView("verses"); setSuraFilter(null); setPreview(null); } }
  const selectWord = (id) => { setSel(id); setFormSel(null); setProfileView("verses"); setSuraFilter(null); setPreview(null); }; // resets reader together
  const switchTab = (tb) => { setTab(tb); setSel(null); setCanonSel(null); setCanonRule(null); setCanonGroup(null); setOrthoCat(null); setSuraFilter(null); setPreview(null); setQ(""); };
  const clearDetail = () => { setSel(null); setCanonSel(null); setSuraFilter(null); setPreview(null); };

  const isOrtho = !!sel && sel.startsWith("o|");
  const inDetail = !!sel || !!canonSel;

  // Catalogues (each cached by verseData inside analytics; built per active tab).
  const variants = useMemo(() => (open && tab === "internal" ? rasmVariants(verseData) : EMPTY), [open, tab, verseData]);
  const ortho = useMemo(() => (open && tab === "ortho" ? rasmOrthography(verseData) : null), [open, tab, verseData]);
  const rawCanon = useMemo(() => (open && tab === "canon" ? reconcileCanon(verseData) : null), [open, tab, verseData]);
  // Only show what's actually in the Ḥafṣ text: drop entries the reconciler couldn't locate (found===0),
  // and any group/rule left empty. (CSV export still carries the full audit, including detected=0.)
  const canon = useMemo(() => {
    if (!rawCanon) return null;
    return { ...rawCanon, rules: rawCanon.rules.map((rule) => ({
      ...rule,
      groups: rule.groups.map((g) => ({ ...g, entries: g.entries.filter((e) => e.found > 0 && e.differs) })).filter((g) => g.entries.length),
    })).filter((rule) => rule.groups.length) };
  }, [rawCanon]);
  const profile = useMemo(() => {
    if (!open || !sel) return null;
    return sel.startsWith("o|") ? orthoProfile(verseData, sel) : rasmProfile(verseData, sel);
  }, [open, sel, verseData]);

  // Internal-tab filter. Matching is on the NORMALISED skeleton so the box works by how the word is
  // pronounced (diacritics-insensitive), not only by the exact drawn rasm — e.g. حقّ, صلاة all hit.
  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return variants;
    return variants.filter((e) => norm(e.display).includes(needle) || norm(e.lemma || "").includes(needle) || e.forms.some((f) => norm(f.display).includes(needle) || norm(f.rasm).includes(needle)));
  }, [variants, q]);
  const listR = useReveal(CAP, filtered);

  // Ortho-tab filter, regrouped by device category. Normalised match against the drawn form AND the
  // spelled-out (pronounced) form, so typing the pronunciation finds it — حتا → حَتَّىٰ, صلاة → ٱلصَّلَوٰة.
  const orthoFiltered = useMemo(() => {
    if (!ortho) return EMPTY;
    const needle = norm(q.trim());
    const forms = needle ? ortho.forms.filter((f) => norm(f.drawn).includes(needle) || norm(f.plene).includes(needle) || norm(f.rasm).includes(needle)) : ortho.forms;
    return ORTHO_CATEGORIES.map((key) => ({ key, forms: forms.filter((f) => f.category === key) })).filter((g) => g.forms.length);
  }, [ortho, q]);

  // Canon-tab filter (over all reconciled entries; keep group/rule structure).
  const canonFiltered = useMemo(() => {
    if (!canon) return EMPTY;
    const needle = norm(q.trim());
    return canon.rules.map((rule) => ({
      ...rule,
      groups: rule.groups.map((g) => ({
        ...g,
        entries: needle ? g.entries.filter((e) => norm(e.rasm).includes(needle) || norm(e.modern || "").includes(needle)) : g.entries,
      })).filter((g) => g.entries.length),
    })).filter((rule) => rule.groups.length);
  }, [canon, q]);

  // Per-rule roll-up for the six-rule overview cards: entries, how many located, total occurrences.
  const canonRules = useMemo(() => {
    if (!canon) return EMPTY;
    return canon.rules.map((rule) => {
      const entries = rule.groups.flatMap((g) => g.entries);
      return { rule, total: entries.length, located: entries.filter((e) => e.found > 0).length, occ: entries.reduce((s, e) => s + e.found, 0) };
    });
  }, [canon]);
  const activeRule = useMemo(() => (canon && canonRule ? canon.rules.find((r) => r.id === canonRule) : null), [canon, canonRule]);
  // Within a rule: a single-group rule shows its entries directly; a multi-group rule shows group
  // cards first, then the chosen group's entries. `activeGroup` is the group whose entries to show.
  const activeGroup = useMemo(() => {
    if (!activeRule) return null;
    if (activeRule.groups.length === 1) return activeRule.groups[0];
    return canonGroup ? activeRule.groups.find((g) => g.id === canonGroup) : null;
  }, [activeRule, canonGroup]);
  const showGroupCards = !!activeRule && activeRule.groups.length > 1 && !activeGroup;
  const activeOrthoCat = useMemo(() => (ortho && orthoCat ? ortho.byCategory.find((g) => g.key === orthoCat) : null), [ortho, orthoCat]);
  // Drilled-in long-vowel device: reveal its forms in pages (no static "+N more" dead-end).
  const orthoR = useReveal(ORTHO_CAP, activeOrthoCat ? activeOrthoCat.forms : EMPTY);

  // āyāt list source: canon entry's located verses · ortho single list · internal — one spelling's
  // verses, or (formSel === null) every spelling merged into one muṣḥaf-ordered list.
  const formVerses = useMemo(() => {
    if (canonSel) return canonSel.entry.verses || EMPTY;
    if (!profile) return EMPTY;
    if (isOrtho) return profile.verseList;
    if (formSel != null) return profile.formVerses[formSel] || EMPTY;
    const m = new Map(); // vk → merged word-indices across all spellings
    for (const fv of profile.formVerses) for (const { vk, idx } of fv) {
      const cur = m.get(vk); if (cur) for (const x of idx) cur.push(x); else m.set(vk, [...idx]);
    }
    return [...m.entries()].map(([vk, idx]) => ({ vk, idx }))
      .sort((a, b) => { const va = verseData[a.vk], vb = verseData[b.vk]; return (va.s - vb.s) || (va.a - vb.a); });
  }, [canonSel, profile, formSel, isOrtho, verseData]);
  // STABLE key array — a fresh `.map()` each render would make useVerseFilter's output churn,
  // and useReveal resets-on-key-change would then setState every render (infinite loop → #301).
  const formVkeys = useMemo(() => formVerses.map((v) => v.vk), [formVerses]);
  const { filtered: ayatView, controls: ayatFilter } = useVerseFilter(formVkeys, verseData);
  const idxByVk = useMemo(() => { const m = new Map(); for (const v of formVerses) m.set(v.vk, v.idx); return m; }, [formVerses]);
  // A clicked by-sūra bar narrows the āyāt list to that sūra; the reveal pages whatever's shown.
  const shownAyat = useMemo(() => (suraFilter ? ayatView.filter((vk) => verseData[vk] && verseData[vk].s === suraFilter) : ayatView), [ayatView, suraFilter, verseData]);
  const ayatR = useReveal(CAP, shownAyat);

  if (!open) return null;
  const pv = preview ? verseData[preview] : null;
  const navTo = (vk) => { const [s, a] = vk.split(":").map(Number); onNavigate?.(s, a); };
  const headWord = canonSel ? canonSel.entry.rasm : (activeGroup && !showGroupCards) ? rn(activeGroup) : activeRule ? rn(activeRule) : activeOrthoCat ? t(`rasm.catShort.${orthoCat}`) : (profile ? (isOrtho ? profile.drawn : profile.display) : t("rasm.title"));
  // Layered back: entry → its group's entries; group → the rule's group cards; rule → the rule overview;
  // ortho device → its overview; profile → the catalogue.
  const back = canonSel ? () => { setCanonSel(null); setPreview(null); }
    : sel ? clearDetail
    : (tab === "canon" && canonGroup) ? () => { setCanonGroup(null); setPreview(null); }
    : (tab === "canon" && canonRule) ? () => { setCanonRule(null); setPreview(null); }
    : (tab === "ortho" && orthoCat) ? () => { setOrthoCat(null); setPreview(null); }
    : undefined;
  const backLabel = (tab === "canon" && canonGroup && !canonSel) ? t("rasm.backGroups")
    : (tab === "canon" && canonRule && !canonSel) ? t("rasm.backRules")
    : (tab === "ortho" && orthoCat && !sel) ? t("rasm.backCats")
    : t("rasm.back");

  // One rule's groups + entries (shared by the flat search view and the drilled-in rule view). The
  // rule header is omitted when drilled in (the modal title already shows it) but kept for search hits.
  // One group's entries (rasm → modern, with the located/canon count badge). Reused by the flat search
  // (all groups under a rule header) and the drilled-in single-group view.
  const renderGroup = (rule, g) => (
    <div key={g.id} style={{ marginBlockStart: "var(--space-2)" }}>
      <div className="ag-dist-sec-h" style={{ borderBlockStart: "none" }}><span style={{ color: "var(--gold-400)" }}>{rn(g)} ({fmtNum(g.entries.length)})</span></div>
      <ul className="ag-phrase-list">
        {g.entries.map((e, i) => (
          <li key={i}>
            <button type="button" className="ag-modal-row" style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", opacity: e.found === 0 ? 0.6 : 1 }}
              onClick={() => { setCanonSel({ entry: e, rule, group: g }); setPreview(null); }} disabled={e.found === 0}>
              <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-lg)", color: "var(--gold-400)" }}>{e.rasm}</span>
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <span style={{ fontFamily: "var(--font-quran)", color: "#34d8a8" }}>{e.modern}</span>
              <span className="ag-dist-num" style={{ marginInlineStart: "auto" }}>
                {e.found === 0
                  ? <span style={{ color: "var(--text-faint)" }}>❌ {t("rasm.notLocated")}</span>
                  : e.count != null
                    ? <span style={{ color: e.found === e.count ? "#34d8a8" : "var(--rubric-400)" }}>{e.found === e.count ? "✓" : "⚠"} {fmtNum(e.found)}{e.found !== e.count ? ` / ${fmtNum(e.count)}` : ""}</span>
                    : <span style={{ color: "var(--gold-400)" }}>{fmtNum(e.found)}×</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
  // A whole rule's groups (flat search view — keeps the rule header to place each hit).
  const renderRule = (rule, showHead) => (
    <div key={rule.id} className="ag-dist-sec" style={{ marginBlockStart: "var(--space-3)" }}>
      {showHead && <div className="ag-dist-sec-h"><span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>{rule.ar} · {rule.en}</span></div>}
      {showHead && <p className="ag-hint" style={{ marginBlockStart: 2 }}>{rd(rule)}</p>}
      {rule.groups.map((g) => renderGroup(rule, g))}
    </div>
  );

  // One long-vowel device's forms (drawn → ā-in-full), shared by the flat search and drilled-in views.
  // With a `reveal` (the drilled-in view) the list pages via a Load-more button; without it (flat
  // search, already few rows) it shows up to ORTHO_CAP.
  const renderOrthoForms = (key, forms, showHead, reveal) => (
    <div key={key} className="ag-dist-sec" style={{ marginBlockStart: "var(--space-2)" }}>
      {showHead && <div className="ag-dist-sec-h"><span>{t(`rasm.cat.${key}`)} ({fmtNum(forms.length)})</span></div>}
      {showHead && <p className="ag-hint">{t(`rasm.catHint.${key}`)}</p>}
      <ul className="ag-phrase-list">
        {forms.slice(0, reveal ? reveal.limit : ORTHO_CAP).map((f) => (
          <li key={f.id}>
            <button type="button" className="ag-modal-row" style={{ width: "100%", textAlign: "start", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}
              onClick={() => selectWord(f.id)}>
              <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-lg)", color: "var(--gold-400)" }}>{f.drawn}</span>
              <span style={{ color: "var(--text-faint)" }}>→</span>
              <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-lg)", color: "#34d8a8" }}>{f.plene}</span>
              <span className="ag-dist-num" style={{ marginInlineStart: "auto", color: "var(--gold-400)" }}>{fmtNum(f.count)}×</span>
            </button>
          </li>
        ))}
        {reveal
          ? <li><MoreButton shown={reveal.limit} total={forms.length} step={ORTHO_CAP} onMore={reveal.more} /></li>
          : forms.length > ORTHO_CAP && <li><span className="ag-dist-name">+{fmtNum(forms.length - ORTHO_CAP)} {t("rasm.more")}</span></li>}
      </ul>
    </div>
  );

  return (
    <ModalShell open={open} share tall onClose={onClose} closeLabel={t("common.close")} ariaLabel={t("rasm.title")}
      back={back} backLabel={backLabel}
      title={<>
        <span className="ag-badge t-verse">{t("rasm.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-quran)" }}>{headWord}</h2>
        {canonSel
          ? <span className="ag-modal-count" style={{ fontFamily: "var(--font-quran)" }}>{canonSel.entry.modern} · {fmtNum(canonSel.entry.found)} {t("rasm.occ")}</span>
          : sel && profile
            ? (isOrtho
                ? <span className="ag-modal-count">{fmtNum(profile.count)} {t("rasm.occ")} · {fmtNum(profile.suraCount)} {t("rasm.suras")}</span>
                : <span className="ag-modal-count">{fmtNum(profile.forms.length)} {t("rasm.spellings")} · {fmtNum(profile.total)} {t("rasm.occ")}</span>)
            : activeRule
              ? <span className="ag-modal-count" style={{ fontFamily: "var(--font-display)" }}>{en ? activeRule.ar : activeRule.en}</span>
              : <span className="ag-modal-count">{tab === "internal" ? `${fmtNum(variants.length)} ${t("rasm.words")}` : tab === "ortho" ? `${fmtNum(ortho?.forms.length || 0)} ${t("rasm.forms")}` : t("rasm.sixRules")}</span>}
      </>}
      actions={<>
        <button type="button" className={"ag-btn" + (showHelp ? " is-gold" : "")} aria-pressed={showHelp}
          title={showHelp ? t("rasm.helpHide") : t("rasm.helpShow")} aria-label={showHelp ? t("rasm.helpHide") : t("rasm.helpShow")}
          onClick={() => setShowHelp((v) => !v)}>ⓘ</button>
        {(sel && profile)
          ? <SaveButton item={{ type: "rasm", title: isOrtho ? `${profile.drawn} → ${profile.plene}` : profile.display, payload: { id: sel } }} label={t("ws.save")} />
          : !inDetail && (
            tab === "internal" && variants.length > 0
              ? <button type="button" className="ag-btn" onClick={() => exportJsonFile(variants.map((e) => ({ word: e.display, lemma: e.lemma, total: e.total, suras: e.suraCount, forms: e.forms.map((f) => ({ rasm: f.display, count: f.count, verses: f.verses })) })), "rasm-variants.json")}>⤓ JSON</button>
              : tab === "ortho" && ortho?.forms.length > 0
                ? <button type="button" className="ag-btn" onClick={() => exportCsvFile([[t("rasm.colDrawn"), t("rasm.colPlene"), t("rasm.colCategory"), t("rasm.colCount"), t("rasm.colSuras")], ...ortho.forms.map((f) => [f.drawn, f.plene, t(`rasm.cat.${f.category}`), f.count, f.suraCount])], "rasm-longvowel.csv")}>⤓ CSV</button>
                : tab === "canon" && rawCanon
                  ? <button type="button" className="ag-btn" onClick={() => exportCsvFile([["rule", "group", "rasm", "modern", "refs", "canonCount", "detected", "source"], ...rawCanon.rules.flatMap((r) => r.groups.flatMap((g) => g.entries.map((e) => [r.ar, g.ar, e.rasm, e.modern || "", e.refs || "", e.count ?? "", e.found, e.source || g.source || r.source || ""])))], "rasm-canon.csv")}>⤓ CSV</button>
                  : null
          )}
      </>}>
      <div className="ag-dist-body">
        {!inDetail ? (
          /* ── Catalogue ── */
          <div className="ag-dist-sec">
            {/* tab toggle: internal variants (A) · auto long-vowel (B) · the six rules (canon) — hidden when drilled into one rule */}
            {!activeRule && !activeOrthoCat && (
              <div className="ag-seg ag-seg-sm" role="tablist" aria-label={t("rasm.title")} style={{ marginBlockEnd: "var(--space-2)", flexWrap: "wrap" }}>
                <button type="button" role="tab" aria-selected={tab === "internal"} className={tab === "internal" ? "is-on" : ""} onClick={() => switchTab("internal")}>{t("rasm.tab.internal")}</button>
                <button type="button" role="tab" aria-selected={tab === "ortho"} className={tab === "ortho" ? "is-on" : ""} onClick={() => switchTab("ortho")}>{t("rasm.tab.ortho")}</button>
                <button type="button" role="tab" aria-selected={tab === "canon"} className={tab === "canon" ? "is-on" : ""} onClick={() => switchTab("canon")}>{t("rasm.tab.canon")}</button>
              </div>
            )}
            {showHelp && <p className="ag-hint">{(activeGroup && !showGroupCards) ? rd(activeGroup) : activeRule ? rd(activeRule) : activeOrthoCat ? t(`rasm.catHint.${orthoCat}`) : t(tab === "canon" ? "rasm.canonIntro" : tab === "ortho" ? "rasm.orthoIntro" : "rasm.intro")}</p>}
            {showHelp && tab === "canon" && canon && !activeRule && <p className="ag-hint" style={{ color: "var(--text-faint)" }}>ⓘ {en && canon.meta.transmissionEn ? canon.meta.transmissionEn : canon.meta.transmission} — {t("rasm.canonMethod")}</p>}
            {showHelp && tab === "internal" && !morph && <p className="ag-hint" style={{ color: "var(--text-faint)" }}>ⓘ {t("rasm.morphNote")}</p>}
            <input className="ag-input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t("rasm.filter")} aria-label={t("rasm.filter")} style={{ width: "100%", marginBlock: "var(--space-2)" }} dir="rtl" />

            {tab === "internal" ? (
              filtered.length === 0 ? <span className="ag-dist-name">{t("rasm.none")}</span> : (
                <ul className="ag-phrase-list">
                  {filtered.slice(0, listR.limit).map((e) => (
                    <li key={e.id}>
                      <button type="button" className="ag-modal-row" style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
                        onClick={() => selectWord(e.id)}>
                        <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-lg)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {e.forms.map((f, i) => (
                            <span key={f.rasm} style={{ color: FORM_COLORS[i % FORM_COLORS.length] }}>
                              {f.display}<b style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)", marginInlineStart: 3 }}>{fmtNum(f.count)}</b>
                            </span>
                          ))}
                        </span>
                        {e.lemma && <span className="ag-tag" style={{ fontFamily: "var(--font-quran)", color: "var(--text-faint)" }}>{e.lemma}</span>}
                        <span className="ag-dist-num" style={{ marginInlineStart: "auto", color: "var(--gold-400)" }}>{fmtNum(e.suraCount)} {t("rasm.suras")}</span>
                      </button>
                    </li>
                  ))}
                  <li><MoreButton shown={listR.limit} total={filtered.length} step={CAP} onMore={listR.more} /></li>
                </ul>
              )
            ) : tab === "ortho" ? (
              !ortho ? <span className="ag-dist-name">{t("ui.loading")}</span> :
              q.trim() ? (
                /* search across categories → flat results (category header kept to place each hit) */
                orthoFiltered.length === 0 ? <span className="ag-dist-name">{t("rasm.none")}</span>
                  : orthoFiltered.map((g) => renderOrthoForms(g.key, g.forms, true))
              ) : activeOrthoCat ? (
                /* one device drilled into → just its forms (paged) */
                renderOrthoForms(activeOrthoCat.key, activeOrthoCat.forms, false, orthoR)
              ) : (
                /* the devices as overview cards */
                <ol className="ag-canon-rules" style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}>
                  {ortho.byCategory.map((g) => (
                    <li key={g.key}>
                      <button type="button" className="ag-modal-row" style={{ width: "100%", height: "100%", textAlign: "start", display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", padding: "var(--space-2)" }}
                        onClick={() => { setOrthoCat(g.key); setPreview(null); }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-base)", color: "var(--gold-400)" }}>{t(`rasm.catShort.${g.key}`)}</span>
                        <span className="ag-hint" style={{ margin: 0, fontSize: "var(--text-xs)", flex: "1 1 auto" }}>{t(`rasm.catHint.${g.key}`)}</span>
                        <span className="ag-dist-num" style={{ color: "var(--text-faint)" }}>{fmtNum(g.forms.length)} {t("rasm.forms")} · {fmtNum(g.count)}×</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )
            ) : (
              /* canon: the six rules of رسم المصحف — overview cards → one rule's entries → entry profile */
              !canon ? <span className="ag-dist-name">{t("ui.loading")}</span> :
              q.trim() ? (
                /* search across all rules → flat results (rule header kept to place each hit) */
                canonFiltered.length === 0 ? <span className="ag-dist-name">{t("rasm.none")}</span>
                  : canonFiltered.map((rule) => renderRule(rule, true))
              ) : showGroupCards ? (
                /* multi-group rule → its sub-groups as cards */
                <ol className="ag-canon-rules" style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}>
                  {activeRule.groups.map((g, i) => (
                    <li key={g.id}>
                      <button type="button" className="ag-modal-row" style={{ width: "100%", height: "100%", textAlign: "start", display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", padding: "var(--space-2)" }}
                        onClick={() => { setCanonGroup(g.id); setPreview(null); }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span className="ag-badge t-verse" style={{ flex: "0 0 auto" }}>{fmtNum(i + 1)}</span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-base)", color: "var(--gold-400)" }}>{rn(g)}</span>
                        </span>
                        <span className="ag-hint" style={{ margin: 0, fontSize: "var(--text-xs)", flex: "1 1 auto" }}>{rd(g)}</span>
                        <span className="ag-dist-num" style={{ color: "var(--text-faint)" }}>{fmtNum(g.entries.length)} {t("rasm.entries")}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : activeGroup ? (
                /* a single/chosen group → its entries */
                renderGroup(activeRule, activeGroup)
              ) : (
                /* the rules as a stepped overview grid */
                <ol className="ag-canon-rules" style={{ display: "grid", gap: "var(--space-2)", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", listStyle: "none", padding: 0, margin: 0 }}>
                  {canonRules.map(({ rule, total, occ }, i) => (
                    <li key={rule.id}>
                      <button type="button" className="ag-modal-row" style={{ width: "100%", height: "100%", textAlign: "start", display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", padding: "var(--space-2)" }}
                        onClick={() => { setCanonRule(rule.id); setPreview(null); }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span className="ag-badge t-verse" style={{ flex: "0 0 auto" }}>{fmtNum(i + 1)}</span>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", color: "var(--gold-400)" }}>{rn(rule)}</span>
                        </span>
                        <span style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{en ? rule.ar : rule.en}</span>
                        <span className="ag-hint" style={{ margin: 0, fontSize: "var(--text-xs)", flex: "1 1 auto" }}>{rd(rule)}</span>
                        <span className="ag-dist-num" style={{ color: "var(--text-faint)" }}>
                          {fmtNum(total)} {t("rasm.entries")} · {fmtNum(occ)}×
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )
            )}
          </div>
        ) : canonSel ? (
          /* ── Canon entry profile (rasm → modern, source, located āyāt) ── */
          <div className="ag-dist-sec">
            <div className="ag-dist-bars" style={{ marginBlockEnd: "var(--space-2)" }}>
              <div className="ag-dist-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-xl)", color: "var(--gold-400)" }}>{canonSel.entry.rasm}</span>
                <span style={{ color: "var(--text-faint)", margin: "0 6px" }}>→</span>
                <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-xl)", color: "#34d8a8" }}>{canonSel.entry.modern}</span>
                <span className="ag-tag" style={{ marginInlineStart: "auto" }}>{rn(canonSel.rule)} · {rn(canonSel.group)}</span>
              </div>
            </div>
            {showHelp && <p className="ag-hint" style={{ color: "var(--text-faint)", fontSize: "var(--text-xs)" }}>{t("rasm.greenNote")}</p>}
            {canonSel.entry.note && <p className="ag-hint">{canonSel.entry.note}</p>}
            <p className="ag-hint">{t("rasm.refs")}: <span style={{ fontFamily: "var(--font-quran)" }}>{canonSel.entry.refs || "—"}</span>
              {canonSel.entry.count != null && <> · {t("rasm.canonCount")}: {fmtNum(canonSel.entry.count)} · {t("rasm.detected")}: {fmtNum(canonSel.entry.found)} {canonSel.entry.found === canonSel.entry.count ? "✓" : "⚠"}</>}
            </p>
            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-2)" }}>
              <span style={{ fontFamily: "var(--font-quran)", color: "var(--gold-400)" }}>{canonSel.entry.rasm}</span>
              <span className="ag-dist-num">{fmtNum(formVerses.length)} {t("rasm.ayat")}</span>
            </div>
            {ayatFilter}
            {shownAyat.length === 0 ? <span className="ag-dist-name">{t("rasm.notLocatedHint")}</span> : (
              <ul className="ag-phrase-list">
                {shownAyat.slice(0, ayatR.limit).map((vk) => { const v = verseData[vk]; if (!v) return null; return (
                  <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                    <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                    <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      <HighlightedAyah text={v.text} highlightIndices={new Set(idxByVk.get(vk) || [])} theme={theme} />
                    </span>
                  </button></li>
                ); })}
                <li><MoreButton shown={ayatR.limit} total={shownAyat.length} step={CAP} onMore={ayatR.more} /></li>
              </ul>
            )}
          </div>
        ) : profile && (isOrtho ? (
          /* ── Profile (long-vowel rasm: drawn vs plene) ── */
          <div className="ag-dist-sec">
            <div className="ag-dist-bars" style={{ marginBlockEnd: "var(--space-2)" }}>
              <div className="ag-dist-row" style={{ alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-xl)", color: "var(--gold-400)" }}>{profile.drawn}</span>
                <span style={{ color: "var(--text-faint)", margin: "0 8px" }}>→</span>
                <span style={{ fontFamily: "var(--font-quran)", fontSize: "var(--text-xl)", color: "#34d8a8" }}>{profile.plene}</span>
                <span className="ag-tag" style={{ marginInlineStart: "auto" }}>{t(`rasm.cat.${profile.category}`)}</span>
              </div>
            </div>
            {showHelp && <p className="ag-hint">{t("rasm.orthoProfileHint")}</p>}

            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-2)" }}><span>{t("rasm.bySura")} ({fmtNum(profile.bySura.length)})</span>{suraFilter && <button type="button" className="ag-btn" onClick={() => setSuraFilter(null)}>{t("rasm.allSuras")}</button>}</div>
            <div className="ag-dist-bars">
              {profile.bySura.map((d) => {
                const max = profile.bySura.reduce((m, x) => Math.max(m, x.count), 1);
                return (
                  <button type="button" className={"ag-dist-row ag-dist-rowbtn" + (suraFilter === d.sura ? " is-on" : "")} key={d.sura}
                    onClick={() => { setSuraFilter(suraFilter === d.sura ? null : d.sura); setPreview(null); }} aria-pressed={suraFilter === d.sura} title={t("rasm.filterSura")}>
                    <span className="ag-dist-name">{d.sura}. {d.name}</span>
                    <span className="ag-dist-num">{fmtNum(d.count)}</span>
                    <span className="ag-dist-barwrap"><span className="ag-dist-bar" style={{ width: `${(d.count / max) * 100}%`, background: "var(--gold-500)" }} /></span>
                  </button>
                );
              })}
            </div>

            <div className="ag-dist-sec-h" style={{ marginBlockStart: "var(--space-3)" }}>
              <span style={{ fontFamily: "var(--font-quran)", color: "var(--gold-400)" }}>{profile.drawn}</span>
              <span className="ag-dist-num">{fmtNum(formVerses.length)} {t("rasm.ayat")}</span>
            </div>
            {ayatFilter}
            {shownAyat.length === 0 ? <span className="ag-dist-name">{t("rasm.none")}</span> : (
              <ul className="ag-phrase-list">
                {shownAyat.slice(0, ayatR.limit).map((vk) => { const v = verseData[vk]; if (!v) return null; return (
                  <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                    <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                    <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                      <HighlightedAyah text={v.text} highlightIndices={new Set(idxByVk.get(vk) || [])} theme={theme} />
                    </span>
                  </button></li>
                ); })}
                <li><MoreButton shown={ayatR.limit} total={shownAyat.length} step={CAP} onMore={ayatR.more} /></li>
              </ul>
            )}
          </div>
        ) : (
          /* ── Profile (internal variants) — pinned spellings headline + stepped sub-views ── */
          (() => {
            const all = formSel == null;
            const valOf = (d) => all ? d.counts.reduce((a, b) => a + b, 0) : d.counts[formSel];
            const suraRows = all ? profile.bySura : profile.bySura.filter((d) => d.counts[formSel] > 0);
            const suraMax = suraRows.reduce((m, d) => Math.max(m, valOf(d)), 1);
            const scopeLabel = all ? t("rasm.allSpellings") : profile.forms[formSel]?.display;
            const tabs = [["verses", t("rasm.viewVerses"), formVerses.length], ["sura", t("rasm.viewSura"), suraRows.length], ["timeline", t("rasm.viewTimeline"), profile.total]];
            return (
              <div className="ag-dist-sec">
                {/* PINNED HEADLINE: the spellings comparison (= the scope control) + the sub-view switch,
                    and — in the Verses view — the āya filter. All of it stays fixed while the active view
                    scrolls under it; selecting "All" or one spelling re-scopes every view in lock-step. */}
                <div className="ag-rasm-pin">
                  <div className="ag-dist-sec-h" style={{ borderBlockStart: "none" }}><span className="ag-rasm-pinlabel">{t("rasm.spellingsH")}</span>
                    <span style={{ display: "flex", gap: 6, marginInlineStart: "auto", alignItems: "center" }}>
                      <button type="button" className={"ag-btn" + (all ? " is-gold" : "")} aria-pressed={all}
                        onClick={() => { setFormSel(null); setSuraFilter(null); setPreview(null); }}>{t("rasm.allSpellings")} ({fmtNum(profile.total)})</button>
                      <button type="button" data-export className="ag-btn" onClick={() => exportCsvFile([[t("rasm.colSpelling"), t("rasm.colCount"), t("rasm.colVerses"), t("rasm.colFirst"), t("rasm.colLast")], ...profile.forms.map((f) => [f.display, f.count, f.verses, f.first, f.last])], `rasm-${profile.pron}.csv`)}>⤓ CSV</button>
                    </span>
                  </div>
                  <div className="ag-dist-bars">
                    {profile.forms.map((f, i) => (
                      <button type="button" key={f.rasm} className={"ag-dist-row ag-dist-rowbtn" + (formSel === i ? " is-on" : "")} onClick={() => { setFormSel(formSel === i ? null : i); setSuraFilter(null); setPreview(null); }} aria-pressed={formSel === i} title={t("rasm.showAyat")} style={{ opacity: formSel != null && formSel !== i ? 0.5 : 1 }}>
                        <span className="ag-dist-name" style={{ fontFamily: "var(--font-quran)", color: FORM_COLORS[i % FORM_COLORS.length], fontSize: "var(--text-lg)" }}>{f.display}</span>
                        <span className="ag-dist-num">{fmtNum(f.count)} ({Math.round((f.count / profile.total) * 100)}%)</span>
                        <span className="ag-dist-barwrap"><span className="ag-dist-bar" style={{ width: `${(f.count / profile.total) * 100}%`, background: FORM_COLORS[i % FORM_COLORS.length] }} /></span>
                      </button>
                    ))}
                  </div>
                  <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {tabs.map(([key, label, n]) => (
                      <button key={key} type="button" role="tab" aria-selected={profileView === key} className={"ag-btn" + (profileView === key ? " is-gold" : "")}
                        onClick={() => setProfileView(key)}>{label} <span style={{ opacity: 0.65 }}>{fmtNum(n)}</span></button>
                    ))}
                  </div>
                  {/* Verses scope + filter live IN the pin so they don't scroll away with the list. */}
                  {profileView === "verses" && (
                    <>
                      <div className="ag-dist-sec-h" style={{ borderBlockStart: "none" }}>
                        <span style={{ fontFamily: !all ? "var(--font-quran)" : undefined, fontSize: !all ? "var(--text-lg)" : undefined, color: !all ? FORM_COLORS[formSel % FORM_COLORS.length] : "var(--gold-400)" }}>
                          {scopeLabel}
                          {suraFilter && <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>{" "}{t("rasm.inSura", { sura: profile.bySura.find((d) => d.sura === suraFilter)?.name })}</span>}
                        </span>
                        <span style={{ display: "flex", gap: 6, marginInlineStart: "auto", alignItems: "center" }}>
                          {suraFilter && <button type="button" className="ag-btn" onClick={() => { setSuraFilter(null); setPreview(null); }}>{t("rasm.allSuras")}</button>}
                          <span className="ag-dist-num">{fmtNum(shownAyat.length)} {t("rasm.ayat")}</span>
                        </span>
                      </div>
                      {ayatFilter}
                    </>
                  )}
                </div>

                {/* ── VERSES — the selection's āyāt (spelling ∩ sūra), exact form highlighted in place ── */}
                {profileView === "verses" && (
                  <>
                    {shownAyat.length === 0 ? <span className="ag-dist-name">{t("rasm.none")}</span> : (
                      <ul className="ag-phrase-list">
                        {shownAyat.slice(0, ayatR.limit).map((vk) => { const v = verseData[vk]; if (!v) return null; return (
                          <li key={vk}><button type="button" className={"ag-modal-row" + (preview === vk ? " is-on" : "")} style={{ width: "100%", textAlign: "start", display: "flex", gap: 8, alignItems: "baseline" }} onClick={() => setPreview(vk)} aria-pressed={preview === vk}>
                            <span className="ag-ayah-ref" style={{ flexShrink: 0 }}><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{fmtNum(v.a)}</span></span>
                            <span className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                              <HighlightedAyah text={v.text} highlightIndices={new Set(idxByVk.get(vk) || [])} theme={theme} />
                            </span>
                          </button></li>
                        ); })}
                        <li><MoreButton shown={ayatR.limit} total={shownAyat.length} step={CAP} onMore={ayatR.more} /></li>
                      </ul>
                    )}
                  </>
                )}

                {/* ── BY SŪRA — scoped distribution; tap a sūra to read its āyāt (jumps to Verses) ── */}
                {profileView === "sura" && (
                  <div className="ag-dist-bars" style={{ marginBlockStart: "var(--space-2)" }}>
                    {suraRows.map((d) => {
                      const tot = valOf(d);
                      return (
                        <button type="button" className={"ag-dist-row ag-dist-rowbtn" + (suraFilter === d.sura ? " is-on" : "")} key={d.sura}
                          onClick={() => { setSuraFilter(d.sura); setProfileView("verses"); setPreview(null); }} aria-pressed={suraFilter === d.sura}
                          title={d.counts.map((c, i) => c ? `${profile.forms[i].display}: ${c}` : null).filter(Boolean).join(" · ")}>
                          <span className="ag-dist-name">{d.sura}. {d.name}</span>
                          <span className="ag-dist-num">{fmtNum(tot)}</span>
                          <span className="ag-dist-barwrap" style={{ display: "flex" }}>
                            {all
                              ? d.counts.map((c, i) => c > 0 ? <span key={i} className="ag-dist-bar" style={{ width: `${(c / suraMax) * 100}%`, background: FORM_COLORS[i % FORM_COLORS.length] }} title={`${profile.forms[i].display}: ${c}`} /> : null)
                              : <span className="ag-dist-bar" style={{ width: `${(tot / suraMax) * 100}%`, background: FORM_COLORS[formSel % FORM_COLORS.length] }} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── TIMELINE — every occurrence in muṣḥaf order; selected spelling lit, rest dimmed ── */}
                {profileView === "timeline" && (
                  <>
                    <p className="ag-hint" style={{ marginBlockStart: "var(--space-2)" }}>
                      {t("rasm.statLine", { suras: fmtNum(profile.suraCount), switches: fmtNum(profile.switches.length) })}
                      {" "}{profile.forms.map((f, i) => `${f.display}: ${t("rasm.run", { n: fmtNum(profile.longestRun[i]) })}`).join(" · ")}
                    </p>
                    {showHelp && <p className="ag-hint">{t("rasm.timelineHint")}</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBlock: "var(--space-2)", maxHeight: 220, overflowY: "auto", padding: 2 }}>
                      {profile.timeline.map((tk, i) => (
                        <span key={i} title={`${verseData[tk.vk]?.sn} ${verseData[tk.vk]?.a} — ${profile.forms[tk.f].display}`}
                          onClick={() => setPreview(tk.vk)} role="button" tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreview(tk.vk); } }}
                          style={{ width: 11, height: 18, borderRadius: 2, cursor: "pointer", background: FORM_COLORS[tk.f % FORM_COLORS.length], opacity: preview === tk.vk ? 1 : (formSel != null && tk.f !== formSel ? 0.15 : 0.82), outline: preview === tk.vk ? "2px solid var(--text)" : "none" }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()
        ))}

        {/* sticky inline preview — read an āya in place; ⌖ jumps the graph in رسم mode */}
        {pv && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, marginBlockStart: "var(--space-3)", padding: "var(--space-2) var(--space-3)",
            background: "var(--ink-800)", borderBlockStart: "2px solid var(--gold-500)", borderRadius: "var(--radius-sm)", boxShadow: "0 -10px 22px -10px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="ag-ayah-ref"><span className="ag-ayah-surah">{pv.sn}</span><span className="ag-ayah-num">{fmtNum(pv.a)}</span></span>
              <span style={{ display: "flex", gap: 4 }}>
                {onNavigate && <button type="button" className="ag-btn is-gold" title={t("rasm.goTo")} onClick={() => navTo(preview)}>⌖ {t("aya.goTo")}</button>}
                <button type="button" className="ag-iconbtn" title={t("common.close")} aria-label={t("common.close")} style={{ width: 26, height: 26 }} onClick={() => setPreview(null)}>✕</button>
              </span>
            </div>
            <div className="ag-modal-text" style={{ fontFamily: "var(--font-quran)", marginBlockStart: 4, lineHeight: 1.9 }}>
              <HighlightedAyah text={pv.text} highlightIndices={(profile || canonSel) ? new Set(idxByVk.get(preview) || []) : undefined} theme={theme} />
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
