import { useState } from "react";
import { ModalShell } from "./ModalShell.jsx";
import { MoreButton } from "./MoreButton.jsx";
import { useReveal } from "../hooks/useReveal.js";
import { exportTextFile, exportJsonFile } from "../graph/exportGraph.js";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Claim board (لوحة الدعاوى) ═══
 *
 * The ما يؤيد / ما يعارض ledger, as a master→detail view so it scales to claims with hundreds of
 * verses: a compact LIST (each claim = statement + for/against counts), and a focused DETAIL for
 * one claim — its verses in two columns with a Both / Supports / Challenges filter (so a crowded
 * side can be isolated), long sides paginated, and a ← back to the list. Verses are pinned in from
 * the concordance (the ⚐ action); here you edit the statement, annotate each pin, filter, reorder/
 * delete, and export one claim or the whole case to Markdown or JSON. Reads the workspace store. */

const STEP = 40; // verses revealed per "show more" on a side

// Markdown for one claim (used by both the per-claim and the whole-case export).
function claimMd(c, verseData, t) {
  const lines = [`## ${c.statement || t("claim.untitled")}`, ""];
  if (c.note) lines.push(`> ${c.note}`, "");
  for (const [side, head] of [["support", t("claim.support")], ["oppose", t("claim.oppose")]]) {
    lines.push(`### ${head} (${(c[side] || []).length})`);
    for (const r of c[side] || []) {
      const v = verseData[r.vk];
      lines.push(`- **${v ? `${v.sn} ${v.a}` : r.vk}** — ${v ? v.text : ""}${r.note ? `  \n  _${r.note}_` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// One pinned verse: reference (→ jump), removable, full text, and a per-pin note.
function RefCard({ claimId, side, r, verseData, onNavigate }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const v = verseData[r.vk];
  return (
    <div className="ag-claim-ref">
      <div className="ag-claim-ref-head">
        <button type="button" className="ag-claim-ref-go" title={t("occ.makeCenter")} onClick={() => v && onNavigate(v.s, v.a)}>{v ? `${v.sn} ${v.a}` : r.vk}</button>
        <button type="button" className="ag-tag-x" aria-label={t("claim.removeRef")} onClick={() => ws.removeClaimRef(claimId, side, r.vk)}>✕</button>
      </div>
      {v && <div className="ag-claim-ref-text" dir="rtl">{v.text}</div>}
      <input className="ag-input ag-input-sm ag-claim-ref-note" value={r.note || ""} placeholder={t("claim.notePh")}
        onChange={(e) => ws.updateClaimRef(claimId, side, r.vk, e.target.value)} />
    </div>
  );
}

// One side's verse list, paginated (a side can hold hundreds).
function SideColumn({ claim, side, verseData, onNavigate, full }) {
  const { t } = useI18n();
  const refs = claim[side] || [];
  const rev = useReveal(STEP, `${claim.id}:${side}`);
  const shown = refs.slice(0, rev.limit);
  return (
    <div className={"ag-claim-col ag-claim-" + side + (full ? " is-full" : "")}>
      <div className="ag-claim-col-head">{t(side === "support" ? "claim.support" : "claim.oppose")} <b>{refs.length}</b></div>
      {refs.length === 0 ? <p className="ag-hint">{t("claim.noVerses")}</p>
        : <>{shown.map((r) => <RefCard key={r.vk} claimId={claim.id} side={side} r={r} verseData={verseData} onNavigate={onNavigate} />)}
            <MoreButton shown={shown.length} total={refs.length} onMore={rev.more} step={STEP} /></>}
    </div>
  );
}

// The focused single-claim view.
function ClaimDetail({ claim, verseData, onNavigate }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [filter, setFilter] = useState("both"); // both | support | oppose
  const ns = (claim.support || []).length, no = (claim.oppose || []).length;
  return (
    <div className="ag-claim-detail">
      <textarea className="ag-input ag-claim-statement" rows={2} value={claim.statement} placeholder={t("claim.statementPh")}
        onChange={(e) => ws.updateClaim(claim.id, { statement: e.target.value })} />
      <input className="ag-input ag-input-sm" value={claim.note || ""} placeholder={t("claim.notePh")}
        onChange={(e) => ws.updateClaim(claim.id, { note: e.target.value })} />
      <div className="ag-seg ag-seg-sm ag-claim-filter" role="group" aria-label={t("claim.title")}>
        <button type="button" className={filter === "both" ? "is-on" : ""} aria-pressed={filter === "both"} onClick={() => setFilter("both")}>{t("claim.both")} {ns + no}</button>
        <button type="button" className={filter === "support" ? "is-on" : ""} aria-pressed={filter === "support"} onClick={() => setFilter("support")}>{t("claim.support")} {ns}</button>
        <button type="button" className={filter === "oppose" ? "is-on" : ""} aria-pressed={filter === "oppose"} onClick={() => setFilter("oppose")}>{t("claim.oppose")} {no}</button>
      </div>
      <div className={"ag-claim-cols" + (filter !== "both" ? " is-single" : "")}>
        {filter !== "oppose" && <SideColumn claim={claim} side="support" verseData={verseData} onNavigate={onNavigate} full={filter === "support"} />}
        {filter !== "support" && <SideColumn claim={claim} side="oppose" verseData={verseData} onNavigate={onNavigate} full={filter === "oppose"} />}
      </div>
    </div>
  );
}

export function ClaimBoard({ open, verseData, onNavigate, onClose }) {
  const { t } = useI18n();
  const ws = useWorkspace();
  const [openId, setOpenId] = useState(null);
  const [claimQuery, setClaimQuery] = useState(""); // filter the master list when many claims exist
  const current = ws.claims.find((c) => c.id === openId) || null;
  const cq = claimQuery.trim();
  const shownClaims = cq ? ws.claims.filter((c) => (c.statement || "").includes(cq)) : ws.claims;

  const exportAllMd = () => exportTextFile(ws.claims.map((c) => claimMd(c, verseData, t)).join("\n"), "claims.md", "text/markdown;charset=utf-8");
  const exportOneMd = (c) => exportTextFile(claimMd(c, verseData, t), `claim-${(c.statement || "claim").slice(0, 20).replace(/\s+/g, "-")}.md`, "text/markdown;charset=utf-8");

  return (
    <ModalShell open={open} share onClose={onClose} closeLabel={t("occ.close")} ariaLabel={t("claim.title")}
      title={current
        ? <>
            <button type="button" className="ag-iconbtn" title={t("claim.allClaims")} aria-label={t("claim.allClaims")} onClick={() => setOpenId(null)}>→</button>
            <h2 className="ag-modal-word ag-claim-htitle">{current.statement || t("claim.untitled")}</h2>
            <span className="ag-modal-count">{t("claim.count", { s: (current.support || []).length, o: (current.oppose || []).length })}</span>
          </>
        : <><h2 className="ag-modal-word">{t("claim.title")}</h2><span className="ag-modal-count">{ws.claims.length}</span></>}
      actions={current
        ? <>
            <button type="button" className="ag-btn" title={t("claim.exportThis")} onClick={() => exportOneMd(current)}>⤓ MD</button>
            <button type="button" className="ag-btn" title={t("claim.exportThis")} onClick={() => exportJsonFile(current, "claim.json")}>⤓ JSON</button>
            <button type="button" className="ag-btn is-warn" title={t("claim.delete")} onClick={() => { ws.removeClaim(current.id); setOpenId(null); }}>🗑</button>
          </>
        : <>
            <button type="button" className="ag-btn is-primary" onClick={() => setOpenId(ws.addClaim(""))}>＋ {t("claim.add")}</button>
            {ws.claims.length > 0 && <>
              <button type="button" className="ag-btn" title={t("claim.exportMd")} onClick={exportAllMd}>⤓ MD</button>
              <button type="button" className="ag-btn" title={t("claim.exportJson")} onClick={() => exportJsonFile({ claims: ws.claims }, "claims.json")}>⤓ JSON</button>
            </>}
          </>}>
      <div className="ag-claim-board">
        {current
          ? <ClaimDetail claim={current} verseData={verseData} onNavigate={onNavigate} />
          : <>
              <p className="ag-hint ag-cq-intro">{t("claim.intro")}</p>
              {ws.claims.length === 0 && <p className="ag-hint is-warn">{t("claim.empty")}</p>}
              {ws.claims.length > 8 && (
                <input className="ag-input" type="search" value={claimQuery} placeholder={t("claim.filterPh")} aria-label={t("claim.filterAria")}
                  onChange={(e) => setClaimQuery(e.target.value)} />
              )}
              {ws.claims.length > 0 && shownClaims.length === 0 && <p className="ag-hint">{t("claim.filterNone")}</p>}
              {shownClaims.map((c) => {
                const i = ws.claims.indexOf(c); // position in the FULL list (reorder stays correct under a filter)
                return (
                <div key={c.id} className="ag-claim-listrow">
                  <button type="button" className="ag-claim-listmain" title={t("claim.openTitle")} onClick={() => setOpenId(c.id)}>
                    <span className="ag-claim-liststatement">{c.statement || t("claim.untitled")}</span>
                    <span className="ag-claim-badges">
                      <span className="ag-claim-badge is-s" title={t("claim.support")}>✓ {(c.support || []).length}</span>
                      <span className="ag-claim-badge is-o" title={t("claim.oppose")}>✗ {(c.oppose || []).length}</span>
                    </span>
                  </button>
                  <div className="ag-claim-ctrl">
                    {!cq && <button type="button" className="ag-iconbtn" aria-label="↑" disabled={i === 0} onClick={() => ws.moveClaim(c.id, -1)}>↑</button>}
                    {!cq && <button type="button" className="ag-iconbtn" aria-label="↓" disabled={i === ws.claims.length - 1} onClick={() => ws.moveClaim(c.id, 1)}>↓</button>}
                    <button type="button" className="ag-iconbtn is-warn" title={t("claim.delete")} aria-label={t("claim.delete")} onClick={() => ws.removeClaim(c.id)}>🗑</button>
                  </div>
                </div>
                );
              })}
            </>}
      </div>
    </ModalShell>
  );
}
