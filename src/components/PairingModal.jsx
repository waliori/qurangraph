import { useEffect, useMemo, useState } from "react";
import { looseResolve } from "../search.js";
import { wordGroupKey } from "../arabic-utils.js";
import { pairingMatrix } from "../analytics/pairing.js";
import { derivationFamily } from "../analytics/derivation.js";
import { exportJsonFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { SaveButton } from "./SaveButton.jsx";
import { useFields } from "../hooks/useFields.js";
import { useI18n } from "../i18n/index.js";

/* ═══ Pairing matrix ═══
 *
 * A co-occurrence grid over a hand-picked set of terms, so the EMPTY cell is visible — the jinn/ins
 * move (جنّ↔إنس, جِنّة↔ناس, and the blank جنّ↔جانّ). Two axes (rows × cols) or a symmetric square when
 * the second axis is empty. Terms resolve through the same forgiving search the rest of the app uses;
 * a cell click opens the shared (intersected) verses in the concordance with both terms highlighted.
 *
 * `seed = { root, label } | null` lets the matrix pre-load a root's derived lemmas (جنّ/جانّ/جِنّة) onto
 * the first axis in one click. `indices` = { exact:w2v, root:r2v, lemma:l2v }. */
const MODES = ["root", "lemma", "exact"];

function AxisEditor({ title, terms, onAdd, onAddMany, onRemove, indices, r2v, fields, precision, searchAlias, searchAliasFuzzy, seedBtn }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("root");
  const [miss, setMiss] = useState(false);
  // Seed an axis from a saved semantic field → field-vs-field co-occurrence in one step.
  const seedField = (id) => {
    const f = (fields || []).find((x) => x.id === id);
    if (!f) return;
    const next = f.roots.map((r) => ({ label: r, key: r, mode: "root", keys: (r2v || {})[r] || [] })).filter((tm) => tm.keys.length);
    if (next.length) onAddMany(next);
  };
  const submit = (e) => {
    e.preventDefault();
    const { candidates } = looseResolve(q, mode, precision, indices, searchAlias, searchAliasFuzzy);
    if (!candidates.length) { setMiss(true); return; }
    const c = candidates[0];
    const keys = (indices[mode] || {})[c.lookup] || [];
    onAdd({ label: c.lookup, key: c.lookup, mode, keys });
    setQ(""); setMiss(false);
  };
  return (
    <div className="ag-pm-axis">
      <div className="ag-pm-axis-head">
        <span className="ag-cq-lab">{title}</span>
        {seedBtn}
        {fields?.length > 0 && (
          <select className="ag-select ag-select-sm" value="" onChange={(e) => { if (e.target.value) seedField(e.target.value); }} aria-label={t("pm.seedField")}>
            <option value="">{t("pm.seedField")}</option>
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.roots.length})</option>)}
          </select>
        )}
      </div>
      <div className="ag-pm-chips">
        {terms.map((tm, i) => (
          <span key={tm.key + i} className={"ag-tag ag-pm-chip t-" + (tm.mode === "root" ? "root" : tm.mode === "lemma" ? "lemma" : "word")}>
            {tm.label} <b>{tm.keys.length}</b>
            <button type="button" className="ag-tag-x" aria-label={t("claim.removeRef")} onClick={() => onRemove(i)}>✕</button>
          </span>
        ))}
      </div>
      <form className="ag-pm-add" onSubmit={submit} role="search">
        <select className="ag-select ag-select-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
          {MODES.map((m) => <option key={m} value={m}>{t("cmp.mode." + m)}</option>)}
        </select>
        <input className={"ag-input ag-input-sm" + (miss ? " is-miss" : "")} type="search" value={q}
          placeholder={t("pm.termPh")} aria-label={t("pm.addTerm")} onChange={(e) => { setQ(e.target.value); if (miss) setMiss(false); }} />
        <button type="submit" className="ag-btn ag-btn-xs">＋</button>
      </form>
    </div>
  );
}

export function PairingModal({ seed, initialRows, initialCols, indices, r2v, verseData, morph, precision = "loose", searchAlias, searchAliasFuzzy, onChange, onOpen, onClose }) {
  const { t, fmtNum } = useI18n();
  const { fields } = useFields();
  // Seeded once from props (the modal remounts on each open, so reopening restores the matrix).
  const [rows, setRows] = useState(() => initialRows || []);
  const [cols, setCols] = useState(() => initialCols || []);
  // Report the current terms up so the parent can persist them across close/reopen + save them.
  useEffect(() => { onChange?.(rows, cols); }, [rows, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const matrix = useMemo(() => (rows.length ? pairingMatrix(rows, cols.length ? cols : null) : null), [rows, cols]);
  // The workspace item this matrix saves as — only the term descriptors (keys recomputed on reopen).
  const saveItem = useMemo(() => {
    const strip = (arr) => arr.map((tm) => ({ label: tm.label, key: tm.key, mode: tm.mode }));
    const title = [rows.map((tm) => tm.label).join("، "), cols.length ? cols.map((tm) => tm.label).join("، ") : null].filter(Boolean).join(" × ");
    return { type: "pairing", title: title || t("pm.title"), payload: { rows: strip(rows), cols: strip(cols) } };
  }, [rows, cols, t]);

  // Seed the row axis with the derived lemmas of the seed root (جنّ/جانّ/جِنّة …).
  const seedLemmas = () => {
    if (!seed?.root) return;
    const fam = derivationFamily(seed.root, r2v, verseData, morph);
    const next = [];
    for (const d of fam) {
      const keys = (indices.lemma || {})[d.lemma] || [];
      if (keys.length) next.push({ label: d.lemma, key: d.lemma, mode: "lemma", keys });
    }
    if (next.length) setRows(next);
  };

  // Open one cell's shared verses, highlighting both terms.
  const openCell = (ri, ci) => {
    const cell = matrix.cells[ri][ci];
    if (!cell.count) return;
    const a = rows[ri], b = (cols.length ? cols : rows)[ci];
    const hi = {};
    for (const vk of cell.keys) {
      const v = verseData[vk]; if (!v?.words) continue;
      const s = [];
      v.words.forEach((w, i) => { if (wordGroupKey(w, a.mode) === a.key || wordGroupKey(w, b.mode) === b.key) s.push(i); });
      hi[vk] = s;
    }
    onOpen({ lookup: a.key, label: `${a.label} ∩ ${b.label}`, mode: a.mode, keys: cell.keys, hi });
  };

  return (
    <ModalShell open share onClose={onClose} closeLabel={t("occ.close")} ariaLabel={t("pm.title")}
      title={<><h2 className="ag-modal-word">{t("pm.title")}</h2></>}
      actions={matrix && <>
        <SaveButton item={saveItem} />
        <button type="button" className="ag-btn" title={t("pm.export")}
          onClick={() => exportJsonFile({ rows: matrix.rows, cols: matrix.cols, cells: matrix.cells.map((r) => r.map((c) => c.count)) }, "pairing-matrix.json")}>⤓ JSON</button>
      </>}>
      <div className="ag-pm">
        <p className="ag-hint ag-cq-intro">{t("pm.intro")}</p>
        <AxisEditor title={t("pm.rows")} terms={rows} indices={indices} r2v={r2v} fields={fields} precision={precision}
          searchAlias={searchAlias} searchAliasFuzzy={searchAliasFuzzy}
          onAdd={(tm) => setRows((r) => [...r, tm])} onAddMany={(ts) => setRows((r) => [...r, ...ts])} onRemove={(i) => setRows((r) => r.filter((_, j) => j !== i))}
          seedBtn={seed?.root ? <button type="button" className="ag-btn ag-btn-xs" onClick={seedLemmas}>{t("pm.seedLemmas")}</button> : null} />
        <AxisEditor title={t("pm.cols")} terms={cols} indices={indices} r2v={r2v} fields={fields} precision={precision}
          searchAlias={searchAlias} searchAliasFuzzy={searchAliasFuzzy}
          onAdd={(tm) => setCols((c) => [...c, tm])} onAddMany={(ts) => setCols((c) => [...c, ...ts])} onRemove={(i) => setCols((c) => c.filter((_, j) => j !== i))} />
        <p className="ag-hint">{t("pm.symmetricHint")}</p>

        {!matrix || rows.length < 1 ? <p className="ag-hint is-warn">{t("pm.none")}</p> : (
          <div className="ag-pm-grid-wrap">
            <table className="ag-pm-grid">
              <thead>
                <tr>
                  <th />
                  {matrix.cols.map((c, j) => <th key={j} className="ag-pm-col">{c.label}<span className="ag-pm-tot">{fmtNum(c.total)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((rw, ri) => (
                  <tr key={ri}>
                    <th className="ag-pm-row">{rw.label}<span className="ag-pm-tot">{fmtNum(rw.total)}</span></th>
                    {matrix.cols.map((cl, ci) => {
                      const cell = matrix.cells[ri][ci];
                      const diag = matrix.symmetric && ri === ci;
                      return (
                        <td key={ci} className={"ag-pm-cell" + (cell.count === 0 ? " is-empty" : "") + (diag ? " is-diag" : "")}>
                          <button type="button" disabled={!cell.count}
                            title={t("pm.cellTitle", { a: rw.label, b: cl.label, n: fmtNum(cell.count) })}
                            onClick={() => openCell(ri, ci)}>
                            {diag ? <span className="ag-pm-diag">{fmtNum(cell.count)}</span> : cell.count ? fmtNum(cell.count) : "·"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
