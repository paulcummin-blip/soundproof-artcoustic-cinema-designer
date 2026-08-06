/**
 * ClientRecommendedSeatingPosition
 * --------------------------------
 * Client-facing P1 Visual Report page.
 *
 * Shows how listener distance from the room walls affects RP22 Parameter 1:
 *   - nested shaded zones measured inward from the four room walls
 *     (Below L1 / L1 / L2 / L3 / L4 — progressively calmer toward the centre)
 *   - all real seats plotted at their room coordinates
 *   - strongest seats (highest canonical P1 level) visually emphasised
 *   - compact result matrix, horizontal legend, and client explanation
 *
 * Seat P1 distance/level come ONLY from the canonical authority:
 *   analysisResult.perSeatRp22[seatId].rp22[1]
 * The shaded zones are purely visual and never recalculate P1.
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React, { useMemo } from "react";

// ── Wall-distance zones (metres inward from each room wall) ──
// Thresholds match the canonical P1 grading authority.
const ZONES = [
  { key: "below-l1", inset: 0.0, fill: "rgba(74, 35, 15, 0.22)", label: "Below L1" },
  { key: "l1",      inset: 0.5, fill: "rgba(98, 81, 67, 0.16)",  label: "L1" },
  { key: "l2",      inset: 0.8, fill: "rgba(98, 81, 67, 0.09)",  label: "L2" },
  { key: "l3",      inset: 1.2, fill: "rgba(33, 52, 40, 0.06)",  label: "L3" },
  { key: "l4",      inset: 1.5, fill: "rgba(33, 52, 40, 0.02)",  label: "L4" },
];

const LEGEND_ITEMS = ZONES.map((z) => ({ label: z.label, fill: z.fill }));

const CLIENT_EXPLANATION =
  "The two centre seats sit within the preferred listening area, giving them the greatest separation from the room boundaries. The outer seats remain good listening positions, while their closer proximity to the side walls slightly reduces their spatial performance.";

export default function ClientRecommendedSeatingPosition({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  screen,
  print,
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const { svgW, svgH, scale, toPx } = useMemo(() => {
    const PADDING_M = 0.6;
    const totalW = W + PADDING_M * 2;
    const totalL = L + PADDING_M * 2;
    const SVG_W = 760;
    const SVG_H = Math.round(SVG_W * (totalL / totalW));
    const SCALE = SVG_W / totalW;
    const toPx = (x, y) => ({
      px: (x + PADDING_M) * SCALE,
      py: (y + PADDING_M) * SCALE,
    });
    return { svgW: SVG_W, svgH: SVG_H, scale: SCALE, toPx };
  }, [W, L]);

  // Normalise enriched seats (distance/level already resolved by selector)
  const plotSeats = useMemo(
    () =>
      (Array.isArray(seats) ? seats : [])
        .map((s) => {
          const x = Number(s.x);
          const y = Number(s.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return {
            id: s.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`,
            x,
            y,
            distanceM: s.distanceM,
            formatted: s.formatted,
            level: s.level,
            isStrongest: s.isStrongest === true,
          };
        })
        .filter(Boolean),
    [seats]
  );

  // RSP marker (preserved)
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspMatchesSeat = rspValid && plotSeats.some((s) => Math.abs(s.x - rspX) < 0.01 && Math.abs(s.y - rspY) < 0.01);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  // Screen (front wall)
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  if (!rspValid || plotSeats.length === 0) return null;

  const containerStyle = print
    ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0", width: "100%" }
    : {
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
      };

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy: Category → Parameter reference (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 8 }}>
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
            RP22 Parameter 1 — Listener Distance from Room Boundaries
          </p>
        </div>
      )}

      {/* ── Descriptive page title (screen only) ── */}
      {!print && (
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: "#213428",
          marginBottom: 4,
          fontFamily: "Futura PT Light, Century Gothic, sans-serif",
        }}>
          Recommended Seating Position
        </div>
      )}

      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="client-report-print-svg"
        style={print
          ? { width: "100%", height: "auto", maxHeight: "none" }
          : { width: "100%", maxWidth: 600, height: "auto" }
        }
      >
        {/* ── Nested shaded zones (drawn outermost-first, inner on top) ── */}
        {ZONES.map((zone) => {
          const inset = zone.inset;
          const w = W - inset * 2;
          const h = L - inset * 2;
          if (w <= 0 || h <= 0) return null;
          const tl = toPx(inset, inset);
          const br = toPx(inset + w, inset + h);
          return (
            <rect
              key={zone.key}
              x={tl.px}
              y={tl.py}
              width={br.px - tl.px}
              height={br.py - tl.py}
              fill={zone.fill}
              stroke="none"
            />
          );
        })}

        {/* Room outline */}
        <rect
          x={roomTopLeft.px}
          y={roomTopLeft.py}
          width={roomBottomRight.px - roomTopLeft.px}
          height={roomBottomRight.py - roomTopLeft.py}
          fill="none"
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

        {/* ── Seats ── */}
        {plotSeats.map((seat, idx) => {
          const sp = toPx(seat.x, seat.y);
          const isRspSeat = rspMatchesSeat && Math.abs(seat.x - rspX) < 0.01 && Math.abs(seat.y - rspY) < 0.01;
          if (seat.isStrongest) {
            return (
              <g key={seat.id}>
                <circle cx={sp.px} cy={sp.py} r={13} fill="none" stroke="#213428" strokeWidth={2.5} opacity={0.9} />
                <circle
                  cx={sp.px}
                  cy={sp.py}
                  r={isRspSeat ? 10 : 9}
                  fill="#213428"
                  stroke="#F8F8F7"
                  strokeWidth={1.5}
                />
              </g>
            );
          }
          return (
            <circle
              key={seat.id}
              cx={sp.px}
              cy={sp.py}
              r={isRspSeat ? 9 : 7}
              fill="#625143"
              stroke="#F8F8F7"
              strokeWidth={1.5}
            />
          );
        })}

        {/* RSP marker — separate if not on a seat */}
        {rspPx && !rspMatchesSeat && (
          <g>
            <circle cx={rspPx.px} cy={rspPx.py} r={12} fill="none" stroke="#213428" strokeWidth={3} />
            <circle cx={rspPx.px} cy={rspPx.py} r={5} fill="#213428" />
          </g>
        )}

        {/* RSP label */}
        {rspPx && (
          <text
            x={rspPx.px}
            y={rspPx.py + 28}
            fill="#213428"
            fontSize={12}
            textAnchor="middle"
            fontWeight={600}
            fontFamily="Didact Gothic, Century Gothic, sans-serif"
            letterSpacing="0.08em"
          >
            RSP
          </text>
        )}
      </svg>

      {/* ── Compact horizontal legend ── */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: print ? 10 : 14,
        margin: 0,
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              display: "inline-block",
              width: 14,
              height: 14,
              borderRadius: 3,
              background: item.fill,
              border: "1px solid #DCDBD6",
            }} />
            <span style={{ fontSize: print ? 9 : 11, color: "#625143", letterSpacing: "0.04em" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Compact result matrix ── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        width: "100%",
        fontFamily: "Didact Gothic, Century Gothic, sans-serif",
      }}>
        <table style={{
          borderCollapse: "collapse",
          fontSize: print ? 10 : 12,
          color: "#3E4349",
        }}>
          <thead>
            <tr>
              <th style={{ padding: "4px 10px", textAlign: "left", fontWeight: 600, color: "#625143", borderBottom: "1px solid #DCDBD6" }} />
              {plotSeats.map((seat, i) => (
                <th
                  key={seat.id}
                  style={{
                    padding: "4px 12px",
                    textAlign: "center",
                    fontWeight: seat.isStrongest ? 700 : 500,
                    color: seat.isStrongest ? "#213428" : "#625143",
                    borderBottom: "1px solid #DCDBD6",
                  }}
                >
                  Seat {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "4px 10px", textAlign: "left", fontWeight: 600, color: "#625143" }}>P1 Distance</td>
              {plotSeats.map((seat) => (
                <td
                  key={seat.id}
                  style={{
                    padding: "4px 12px",
                    textAlign: "center",
                    fontWeight: seat.isStrongest ? 700 : 500,
                    color: seat.isStrongest ? "#213428" : "#3E4349",
                  }}
                >
                  {seat.level ?? "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ padding: "2px 10px 4px" }} />
              {plotSeats.map((seat) => (
                <td
                  key={seat.id}
                  style={{
                    padding: "2px 12px 4px",
                    textAlign: "center",
                    fontSize: print ? 8.5 : 10,
                    color: "#625143",
                  }}
                >
                  {seat.formatted ?? "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Client explanation (screen only — print uses the result region) ── */}
      {!print && (
        <p style={{
          fontSize: 13,
          color: "#625143",
          textAlign: "center",
          maxWidth: 520,
          lineHeight: 1.5,
          margin: 0,
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}>
          {CLIENT_EXPLANATION}
        </p>
      )}
    </div>
  );
}