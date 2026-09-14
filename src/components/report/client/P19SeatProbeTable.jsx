/**
 * P19SeatProbeTable
 * ----------------
 * Compact parity table comparing the heat-map evaluator's P19 at each saved
 * seat coordinate against the published per-seat P19 from the completed bass
 * contract. Also includes the exact RSP probe row.
 *
 * The heat-map values are computed by the heat-map evaluator itself — never
 * copied from published seat grades. The delta column reveals any drift
 * between the heat-map path and the published authority.
 */
import React from "react";

const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

function gradeLabel(level) {
  if (level == null) return "—";
  const n = Number(level);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "FAIL";
  if (n >= 1 && n <= 4) return `L${n}`;
  return "—";
}

export default function P19SeatProbeTable({ seatProbes, rspProbe, bassPerformance, seatingPositions, print }) {
  if (!seatProbes || seatProbes.length === 0) return null;

  const publishedMap = new Map();
  (bassPerformance?.p19?.perSeatResults || []).forEach((s) => {
    if (s?.seatId != null) publishedMap.set(s.seatId, s);
  });

  const seatLabelMap = new Map();
  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((s, i) => {
    if (s?.id != null) seatLabelMap.set(s.id, s.label || `Seat ${i + 1}`);
  });

  const pubRspRaw = bassPerformance?.p19?.achievedVariationDb;
  const pubRspLevel = bassPerformance?.p19?.achievedLevel;

  const cellPad = "3px 6px";
  const headerBg = "#EDECEA";
  const headerColor = "#625143";
  const borderStyle = { borderTop: "1px solid #E6E4DD" };

  return (
    <div style={{ width: "100%", maxWidth: print ? "100%" : 600, fontFamily: BODY_FONT }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "#625143", marginBottom: 4,
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}>
        Seat P19 Parity — heat-map evaluator vs published
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: headerBg }}>
            <th style={{ padding: cellPad, textAlign: "left", color: headerColor, fontWeight: 600 }}>Seat</th>
            <th style={{ padding: cellPad, textAlign: "right", color: headerColor, fontWeight: 600 }}>Pub dB</th>
            <th style={{ padding: cellPad, textAlign: "right", color: headerColor, fontWeight: 600 }}>Map dB</th>
            <th style={{ padding: cellPad, textAlign: "right", color: headerColor, fontWeight: 600 }}>Δ</th>
            <th style={{ padding: cellPad, textAlign: "center", color: headerColor, fontWeight: 600 }}>Pub</th>
            <th style={{ padding: cellPad, textAlign: "center", color: headerColor, fontWeight: 600 }}>Map</th>
          </tr>
        </thead>
        <tbody>
          {seatProbes.map((probe) => {
            const pub = publishedMap.get(probe.seatId);
            const pubRaw = pub && Number.isFinite(Number(pub.variationDbRaw)) ? Number(pub.variationDbRaw) : null;
            const pubLevel = pub ? pub.level : null;
            const mapRaw = probe.p19Raw;
            const delta = (pubRaw != null && mapRaw != null) ? mapRaw - pubRaw : null;
            const label = seatLabelMap.get(probe.seatId) || probe.seatId;
            const deltaColor = Math.abs(delta || 0) > 0.05 ? "#B04040" : "#3E4349";
            return (
              <tr key={probe.seatId} style={borderStyle}>
                <td style={{ padding: cellPad, color: "#1B1A1A", fontWeight: 600 }}>{label}</td>
                <td style={{ padding: cellPad, textAlign: "right", color: "#3E4349" }}>{pubRaw != null ? pubRaw.toFixed(2) : "—"}</td>
                <td style={{ padding: cellPad, textAlign: "right", color: "#3E4349" }}>{mapRaw != null ? mapRaw.toFixed(2) : "—"}</td>
                <td style={{ padding: cellPad, textAlign: "right", color: deltaColor }}>{delta != null ? delta.toFixed(3) : "—"}</td>
                <td style={{ padding: cellPad, textAlign: "center", color: "#3E4349" }}>{gradeLabel(pubLevel)}</td>
                <td style={{ padding: cellPad, textAlign: "center", color: "#3E4349" }}>{probe.p19Grade || "—"}</td>
              </tr>
            );
          })}
          {rspProbe && rspProbe.p19Raw != null && (() => {
            const rspDelta = (pubRspRaw != null && rspProbe.p19Raw != null) ? rspProbe.p19Raw - Number(pubRspRaw) : null;
            const rspDeltaColor = Math.abs(rspDelta || 0) > 0.05 ? "#B04040" : "#213428";
            return (
              <tr style={{ borderTop: "2px solid #625143", background: "#F8F8F7" }}>
                <td style={{ padding: cellPad, color: "#213428", fontWeight: 700 }}>RSP</td>
                <td style={{ padding: cellPad, textAlign: "right", color: "#213428", fontWeight: 600 }}>
                  {pubRspRaw != null ? Number(pubRspRaw).toFixed(2) : "—"}
                </td>
                <td style={{ padding: cellPad, textAlign: "right", color: "#213428", fontWeight: 600 }}>
                  {rspProbe.p19Raw.toFixed(2)}
                </td>
                <td style={{ padding: cellPad, textAlign: "right", color: rspDeltaColor, fontWeight: 600 }}>
                  {rspDelta != null ? rspDelta.toFixed(3) : "—"}
                </td>
                <td style={{ padding: cellPad, textAlign: "center", fontWeight: 600, color: "#213428" }}>
                  {gradeLabel(pubRspLevel)}
                </td>
                <td style={{ padding: cellPad, textAlign: "center", fontWeight: 600, color: "#213428" }}>
                  {rspProbe.p19Grade || "—"}
                </td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}