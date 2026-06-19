import { Component } from "react";
import { translate } from "../i18n/index.js";
import { logCrash } from "../errorLog.js";

/* Catches render/runtime errors in the graph so a single bad node or NaN
 * coordinate shows a recoverable message instead of unmounting to a blank page.
 * (The data-fetch error path is handled separately inside QuranGraph; this is
 * the backstop for everything else.)
 *
 * Being a class component, it can't use the useI18n hook, so it reads the active
 * language straight off <html lang> (set by I18nProvider) and resolves strings via
 * the pure translate() — so the crash screen honours the chosen UI language. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("QuranGraph crashed:", error, info);
    logCrash(error, { source: "react", info }); // local-only record (never uploaded)
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const lang = (typeof document !== "undefined" && document.documentElement.getAttribute("lang")) || "ar";
    const t = (k) => translate(lang, k);
    return (
      <div className="ag-boot">
        <div className="ag-boot-glyph">۞</div>
        <div className="ag-boot-msg">{t("common.boot.crash")}</div>
        <div className="ag-boot-sub">{String(this.state.error?.message || this.state.error)}</div>
        <button className="ag-btn is-gold" onClick={this.reset}>{t("common.boot.retry")}</button>
      </div>
    );
  }
}
