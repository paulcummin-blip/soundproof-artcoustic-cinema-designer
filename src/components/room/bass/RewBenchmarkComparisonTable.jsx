import React, { useMemo } from "react";

// Fixed REW benchmark — do not modify without a new sweep.
const REW_BENCHMARK = [
  { hz: 20,  db: 92.4 },
  { hz: 25,  db: 93.6 },
  { hz: 30,  db: 89.2 },
  { hz: 40,  db: 86.0 },
  { hz: 50,  db: 91.8 },
  { hz: 57,  db: 104.1 },
  { hz: 60,  db: 98.1 },
  { hz: 70,  db: 86.8 },
  { hz: 80,  db: 79.7 },
  { hz: 85,  db: 90.8 },
  { hz: 100, db: 98.3 },
  { hz: 120, db: 92.1 },
  { hz: 150, db: 94.3 },
  { hz: 180, db: 99.3 },
  { hz: 200, db: 99.5 },
];

/**
 * Interpolates the B44 simulation response at a target frequency.
 * b44Data: array of { frequency, spl }
 */
function interpolateB44(b44Data, targetHz) {
  if (!Array.isArray(b44Data) || b44Data.length === 0) return null;
  // Find nearest neighbours
  let lo = null, hi = null;
  for (let i = 0; i < b44Data.length; i++) {
    const pt = b44Data[i];
    if (!Number.isFinite(pt.frequency) || !Number.isFinite(pt.spl)) continue;
    if (pt.frequency <= targetHz) lo = pt;
    if (pt.frequency >= targetHz && !hi) hi = pt;
  }
  if (!lo && !hi) return null;
  if (!lo) return hi.spl;
  if (!hi) return lo.spl;
  if (Math.abs(lo.frequency - hi.frequency) < 1e-6) return lo.spl;
  const t = (targetHz - lo.frequency) / (hi.frequency - lo.frequency);
  return lo.spl + t * (hi.spl - lo.spl);
}

/**
 * RewBenchmarkComparisonTable
 *
 * Props:
 *   b44Data  — array of { frequency, spl } for the active selected seat
 *   label    — optional string label for the B44 column header
 */
export default function RewBenchmarkComparisonTable({ b44Data, label = "B44 dB" }) {
  const rows = useMemo(() => {
    return REW_BENCHMARK.map(({ hz, db: rewDb }) => {
      const b44Db = interpolateB44(b44Data, hz);
      const error = b44Db !== null ? b44Db - rewDb : null;
      return { hz, rewDb, b44Db, error };
    });
  }, [b44Data]);

  const validErrors = rows.map(r => r.error).filter(e => e !== null && Number.isFinite(e));
  const mae = validErrors.length > 0
    ? validErrors.reduce((sum, e) => sum + Math.abs(e), 0) / validErrors.length
    : null;
  const worstError = validErrors.length > 0
    ? validErrors.reduce((worst, e) => Math.abs(e) > Math.abs(worst) ? e : worst, 0)
    : null;
  const worstHz = worstError !== null
    ? rows.find(r => r.error !== null && Math.abs(r.error - worstError) < 1e-6)?.hz
    : null;
  const bestError = validErrors.length > 0
    ? validErrors.reduce((best, e) => Math.abs(e) < Math.abs(best) ? e : best, validErrors[0])
    : null;
  const bestHz = bestError !== null
    ? rows.find(r => r.error !== null && Math.abs(r.error - bestError) < 1e-6)?.hz
    : null;

  const fmt1 = (v) => (v !== null && Number.isFinite(v)) ? v.toFixed(1) : "—";
  const errorColor = (e) => {
    if (e === null) return "#6b7280";
    const abs = Math.abs(e);
    if (abs <= 1.0) return "#15803d";
    if (abs <= 3.0) return "#a16207";
    if (abs <= 6.0) return "#c2410c";
    return "#b91c1c";
  };

  return (
    <div style={{ fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #bbf7d0", color: "#15803d", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <th style={{ textAlign: "right", padding: "2px 6px", minWidth: 36 }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 6px", minWidth: 58 }}>REW dB</th>
              <th style={{ textAlign: "right", padding: "2px 6px", minWidth: 58 }}>{label}</th>
              <th style={{ textAlign: "right", padding: "2px 6px", minWidth: 58 }}>Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ hz, rewDb, b44Db, error }) => (
              <tr key={hz} style={{ borderBottom: "1px solid #dcfce7" }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700, color: "#166534" }}>{hz}</td>
                <td style={{ textAlign: "right", padding: "1px 6px", color: "#1e3a5f" }}>{fmt1(rewDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px", color: "#1c1917" }}>{fmt1(b44Db)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: error !== null ? 700 : 400, color: errorColor(error) }}>
                  {error !== null ? (error >= 0 ? "+" : "") + fmt1(error) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary row */}
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "12px 20px", borderTop: "1px solid #bbf7d0", paddingTop: 6, color: "#166534", fontSize: 10 }}>
        <div>
          <span style={{ color: "#6b7280" }}>Mean absolute error: </span>
          <span style={{ fontWeight: 700, color: mae !== null && mae <= 3 ? "#15803d" : mae !== null && mae <= 6 ? "#c2410c" : "#b91c1c" }}>
            {mae !== null ? mae.toFixed(2) + " dB" : "—"}
          </span>
        </div>
        <div>
          <span style={{ color: "#6b7280" }}>Worst error: </span>
          <span style={{ fontWeight: 700, color: "#b91c1c" }}>
            {worstError !== null ? ((worstError >= 0 ? "+" : "") + fmt1(worstError) + " dB") : "—"}
            {worstHz !== null ? ` @ ${worstHz} Hz` : ""}
          </span>
        </div>
        <div>
          <span style={{ color: "#6b7280" }}>Best match: </span>
          <span style={{ fontWeight: 700, color: "#15803d" }}>
            {bestError !== null ? ((bestError >= 0 ? "+" : "") + fmt1(bestError) + " dB") : "—"}
            {bestHz !== null ? ` @ ${bestHz} Hz` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}