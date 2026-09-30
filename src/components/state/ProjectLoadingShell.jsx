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

export default function ProjectLoadingShell({
  projectName = null,
  projectClientName = null,
  label = "Loading project…",
  compact = false,
}) {
  const heading = projectName ? projectName : label;
  const subheading = projectName
    ? "Loading saved project state…"
    : "Waiting for the selected project…";

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
          {projectName ? "Opening project" : "Project loading"}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1B1A1A", marginTop: 6, lineHeight: 1.25 }}>
          {heading}
        </div>
        <div style={{ fontSize: 13, color: "#625143", marginTop: 4 }}>
          {projectClientName ? `Client: ${projectClientName} · ${subheading}` : subheading}
        </div>

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
          Saved design data is being hydrated. Room dimensions, speaker layouts,
          performance results and prices will appear once the project has loaded —
          nothing is shown from placeholder data.
        </div>
      </div>
    </div>
  );
}