import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Global crash guard — the last line of defense for the UI.
 *
 * Without it, any unexpected render error white-screens the entire
 * dashboard with no explanation and no way out. The fallback renders
 * with INLINE STYLES ONLY (no Tailwind classes): if the crash was
 * caused by a styling/CSS issue the fallback must still render
 * correctly, and it must survive even if the stylesheet never loaded.
 *
 * Bilingual by design (no i18n dependency — the translation system
 * itself may be what crashed).
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Server-side logs would be better, but never swallow the crash.
    console.error("SIGMO UI crash:", error, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0f0d",
          color: "#e7ecea",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            border: "1px solid rgba(52, 211, 153, 0.3)",
            borderRadius: "0.75rem",
            backgroundColor: "rgba(17, 26, 22, 0.9)",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              margin: "0 auto 1rem",
              borderRadius: "9999px",
              border: "1px solid rgba(52, 211, 153, 0.3)",
              backgroundColor: "rgba(52, 211, 153, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
            }}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#9cb0a8", marginTop: "0.5rem", marginBottom: 0 }}>
            የሚጠበቅ ስህተት ተከስቷል። ገጹን እንደገና መጫን ይሞክሩ — ችግሩ ከቀጠለ አስተዳዳሪውን ያሳውቁ።
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem",
              width: "100%",
              padding: "0.625rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#1ad677",
              color: "#052e1a",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload · እንደገና ጫን
          </button>
          <details style={{ marginTop: "1rem", textAlign: "left", fontSize: "0.75rem", color: "#9cb0a8" }}>
            <summary style={{ cursor: "pointer" }}>Technical details</summary>
            <pre
              style={{
                marginTop: "0.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#f8b4b4",
                margin: 0,
              }}
            >
              {this.state.error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
