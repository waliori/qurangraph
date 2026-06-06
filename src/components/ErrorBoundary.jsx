import { Component } from "react";

/* Catches render/runtime errors in the graph so a single bad node or NaN
 * coordinate shows a recoverable message instead of unmounting to a blank page.
 * (The data-fetch error path is handled separately inside QuranGraph; this is
 * the backstop for everything else.) */
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
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ag-boot">
        <div className="ag-boot-glyph">۞</div>
        <div className="ag-boot-msg">حدث خطأ غير متوقع في الشبكة.</div>
        <div className="ag-boot-sub">{String(this.state.error?.message || this.state.error)}</div>
        <button className="ag-btn is-gold" onClick={this.reset}>إعادة المحاولة</button>
      </div>
    );
  }
}
