import React from "react";

// Safe, no-op passthrough boundary; no env vars, no hooks, browser-safe.
export function SegmentBoundary({ name, children }) {
  // Dev-only breadcrumb without using process.env
  if (typeof window !== "undefined" && name) {
    try {
      if (window.console && typeof window.console.debug === "function") {
        window.console.debug(`[SegmentBoundary] ${name}`);
      }
    } catch {}
  }
  return <>{children}</>;
}

export default SegmentBoundary;