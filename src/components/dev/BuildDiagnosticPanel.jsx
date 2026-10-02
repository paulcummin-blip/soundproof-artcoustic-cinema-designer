import React from "react";
import { useLocation } from "react-router-dom";
import { PROJECT_OPENING_LINES } from "@/components/state/projectOpeningReadiness";
import { RESTORE_CHECKLIST_VERSION } from "@/components/state/projectRestoreChecklist";
import { SHOW_DEBUG_PANEL } from "@/components/utils/diagnostics";

const REPORT_GATE_VERSION = "engineering-report-completeness-v1";

// Floating verification aid for the build id, checkpoint versions, the report
// gate and the restore checklist. It is OFF on every normal load — dealer,
// client, partner and admin alike — and appears only when somebody asks for it
// explicitly:
//
//   · ?debugBuild=1                             (URL query parameter)
//   · soundproof:debug:buildDiagnostic = "true"  (localStorage)
//   · the local development server               (import.meta.env.DEV)
//   · SHOW_DEBUG_PANEL in components/utils/diagnostics.js
//
// Closing it hides it for the rest of the browser session, so whoever has
// finished looking at it is not followed by it from page to page.
const QUERY_FLAG = "debugBuild";
const STORAGE_FLAG = "soundproof:debug:buildDiagnostic";
const DISMISSED_KEY = "soundproof:debug:buildDiagnostic:dismissed";

function isExplicitlyRequested() {
  if (SHOW_DEBUG_PANEL || import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get(QUERY_FLAG) === "1") return true;
    return window.localStorage.getItem(STORAGE_FLAG) === "true";
  } catch {
    return false;
  }
}

function isDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function BuildDiagnosticPanel() {
  const location = useLocation();
  // Resolved once per mount: the panel must not appear mid-session because a flag
  // changed under the person looking at the screen.
  const [requested] = React.useState(isExplicitlyRequested);
  const [dismissed, setDismissed] = React.useState(isDismissed);

  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const assetBuildId = typeof document !== "undefined"
    ? Array.from(document.scripts)
      .map((script) => script.src)
      .filter(Boolean)
      .map((src) => src.match(/\/assets\/(index-[^/?]+\.js)/)?.[1] || null)
      .find(Boolean)
    : null;
  const buildId = query?.get("_b44_commit")
    || import.meta.env.VITE_APP_BUILD_ID
    || import.meta.env.VITE_GIT_SHA
    || import.meta.env.VITE_COMMIT_SHA
    || (typeof window !== "undefined" && (window.__BASE44_BUILD_ID__ || window.__APP_BUILD_ID__))
    || assetBuildId
    || "not exposed";
  const route = `${location.pathname}${location.search}`;

  // The machine-readable half of the same diagnostic: written whether or not the
  // panel is drawn, so an automated check can still read the build, the
  // checkpoint identity and the route without a panel on screen.
  React.useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const root = document.documentElement;
    root.dataset.soundProofBuildId = String(buildId);
    root.dataset.reportGateVersion = REPORT_GATE_VERSION;
    root.dataset.restoreChecklistVersion = RESTORE_CHECKLIST_VERSION;
    root.dataset.restoreChecklistRowCount = String(PROJECT_OPENING_LINES.length);
    root.dataset.currentRoute = route;
    return () => {
      delete root.dataset.soundProofBuildId;
      delete root.dataset.reportGateVersion;
      delete root.dataset.restoreChecklistVersion;
      delete root.dataset.restoreChecklistRowCount;
      delete root.dataset.currentRoute;
    };
  }, [buildId, route]);

  if (!requested || dismissed) return null;

  const close = () => {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // A browser that refuses session storage still closes the panel.
    }
    setDismissed(true);
  };

  return (
    <div
      data-build-checkpoint-diagnostic="true"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 9999,
        maxWidth: 420,
        padding: "9px 12px",
        borderRadius: 7,
        border: "1px solid #3E4349",
        background: "#1B1A1A",
        color: "#F5F4F0",
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 1.45,
        boxShadow: "0 4px 16px rgba(0,0,0,0.30)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
        <div style={{ color: "#A8C7A0", fontWeight: 700, flex: 1 }}>Sound Proof build diagnostic</div>
        <button
          type="button"
          onClick={close}
          title="Close — hidden for the rest of this session"
          aria-label="Close Sound Proof build diagnostic"
          style={{
            border: "1px solid #3E4349",
            background: "#25231F",
            color: "#F5F4F0",
            fontFamily: "monospace",
            fontSize: 10,
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
      <div>Build/checkpoint: {String(buildId)}</div>
      <div>Report gate: {REPORT_GATE_VERSION}</div>
      <div>Restore checklist: {RESTORE_CHECKLIST_VERSION}</div>
      <div>Visible rows: {PROJECT_OPENING_LINES.length}</div>
      <div>Route: {route}</div>
    </div>
  );
}