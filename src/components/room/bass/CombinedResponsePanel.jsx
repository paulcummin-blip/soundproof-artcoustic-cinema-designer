import React from "react";

const num = (value) => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);
const one = (value) => {
  const n = num(value);
  return n === null ? "—" : n.toFixed(1);
};
const delta = (value) => {
  const n = num(value);
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)} dB`;
};

function Row({ label, combined, subOnly, deltaText, muted = false }) {
  return (
    <tr>
      <td style={{ padding: "5px 8px 5px 0", color: "#3E4349", fontWeight: muted ? 400 : 500 }}>{label}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#213428", fontWeight: 600 }}>{combined}</td>
      <td style={{ padding: "5px 0 5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#737373" }}>{subOnly}</td>
      <td style={{ padding: "5px 0 5px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#737373" }}>{deltaText}</td>
    </tr>
  );
}

/**
 * Provisional combined LCR + subwoofer result, shown beside the existing
 * subwoofer-only diagnostic. Nothing here is published.
 */
export default function CombinedResponsePanel({ provisional, combined, hasResult }) {
  const band = provisional?.band?.valid ? `P19/P20 band ${Math.round(provisional.band.lowerHz)}–${Math.round(provisional.band.upperHz)} Hz` : null;

  return (
    <div style={{ border: "1px solid #DCDBD6", borderRadius: 12, background: "#FFFFFF", padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1B1A1A", fontFamily: "Didact Gothic, sans-serif" }}>
          Combined LCR + subwoofer
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "#625143" }}>provisional</span>
        </div>
        {band && <div style={{ fontSize: 11.5, color: "#625143" }}>{band}</div>}
      </div>

      {!hasResult ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#625143" }}>
          Calculate Bass Response to build the combined response.
        </div>
      ) : !provisional?.available ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#625143" }}>
          {combined?.available
            ? `Assessment not available: ${String(provisional?.reason || "unknown").replace(/[-_]/g, " ")}.`
            : `Combined response not available: ${String(combined?.reason || provisional?.reason || "unknown").replace(/[-_]/g, " ")}.`}
        </div>
      ) : (
        <>
          <table style={{ marginTop: 10, width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th />
                <th style={{ padding: "0 8px 4px", textAlign: "right", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#625143" }}>Combined</th>
                <th style={{ padding: "0 0 4px 8px", textAlign: "right", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#625143" }}>Sub only</th>
                <th style={{ padding: "0 0 4px 10px", textAlign: "right", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#625143" }}>Change</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="P19 level"
                combined={provisional.combined?.p19?.level ?? "—"}
                subOnly={provisional.subOnly?.p19?.level ?? "—"}
                deltaText={provisional.comparison?.p19LevelDelta === null ? "—" : delta(provisional.comparison?.p19LevelDelta)}
              />
              <Row
                label="P19 deviation"
                combined={`${one(provisional.combined?.p19?.variationDb)} dB`}
                subOnly={`${one(provisional.subOnly?.p19?.variationDb)} dB`}
                deltaText={delta(provisional.comparison?.p19DeviationDeltaDb)}
                muted
              />
              <Row
                label="P20 level"
                combined={provisional.combined?.p20?.level ?? "—"}
                subOnly={provisional.subOnly?.p20?.level ?? "—"}
                deltaText={provisional.comparison?.p20LevelDelta === null ? "—" : delta(provisional.comparison?.p20LevelDelta)}
              />
              <Row
                label="P20 deviation"
                combined={`±${one(provisional.combined?.p20?.variationDb)} dB`}
                subOnly={`±${one(provisional.subOnly?.p20?.variationDb)} dB`}
                deltaText={delta(provisional.comparison?.p20DeviationDeltaDb)}
                muted
              />
            </tbody>
          </table>

          <div style={{ marginTop: 10, fontSize: 11.5, color: "#625143", lineHeight: 1.5 }}>
            <div>
              <span style={{ fontWeight: 500 }}>Limiting seat: </span>
              {provisional.combined?.p20?.limitingSeatId || "—"}
              <span style={{ margin: "0 8px", color: "#DCDBD6" }}>|</span>
              <span style={{ fontWeight: 500 }}>Limiting frequency: </span>
              {provisional.combined?.p20?.limitingFrequencyHz != null
                ? `${Math.round(provisional.combined.p20.limitingFrequencyHz)} Hz`
                : "—"}
            </div>
            <div>
              {provisional.seatCount} seat{provisional.seatCount === 1 ? "" : "s"} assessed against the reference seat. Provisional only — the published P19/P20 stay with the subwoofer-only authority.
            </div>
          </div>
        </>
      )}
    </div>
  );
}