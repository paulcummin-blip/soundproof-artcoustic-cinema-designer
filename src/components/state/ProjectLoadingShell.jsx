// ProjectLoadingShell.jsx
// --------------------------------
// Project-specific loading shell. Renders a neutral skeleton — never default
// room dimensions, default speaker layouts, RP22 values, prices or engineering
// results. When the project is known it names it, so the designer can see which
// project is being opened.

import React from "react";

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

function Bar({ width = "100%", height = 12 }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: "linear-gradient(90deg, #E7E5E0 25%, #EFEDE9 50%, #E7E5E0 75%)",
        backgroundSize: "200% 100%",
        animation: "project-shell-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

// One progress line: what is being restored, and whether it is done. The detail
// sentence is carried as a tooltip so the panel stays calm.
function OpeningLine({ label, state, detail }) {
  const done = state === "ready";
  const known = state === "unavailable";
  return (
    <div
      title={detail || undefined}
      style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "#3E4349" }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          flexShrink: 0,
          background: done ? "#213428" : known ? "#8B7F76" : "#B9B2A8",
          animation: done || known ? "none" : "project-shell-dot 1.2s ease-in-out infinite",
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: done ? "#213428" : "#8B7F76", fontWeight: done ? 700 : 500 }}>
        {done ? "Ready" : known ? "Not available" : "Restoring"}
      </span>
    </div>
  );
}

export default function ProjectLoadingShell({
  projectName = null,
  projectClientName = null,
  projectReference = null,
  lines = [],
  label = "Your project",
  compact = false,
}) {
  const heading = projectName ? projectName : label;
  const clientLine = projectClientName ? `Client: ${projectClientName}` : null;
  const referenceLine = projectReference ? `Reference: ${projectReference}` : null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: compact ? 120 : "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: FONT_BODY,
        background: "#F5F4F0",
      }}
    >
      <style>{`
        @keyframes project-shell-pulse {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes project-shell-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          background: "#FFFFFF",
          border: "1px solid #E6E4DD",
          borderRadius: 10,
          padding: "28px 32px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#625143" }}>
          Loading Project
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1B1A1A", marginTop: 6, lineHeight: 1.25 }}>
          {heading}
        </div>
        {clientLine && (
          <div style={{ fontSize: 13, color: "#625143", marginTop: 4 }}>
            {clientLine}
          </div>
        )}
        {referenceLine && (
          <div style={{ fontSize: 13, color: "#625143", marginTop: 2 }}>
            {referenceLine}
          </div>
        )}

        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Bar width="70%" height={14} />
          <Bar width="100%" />
          <Bar width="92%" />
          <Bar width="58%" />
        </div>

        <div
          style={{
            marginTop: 22,
            paddingTop: 14,
            borderTop: "1px solid #EEEDEA",
            fontSize: 12,
            color: "#8B7F76",
          }}
        >
          Restoring saved design, performance results, reports and pricing.
        </div>

        {lines.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {lines.map((line) => (
              <OpeningLine key={line.key} label={line.label} state={line.state} detail={line.detail} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}