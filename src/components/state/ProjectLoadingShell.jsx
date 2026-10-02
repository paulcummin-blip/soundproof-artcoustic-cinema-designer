// ProjectLoadingShell.jsx
// --------------------------------
// Project-specific loading shell. Renders a neutral skeleton — never default
// room dimensions, default speaker layouts, RP22 values, prices or engineering
// results. When the project is known it names it, so the designer can see which
// project is being opened.

import React from "react";
import { RESTORE_STATUS_LABEL } from "@/components/state/projectRestoreChecklist";

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

// One progress line: what is being restored, and how it finished. The status text
// comes straight from the restore checklist's vocabulary, so a row can only say
// "Restoring" while it really is still restoring — and a row that is holding the
// project is marked as required, so the panel always names what it is waiting for.
//
// A completed stage says HOW it finished — Ready, Not generated yet, Not
// calculated yet, Not applicable, Out of date or Failed — so "nothing is saved
// for this yet" can never look like a failure, and a failure can never look like
// an empty project. The detail sentence is carried as a tooltip.
function OpeningLine({ label, status, terminal, blocking, detail }) {
  const warned = terminal && (status === "stale" || status === "failed");
  const done = terminal && !warned;
  const statusText = RESTORE_STATUS_LABEL[status] || "Restoring";
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
          background: done ? "#213428" : warned ? "#B4732A" : terminal ? "#8B7F76" : "#B9B2A8",
          animation: terminal ? "none" : "project-shell-dot 1.2s ease-in-out infinite",
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      {blocking === true && !terminal && (
        <span
          style={{
            fontSize: 10,
            color: "#8A4B12",
            border: "1px solid #E2D9C6",
            borderRadius: 4,
            padding: "1px 5px",
            whiteSpace: "nowrap",
          }}
        >
          required
        </span>
      )}
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

// The long-wait notice. It appears while the restore is simply taking a while —
// larger projects, saved bass authority, report authority, proposal source data and
// pricing can all take longer — and it never implies a failure. Retry appears here
// only once the authority says a restore genuinely failed or has stopped responding.
// There is still no continue-anyway option: a required row that has not restored
// keeps the project here until it does.
function StillRestoringNotice({ title, labels, onRetry }) {
  const named = labels.length > 0
    ? `${labels.join(", ")} ${labels.length === 1 ? "has" : "have"} not finished restoring.`
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
        Larger projects can take longer. {named} The project opens as soon as every
        row above has finished restoring.
        {onRetry ? " If a step has stopped responding, Retry runs the restore again." : ""}
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
      </div>
    </div>
  );
}

export default function ProjectLoadingShell({
  projectName = null,
  projectClientName = null,
  projectReference = null,
  lines = [],
  heldByLabels = [],
  label = "Your project",
  compact = false,
  phase = "restoring",
  stillRestoringTitle = null,
  stillRestoringLabels = [],
  retryAvailable = false,
  onRetry = null,
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
                status={line.status}
                terminal={line.terminal}
                blocking={line.blocking}
                detail={line.detail}
              />
            ))}
          </div>
        )}

        {/* What the panel is waiting for, named. If a row above still says
            Restoring, it appears here — the project cannot open on it. */}
        {heldByLabels.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "#8A4B12", lineHeight: 1.5 }}>
            This project opens once every row above has finished restoring. Still
            waiting for {heldByLabels.join(", ")}.
          </div>
        )}

        {/* Retry is offered only once the authority says a restore failed or has
            stopped responding — a slow-but-working restore shows the notice alone. */}
        {phase === "still-restoring" && stillRestoringTitle && (
          <StillRestoringNotice
            title={stillRestoringTitle}
            labels={stillRestoringLabels}
            onRetry={retryAvailable ? onRetry : null}
          />
        )}
      </div>
    </div>
  );
}