import { useEffect, useRef, useState } from "react";
import { findSharedPhrases, buildSeedIndex } from "../analytics/phrases.js";
import { exportCsvFile } from "../graph/exportGraph.js";
import { ModalShell } from "./ModalShell.jsx";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";

/* ═══ Shared-phrase (المتشابهات) modal ═══
 *
 * Lists the multi-word runs the centre verse shares with other āyāt, longest first and
 * each with the verses that carry it (click to re-centre). Two controls tune the search:
 *   - Min length (2/3/4 words): the shortest run reported.
 *   - Ignore particles: match on the content skeleton, so verses that differ only by a
 *     حرف (وما، فلا، …) still align — caught via a particle-stripped seed index built here.
 * The default (all-words) seed index is built once by the parent and passed in. */

const VERSE_CAP = 60; // most a single phrase lists inline before a "+N more" note

// Highlight the shared run inside a verse. Contiguous by default; when particles were
// ignored, the run's content tokens may be separated by particles, so match them as an
// in-order subsequence (greedy from the first hit) and highlight those words.
function PhraseVerse({ words, phraseNorm, gapAware }) {
  const toks = phraseNorm.split(" ");
  const hit = new Set();
  if (!gapAware) {
    for (let i = 0; i + toks.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < toks.length; j++) if (words[i + j].norm !== toks[j]) { ok = false; break; }
      if (ok) { for (let j = 0; j < toks.length; j++) hit.add(i + j); break; }
    }
  } else {
    let start = -1;
    for (let s = 0; s < words.length && start < 0; s++) if (words[s].norm === toks[0]) start = s;
    if (start >= 0) {
      let t = 0;
      for (let i = start; i < words.length && t < toks.length; i++) if (words[i].norm === toks[t]) { hit.add(i); t++; }
      if (t < toks.length) hit.clear();
    }
  }
  return (
    <span className="ag-phrase-verse" dir="rtl">
      {words.map((w, i) => <span key={i} className={hit.has(i) ? "ag-phrase-hit" : undefined}>{w.orig} </span>)}
    </span>
  );
}

const MIN_LENS = [2, 3, 4];

export function PhraseModal({ phrase, seedIndex, verseData, onNavigate, onClose }) {
  const { t, fmtNum } = useI18n();
  const ws = useWorkspace();
  const centerKey = phrase?.centerKey;
  const [minLen, setMinLen] = useState(3);
  const [ignoreParticles, setIgnoreParticles] = useState(false);
  // Cache the particle-stripped seed index (corpus-wide) per verseData identity, so toggling
  // the option doesn't rebuild it each time.
  const particleIdx = useRef({ vd: null, idx: null });

  // findSharedPhrases scans the corpus and can take tens of ms on a long, recurrent verse —
  // running it synchronously janks the modal. Defer to an idle callback so the dialog paints
  // immediately with a loading state, then fills in. Re-runs when the controls change.
  const [result, setResult] = useState(null); // null = still computing
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!centerKey || !seedIndex) { setResult([]); return undefined; }
    setResult(null);
    let alive = true;
    const ric = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
    const cic = window.cancelIdleCallback || clearTimeout;
    const id = ric(() => {
      let idx = seedIndex;
      if (ignoreParticles) {
        if (particleIdx.current.vd !== verseData) particleIdx.current = { vd: verseData, idx: buildSeedIndex(verseData, { ignoreParticles: true }) };
        idx = particleIdx.current.idx;
      }
      const r = findSharedPhrases(centerKey, verseData, idx, { minLen, ignoreParticles });
      if (alive) setResult(r);
    }, { timeout: 300 });
    return () => { alive = false; cic(id); };
  }, [centerKey, verseData, seedIndex, minLen, ignoreParticles]);
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
          <p className="ag-hint">{t("phrase.hint")}</p>
          <div className="ag-dist-sec-h" style={{ gap: "var(--space-3)", flexWrap: "wrap" }}>
            <span className="ag-seg ag-seg-sm" role="group" aria-label={t("phrase.minLen")}>
              {MIN_LENS.map((n) => (
                <button type="button" key={n} className={minLen === n ? "is-on" : ""} aria-pressed={minLen === n} onClick={() => setMinLen(n)}>{t("phrase.minLenVal", { n })}</button>
              ))}
            </span>
            <button type="button" className={"ag-btn" + (ignoreParticles ? " is-gold" : "")} aria-pressed={ignoreParticles}
              title={t("phrase.ignoreParticlesTitle")} onClick={() => setIgnoreParticles((v) => !v)}>
              {ignoreParticles ? "◆" : "◇"} {t("phrase.ignoreParticles")}
            </button>
          </div>
          {computing ? (
            <div className="ag-empty-inner" style={{ paddingBlock: "var(--space-5)", textAlign: "center", color: "var(--text-faint)" }}>{t("phrase.computing")}</div>
          ) : phrases.length === 0 ? (
            <div className="ag-empty-inner" style={{ paddingBlock: "var(--space-5)", textAlign: "center", color: "var(--text-faint)" }}>{t("phrase.empty")}</div>
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
                          <span className="ag-modal-text"><PhraseVerse words={v.words} phraseNorm={p.norm} gapAware={ignoreParticles} /></span>
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
