import React from "react";

/**
 * Fixed-height skeleton that reserves the same visual footprint as the
 * BassResponse graph card. Used while the authoritative bass results are
 * hydrating so the performance workspace never collapses to a one-line
 * loading state.
 *
 * Presentation only — no data, no maths, no authority.
 */
export default function BassGraphShellSkeleton({ label = "Loading graph…" }) {
  return (
    <div
      style={{
        border: "1px solid #DCDBD6",
        borderRadius: 16,
        background: "#FFFFFF",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 600,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8B7F76",
          fontSize: 13,
        }}
      >
        {label}
      </div>
    </div>
  );
}