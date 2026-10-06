/**
 * ReportGateDiagnosticsPanel
 * --------------------------
 * The report gate's own account of why a report did or did not open, so support
 * can see exactly which authority is missing instead of guessing.
 *
 * It is a DIAGNOSTIC surface and never reaches a dealer or a client: it renders
 * nothing at all unless the viewer is a master admin or has Engineering Mode on
 * (the development preview flag), and even then it is collapsed behind "Show
 * diagnostics" — the block message stays the headline.
 *
 * Presentation only: it renders the diagnostics object it is given.
 */

import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { isMasterAdmin } from "@/lib/accountAccess";
import { useEngineeringMode } from "@/components/state/useEngineeringMode";
import { buildReportGateDiagnosticRows } from "./reportGateDiagnostics";
import BassReconciliationDiagnosticRows from "@/components/report/BassReconciliationDiagnosticRows";

const PANEL = {
  marginTop: 20,
  borderTop: "1px solid #DCDBD6",
  paddingTop: 12,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 11,
  color: "#3E4349",
};

const SUMMARY = {
  cursor: "pointer",
  fontFamily: "'Didact Gothic', 'Century Gothic', sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8A8580",
  listStyle: "none",
};

const ROW = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, auto) 1fr",
  gap: 10,
  padding: "2px 0",
  wordBreak: "break-word",
};

const LABEL = { color: "#8A8580" };

export default function ReportGateDiagnosticsPanel({ diagnostics = null }) {
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();

  // Admin or development preview only: a dealer never sees this panel.
  const allowed = isMasterAdmin(user) || engineeringMode === true;
  const rows = buildReportGateDiagnosticRows(diagnostics);
  if (!allowed || !rows.length) return null;

  return (
    <details style={PANEL} data-report-gate-diagnostics="true">
      <summary style={SUMMARY}>Show diagnostics</summary>
      <div style={{ marginTop: 10 }}>
        <BassReconciliationDiagnosticRows projectId={diagnostics.project_id} versionId={diagnostics.version_id} gateResult={diagnostics.gate_result} />
        {rows.map(([label, value]) => (
          <div key={label} style={ROW}>
            <span style={LABEL}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </details>
  );
}