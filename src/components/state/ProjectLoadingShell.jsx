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

// One progress line: what is being restored, and how it finished. A completed
// stage says HOW it finished — Ready, Not generated yet, Not applicable, Out of
// date or Unavailable — so "nothing is saved for this yet" can never look like a
// failure, and a failure can never look like an empty project. The detail
// sentence is carried as a tooltip so the panel stays calm.
const OUTCOME_TEXT = {
  ready: "Ready",
  "not-generated": "Not generated yet",
  "not-applicable": "Not applicable",
  stale: "Out of date",
  failed: "Unavailable",
};

const WARNING_OUTCOMES = ["stale", "failed"];

function OpeningLine({ label, state, outcome, detail }) {
  const done = state === "ready";
  const known = state === "unavailable";
  const warned = known && WARNING_OUTCOMES.includes(outcome);
  const statusText = done ? "Ready" : known ? (OUTCOME_TEXT[outcome] || "Not available") : "Restoring";
  const statusColour = done ? "#213428" : warned ? "#8A4B12" : "#8B7F76";

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
          background: done ? "#213428" : warned ? "#B4732A" : known ? "#8B7F76" : "#B9B2A8",
          animation: done || known ? "none" : "project-shell-dot 1.2s ease-in-out infinite",
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, color: statusColour, fontWeight: done || warned ? 700 : 500 }}>
        {statusText}
      </span>
    </div>
  );
}

const BUTTON_BASE = {
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FONT_BODY,
};

// The long-wait notice: the panel says plainly that saved data is still
// restoring, and offers to re-ask. Continuing anyway is offered only when every
// stage still restoring is a non-blocking one (the authority decides).
function StillRestoringNotice({ title, labels, canContinueWithWarning, onRetry, onContinueWithWarning }) {
  const named = labels.length > 0
    ? `${labels.join(", ")} ${labels.length === 1 ? "has" : "have"} not finished yet.`
    : "Some saved data has not finished restoring.";
  return (
    <div
      style={{
        marginTop: 18,
        padding: "14px 16px",
        border: "1px solid #E2D9C6",
        borderRadius: 8,
        background: "#FBF7EF",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B1A1A" }}>{title}</div>
      <div style={{ fontSize: 12, color: "#625143", marginTop: 6, lineHeight: 1.5 }}>
        {named} The project opens once these are restored
        {canContinueWithWarning
          ? ", or now, if you choose to continue with a warning."
          : ". This is a required step, so the project cannot be opened without it."}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{ ...BUTTON_BASE, border: "1px solid #213428", background: "#213428", color: "#FFFFFF" }}
          >
            Retry
          </button>
        )}
        {canContinueWithWarning && onContinueWithWarning && (
          <button
            type="button"
            onClick={onContinueWithWarning}
            style={{ ...BUTTON_BASE, border: "1px solid #B4732A", background: "#FFFFFF", color: "#8A4B12" }}
          >
            Continue with warning
          </button>
        )}
      </div>
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
  phase = "restoring",
  stillRestoringTitle = null,
  stillRestoringLabels = [],
  canContinueWithWarning = false,
  onRetry = null,
  onContinueWithWarning = null,
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
              <OpeningLine
                key={line.key}
                label={line.label}
                state={line.state}
                outcome={line.outcome}
                detail={line.detail}
              />
            ))}
          </div>
        )}

        {phase === "still-restoring" && stillRestoringTitle && (
          <StillRestoringNotice
            title={stillRestoringTitle}
            labels={stillRestoringLabels}
            canContinueWithWarning={canContinueWithWarning}
            onRetry={onRetry}
            onContinueWithWarning={onContinueWithWarning}
          />
        )}
      </div>
    </div>
  );
}