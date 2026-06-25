import { useCallback, useEffect, useRef, useState } from "react";
import { Joyride, EVENTS, STATUS, ACTIONS } from "react-joyride";
import { useI18n } from "../i18n/index.js";

/* ═══ Getting-started tour ═══
 *
 * An interactive, end-to-end walkthrough built on react-joyride, run in
 * CONTROLLED mode: the parent owns the step index. On "action" steps (marked
 * `data.gated`) the parent advances the index itself once it detects the user
 * actually performed the action (changed the verse, expanded a word, opened the
 * distribution, opened the tools); the primary button is a "skip this step"
 * fallback. The spotlight lets the user interact with the highlighted control
 * (blockTargetInteraction is off), and action steps over the canvas hide the
 * overlay entirely so the graph is fully draggable.
 *
 * Trigger policy: auto-opens on every load until the user ticks "don't show on
 * startup" (the parent persists that). Relaunch from Help.
 */
const NoArrow = () => null;

// In-card text-size control: scale the tour copy between these bounds, persisted.
const SCALE_MIN = 0.85, SCALE_MAX = 1.4, SCALE_STEP = 0.1;
const clampScale = (v) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(v * 100) / 100));
const readScale = () => {
  try { const v = parseFloat(localStorage.getItem("qg.tourScale")); return v >= SCALE_MIN && v <= SCALE_MAX ? v : 1; } catch { return 1; }
};

const OPTIONS = {
  zIndex: 10000,
  overlayColor: "rgba(4, 6, 12, 0.62)",
  spotlightPadding: 8,
  spotlightRadius: 12,
  skipBeacon: true,
  disableFocusTrap: true, // let the user click the page / the highlighted control
  blockTargetInteraction: false, // spotlighted controls stay interactive
  overlayClickAction: false,
  dismissKeyAction: false,
  skipScroll: true,
  targetWaitTimeout: 4000, // graph nodes (e.g. the كرسي partner verse) can render after a worker re-layout
};
const STYLES = { floater: { width: "min(360px, 92vw)", maxWidth: "92vw" } };

// Thin wrapper: keying the card by step index remounts it each step, so the
// dragged offset resets to its anchored position without a setState-in-effect.
function TourTooltip(props) {
  return <TourCard key={props.index} {...props} />;
}

function TourCard({
  index, size, step, isLastStep,
  backProps, primaryProps, skipProps, closeProps, tooltipProps,
  dontShow, onDontShow, fontScale, onFontScale, theme, onToggleTheme, lang, onToggleLang, minimized, onToggleMin, dir, t,
}) {
  const gated = !!step.data?.gated;
  const cardRef = useRef(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  // Local mirrors of the in-card controls. react-joyride re-renders the tooltip
  // only on step changes, NOT when the parent's props change — so driving these
  // straight from props makes them update a step late (the "checkbox doesn't tick
  // until Next/Back" bug). Keep the live state here for instant feedback and call
  // up to persist it; each control re-seeds from its prop when the step remounts.
  const [dont, setDont] = useState(dontShow);
  const [scale, setScale] = useState(fontScale);
  const [themeView, setThemeView] = useState(theme);
  const [langView, setLangView] = useState(lang);
  // Local mirror (instant UI), synced up to persist across the per-step remount.
  const [minView, setMinView] = useState(minimized);

  // Clamp a desired offset so the whole card stays within the viewport (8px
  // margin). `off` is the currently-applied offset, so the card's base position
  // is its measured rect minus `off`.
  const clamp = (next) => {
    const el = cardRef.current;
    if (!el) return next;
    const r = el.getBoundingClientRect();
    const baseL = r.left - off.x, baseT = r.top - off.y;
    const x = Math.min(window.innerWidth - 8 - r.width - baseL, Math.max(8 - baseL, next.x));
    const y = Math.min(window.innerHeight - 8 - r.height - baseT, Math.max(8 - baseT, next.y));
    return { x, y };
  };
  const onGrabDown = (e) => {
    // The whole header/title strip drags, but let the controls inside it (theme,
    // text size, close) take their own clicks instead of starting a drag.
    if (e.target.closest("button, input, a, select, label")) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onGrabMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setOff(clamp({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
  };
  const onGrabUp = () => { dragRef.current = null; };
  // Nudge fully into view once placed (react-joyride can anchor a card partly
  // off-screen next to an edge target), and again on resize / rotate.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOff((o) => clamp(o)));
    const h = () => setOff((o) => clamp(o));
    window.addEventListener("resize", h);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", h); };
  });

  const bumpScale = (d) => { const v = clampScale(scale + d); setScale(v); onFontScale?.(v); };
  const toggleTheme = () => { onToggleTheme?.(); setThemeView((v) => (v === "dark" ? "light" : "dark")); };
  const toggleLang = () => { onToggleLang?.(); setLangView((v) => (v === "ar" ? "en" : "ar")); };

  return (
    <div ref={cardRef} className={"ag-tour" + (minView ? " is-min" : "")} dir={dir} {...tooltipProps} aria-label={t("tour.ariaLabel")}
      style={{ transform: `translate(${off.x}px, ${off.y}px)`, "--tour-scale": scale }}>
      <div className="ag-tour-drag"
        onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>
        <div className="ag-tour-head">
          <button type="button" className="ag-tour-tool" onClick={toggleTheme}
            title={t("common.theme")} aria-label={t("common.theme")}>{themeView === "dark" ? "☀" : "☾"}</button>
          <button type="button" className="ag-tour-tool ag-tour-lang" onClick={toggleLang}
            title={t("common.language")} aria-label={t("common.language")}>{langView === "ar" ? "EN" : "ع"}</button>
          <button type="button" className="ag-tour-tool" onClick={() => bumpScale(-SCALE_STEP)} disabled={scale <= SCALE_MIN}
            title={t("tour.textSmaller")} aria-label={t("tour.textSmaller")}>A−</button>
          <button type="button" className="ag-tour-tool" onClick={() => bumpScale(SCALE_STEP)} disabled={scale >= SCALE_MAX}
            title={t("tour.textLarger")} aria-label={t("tour.textLarger")}>A+</button>
          <button type="button" className="ag-tour-tool ag-tour-min-btn"
            onClick={() => { const v = !minView; setMinView(v); onToggleMin?.(v); }}
            title={t(minView ? "tour.expand" : "tour.minimize")} aria-label={t(minView ? "tour.expand" : "tour.minimize")}>{minView ? "▢" : "—"}</button>
          <button type="button" className="ag-tour-x" {...closeProps} title={t("tour.close")} aria-label={t("tour.close")}>✕</button>
        </div>
        {step.title && <div className="ag-tour-title">{step.title}</div>}
      </div>
      <div className="ag-tour-body">{step.content}</div>

      {index < 2 && <p className="ag-tour-tip">{t("tour.dragHint")}</p>}

      {gated && <div className="ag-tour-hint"><span className="ag-tour-pulse" aria-hidden="true" />{t("tour.yourTurn")}</div>}

      <div className="ag-tour-dots" aria-hidden="true">
        {Array.from({ length: size }).map((_, i) => (
          <span key={i} className={"ag-tour-dot" + (i === index ? " is-on" : i < index ? " is-done" : "")} />
        ))}
      </div>

      <label className="ag-tour-dont">
        <input type="checkbox" checked={dont} onChange={(e) => { setDont(e.target.checked); onDontShow(e.target.checked); }} />
        <span>{t("tour.dontShow")}</span>
      </label>

      <div className="ag-tour-nav">
        <button type="button" className="ag-tour-skip" {...skipProps}>{t("tour.skip")}</button>
        <span className="ag-tour-spacer" />
        <span className="ag-tour-count">{t("tour.progress", { c: index + 1, n: size })}</span>
        {index > 0 && <button type="button" className="ag-btn ag-tour-btn" {...backProps}>{t("tour.back")}</button>}
        <button type="button" className={"ag-btn ag-tour-btn" + (gated ? "" : " is-gold")} {...primaryProps}>
          {isLastStep ? t("tour.done") : gated ? t("tour.skipStep") : t("tour.next")}
        </button>
      </div>
    </div>
  );
}

export function Tour({ run, stepIndex, steps, onStepChange, onEnd, theme, onToggleTheme }) {
  const { t, dir, lang, setLang } = useI18n();
  const onToggleLang = useCallback(() => setLang(lang === "ar" ? "en" : "ar"), [lang, setLang]);
  const [dontShow, setDontShow] = useState(false);
  const dontShowRef = useRef(false);
  const endedRef = useRef(false);
  // Text-size preference lives here (not in the per-step card, which remounts) so
  // it survives step changes; persisted so it sticks across tour runs.
  const [fontScale, setFontScale] = useState(readScale);
  const changeScale = useCallback((v) => {
    setFontScale(v);
    try { localStorage.setItem("qg.tourScale", String(v)); } catch { /* private mode */ }
  }, []);
  // Minimize collapses the card to a small corner pill so the whole app behind the tour
  // becomes interactive (change a tab, shrink a sheet…) — then restore to keep reading.
  // Lifted here (not in the per-step card, which remounts) so it persists across steps.
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (run) { endedRef.current = false; return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinimized(false); // a fresh run always starts expanded
  }, [run]);
  // While minimized, a body class shrinks the floater to a corner pill (CSS), freeing the
  // rest of the screen — the floater itself stops eating clicks so the app behind is live.
  useEffect(() => {
    document.body.classList.toggle("qg-tour-min", run && minimized);
    return () => document.body.classList.remove("qg-tour-min");
  }, [run, minimized]);
  const setDS = useCallback((v) => { dontShowRef.current = v; setDontShow(v); }, []);

  const handleEvent = useCallback((data) => {
    const { type, status, action, index } = data;
    // End on finish/skip AND on the card's ✕ (action CLOSE). CLOSE arrives as a STEP_AFTER
    // event, so without this it fell through to the advance branch below — the tour didn't
    // actually close, its overlay stayed up, and clicks on a later-opened modal (e.g. the
    // share button) were swallowed. Treat ✕ as "dismiss the tour", like Skip.
    const ending = type === EVENTS.TOUR_END || status === STATUS.FINISHED || status === STATUS.SKIPPED || action === ACTIONS.CLOSE;
    if (ending && !endedRef.current) {
      endedRef.current = true;
      onEnd(dontShowRef.current);
      return;
    }
    if (type === EVENTS.STEP_AFTER) {
      onStepChange(index + (action === ACTIONS.PREV ? -1 : 1));
    } else if (type === EVENTS.TARGET_NOT_FOUND && !steps[index]?.data?.gated) {
      // Only skip a missing target on non-action steps. On a gated step the
      // target (e.g. a freshly-laid-out node) may just be slow; never auto-skip
      // it — the user's action (or the Skip button) advances instead.
      onStepChange(index + 1);
    }
  }, [onStepChange, onEnd, steps]);

  const Tooltip = useCallback(
    (props) => <TourTooltip {...props} dontShow={dontShow} onDontShow={setDS}
      fontScale={fontScale} onFontScale={changeScale} theme={theme} onToggleTheme={onToggleTheme}
      lang={lang} onToggleLang={onToggleLang} minimized={minimized} onToggleMin={setMinimized} dir={dir} t={t} />,
    [dontShow, setDS, fontScale, changeScale, theme, onToggleTheme, lang, onToggleLang, minimized, dir, t],
  );

  // Pulse a ring on the current step's target element (the dimmed overlay alone
  // isn't enough on hideOverlay steps; this works for HTML controls and SVG
  // nodes alike). Skip centred steps (their target is the whole stage).
  useEffect(() => {
    if (!run) return undefined;
    const step = steps[stepIndex];
    // `data.ring` names the element to highlight explicitly — used by the mobile
    // show-and-tell steps, which target the (always-present) stage so the tour can't
    // break, yet still want to spotlight the control/sheet they describe. Otherwise
    // ring the step's own target, skipping centred steps and large noRing panels.
    const sel = step?.data?.ring
      || (step && step.placement !== "center" && !step.data?.noRing && typeof step.target === "string" ? step.target : null);
    if (!sel) return undefined;
    let el = null, timer = 0, tries = 0;
    const apply = () => {
      el = document.querySelector(sel);
      if (el) el.classList.add("qg-tour-target");
      else if (tries++ < 25) timer = window.setTimeout(apply, 100); // target may appear after the before-hook
    };
    timer = window.setTimeout(apply, 40);
    return () => { window.clearTimeout(timer); if (el) el.classList.remove("qg-tour-target"); };
  }, [run, stepIndex, steps]);

  // Mobile: pin the card to the bottom of the screen for steps that describe the top
  // toolbar (data.mcard === "bottom"), so the card doesn't cover the control it explains.
  // Default (top) is the CSS baseline; we only toggle the override class.
  useEffect(() => {
    const on = run && steps[stepIndex]?.data?.mcard === "bottom";
    document.body.classList.toggle("qg-tour-mbottom", !!on);
    return () => document.body.classList.remove("qg-tour-mbottom");
  }, [run, stepIndex, steps]);

  if (!steps?.length) return null;

  return (
    <Joyride
      run={run}
      stepIndex={stepIndex}
      steps={steps}
      continuous
      showProgress={false}
      onEvent={handleEvent}
      tooltipComponent={Tooltip}
      arrowComponent={NoArrow}
      options={OPTIONS}
      styles={STYLES}
    />
  );
}
