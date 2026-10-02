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
import {
  useCanonicalProject,
  retryProjectHydration,
} from "@/components/state/projectHydrationStore";
import ProjectLoadingShell from "@/components/state/ProjectLoadingShell";
import ProjectDesignHydrator from "@/components/state/ProjectDesignHydrator";
import ProjectOpeningResolver from "@/components/state/ProjectOpeningResolver";
import { useProjectOpening } from "@/components/state/projectOpeningAuthority";

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
  // The opening panel is held by the project opening authority: it stays until
  // the saved design is restored AND the main project authorities are ready or
  // known to be unavailable. "The record has loaded" is not enough.
  const opening = useProjectOpening(hydration.projectId || null);

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
    return children;
  }

  // Only a project that is still loading (or whose identity is not yet known)
  // reaches the shell. The saved design state is hydrated by the shared
  // hydrator (the same canonical path the pages use), so no page can render a
  // default room/system as if it were this project.
  return (
    <>
      <ProjectDesignHydrator projectId={hydration.projectId} />
      <ProjectOpeningResolver projectId={hydration.projectId} />
      <ProjectLoadingShell
        projectName={projectName}
        projectClientName={projectClientName}
        projectReference={projectReference}
        lines={opening.lines}
      />
    </>
  );
}