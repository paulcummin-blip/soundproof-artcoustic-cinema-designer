/**
 * P17SeatEvidencePanel.jsx
 * ------------------------
 * READ-ONLY P17 diagnostic panel, mounted in the Room Designer compliance panel.
 *
 * It shows, from evidence that already exists:
 *   - the current design's per-seat P17 evidence (raw variance, cause, limiting
 *     speaker, seat and RSP angles, model coverage limit)
 *   - the ADI explanation of which cause decided the level, and whether a height
 *     change is even an available fix
 *   - the saved Level 1 versus Level 4 diagnostic table
 *
 * It recomputes nothing, grades nothing and writes nothing.
 */

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useActiveProjectId } from "@/components/state/project-session";
import {
  buildP17SeatEvidenceRows,
  p17MetricsFromEngineeringSummary,
} from "@/components/utils/rp22/p17SeatEvidenceAuthority";
import { buildP17DiagnosticExplanation } from "@/components/adi/designGuidance/p17DiagnosticExplanation";
import P17SeatEvidenceTable from "./P17SeatEvidenceTable";
import P17VersionComparisonTable from "./P17VersionComparisonTable";
import useP17SavedVersionComparison from "@/components/hooks/useP17SavedVersionComparison";

const card = {
  border: "1px solid #DCDBD6",
  borderRadius: 8,
  background: "#FFFFFF",
  marginTop: 12,
};
const head = { padding: "10px 12px", borderBottom: "1px solid #DCDBD6" };
const title = { fontSize: 13, fontWeight: 700, color: "#1B1A1A" };
const sub = { fontSize: 10.5, color: "#625143", marginTop: 2 };

export default function P17SeatEvidencePanel({ engineeringSummary = null, seats = [] }) {
  const projectId = useActiveProjectId();
  const [showSeatTable, setShowSeatTable] = useState(false);
  const [showSavedComparison, setShowSavedComparison] = useState(false);

  const rows = useMemo(() => buildP17SeatEvidenceRows({
    seats,
    p17BySeatId: p17MetricsFromEngineeringSummary(engineeringSummary),
  }), [seats, engineeringSummary]);

  const explanation = useMemo(() => buildP17DiagnosticExplanation({ rows }), [rows]);
  // Saved-version evidence is read only when the designer opens that section.
  const { loading, versions } = useP17SavedVersionComparison({ projectId, enabled: showSavedComparison });

  const toggle = (open) => ({
    display: "flex", alignItems: "center", gap: 5, width: "100%", textAlign: "left",
    background: "#F7F6F2", border: "1px solid #DCDBD6", borderRadius: 6,
    padding: "6px 9px", fontSize: 11, fontWeight: 700, color: "#213428", cursor: "pointer",
    ...(open ? { marginBottom: 8 } : {}),
  });

  return (
    <div style={card}>
      <div style={head}>
        <div style={title}>ADI Data</div>
        <div style={sub}>
          P17 diagnostics, read only: each seat's Result, the Cause that decided it, the limiting
          speaker and its angles, the raw seat-versus-RSP variance and the model coverage window.
          Nothing is recalculated and no record is changed.
        </div>
      </div>

      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        {explanation ? (
          <div style={{ background: "#F7F6F2", borderLeft: "4px solid #213428", borderRadius: 6, padding: "9px 11px", display: "grid", gap: 4 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#1B1A1A" }}>{explanation.headline}</div>
            {explanation.lines.map((line) => (
              <div key={line} style={{ fontSize: 10.5, color: "#3E4349", lineHeight: 1.45 }}>{line}</div>
            ))}
            <div style={{ fontSize: 10.5, color: "#213428", fontWeight: 600, lineHeight: 1.45 }}>{explanation.actionLine}</div>
            <div style={{ fontSize: 9.5, color: "#9B8E82" }}>Calculated from stored evidence. No value recalculated and no record changed.</div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#9B8E82" }}>No P17 seat evidence for the current design.</div>
        )}

        <div>
          <button type="button" style={toggle(showSeatTable)} onClick={() => setShowSeatTable((open) => !open)}>
            {showSeatTable ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Current design — one limiting row per seat (expand for every speaker)
          </button>
          {showSeatTable && <P17SeatEvidenceTable rows={rows} />}
        </div>

        <div>
          <button type="button" style={toggle(showSavedComparison)} onClick={() => setShowSavedComparison((open) => !open)}>
            {showSavedComparison ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Saved versions — Level 1 vs Level 4 P17 diagnostic
          </button>
          {showSavedComparison && (
            loading
              ? <div style={{ fontSize: 10.5, color: "#9B8E82" }}>Reading saved versions…</div>
              : versions.length
                ? <P17VersionComparisonTable versions={versions} />
                : <div style={{ fontSize: 10.5, color: "#9B8E82" }}>No saved version evidence available for this project.</div>
          )}
        </div>
      </div>
    </div>
  );
}