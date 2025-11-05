import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Safe renderer for objects/arrays/strings with circular-ref protection
function SafeBlock({ label, data }) {
  const text = React.useMemo(() => {
    try {
      if (data == null) return String(data);
      if (typeof data === "string") return data;
      const seen = new WeakSet();
      return JSON.stringify(
        data,
        (k, v) => {
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
          }
          return v;
        },
        2
      );
    } catch (_e) {
      try {
        return String(data);
      } catch {
        return "[Unrenderable value]";
      }
    }
  }, [data]);

  return (
    <div className="mb-3">
      <div className="font-semibold mb-1">{label}</div>
      <pre className="text-xs whitespace-pre-wrap break-words bg-[#F8F8F7] p-2 rounded border border-[#DCDBD6]">
        {text}
      </pre>
    </div>
  );
}

export class SafeBootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });

    if (typeof window !== "undefined") {
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(
        `[SafeBootErrorBoundary] ${new Date().toISOString()} FATAL ERROR: ${error?.message || error}`
      );
      window.__APP_DEBUG.push(`[SafeBootErrorBoundary] Stack: ${error?.stack || "(no stack)"}`);
      window.__APP_DEBUG.push(
        `[SafeBootErrorBoundary] Component Stack: ${errorInfo?.componentStack || "(no component stack)"}`
      );
    }

    // eslint-disable-next-line no-console
    console.error("SafeBootErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  handleTryOffline = () => {
    if (typeof window !== "undefined") {
      window.__USE_API = false;
      window.location.reload();
    }
  };

  // No hooks here — safe for class components
  getRuntimeStatus() {
    if (typeof window === "undefined") return null;
    const apiEnabled = window.__USE_API !== false;
    const apiKey = window.BASE44_API_KEY || window.localStorage?.getItem("BASE44_API_KEY");
    const rp22Status = window.__STRICT_RP22 ? "strict" : "non-strict";
    return {
      apiEnabled,
      apiKeyPresent: Boolean(apiKey),
      rp22Mode: rp22Status,
    };
  }

  render() {
    if (this.state.hasError) {
      const status = this.getRuntimeStatus();
      const debugLog =
        (typeof window !== "undefined" && window.__APP_DEBUG) ? window.__APP_DEBUG : [];

      return (
        <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-[#DCDBD6] p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>

              <h1 className="text-2xl font-bold text-[#1B1A1A] font-header mb-3">Application Error</h1>

              <p className="text-[#3E4349] font-body mb-6 leading-relaxed">
                Something went wrong while loading the Artcoustic Cinema Designer.
                This might be a temporary issue with the system or network connectivity.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
                <button
                  onClick={this.handleReload}
                  className="flex items-center justify-center gap-2 bg-[#1B1A1A] hover:bg-[#3E4349] text-white px-6 py-3 rounded-lg font-body transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Application
                </button>

                <button
                  onClick={this.handleTryOffline}
                  className="flex items-center justify-center gap-2 bg-white border border-[#DCDBD6] hover:bg-[#F8F8F7] text-[#1B1A1A] px-6 py-3 rounded-lg font-body transition-colors"
                >
                  Try Offline Mode
                </button>
              </div>

              <details className="text-left bg-[#F8F8F7] border border-[#DCDBD6] rounded-lg p-4">
                <summary className="cursor-pointer font-medium text-[#1B1A1A] font-body mb-2">
                  Debug Information
                </summary>

                <div className="space-y-4">
                  {/* Use SafeBlock for all debug/value dumps */}
                  <SafeBlock
                    label="Error Details"
                    data={{
                      message: this.state.error?.message || String(this.state.error || ""),
                      stack: this.state.error?.stack || null,
                      componentStack: this.state.errorInfo?.componentStack || null,
                    }}
                  />
                  <SafeBlock label="Runtime Status" data={status} />
                  <SafeBlock label="Debug Log" data={debugLog} />
                </div>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SafeBootErrorBoundary;