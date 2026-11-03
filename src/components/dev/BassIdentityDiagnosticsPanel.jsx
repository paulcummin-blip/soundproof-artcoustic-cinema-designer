import React, { useSyncExternalStore } from "react";
import { useActiveProjectId } from "@/components/state/project-session";
import { useCanonicalProject } from "@/components/state/projectHydrationStore";
import { useEngineeringMode } from "@/components/state/useEngineeringMode";
import {
  subscribeBassIdentityDiagnostics,
  getBassIdentityDiagnosticsSnapshot,
  diffBassIdentityCaptures,
  getBassIdentityCapture,
  BASS_IDENTITY_STAGE,
} from "@/components/room/bass/bassIdentityDiagnostics";

// Floating, dev-only panel that shows the PUBLISHED vs REOPENED bass identity
// diff for the active project version. Observability only — it reads the
// diagnostics store and never touches the bass engine, the authority or the
// fingerprints. Appears only in Engineering Mode (or local dev), so dealers
// and clients never see it.

function truncate(value, max = 140) {
  if (value == null) return String(value);
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function BassIdentityDiagnosticsPanel() {
  const { engineeringMode } = useEngineeringMode();
  const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
  const activeProjectId = useActiveProjectId();
  const hydration = useCanonicalProject();
  // Re-render when the diagnostics store changes.
  useSyncExternalStore(subscribeBassIdentityDiagnostics, getBassIdentityDiagnosticsSnapshot, getBassIdentityDiagnosticsSnapshot);

  if (!engineeringMode && !isDev) return null;

  const projectId = activeProjectId;
  const versionId = hydration?.identity?.activeVersionId || null;
  const hasScope = !!projectId && !!versionId;

  const published = hasScope ? getBassIdentityCapture(projectId, versionId, BASS_IDENTITY_STAGE.PUBLISHED) : null;
  const reopened = hasScope ? getBassIdentityCapture(projectId, versionId, BASS_IDENTITY_STAGE.REOPENED) : null;
  const diff = hasScope ? diffBassIdentityCaptures(projectId, versionId) : null;

  const tone = !diff?.ready
    ? "#737373"
    : diff.fingerprintsEqual
      ? "#213428"
      : "#4A230F";
  const headline = !hasScope
    ? "No active project version"
    : !diff?.ready
      ? `Waiting: ${diff?.reason || "missing"}`
      : diff.fingerprintsEqual
        ? "Identity MATCHES (not stale)"
        : "Identity DIFFERS (stale)";

  return (
    <div
      data-bass-identity-diagnostic="true"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        maxWidth: 460,
        padding: "10px 12px",
        borderRadius: 7,
        border: `1px solid ${tone}`,
        background: "#1B1A1A",
        color: "#F5F4F0",
        fontFamily: "monospace",
        fontSize: 10,
        lineHeight: 1.45,
        boxShadow: "0 4px 16px rgba(0,0,0,0.30)",
      }}
    >
      <div style={{ color: tone, fontWeight: 700, marginBottom: 6 }}>
        Bass identity diagnostics — {headline}
      </div>
      <div>project: {truncate(projectId || "—", 40)}</div>
      <div>version: {truncate(versionId || "—", 40)}</div>
      <div>published fp: {truncate(published?.fingerprint || "—", 52)}</div>
      <div>reopened fp: {truncate(reopened?.fingerprint || "—", 52)}</div>
      {diff?.ready && !diff.fingerprintsEqual && diff.firstDiff && (
        <>
          <div style={{ marginTop: 6, color: "#A8C7A0", fontWeight: 700 }}>FIRST DIFFERING FIELD</div>
          <div>path: {diff.firstDiff.path}</div>
          <div>type: {diff.firstDiff.differenceType}</div>
          <div>published: {truncate(diff.firstDiff.published)}</div>
          <div>reopened: {truncate(diff.firstDiff.reopened)}</div>
        </>
      )}
      {diff?.ready && Array.isArray(diff.fieldDigestDiffs) && diff.fieldDigestDiffs.length > 0 && (
        <>
          <div style={{ marginTop: 6, color: "#A8C7A0", fontWeight: 700 }}>TOP-LEVEL FIELD DIGEST DIFFS</div>
          {diff.fieldDigestDiffs.slice(0, 6).map((d, i) => (
            <div key={i}>
              {d.stage}.{d.field}
            </div>
          ))}
        </>
      )}
      <div style={{ marginTop: 6, color: "#737373" }}>
        window.__SP_BASS_IDENTITY_DIFF__(projectId, versionId) for full detail
      </div>
    </div>
  );
}