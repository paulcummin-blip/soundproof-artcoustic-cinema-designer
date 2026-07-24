// components/rp22/RP22ComplianceParameterTile.jsx
// Exact tile extracted from RP22CompliancePanel — do not alter appearance.
import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import BassRp22ParameterTooltip from "@/components/room/bass/BassRp22ParameterTooltip";

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

export default function RP22ComplianceParameterTile({ param, achievedValue, lvl, seatPillGrid, targetBasisNote }) {
  const isSeatScope = String(param?.scope || "").toLowerCase() === "seat";

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

      {/* ── Section 2: Pill zone (fixed min-height, grows for more rows) ── */}
      <div style={{ padding: "8px 12px 0 12px", minHeight: PILL_ZONE_MIN_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: 12, color: "#625143" }}>
            {isSeatScope ? "Per-seat levels" : "Level"}
          </span>
          {isSeatScope ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {seatPillGrid ?? null}
            </div>
          ) : (
            <RP22GradingPill level={lvl} />
          )}
        </div>
      </div>

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