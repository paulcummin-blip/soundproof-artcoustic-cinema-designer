// components/rp22/RP22ComplianceParameterTile.jsx
// Exact tile extracted from RP22CompliancePanel — do not alter appearance.
import React, { useState } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";
import SeatScopeBadge from "@/components/report/SeatScopeBadge";
import { formatSeatLabel } from "@/components/utils/seatLabel";
import { ChevronDown, ChevronUp } from "lucide-react";

/* ---------- Shared style tokens (mirrored from RP22CompliancePanel) ---------- */
const card  = { border: "1px solid #DCDBD6", background: "#fff", borderRadius: 8 };
const head  = { padding: "12px 12px 0 12px" };
const title = { fontSize: 14, fontWeight: 700, color: "#1B1A1A" };
const sub   = { fontSize: 12, color: "#625143", marginTop: 4 };
const body  = { padding: "8px 12px 12px 12px" };
const row   = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };

const fmtIneq = (dir) => {
  if (dir === ">=") return "≥";
  if (dir === "<=") return "≤";
  if (dir === ">") return ">";
  if (dir === "<") return "<";
  if (dir === "=") return "=";
  return String(dir || "");
};

/**
 * Props:
 *   param          — { id, title, short, scope, unit, thresholds }
 *   achievedValue  — string to display as the achieved value
 *   lvl            — level string ("L1"…"L4", "FAIL", "—")
 *   seatPillGrid   — optional ReactNode for seat-scoped per-seat pill grids
 */
// Pill zone min-height: supports up to 3 seat rows (each ~28px pill + 6px gap) with breathing room
const PILL_ZONE_MIN_HEIGHT = 110;

export default function RP22ComplianceParameterTile({ param, achievedValue, lvl, seatPillGrid, seatGridData, targetBasisNote }) {
  const isSeatScope = String(param?.scope || "").toLowerCase() === "seat";
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: 380 }}>
      {/* ── Section A: Title / description / scope / achieved — fixed min-height so Section B always starts at same Y ── */}
      <div style={{ ...head, minHeight: 160 }}>
        <div style={title}>
          {[19, 20].includes(param.id) ? (
            <BassRp22ParameterTooltip parameterKey={`p${param.id}`}>
              <span className="cursor-help underline decoration-dotted underline-offset-2">P{param.id}</span>
            </BassRp22ParameterTooltip>
          ) : <>{param.id}. {param.title}</>}
        </div>
        <div style={{ ...sub, display: "flex", gap: 8, alignItems: "center" }}>
          <span>{param.short}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#3E4349" }}>
            SCOPE: <strong>{String(param.scope || "").toUpperCase()}</strong>
          </span>
        </div>
        {/* Achieved value line */}
        <div style={{ fontSize: 11, color: "#1B1A1A", marginTop: 6, fontWeight: 600 }}>
          {isSeatScope ? "Achieved (RSP): " : "Achieved: "}
          <span style={{ color: "#213428" }}>{achievedValue}</span>
        </div>
        {/* Target basis note (P12/P13 only) */}
        {targetBasisNote && (
          <div style={{ fontSize: 10, color: "#9B8E82", marginTop: 4, fontStyle: "italic" }}>
            {targetBasisNote}
          </div>
        )}
      </div>

      {/* ── Section 2: Pill zone (room) or SEAT badge (seat-scoped) ── */}
      <div style={{ padding: "8px 12px 0 12px", minHeight: isSeatScope ? 'auto' : PILL_ZONE_MIN_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: 12, color: "#625143" }}>
            {isSeatScope ? "Seat scope" : "Level"}
          </span>
          {isSeatScope ? (
            <SeatScopeBadge />
          ) : (
            <RP22GradingPill level={lvl} />
          )}
        </div>
        {isSeatScope && seatGridData && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-[#625143] hover:text-[#1B1A1A] print:hidden"
            style={{ marginTop: 8, alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} seat results
          </button>
        )}
      </div>

      {/* ── Section 2b: Expandable per-seat detail (seat-scoped only) ── */}
      {isSeatScope && expanded && seatGridData && (
        <div style={{ padding: "8px 12px 0 12px" }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E4DD]">
                <th className="text-left py-1 text-[#625143] font-medium">Seat</th>
                <th className="text-right py-1 text-[#625143] font-medium">Result</th>
                <th className="text-right py-1 text-[#625143] font-medium">Level</th>
              </tr>
            </thead>
            <tbody>
              {seatGridData.flatMap(rowObj =>
                rowObj.seats.map((seat) => (
                  <tr key={seat.id} className="border-b border-[#F0EFEA]">
                    <td className="py-1 text-[#1B1A1A]">
                      {formatSeatLabel(seat.id)}{seat.isPrimary ? " (RSP)" : ""}
                    </td>
                    <td className="py-1 text-right text-[#3E4349]">{seat.value || "—"}</td>
                    <td className="py-1 text-right">
                      <RP22GradingPill level={seat.level || "—"} compact />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Section 3: Threshold row — always pushed to bottom ── */}
      <div style={{ ...body, marginTop: "auto", paddingTop: 0 }}>
        <div style={{ paddingTop: 8, borderTop: "1px solid #F0EFEA" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              textAlign: "center",
              gap: 8,
            }}
          >
            {["L4", "L3", "L2", "L1"].map((k) => {
              const trg = param.thresholds[k];
              const isEq = param.thresholds.direction === "=";
              return (
                <div key={k} style={{ fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: "#3E4349" }}>{k}</div>
                  <div
                    style={{
                      color: "#625143",
                      fontFamily:
                        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                    }}
                  >
                    {trg == null
                      ? "–"
                      : isEq
                      ? String(trg)
                      : `${fmtIneq(param.thresholds.direction)} ${trg}${
                          param.unit === "°"
                            ? "°"
                            : param.unit === "Hz"
                            ? " Hz"
                            : param.unit === "± dB" || param.unit === "dB"
                            ? " dB"
                            : param.unit === "dB SPL (C)"
                            ? " dBC"
                            : param.unit === "m"
                            ? " m"
                            : ""
                        }`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}