/**
 * ReportGateDiagnosticsPanel
 * --------------------------
 * The report gate's own account of why a report did or did not open, shown with
 * the blocked state so a designer (or support) can see exactly which authority
 * is missing instead of guessing. Collapsed by default — the block message stays
 * the headline.
 *
 * Presentation only: it renders the diagnostics object it is given.
 */

import React from "react";
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
  const rows = buildReportGateDiagnosticRows(diagnostics);
  if (!rows.length) return null;

  return (
    <details style={PANEL}>
      <summary style={SUMMARY}>Report gate diagnostics</summary>
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