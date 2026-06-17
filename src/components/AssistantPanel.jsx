import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/index.js";
import { useWorkspace } from "../hooks/useWorkspace.js";
import { usePersistedState } from "../hooks/usePersistedState.js";
import { useAssistantCtx } from "../ai/AssistantContext.jsx";
import { useRetrieval } from "../hooks/useRetrieval.js";
import { extractSeeds } from "../ai/retrieve.js";
import { detectLookupIntent } from "../ai/intent.js";
import { morphAt } from "../morphology.js";
import { assembleContext, estimateTokens } from "../ai/contextSerializers.js";
import { parseActions, actionLabel } from "../ai/actions.js";

/* ═══ Local AI assistant panel ═══
 *
 * A DRAGGABLE, NON-MODAL floating window (no scrim, no focus trap) so the researcher can
 * keep working the graph while it's open — selecting a different word or verse updates the
 * attachable context live. The engine itself lives in AssistantContext (survives close), so
 * reopening never reloads the model.
 *
 * It is a lexical research aid: attach data gathered in the app (selected word + morphology,
 * verse, graph, lexicon article, saved workspace items) and ask grounded questions. It can
 * also DRIVE the app — when the model emits an action, we render a confirm button that runs
 * it via app.onAction (openOcc/navigate/setDist/setCmp in QuranGraph). The model runs in the
 * cloud: the free shared tier routes through our own proxy, or the user brings their own key.
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Build the list of attachable context chips from live app state + workspace items.
function buildAttachables(app, wsItems, t) {
  const out = [];
  const { selNode, currentKey, currentVerse, searchMode, graphNodes, omitted, selRoot, meanings, lexLabel, morph, verseData } = app;

  if (selNode?.type === "word") {
    const vk = selNode.parentVerseKey;
    out.push({
      id: "live:word", kind: "word", title: t("ai.attach.word", { w: selNode.label }),
      payload: {
        label: selNode.label, lookup: selNode.lookup, mode: searchMode,
        root: selNode.root, lemma: selNode.lemma, count: selNode.count,
        verseRef: vk, verseText: verseData?.[vk]?.text,
        morph: morph ? morphAt(morph, vk, selNode.wordIndex) : null,
      },
    });
  } else if (selNode && (selNode.type === "verse" || selNode.type === "center")) {
    out.push({
      id: "live:selverse", kind: "verse", title: t("ai.attach.verse", { v: selNode.label }),
      payload: { ref: selNode.verseKey, surahName: verseData?.[selNode.verseKey]?.sn, text: selNode.text },
    });
  }

  if (currentVerse && currentKey) {
    out.push({
      id: "live:centre", kind: "verse", title: t("ai.attach.centre", { v: `${currentVerse.s}:${currentVerse.a}` }),
      payload: { ref: currentKey, surahName: currentVerse.sn, text: currentVerse.text },
    });
  }

  const expandedWords = (graphNodes || []).filter((n) => n.type === "word" && n.isExpanded);
  if (expandedWords.length) {
    const expanded = expandedWords.map((w) => ({
      label: w.label, count: w.count,
      verses: (graphNodes || []).filter((v) => (v.type === "verse" || v.type === "center") && v.connectingWord === (w.lookup || w.wordNorm)).map((v) => v.verseKey),
    }));
    out.push({
      id: "live:graph", kind: "graph", title: t("ai.attach.graph", { n: expandedWords.length }),
      payload: { centerRef: currentKey, surahName: currentVerse?.sn, centerText: currentVerse?.text, mode: searchMode, expanded, omitted },
    });
  }

  if (selRoot && meanings?.[selRoot]) {
    const m = meanings[selRoot];
    out.push({
      id: "live:lexicon", kind: "lexicon", title: t("ai.attach.lexicon", { r: selRoot }),
      payload: { root: selRoot, lexLabel, concise: m.c, full: m.f, cite: m.cite },
    });
  }

  for (const it of wsItems || []) {
    out.push({ id: "ws:" + it.id, kind: "ws", title: t("ai.attach.saved", { type: t("ws.type." + it.type), name: it.title || "" }), payload: it });
  }
  return out;
}

export function AssistantPanel({ open, onClose, app }) {
  const { t, lang, dir } = useI18n();
  const ws = useWorkspace();
  const ai = useAssistantCtx();
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");
  const [selectedIds, setSelectedIds] = useState(null); // null = use default selection
  const [actionNote, setActionNote] = useState(null);
  const retrieval = useRetrieval();
  const [autoRetrieve, setAutoRetrieve] = usePersistedState("qg.ai.autoRetrieve", true, (v) => !!v);
  const [retrieving, setRetrieving] = useState(false);
  const allowedRefsRef = useRef(null); // refs that were in context this turn (for verification)
  const [verifyResult, setVerifyResult] = useState(null);
  const [pos, setPos] = usePersistedState("qg.ai.pos", null,
    (v) => (v && typeof v.x === "number" && typeof v.y === "number" ? v : null));

  // Refresh the free-tier quota indicator when the panel opens.
  useEffect(() => { if (open) ai.refreshQuota(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Place the window top-trailing on first open if it has no saved position yet.
  useEffect(() => {
    if (open && !pos && typeof window !== "undefined") setPos({ x: Math.max(8, window.innerWidth - 468), y: 64 });
  }, [open, pos, setPos]);
  // Esc closes (non-modal: no focus trap, so listen globally while open).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Items pushed in from a modal's "Ask AI" / the verse multi-select lead the list and are
  // selected by default, ahead of the live graph selection.
  const injected = useMemo(() => ai.injected || [], [ai.injected]);
  const attachables = useMemo(() => [...injected, ...buildAttachables(app || {}, ws.items, t)], [injected, app, ws.items, t]);
  const effectiveSelected = useMemo(() => {
    if (selectedIds) return selectedIds;
    if (injected.length) return new Set(injected.map((a) => a.id));
    const first = attachables.find((a) => a.id.startsWith("live:"));
    return new Set(first ? [first.id] : []);
  }, [selectedIds, attachables, injected]);
  const chosen = attachables.filter((a) => effectiveSelected.has(a.id));
  const ctxBlock = useMemo(() => assembleContext(chosen, { verseData: app?.verseData }, { maxChars: 6000 }), [chosen, app]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [ai?.messages]);

  // Fact-check the latest assistant answer once it finishes streaming: flag fabricated /
  // off-context verse references and misquotes against ground-truth verse text. Stale results
  // are cleared in submit()/clear() (event handlers); this effect only sets results async.
  useEffect(() => {
    if (!ai || ai.streaming) return undefined;
    const msgs = ai.messages || [];
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant" || !last.content?.trim()) return undefined;
    let alive = true;
    retrieval.verify(last.content, allowedRefsRef.current).then((r) => {
      if (alive) setVerifyResult(r?.issues?.length ? r : null);
    }).catch(() => {});
    return () => { alive = false; };
  }, [ai, ai?.messages, ai?.streaming, retrieval]);

  if (!open || !ai) return null;

  const toggle = (id) => setSelectedIds(() => {
    const base = new Set(effectiveSelected);
    if (base.has(id)) base.delete(id); else base.add(id);
    return base;
  });

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!ai.ready || ai.streaming || retrieving) return;
    const q = input.trim();
    if (!q) return;
    setVerifyResult(null); // drop the previous answer's verification before a new turn

    // Deterministic shortcut: a pure lookup intent ("all verses", "distribution") with a word
    // selected is answered by the app action directly — never the model, which picks the wrong
    // tool or feeds an unindexable inflected surface form. Uses the same term/mode the quick
    // buttons use, so the lookup actually resolves.
    const intent = detectLookupIntent(q);
    if (intent && app?.selNode?.type === "word" && app?.onAction) {
      const mode = app.searchMode === "root" || app.searchMode === "lemma" ? app.searchMode : "exact";
      const term = mode === "root" ? (app.selNode.root || app.selNode.rootLabel || app.selNode.wordNorm)
        : mode === "lemma" ? (app.selNode.lemma || app.selNode.lookup || app.selNode.wordNorm)
          : (app.selNode.lookup || app.selNode.wordNorm);
      setInput("");
      runAction({ tool: intent, term, mode });
      return;
    }
    setInput("");

    // RAG: auto-retrieve the most relevant slice of the corpus for THIS question and prepend
    // it as a synthetic context item. Seeds from the attached selection drive retrieval even
    // when the question has no Arabic terms. Explicit user attachments keep their budget
    // priority (listed first); retrieval fills the rest. Attached-only fallback on any failure.
    const seeds = extractSeeds(chosen);
    const allowed = new Set(seeds.refs);
    let block = ctxBlock;
    if (autoRetrieve) {
      setRetrieving(true);
      try {
        const r = await retrieval.run(q, { seeds });
        if (r) {
          const att = { id: "rag", kind: "retrieved", title: t("ai.retrieved"), payload: r };
          block = assembleContext([...chosen, att], { verseData: app?.verseData }, { maxChars: 6500 });
          for (const v of r.verses || []) allowed.add(v.ref);
        }
      } catch { /* keep attached-only context */ }
      finally { setRetrieving(false); }
    }
    allowedRefsRef.current = allowed;
    ai.send({ question: q, contextBlock: block.text, lang });
  };

  const runAction = (a) => {
    setActionNote(null);
    const res = app?.onAction?.(a);
    if (!res || res.ok === false) setActionNote(t(res?.reason === "notfound" ? "ai.actionNotFound" : "ai.actionFail"));
  };

  // Drag the window by its header. Move/up are bound to the window for the drag's duration
  // (not the header, and no pointer-capture) so the drag keeps tracking even when the cursor
  // outruns the small header — robust across mouse + touch.
  const onDragStart = (e) => {
    const node = panelRef.current; if (!node || e.button) return;
    const r = node.getBoundingClientRect();
    const off = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    const move = (ev) => {
      const w = node.offsetWidth || 440;
      setPos({
        x: clamp(ev.clientX - off.dx, 0, window.innerWidth - Math.min(w, window.innerWidth)),
        y: clamp(ev.clientY - off.dy, 0, window.innerHeight - 56),
      });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const SUGGESTIONS = [t("ai.suggest.morph"), t("ai.suggest.rare"), t("ai.suggest.verses")];
  const style = pos ? { left: pos.x, top: pos.y } : { insetInlineEnd: 16, top: 64 };

  // Provider picker (free shared tier vs bring-your-own-key) + the BYOK key/model fields.
  const providerControls = (
    <>
      <label className="ag-range-lab" htmlFor="ai-provider">{t("ai.provider")}</label>
      <select id="ai-provider" className="ag-input" value={ai.provider}
        onChange={(e) => ai.setProvider(e.target.value)}>
        {ai.providerOrder.map((id) => (
          <option key={id} value={id}>{t("ai.provider." + id)}</option>
        ))}
      </select>
      {ai.needsKey ? (
        <>
          <input type="password" className="ag-input" value={ai.apiKey} autoComplete="off" spellCheck={false}
            placeholder={t("ai.keyPlaceholder")} aria-label={t("ai.apiKey")}
            onChange={(e) => ai.setApiKey(e.target.value)} />
          <input type="text" className="ag-input" value={ai.model} autoComplete="off" spellCheck={false}
            list="ai-model-suggestions" placeholder={t("ai.modelPlaceholder")} aria-label={t("ai.model")}
            onChange={(e) => ai.setModel(e.target.value)} />
          <datalist id="ai-model-suggestions">
            {ai.models.map((m) => <option key={m} value={m} />)}
          </datalist>
          <p className="ag-hint">
            {t("ai.byokKeyHint")} {ai.keyUrl && <a href={ai.keyUrl} target="_blank" rel="noopener noreferrer">{t("ai.getKey")}</a>}
          </p>
        </>
      ) : (
        <p className="ag-hint">
          {t("ai.freeHint")}
          {ai.quota && Number.isFinite(ai.quota.remaining) && " " + t("ai.quotaLeft", { n: ai.quota.remaining.toLocaleString(), total: ai.quota.limit.toLocaleString() })}
        </p>
      )}
    </>
  );

  return (
    <aside className="ag-ai-float" role="dialog" aria-label={t("ai.title")} ref={panelRef} dir={dir} style={style}>
      <div className="ag-modal-head ag-ai-drag" onPointerDown={onDragStart}>
        <div className="ag-modal-title"><span className="ag-badge t-root">✦</span><h2 className="ag-modal-word">{t("ai.title")}</h2></div>
        <button type="button" className="ag-iconbtn" aria-label={t("ai.close")} onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>✕</button>
      </div>
      <p className="ag-ai-tagline">{t("ai.tagline")}</p>

      {/* Provider / consent state. Enabling sends questions to a cloud model, so it's an
          explicit opt-in; BYOK additionally needs a key before the chat unlocks. */}
      {!ai.enabled ? (
        <div className="ag-ai-gate">
          {providerControls}
          <button type="button" className="ag-btn is-gold ag-ai-enable" onClick={() => ai.enable()}>
            {t("ai.enable")}
          </button>
          <p className="ag-hint">{t("ai.enableHint")}</p>
        </div>
      ) : !ai.ready ? (
        <div className="ag-ai-gate">
          {providerControls}
          <p className="ag-hint">{t("ai.needKey")}</p>
        </div>
      ) : (
        <div className="ag-ai-modelbar">
          {providerControls}
        </div>
      )}

      {/* Context picker + chat (shown once the assistant is ready) */}
      {ai.ready && (
        <>
          <div className="ag-ai-ctx">
            <div className="ag-ai-ctx-head">
              <span className="ag-range-lab">{t("ai.context")}</span>
              <span className="ag-hint">{t("ai.ctxMeter", { n: chosen.length, tok: estimateTokens(ctxBlock.chars) })}</span>
            </div>
            {/* RAG control: auto-retrieve the most relevant corpus slice (lexical — roots,
                lemmas, semantic neighbours, opposites; free and instant). */}
            <div className="ag-ai-rag">
              <label className="ag-check" title={t("ai.autoRetrieveHint")}>
                <input type="checkbox" checked={autoRetrieve} onChange={(e) => setAutoRetrieve(e.target.checked)} />
                <span>{t("ai.autoRetrieve")}</span>
              </label>
              {retrieving && <span className="ag-hint">{t("ai.retrieving")}</span>}
            </div>
            <div className="ag-ws-chips">
              {attachables.length === 0 && <span className="ag-hint">{t("ai.noContext")}</span>}
              {attachables.map((a) => (
                <button type="button" key={a.id} className={"ag-tag ag-tag-btn" + (effectiveSelected.has(a.id) ? " is-on" : "")}
                  aria-pressed={effectiveSelected.has(a.id)} title={a.title} onClick={() => toggle(a.id)}>{a.title}</button>
              ))}
            </div>
            {ctxBlock.dropped > 0 && <p className="ag-hint">{t("ai.ctxDropped", { n: ctxBlock.dropped })}</p>}
          </div>

          <div className="ag-ai-thread" ref={scrollRef}>
            {ai.messages.length === 0 ? (
              <div className="ag-ai-empty">
                <p className="ag-hint">{t("ai.empty")}</p>
                <div className="ag-ws-chips">
                  {SUGGESTIONS.map((s, i) => (
                    <button type="button" key={i} className="ag-tag ag-tag-btn" onClick={() => setInput(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : ai.messages.map((m, i) => {
              const last = i === ai.messages.length - 1;
              const parsed = m.role === "assistant" ? parseActions(m.content) : null;
              const text = parsed ? parsed.clean : m.content;
              return (
                <div key={i} className={"ag-ai-msg ag-ai-" + m.role}>
                  <span className="ag-ai-role">{m.role === "user" ? t("ai.you") : t("ai.assistant")}</span>
                  <div className="ag-ai-bubble">{text || (ai.streaming && last ? "…" : "")}</div>
                  {parsed && parsed.actions.length > 0 && (
                    <div className="ag-ai-actions">
                      {parsed.actions.map((a, j) => (
                        <button type="button" key={j} className="ag-btn is-gold ag-ai-actbtn" onClick={() => runAction(a)}>{actionLabel(a, lang)}</button>
                      ))}
                    </div>
                  )}
                  {m.role === "assistant" && m.usage?.total ? (
                    <span className="ag-hint ag-ai-usage">{t("ai.tokensUsed", { total: m.usage.total.toLocaleString(), prompt: (m.usage.prompt ?? "?").toLocaleString?.() ?? m.usage.prompt, completion: (m.usage.completion ?? "?").toLocaleString?.() ?? m.usage.completion })}</span>
                  ) : null}
                </div>
              );
            })}
            {actionNote && <p className="ag-hint ag-ai-actnote" role="status">{actionNote}</p>}
            {verifyResult && !ai.streaming && (
              <div className="ag-ai-verify" role="status">
                <strong>⚠ {t("ai.verify.title")}</strong>
                <ul>
                  {verifyResult.issues.map((iss, i) => (
                    <li key={i}>{t("ai.verify." + iss.type, { ref: iss.ref || "", text: iss.text || "" })}</li>
                  ))}
                </ul>
                <span className="ag-hint">{t("ai.verify.note")}</span>
              </div>
            )}
          </div>

          <form className="ag-ai-input" onSubmit={submit}>
            <textarea className="ag-input" rows={2} value={input} placeholder={t("ai.placeholder")} aria-label={t("ai.placeholder")}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }} />
            <div className="ag-ai-controls">
              {ai.messages.length > 0 && !ai.streaming && <button type="button" className="ag-iconbtn" title={t("ai.clear")} aria-label={t("ai.clear")} onClick={() => { ai.clear(); setVerifyResult(null); }}>⌫</button>}
              {ai.streaming
                ? <button type="button" className="ag-btn" onClick={ai.stop}>■ {t("ai.stop")}</button>
                : <button type="submit" className="ag-btn is-gold" disabled={!input.trim() || retrieving}>↑ {t("ai.send")}</button>}
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
