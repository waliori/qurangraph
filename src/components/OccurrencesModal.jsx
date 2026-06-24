import { useMemo, useState } from "react";
import { HighlightedAyah } from "./HighlightedAyah.jsx";
import { ModalShell } from "./ModalShell.jsx";
import { SaveButton } from "./SaveButton.jsx";
import { exportCsvFile, exportJsonFile, exportTextFile, buildConcordance, buildResultBibtex } from "../graph/exportGraph.js";
import { wordGroupKey } from "../arabic-utils.js";
import { roleAt, roleBreakdown, ROLE_AR, ROLE_EN } from "../analytics/role.js";
import { useVirtualRows } from "../hooks/useVirtualRows.js";
import { useVerseFilter } from "./VerseFilter.jsx";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

/* OccurrencesModal — a scrollable popup listing every āyah a word (or its root)
 * occurs in, the current verse first. Each row is clickable to re-centre the
 * graph on that āyah. Driven by `occ = { lookup, label, mode, keys }`. The list is
 * virtualized (useVirtualRows) so even اللّٰه (~2700 occurrences) opens instantly.
 *
 * Three workbench layers ride on top (all off by default, so the plain reader is unchanged):
 *   - الإعراب (role): a per-row syntactic-role chip + an aggregate breakdown — needs `morph`.
 *   - الترميز (coding): tag each verse into the workspace's categories, with live tallies.
 *   - claim pin: drop any verse onto a claim's "supports / challenges" column. */
export function OccurrencesModal({ occ, verseData, searchMode, precision = "loose", morph, theme, onNavigate, onBack, onClose }) {
  const { t, tn, lang } = useI18n();
  const ws = useWorkspace();
  // Full occurrence set drives the header count, exports and citation (a stable fact);
  // the sūra/āya filter scopes only the VIEW (list + role breakdown).
  const allKeys = useMemo(() => occ?.keys || [], [occ]);
  const total = allKeys.length;
  const { filtered: keys, controls: filterControls, filterKey } = useVerseFilter(allKeys, verseData);
  const n = keys.length;
  const { scrollRef, rowRef, onScroll, start, end, padTop, padBottom, listProps, rowProps } =
    useVirtualRows({ count: n, est: 92, resetKey: `${occ?.lookup}|${occ?.mode}|${filterKey}|${n}` });
  const [roleOn, setRoleOn] = useState(false);
  const [coding, setCoding] = useState(false);
  const [menuVk, setMenuVk] = useState(null);   // open tag menu for this verse
  const [pinVk, setPinVk] = useState(null);     // open claim-pin menu for this verse
  const [newTag, setNewTag] = useState("");
  const [newClaim, setNewClaim] = useState(""); // statement typed when pinning to a brand-new claim
  const [tagFilter, setTagFilter] = useState("");     // filter the tag-assign menu when many tags exist
  const [claimFilter, setClaimFilter] = useState(""); // filter the claim-pin menu when many claims exist
  const FILTER_MIN = 8; // show a search box once a list is longer than this
  const ROLE = lang === "en" ? ROLE_EN : ROLE_AR;

  const primary = occ?.lookup;

  // The word positions of the term in a verse — occ.hi (expressions/construction) when supplied,
  // else the mode-grouped positions, else an exact-skeleton fallback. One source for highlight,
  // role, and the KWIC export.
  const posFor = useMemo(() => (vk) => {
    const v = verseData[vk];
    if (!v?.words) return [];
    if (occ?.hi && occ.hi[vk]) return occ.hi[vk];
    const out = [];
    for (let i = 0; i < v.words.length; i++) if (wordGroupKey(v.words[i], occ.mode) === primary) out.push(i);
    if (out.length) return out;
    for (let i = 0; i < v.words.length; i++) if (v.words[i].norm === primary || v.words[i].exact === primary) return [i];
    return [];
  }, [verseData, occ, primary]);

  // Aggregate role breakdown (lazy — only when the lens is on and morphology is loaded).
  const breakdown = useMemo(() => (roleOn && morph ? roleBreakdown(morph, verseData, keys, posFor) : null), [roleOn, morph, verseData, keys, posFor]);
  // Per-tag count within THIS list (vs the global tally the sidebar also shows).
  const inListCounts = useMemo(() => {
    const out = {};
    const set = new Set(keys);
    for (const [vk, ids] of Object.entries(ws.tagAssign || {})) if (set.has(vk)) for (const id of ids) out[id] = (out[id] || 0) + 1;
    return out;
  }, [ws.tagAssign, keys]);

  if (!occ) return null;
  const pinToClaim = (vk, side, claimId, statement) => {
    let id = claimId;
    let label;
    if (!id) { id = ws.addClaim(statement || ""); label = statement; }
    else label = ws.claims.find((x) => x.id === id)?.statement;
    ws.addClaimRef(id, side, vk, "");
    ws.toast(t("claim.pinned", { label: (label || "").slice(0, 24) || t("claim.title") }));
    setPinVk(null); setNewClaim("");
  };

  const rows = [];
  for (let i = start; i < end; i++) {
    const vk = keys[i];
    const v = verseData[vk];
    if (!v) continue;
    const hiIdx = (occ.hi && occ.hi[vk]) ? new Set(occ.hi[vk])
      : (occ.mode === "lemma" || occ.mode === "root") ? new Set(posFor(vk)) : null;
    const vkTags = ws.tagsForVerse ? ws.tagsForVerse(vk) : [];
    let roleLabel = null;
    if (roleOn && morph) { const p = posFor(vk); if (p.length) roleLabel = ROLE[roleAt(morph, verseData, vk, p[0]).role]; }
    rows.push(
      <li key={vk} ref={rowRef(i)} className="ag-occ-li">
        <div className="ag-occ-rowwrap">
          <button type="button" {...rowProps(i)} className={"ag-modal-row" + (i === 0 ? " is-current" : "")}
            onClick={() => onNavigate(v.s, v.a)} title={t("occ.makeCenter")}>
            <span className="ag-ayah-ref">
              <span className="ag-ayah-surah">{v.sn}</span>
              <span className="ag-ayah-num">{v.a}</span>
            </span>
            <span className="ag-modal-text">
              {hiIdx
                ? <HighlightedAyah text={v.text} highlightIndices={hiIdx} theme={theme} />
                : <HighlightedAyah text={v.text} primaryWord={primary} searchMode={searchMode} precision={precision} theme={theme} />}
            </span>
            {roleLabel && <span className="ag-role-chip" title={t("role.title")}>{roleLabel}</span>}
          </button>
          <span className="ag-occ-tools">
            <button type="button" className="ag-iconbtn ag-occ-tool" title={t("claim.pin")} aria-label={t("claim.pin")}
              onClick={() => { setPinVk(pinVk === vk ? null : vk); setMenuVk(null); }}>⚐</button>
            {coding && (
              <button type="button" className="ag-iconbtn ag-occ-tool" title={t("tag.assignTitle")} aria-label={t("tag.assignTitle")}
                onClick={() => { setMenuVk(menuVk === vk ? null : vk); setPinVk(null); }}>🏷</button>
            )}
            {vkTags.map((id) => { const tag = ws.tags.find((x) => x.id === id); return tag ? <span key={id} className="ag-tag-dot" style={{ background: tag.color }} title={tag.label} /> : null; })}
          </span>
        </div>
        {pinVk === vk && (() => {
          const fq = claimFilter.trim();
          const shownClaims = fq ? ws.claims.filter((c) => (c.statement || "").includes(fq)) : ws.claims;
          return (
          <div className="ag-occ-menu" role="menu">
            {ws.claims.length > FILTER_MIN && (
              <input className="ag-input ag-input-sm ag-occ-menu-filter" type="search" value={claimFilter}
                placeholder={t("claim.filterPh")} aria-label={t("claim.filterAria")} onChange={(e) => setClaimFilter(e.target.value)} />
            )}
            {ws.claims.length > 0 && shownClaims.length === 0 && <span className="ag-hint">{t("claim.filterNone")}</span>}
            {shownClaims.map((c) => (
              <div key={c.id} className="ag-occ-menu-row">
                <span className="ag-occ-menu-label">{c.statement?.slice(0, 28) || t("claim.title")}</span>
                <button type="button" className="ag-btn ag-btn-xs" onClick={() => pinToClaim(vk, "support", c.id)}>＋{t("claim.support")}</button>
                <button type="button" className="ag-btn ag-btn-xs" onClick={() => pinToClaim(vk, "oppose", c.id)}>＋{t("claim.oppose")}</button>
              </div>
            ))}
            {/* New claim: type the statement, then pin this verse to one side. */}
            <div className="ag-occ-menu-newclaim">
              <input className="ag-input ag-input-sm" value={newClaim} placeholder={t("claim.statementPh")}
                aria-label={t("claim.add")} onChange={(e) => setNewClaim(e.target.value)} />
              <button type="button" className="ag-btn ag-btn-xs" title={t("claim.pinSupport")} onClick={() => pinToClaim(vk, "support", null, newClaim)}>＋{t("claim.support")}</button>
              <button type="button" className="ag-btn ag-btn-xs" title={t("claim.pinOppose")} onClick={() => pinToClaim(vk, "oppose", null, newClaim)}>＋{t("claim.oppose")}</button>
            </div>
          </div>
          ); })()}
        {menuVk === vk && coding && (() => {
          const fq = tagFilter.trim();
          const shownTags = fq ? ws.tags.filter((tag) => tag.label.includes(fq)) : ws.tags;
          return (
          <div className="ag-occ-menu" role="menu">
            {ws.tags.length === 0 && <span className="ag-hint">{t("tag.none")}</span>}
            {ws.tags.length > FILTER_MIN && (
              <input className="ag-input ag-input-sm ag-occ-menu-filter" type="search" value={tagFilter}
                placeholder={t("tag.filterPh")} aria-label={t("tag.filterAria")} onChange={(e) => setTagFilter(e.target.value)} />
            )}
            {ws.tags.length > 0 && shownTags.length === 0 && <span className="ag-hint">{t("tag.filterNone")}</span>}
            {shownTags.map((tag) => (
              <label key={tag.id} className="ag-occ-menu-row ag-tag-pick">
                <input type="checkbox" checked={vkTags.includes(tag.id)} onChange={() => ws.toggleTag(vk, tag.id)} />
                <span className="ag-tag-dot" style={{ background: tag.color }} />{tag.label}
              </label>
            ))}
          </div>
          ); })()}
      </li>
    );
  }

  return (
    <ModalShell open={!!occ} share onClose={onClose} closeLabel={t("occ.close")}
      back={occ.back && onBack ? onBack : undefined} backLabel={t("occ.backToDistribution")}
      ariaLabel={t("occ.title", { label: occ.label })}
      title={<>
        <span className={"ag-badge " + (occ.mode === "root" ? "t-root" : occ.mode === "lemma" ? "t-lemma" : "t-word")}>{occ.mode === "root" ? t("occ.badge.root") : occ.mode === "lemma" ? t("occ.badge.lemma") : t("occ.badge.word")}</span>
        <h2 className="ag-modal-word">{occ.label}</h2>
        <span className="ag-modal-count">{tn("occ.versesCount", total)}</span>
        {occ.morphNote && <span className="ag-chip is-morph" title={t("occ.morphNoteTitle")}>⚙ {occ.morphNote}</span>}
      </>}
      actions={<>
            {/* Workbench lenses, grouped + labelled so they read as analysis tools — not
                more export buttons — and a divider keeps them off the export cluster. */}
            <span className="ag-modal-lenses">
              <span className="ag-lenses-label">{t("lenses.label")}</span>
              <button type="button" className={"ag-btn" + (roleOn ? " is-active" : "")} aria-pressed={roleOn}
                title={t("role.show")} disabled={!morph} onClick={() => setRoleOn((o) => !o)}>⚖ {t("role.toggle")}</button>
              <button type="button" className={"ag-btn" + (coding ? " is-active" : "")} aria-pressed={coding}
                title={t("tag.toggle")} onClick={() => setCoding((o) => !o)}>🏷 {t("tag.toggle")}</button>
            </span>
            <span className="ag-modal-sep" aria-hidden="true" />
            <SaveButton item={{ type: "occ", title: occ.label, payload: { lookup: occ.lookup, label: occ.label, mode: occ.mode } }} />
            <button type="button" className="ag-btn" title={t("occ.exportCsv")}
              onClick={() => exportCsvFile([[t("occ.col.sura"), t("occ.col.aya"), t("occ.col.ref"), t("occ.col.text")], ...allKeys.map((k) => { const v = verseData[k]; return [v.s, v.a, `${v.sn} ${v.a}`, v.text]; })], `${t("occ.file.verses", { label: occ.label })}.csv`)}>⤓ CSV</button>
            <button type="button" className="ag-btn" title={t("occ.exportKwic")}
              onClick={() => exportCsvFile(buildConcordance(
                allKeys,
                (k) => verseData[k]?.words,
                (w) => wordGroupKey(w, occ.mode) === occ.lookup,
                (k) => { const v = verseData[k]; return { s: v.s, a: v.a, ref: `${v.sn} ${v.a}` }; },
                5,
                [t("occ.col.sura"), t("occ.col.aya"), t("occ.col.ref"), t("occ.col.before"), t("occ.col.word"), t("occ.col.after")],
              ), `${t("occ.file.context", { label: occ.label })}.csv`)}>⤓ {t("occ.kwicBtn")}</button>
            <button type="button" className="ag-btn" title={t("occ.exportJson")}
              onClick={() => exportJsonFile({
                term: occ.label, lookup: occ.lookup, mode: occ.mode, count: total,
                verses: allKeys.map((k) => { const v = verseData[k]; return { sura: v.s, ayah: v.a, ref: `${v.sn} ${v.a}`, text: v.text }; }),
              }, `${t("occ.file.verses", { label: occ.label })}.json`)}>⤓ JSON</button>
            <button type="button" className="ag-btn" title={t("common.cite.resultTitle")}
              onClick={() => {
                const mode = occ.mode || searchMode;
                const bib = buildResultBibtex({
                  key: `ayatnet_occ_${(occ.lookup || "term").replace(/[^A-Za-z0-9؀-ۿ]/g, "").slice(0, 16)}`,
                  title: t("common.cite.occTitle", { label: occ.label, mode: t(`common.graphMode.${mode}`) }),
                  note: t("common.cite.note", { count: total }),
                  url: typeof location !== "undefined" ? location.href : "",
                  year: new Date().getFullYear(), keywords: [occ.lookup, occ.label],
                });
                exportTextFile(bib, `cite-occ-${occ.lookup || "term"}.bib`, "application/x-bibtex");
              }}>⧉ {t("common.cite.cite")}</button>
      </>}>
        {roleOn && breakdown && (
          <div className="ag-role-panel">
            <span className="ag-role-head">{t("role.title")}</span>
            {breakdown.roles.map((r) => (
              <span key={r.role} className="ag-role-tally" title={t("role.heuristic")}>
                {ROLE[r.role]} <b>{r.count}</b> <span className="ag-role-share">{Math.round(r.share * 100)}%</span>
              </span>
            ))}
            <span className="ag-hint ag-role-note">{t("role.heuristic")}</span>
          </div>
        )}
        {coding && (
          <div className="ag-tag-bar">
            <span className="ag-role-head">{t("tag.panel")}</span>
            {ws.tags.map((tag) => (
              <span key={tag.id} className="ag-tag-pill" style={{ borderColor: tag.color }}>
                <span className="ag-tag-dot" style={{ background: tag.color }} />{tag.label}
                <b className="ag-tag-n">{inListCounts[tag.id] || 0}</b>
                <button type="button" className="ag-tag-x" title={t("tag.delete")} aria-label={t("tag.delete")} onClick={() => ws.removeTag(tag.id)}>✕</button>
              </span>
            ))}
            <form className="ag-tag-add" onSubmit={(e) => { e.preventDefault(); const v = newTag.trim(); if (v) { ws.addTag(v); setNewTag(""); } }}>
              <input className="ag-input ag-input-sm" value={newTag} placeholder={t("tag.newPh")} aria-label={t("tag.add")} onChange={(e) => setNewTag(e.target.value)} />
              <button type="submit" className="ag-btn ag-btn-xs">＋</button>
            </form>
          </div>
        )}
        {!roleOn && !coding && <div className="ag-lenses-hint">{t("lenses.hint")}</div>}
        {filterControls}
        {n === 0 && (
          <div className="ag-state"><span>{t("common.filter.noMatch")}</span></div>
        )}
        <ul className="ag-modal-list" ref={scrollRef} onScroll={onScroll} {...listProps} aria-label={t("occ.title", { label: occ.label })}>
          <li className="ag-vspace" aria-hidden="true" style={{ height: padTop }} />
          {rows}
          <li className="ag-vspace" aria-hidden="true" style={{ height: padBottom }} />
        </ul>
    </ModalShell>
  );
}
