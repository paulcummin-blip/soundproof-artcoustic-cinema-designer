import React from "react";

// Accept only nodes React can render safely
function isRenderableNode(v) {
  if (v == null) return true;
  const t = typeof v;
  if (t === "string" || t === "number") return true;
  if (React.isValidElement(v)) return true;
  // Allow arrays only if every item is renderable
  if (Array.isArray(v)) return v.every(isRenderableNode);
  // Everything else (plain objects, functions, symbols) is NOT renderable
  return false;
}

// Tiny badge UI used when a segment can't render its children
function Badge({ text, tone = "red" }) {
  const tones = {
    red:    "text-red-700 bg-red-50 border-red-200",
    amber:  "text-amber-800 bg-amber-50 border-amber-200",
    gray:   "text-gray-700 bg-gray-50 border-gray-200",
  };
  return (
    <div
      className={`text-xs ${tones[tone] || tones.red} border rounded px-2 py-1`}
      style={{ display: "inline-block" }}
      title={text}
      aria-label={text}
      role="status"
    >
      {text}
    </div>
  );
}

/**
 * SegmentBoundary
 * - Catches descendant render errors (standard error boundary)
 * - AND proactively guards its own render by validating children first.
 */
export class SegmentBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(
      `[SegmentBoundary] '${String(this.props.name)}' crashed:`,
      error,
      info?.componentStack
    );
    if (typeof window !== "undefined") {
      window.__APP_DEBUG = window.__APP_DEBUG || [];
      window.__APP_DEBUG.push(
        `[SegmentBoundary] ${String(this.props.name)} → ${error?.message || error}`
      );
      if (info?.componentStack) window.__APP_DEBUG.push(info.componentStack);
    }
  }

  render() {
    const name = String(this.props.name ?? "Segment");

    // If a descendant threw, render a badge (this path is caught)
    if (this.state.hasError) {
      return <Badge text={`${name} failed to render`} tone="red" />;
    }

    // Guard BEFORE returning children so the boundary doesn't throw inside its own render
    const { children } = this.props;
    if (!isRenderableNode(children)) {
      // eslint-disable-next-line no-console
      console.warn(`[SegmentBoundary] '${name}' received non-renderable children:`, children);
      return <Badge text={`${name} (content not renderable)`} tone="amber" />;
    }

    return children ?? null;
  }
}

// Helper for safely rendering unknown values
export function RenderSafe({ value, label }) {
  const ok =
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    React.isValidElement(value);

  if (ok) return value ?? null;

  // eslint-disable-next-line no-console
  console.warn(`[RenderSafe] Non-renderable ${label}:`, value);
  try {
    return (
      <pre className="text-xs whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } catch {
    return <span className="text-xs">[unrenderable {label}]</span>;
  }
}

export default SegmentBoundary;