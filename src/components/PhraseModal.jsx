import { useEffect, useState } from "react";
import { findSharedPhrases } from "../analytics/phrases.js";
import { exportCsvFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

/* ═══ Shared-phrase (المتشابهات) modal ═══
 *
 * Lists every maximal multi-word run the centre verse shares verbatim with other
 * āyāt, longest first, each with the verses that carry it (click to re-centre).
 * Driven by `phrase = { centerKey }`; the trigram seed index is built once by the
 * parent and passed in (it spans the whole corpus, so it is reused, not rebuilt). */

const VERSE_CAP = 60; // most a single phrase lists inline before a "+N more" note

// Render a verse with its shared run emphasised, so the resonance is visible in context.
function PhraseVerse({ words, phraseNorm }) {
  const toks = phraseNorm.split(" ");
  let start = -1;
  for (let i = 0; i + toks.length <= words.length && start < 0; i++) {
    let ok = true;
    for (let j = 0; j < toks.length; j++) if (words[i + j].norm !== toks[j]) { ok = false; break; }
    if (ok) start = i;
  }
  return (
    <span className="ag-phrase-verse" dir="rtl">
      {words.map((w, i) => {
        const on = start >= 0 && i >= start && i < start + toks.length;
        return <span key={i} className={on ? "ag-phrase-hit" : undefined}>{w.orig} </span>;
      })}
    </span>
  );
}

export function PhraseModal({ phrase, seedIndex, verseData, onNavigate, onClose }) {
  const { t, fmtNum } = useI18n();
  const ws = useWorkspace();
  const centerKey = phrase?.centerKey;
  // findSharedPhrases scans the corpus and can take tens of ms on a long, recurrent
  // verse — running it synchronously on open janks the modal. Defer it to an idle
  // callback so the dialog paints immediately with a loading state, then fills in.
  const [result, setResult] = useState(null); // null = still computing
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!centerKey || !seedIndex) { setResult([]); return undefined; }
    setResult(null);
    let alive = true;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => { const r = findSharedPhrases(centerKey, verseData, seedIndex); if (alive) setResult(r); }, { timeout: 250 });
    return () => { alive = false; cic(id); };
  }, [centerKey, verseData, seedIndex]);
  const phrases = result || [];
  const computing = result === null;

  if (!phrase) return null;
  const cv = verseData[centerKey];

  return (
    <ModalShell open={!!phrase} onClose={onClose} closeLabel={t("phrase.close")}
      ariaLabel={t("phrase.ariaLabel", { surah: cv?.sn, ayah: cv?.a })}
      title={<>
        <span className="ag-badge t-verse">{t("phrase.badge")}</span>
        <h2 className="ag-modal-word" style={{ fontFamily: "var(--font-display)" }}>{cv?.sn} {cv?.a}</h2>
        <span className="ag-modal-count">{computing ? "…" : <><b>{fmtNum(phrases.length)}</b> {t("phrase.sharedPhrases")}</>}</span>
      </>}
      actions={<>
        {cv && <button type="button" className="ag-btn" title={t("ws.saveTitle")}
          onClick={() => { ws.saveItem({ type: "phrase", title: `${t("phrase.badge")}: ${cv.sn} ${cv.a}`, payload: { surah: cv.s, ayah: cv.a } }); ws.toast(t("ws.saved")); }}>★</button>}
        {phrases.length > 0 && (
          <button type="button" data-export className="ag-btn" title={t("phrase.exportCsv")}
            onClick={() => exportCsvFile(
              [[t("phrase.csvPhrase"), t("phrase.csvWordCount"), t("phrase.csvAyahCount"), t("phrase.csvAyat")],
               ...phrases.map((p) => [p.tokens.join(" "), p.len, p.verses.length, p.verses.join(t("phrase.listSep"))])],
              t("phrase.csvFilename", { surah: cv?.sn, ayah: cv?.a }))}>⤓ CSV</button>
        )}
      </>}>
        <div className="ag-help-body">
          <p className="ag-hint">
            {t("phrase.hint")}
          </p>
          {computing ? (
            <div className="ag-empty-inner" style={{ paddingBlock: "var(--space-5)", textAlign: "center", color: "var(--text-faint)" }}>
              {t("phrase.computing")}
            </div>
          ) : phrases.length === 0 ? (
            <div className="ag-empty-inner" style={{ paddingBlock: "var(--space-5)", textAlign: "center", color: "var(--text-faint)" }}>
              {t("phrase.empty")}
            </div>
          ) : phrases.map((p, pi) => {
            const shown = p.verses.slice(0, VERSE_CAP);
            return (
              <section className="ag-phrase-sec" key={pi}>
                <div className="ag-phrase-head">
                  <span className="ag-phrase-text" dir="rtl" style={{ fontFamily: "var(--font-quran)" }}>{p.tokens.join(" ")}</span>
                  <span className="ag-phrase-meta">
                    <span className="ag-tag">{t("phrase.wordsTag", { n: p.len })}</span>
                    <span className="ag-tag" style={{ color: "var(--gold-400)" }}>{t("phrase.ayahTag", { n: p.verses.length })}</span>
                  </span>
                </div>
                <ul className="ag-phrase-list">
                  {shown.map((vk) => {
                    const v = verseData[vk];
                    if (!v) return null;
                    return (
                      <li key={vk}>
                        <button type="button" className="ag-modal-row" onClick={() => onNavigate(v.s, v.a)} title={t("phrase.recenter")}>
                          <span className="ag-ayah-ref"><span className="ag-ayah-surah">{v.sn}</span><span className="ag-ayah-num">{v.a}</span></span>
                          <span className="ag-modal-text"><PhraseVerse words={v.words} phraseNorm={p.norm} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {p.verses.length > VERSE_CAP && <p className="ag-hint">{t("phrase.moreAyat", { n: p.verses.length - VERSE_CAP })}</p>}
              </section>
            );
          })}
        </div>
    </ModalShell>
  );
}
