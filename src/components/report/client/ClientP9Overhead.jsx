/**
 * ClientP9Overhead
 * ----------------
 * Screen page for the P9 Overhead Speaker Spacing Visual Report page
 * (RP22 Parameter 9 — Overhead speaker spacing).
 *
 * The drawing is a TRUE SIDE SECTION built from the saved design geometry: the
 * RSP at its real room position and ear height, each overhead row at its real
 * ceiling position, and the P9 adjacent-row angles drawn at the RSP itself.
 * No speaker is moved to make an angle readable — the rows shown are the
 * installed TFL/TFR, TML/TMR and TRL/TRR rows (see P9SideSectionDrawing).
 *
 * P9 is a SEAT-scope parameter. Below the drawing, every active seat is shown
 * with its own canonical published P9 level and worst vertical gap in degrees,
 * sourced from the published seat results via selectClientP9Overhead. The
 * drawing explains the RSP geometry; it never replaces the per-seat authority
 * and never presents itself as the overall P9 grade.
 *
 * Layout:
 *   - Side section SVG (real geometry, angles measured from the RSP)
 *   - Seat result grid (P9 level + degrees per seat)
 *   - Summary card with actual distribution wording (no single RSP badge)
 *
 * P9 thresholds: L4 <= 50°, L3 <= 60°, L2 <= 80°, >80° = L1 (open-ended — no upper L1 threshold).
 */

import React, { useMemo } from "react";
import { getSeatGradeColors } from "./visualReportSeatStyle";
import P9SideSectionDrawing from "./P9SideSectionDrawing";
import { buildP9SideSection } from "./p9SideSectionGeometry";

// Y-tolerance for grouping seats into the same physical row (meters)
const ROW_TOLERANCE_M = 0.05;

/**
 * Group seats into physical rows (front-to-back by y), each sorted left-to-right
 * by x with 1-based seat numbers.
 */
function buildSeatRows(seats) {
  if (!seats || seats.length === 0) return [];
  const sortedByY = [...seats].sort((a, b) => a.y - b.y);
  const clusters = [];
  for (const seat of sortedByY) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(seat.y - last.y) <= ROW_TOLERANCE_M) {
      last.seats.push(seat);
    } else {
      clusters.push({ y: seat.y, seats: [seat] });
    }
  }
  return clusters.map((cluster, idx) => {
    const sortedByX = cluster.seats.sort((a, b) => a.x - b.x);
    return {
      rowIndex: idx + 1,
      seats: sortedByX.map((s, i) => ({ ...s, seatNumber: i + 1 })),
    };
  });
}

function P9SeatBadge({ level, degrees }) {
  if (!level) {
    return <span style={{ color: "#C1B6AD", fontSize: 11 }}>—</span>;
  }
  const grade = getSeatGradeColors(level);
  const degText = degrees != null ? ` ${Math.round(degrees)}°` : "";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: grade.fill,
        color: grade.text,
        border: `1px solid ${grade.border}`,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {level}{degText}
    </span>
  );
}

export default function ClientP9Overhead({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  counts,
  summary,
  placedSpeakers,
  p9Snapshot,
}) {
  // The side section is built only from the published P9 snapshot's own
  // geometry — the real RSP and the real overhead row positions.
  const sideSection = useMemo(
    () => buildP9SideSection({ p9Snapshot, roomDims }),
    [p9Snapshot, roomDims],
  );

  if (!seats || seats.length === 0) {
    return (
      <div style={{
        background: "#FFFFFF",
        borderRadius: 16,
        padding: 48,
        textAlign: "center",
        color: "#625143",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
        border: "1px solid #DCDBD6",
      }}>
        Preparing overhead resolution view…
      </div>
    );
  }

  // Physical row grouping for the seat result grid
  const matrixRows = buildSeatRows(seats);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
      padding: 32,
      background: "#FFFFFF",
      borderRadius: 16,
      border: "1px solid #DCDBD6",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.06)",
      fontFamily: "Didact Gothic, Century Gothic, sans-serif",
    }}>
      {/* ── Heading hierarchy: Category → Parameter reference ── */}
      <div style={{ width: "100%", marginBottom: 16 }}>
        <h1 style={{
          margin: 0,
          fontSize: 34,
          fontWeight: 300,
          color: "#213428",
          letterSpacing: "0.01em",
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          textAlign: "center",
        }}>
          Spatial Resolution
        </h1>
        <p style={{
          margin: "6px 0 0 0",
          fontSize: 12,
          color: "#625143",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          textAlign: "center",
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}>
          RP22 Parameter 9 — Overhead speaker spacing
        </p>
      </div>

      {/* ── Side elevation: the real room section, with the P9 adjacent-row
             angles measured from the RSP itself ── */}
      {sideSection ? (
        <P9SideSectionDrawing
          geometry={sideSection}
          levelLabel={p9Snapshot?.level ?? null}
          style={{ width: "100%", maxWidth: 760, height: "auto" }}
        />
      ) : (
        <div style={{
          width: "100%",
          maxWidth: 760,
          padding: "24px 20px",
          textAlign: "center",
          fontSize: 12,
          color: "#625143",
          background: "#F8F8F7",
          borderRadius: 12,
          border: "1px solid #DCDBD6",
        }}>
          Side elevation unavailable — overhead row geometry is not present in this report.
        </div>
      )}

      {/* ── Seat result grid ── */}
      {matrixRows.length > 0 && (
        <div
          style={{
            width: "100%",
            maxWidth: 600,
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}
        >
          {matrixRows.map((row) => (
            <div
              key={row.rowIndex}
              style={{ marginBottom: matrixRows.length > 1 ? 14 : 0 }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#213428",
                  marginBottom: 6,
                  letterSpacing: "0.02em",
                }}
              >
                Row {row.rowIndex}
              </div>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                  tableLayout: "fixed",
                }}
              >
                <thead>
                  <tr>
                    <th style={{ padding: "4px 6px", textAlign: "left", width: 140 }}></th>
                    {row.seats.map((seat) => (
                      <th
                        key={seat.id}
                        style={{
                          padding: "4px 6px",
                          textAlign: "center",
                          color: "#213428",
                          fontWeight: 400,
                          borderBottom: "1px solid #DCDBD6",
                          fontSize: 11,
                          letterSpacing: "0.02em",
                        }}
                      >
                        Seat {seat.seatNumber}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td
                      style={{
                        padding: "4px 6px",
                        color: "#625143",
                        fontWeight: 400,
                        fontSize: 11,
                        letterSpacing: "0.02em",
                      }}
                    >
                      P9 Overhead
                    </td>
                    {row.seats.map((seat) => (
                      <td
                        key={seat.id}
                        style={{
                          padding: "4px 6px",
                          textAlign: "center",
                          borderBottom: "1px solid #DCDBD6",
                        }}
                      >
                        <P9SeatBadge level={seat.p9Level} degrees={seat.p9Degrees} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary card (no single RSP badge) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 20px",
          background: "#F1F0EE",
          borderRadius: 12,
          border: "1px solid #DCDBD6",
          width: "100%",
          maxWidth: 600,
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#213428", marginBottom: 4 }}>
            Overhead Speaker Spacing
          </div>
          <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5 }}>
            {summary}
          </div>
        </div>
      </div>
    </div>
  );
}