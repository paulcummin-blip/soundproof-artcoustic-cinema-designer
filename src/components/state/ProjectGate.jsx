// ProjectGate.jsx
// --------------------------------
// Renders project-dependent content ONLY when the canonical hydration state
// allows it:
//
//   none    → no project selected (neutral prompt, never a default room)
//   loading → project-specific (or neutral) loading shell
//   failed  → "Project could not be loaded. Retry / Return to Projects."
//   loaded  → the page renders with real saved project data
//
// requiresDesign (default true) means the saved design state must be hydrated.
// Identity-only surfaces (Project Images, sidebars) pass requiresDesign={false}
// and render as soon as the project identity is known.

import React from "react";
import { Link } from "react-router-dom";
import log from "@/components/utils/logger";
import {
  useCanonicalProject,
  retryProjectHydration,
} from "@/components/state/projectHydrationStore";
import ProjectLoadingShell from "@/components/state/ProjectLoadingShell";
import ProjectDesignHydrator from "@/components/state/ProjectDesignHydrator";
import ProjectOpeningResolver from "@/components/state/ProjectOpeningResolver";
import ProjectOpeningWarnings from "@/components/state/ProjectOpeningWarnings";
import {
  dismissProjectOpeningWarnings,
  openingEntrySurfaceForPath,
  PROJECT_OPENING_STILL_RESTORING_TITLE,
  retryProjectOpening,
  useProjectOpening,
} from "@/components/state/projectOpeningAuthority";

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

function Shell({ title, message, children }) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#F5F4F0",
        fontFamily: FONT_BODY,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#FFFFFF",
          border: "1px solid #E6E4DD",
          borderRadius: 10,
          padding: "28px 32px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1B1A1A", fontFamily: "'Didact Gothic', sans-serif" }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "#625143", marginTop: 8, lineHeight: 1.5 }}>{message}</div>
        {children}
      </div>
    </div>
  );
}

export default function ProjectGate({ children, requiresDesign = true }) {
  const hydration = useCanonicalProject();
  const projectName = hydration.identity?.name || null;
  const projectClientName = hydration.identity?.clientName || null;
  const projectReference = hydration.identity?.projectReference || null;
  // The opening panel is held by the restore checklist: it stays until EVERY row
  // has reached a terminal state — ready, loaded, complete, current, out of date,
  // not generated yet, not calculated yet, not applicable, or failed. "The record
  // has loaded" is not enough, and neither is "the wait ran long": a row that is
  // still restoring keeps the panel open, and a REQUIRED row that failed keeps it
  // open too (with Retry). There is no continue-anyway path, which is what stops a
  // report or a proposal being opened on a half-restored authority.
  const opening = useProjectOpening(hydration.projectId || null);

  // One line per opening decision, so a support conversation can see exactly which
  // rows held the panel and what released it. No engineering values, no PII.
  React.useEffect(() => {
    if (!hydration.projectId) return;
    const held = opening.holdLabels.length > 0
      ? ` waiting for: ${opening.holdLabels.join(", ")}`
      : "";
    const released = opening.checklist
      .filter((row) => row.blocking)
      .map((row) => `${row.label}=${row.status}`)
      .join(", ");
    log.debug(
      `[ProjectGate] opening ${opening.holding ? "held" : "released"} `
      + `(attempt ${opening.attempt}, phase ${opening.phase})`
      + (opening.holding ? held : ` — required rows: ${released}`),
    );
  }, [
    hydration.projectId,
    opening.holding,
    opening.phase,
    opening.attempt,
    opening.holdLabels,
    opening.checklist,
  ]);

  // Opening straight into a report or proposal route makes that surface's source
  // data a required stage for the open — the designer is arriving to read it.
  const entrySurface = openingEntrySurfaceForPath(
    typeof window !== "undefined" ? window.location.pathname : "",
  );

  if (hydration.status === "none") {
    return (
      <Shell
        title="No project selected"
        message="Open a project from the Projects page to work on it here. No default room or system is shown."
      >
        <Link
          to="/Projects"
          style={{
            display: "inline-block",
            marginTop: 18,
            padding: "8px 16px",
            borderRadius: 6,
            background: "#213428",
            color: "#FFFFFF",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Return to Projects
        </Link>
      </Shell>
    );
  }

  if (hydration.status === "failed") {
    return (
      <Shell
        title="Project could not be loaded"
        message={hydration.error || "The saved design for this project could not be loaded."}
      >
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
          <button
            type="button"
            onClick={() => retryProjectHydration()}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #213428",
              background: "#213428",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT_BODY,
            }}
          >
            Retry
          </button>
          <Link
            to="/Projects"
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #DCDBD6",
              background: "#FFFFFF",
              color: "#213428",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Return to Projects
          </Link>
        </div>
      </Shell>
    );
  }

  // Identity-only surfaces: render once the project record is known.
  if (!requiresDesign && hydration.identity) {
    return children;
  }

  // Design-dependent pages: the saved design state is hydrated AND the project
  // opening authorities are ready (or known unavailable), so mount the real
  // page. Without the first branch the gate would fall through to the loading
  // shell even after the hydrator reported the project loaded, and no design page
  // could ever mount; without the second it opened half-restored.
  if (hydration.status === "loaded" && !opening.holding) {
    // The project is open. A stage that failed, went out of date, or never
    // confirmed is reported here rather than swallowed: the project is usable,
    // and the designer can see exactly which step did not resolve cleanly.
    return (
      <>
        <ProjectOpeningWarnings
          warnings={opening.warnings}
          onDismiss={() => dismissProjectOpeningWarnings(hydration.projectId)}
        />
        {children}
      </>
    );
  }

  // Only a project that is still loading (or whose identity is not yet known)
  // reaches the shell. The saved design state is hydrated by the shared
  // hydrator (the same canonical path the pages use), so no page can render a
  // default room/system as if it were this project.
  return (
    <>
      <ProjectDesignHydrator projectId={hydration.projectId} />
      <ProjectOpeningResolver projectId={hydration.projectId} entrySurface={entrySurface} />
      <ProjectLoadingShell
        projectName={projectName}
        projectClientName={projectClientName}
        projectReference={projectReference}
        lines={opening.lines}
        heldByLabels={opening.holdLabels}
        phase={opening.phase}
        stillRestoringTitle={PROJECT_OPENING_STILL_RESTORING_TITLE}
        stillRestoringLabels={opening.holdLabels}
        onRetry={() => retryProjectOpening()}
      />
    </>
  );
}