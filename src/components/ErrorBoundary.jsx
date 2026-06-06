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
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#060a14", color: "#e2e8f0", fontFamily: "Arial", gap: 14, padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>😵</div>
        <div style={{ fontSize: 15, color: "#94a3b8", maxWidth: 360 }}>حدث خطأ غير متوقع في الشبكة.</div>
        <div style={{ fontSize: 11, color: "#475569", maxWidth: 420, direction: "ltr", wordBreak: "break-word" }}>{String(this.state.error?.message || this.state.error)}</div>
        <button onClick={this.reset} style={{ background: "#1e40af33", color: "#60a5fa", border: "1px solid #1e40af", borderRadius: 6, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>إعادة المحاولة</button>
      </div>
    );
  }
}
