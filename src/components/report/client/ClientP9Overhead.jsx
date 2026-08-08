/**
 * ClientP9Overhead
 * ----------------
 * Per-seat SVG plan component for the P9 Overhead Speaker Spacing Visual
 * Report page (RP22 Parameter 9 — Overhead speaker spacing).
 *
 * P9 is a SEAT-scope parameter. This component shows every active seat with
 * its own canonical P9 level and worst vertical gap in degrees, sourced from
 * analysisResult.perSeatRp22 via selectClientP9Overhead. It does NOT present
 * a single RSP-level result as the overall P9 grade.
 *
 * Layout:
 *   - Plan view SVG (top-down) with room outline, screen, seats coloured by
 *     P9 level, primary/secondary distinction, RSP marker
 *   - Level key (only levels present)
 *   - Seat result grid (P9 level + degrees per seat)
 *   - Summary card with actual distribution wording (no single RSP badge)
 *
 * P9 thresholds: L4 <= 50°, L3 <= 60°, L2 <= 80°, >80° = FAIL (L1 is N/A).
 */

import React from "react";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";

// ── Level visual styles (plan-view halos + dot fills) ──
const LEVEL_STYLES = {
  L4: {
    fill: "rgba(33, 52, 40, 0.32)",
    stroke: "#213428",
    strokeWidth: 2.5,
    dasharray: "none",
    dotFill: "#213428",
    dotStroke: "#F8F8F7",
  },
  L3: {
    fill: "rgba(62, 67, 73, 0.18)",
    stroke: "#3E4349",
    strokeWidth: 2,
    dasharray: "none",
    dotFill: "#3E4349",
    dotStroke: "#F8F8F7",
  },
  L2: {
    fill: "rgba(98, 81, 67, 0.18)",
    stroke: "#625143",
    strokeWidth: 2,
    dasharray: "none",
    dotFill: "#625143",
    dotStroke: "#F8F8F7",
  },
  FAIL: {
    fill: "rgba(74, 35, 15, 0.18)",
    stroke: "#4A230F",
    strokeWidth: 2,
    dasharray: "none",
    dotFill: "#4A230F",
    dotStroke: "#F8F8F7",
  },
  not_assessed: {
    fill: "rgba(193, 182, 173, 0.08)",
    stroke: "#C1B6AD",
    strokeWidth: 1.5,
    dasharray: "4 3",
    dotFill: "#C1B6AD",
    dotStroke: "#F8F8F7",
  },
};

const LEVEL_ORDER = ["L4", "L3", "L2", "FAIL", "not_assessed"];
const LEVEL_LABELS = {
  L4: "Level 4",
  L3: "Level 3",
  L2: "Level 2",
  FAIL: "Below target",
  not_assessed: "Not assessed",
};

// Seat zone radius in meters (broad translucent halo)
const ZONE_RADIUS_M = 0.55;
const RSP_RING_R = 8;
const RSP_DOT_R = 3;

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
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.not_assessed;
  const degText = degrees != null ? ` ${Math.round(degrees)}°` : "";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: "#F1F0EE",
        color: style.dotFill,
        border: `1px solid ${style.stroke}`,
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
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const PADDING_M = 0.6;
  const totalW = W + PADDING_M * 2;
  const totalL = L + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalL / totalW));
  const SCALE = SVG_W / totalW;
  const ZONE_R_PX = ZONE_RADIUS_M * SCALE;

  const toPx = (x, y) => ({
    px: (x + PADDING_M) * SCALE,
    py: (y + PADDING_M) * SCALE,
  });

  // Screen geometry
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // RSP validity
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

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

  // Categories present in the project (for key)
  const activeLevels = LEVEL_ORDER.filter((key) => (counts?.[key] || 0) > 0);

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

      {/* ── Plan view SVG ── */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: "100%", maxWidth: 760, height: "auto" }}
      >
        {/* Room outline */}
        <rect
          x={roomTopLeft.px}
          y={roomTopLeft.py}
          width={roomBottomRight.px - roomTopLeft.px}
          height={roomBottomRight.py - roomTopLeft.py}
          fill="#F8F8F7"
          stroke="#625143"
          strokeWidth={2}
        />

        {/* Screen */}
        <line
          x1={screenLeftPx.px}
          y1={screenLeftPx.py}
          x2={screenRightPx.px}
          y2={screenRightPx.py}
          stroke="#3E4349"
          strokeWidth={5}
        />
        <text
          x={(screenLeftPx.px + screenRightPx.px) / 2}
          y={screenLeftPx.py - 10}
          fill="#625143"
          fontSize={11}
          textAnchor="middle"
          fontFamily="Didact Gothic, Century Gothic, sans-serif"
          letterSpacing="0.06em"
        >
          SCREEN
        </text>

        {/* Seat zones — broad translucent halos with level colours */}
        {seats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const levelKey = seat.p9Level || "not_assessed";
          const style = LEVEL_STYLES[levelKey] || LEVEL_STYLES.not_assessed;
          const isPrimary = seat.isPrimary;
          return (
            <g key={seat.id}>
              {/* Translucent zone */}
              <circle
                cx={sp.px}
                cy={sp.py}
                r={ZONE_R_PX}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dasharray}
              />
              {/* Seat dot — primary: larger solid, secondary: smaller ring */}
              {isPrimary ? (
                <circle
                  cx={sp.px}
                  cy={sp.py}
                  r={7}
                  fill={style.dotFill}
                  stroke={style.dotStroke}
                  strokeWidth={1.5}
                />
              ) : (
                <circle
                  cx={sp.px}
                  cy={sp.py}
                  r={5}
                  fill="#F8F8F7"
                  stroke={style.dotFill}
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {/* RSP marker — reference only, no classification */}
        {rspPx && (() => {
          const seatCircles = seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            return { cx: sp.px, cy: sp.py, r: ZONE_R_PX };
          });
          const screenCx = (screenLeftPx.px + screenRightPx.px) / 2;
          const screenRect = {
            x1: Math.min(screenLeftPx.px, screenCx - 25),
            y1: screenLeftPx.py - 22,
            x2: Math.max(screenRightPx.px, screenCx + 25),
            y2: screenLeftPx.py + 3,
          };
          const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], screenRect, { w: SVG_W, h: SVG_H });
          return (
            <g>
              <circle cx={rspPx.px} cy={rspPx.py} r={RSP_RING_R} fill="none" stroke="#213428" strokeWidth={2.5} />
              <circle cx={rspPx.px} cy={rspPx.py} r={RSP_DOT_R} fill="#213428" />
              <text
                x={placement.x}
                y={placement.y}
                fill="#213428"
                fontSize={12}
                textAnchor={placement.anchor}
                dominantBaseline="middle"
                fontWeight={600}
                fontFamily="Didact Gothic, Century Gothic, sans-serif"
                letterSpacing="0.08em"
              >
                RSP
              </text>
            </g>
          );
        })()}
      </svg>

      {/* ── Level key (only levels that exist) ── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 16,
        padding: "12px 16px",
        background: "#F1F0EE",
        borderRadius: 8,
        border: "1px solid #DCDBD6",
        width: "100%",
        maxWidth: 600,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {activeLevels.map((key) => {
          const style = LEVEL_STYLES[key];
          const label = LEVEL_LABELS[key];
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width={20} height={20} viewBox="0 0 20 20">
                <circle
                  cx={10}
                  cy={10}
                  r={8}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.dasharray}
                />
              </svg>
              <span style={{ fontSize: 12, color: "#3E4349", letterSpacing: "0.02em" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

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