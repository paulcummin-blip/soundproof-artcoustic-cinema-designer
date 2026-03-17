// components/rp22/RP22ComplianceParameterTile.jsx
// Exact tile extracted from RP22CompliancePanel — do not alter appearance.
import React from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

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
export default function RP22ComplianceParameterTile({ param, achievedValue, lvl, seatPillGrid }) {
  const isSeatScope = String(param?.scope || "").toLowerCase() === "seat";

  return (
    <div style={card}>
      <div style={head}>
        <div style={title}>
          {param.id}. {param.title}
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
      </div>

      <div style={body}>
        <div style={{ ...row, marginTop: 0 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#625143" }}>
              {isSeatScope ? "Per-seat levels" : "Level"}
            </span>
          </div>
          {isSeatScope ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {seatPillGrid ?? null}
            </div>
          ) : (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 28,
              flexShrink: 0,
              overflow: "hidden",
            }}>
              <RP22GradingPill level={lvl} style={{ width: "100%", height: "100%", minWidth: "unset", padding: "0 8px", fontSize: 13, lineHeight: 1 }} />
            </div>
          )}
        </div>

        {/* Thresholds grid */}
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F0EFEA" }}>
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