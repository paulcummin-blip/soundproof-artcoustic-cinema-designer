/**
 * ClientScreenSeating
 * -------------------
 * Client-facing RP23 Screen Size / Seating Position visual report page.
 *
 * Shows banded longitudinal viewing zones (L1|L2|L3|L4|L3|L2|L1) derived
 * from the SAME RP23 angle thresholds used by the live app.
 * Per-seat levels come from selectClientScreenSeating which uses
 * rp23LevelForAngleDeg — the exact same grading authority.
 *
 * Uses the SAME room template as P1/P12/P13 pages (same SVG dimensions,
 * padding, coordinate mapping, seat markers, RSP marker).
 *
 * Works for both screen (card) and print (plain) contexts via the `print` prop.
 */

import React, { useMemo } from "react";
import { LEVEL_FILLS } from "./levelFills";

// Below L1 is intentionally absent from the RP23 legend — outside the valid
// L1 viewing envelope is left visually empty (room background), not coloured.
const LEGEND_ITEMS = [
  { label: "L1", fill: LEVEL_FILLS["l1"] },
  { label: "L2", fill: LEVEL_FILLS["l2"] },
  { label: "L3", fill: LEVEL_FILLS["l3"] },
  { label: "L4", fill: LEVEL_FILLS["l4"] },
];

const LABEL_COLORS = {
  "l1": "#F8F8F7",
  "l2": "#3E4349",
  "l3": "#3E4349",
  "l4": "#3E4349",
};

export default function ClientScreenSeating({
  roomDims,
  seats,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  zones,
  explanation,
  projectorLumens,
  print,
  printPart,
}) {
  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;

  const { svgW, svgH, toPx } = useMemo(() => {
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
    return { svgW: SVG_W, svgH: SVG_H, toPx };
  }, [W, L]);

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
            levelLabel: s.levelLabel,
            formatted: s.formatted,
            isStrongest: s.isStrongest === true,
          };
        })
        .filter(Boolean),
    [seats]
  );

  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspMatchesSeat =
    rspValid && plotSeats.some((s) => Math.abs(s.x - rspX) < 0.01 && Math.abs(s.y - rspY) < 0.01);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  if (!rspValid || plotSeats.length === 0) return null;

  const showDrawing = !print || printPart !== "support";
  const showSupport = !print || printPart !== "drawing";

  const containerStyle = !print
    ? {
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
      }
    : printPart === "drawing"
    ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }
    : printPart === "support"
    ? { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: "Didact Gothic, Century Gothic, sans-serif" }
    : { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0", width: "100%" };

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 8 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 34,
              fontWeight: 300,
              color: "#213428",
              letterSpacing: "0.01em",
              fontFamily: "Futura PT Light, Century Gothic, sans-serif",
              textAlign: "center",
            }}
          >
            Viewing Experience
          </h1>
          <p
            style={{
              margin: "6px 0 0 0",
              fontSize: 12,
              color: "#625143",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textAlign: "center",
              fontFamily: "Didact Gothic, Century Gothic, sans-serif",
            }}
          >
            RP23 — Screen Size &amp; Seating Position
          </p>
        </div>
      )}

      {/* ── Descriptive page title (screen only) ── */}
      {!print && (
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#213428",
            marginBottom: 4,
            fontFamily: "Futura PT Light, Century Gothic, sans-serif",
          }}
        >
          Screen Size and Seating
        </div>
      )}

      {showDrawing && (
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="client-report-print-svg"
          style={
            print && printPart === "drawing"
              ? { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }
              : print
              ? { width: "100%", height: "auto", maxHeight: "none" }
              : { width: "100%", maxWidth: 600, height: "auto" }
          }
        >
        {/* Room background (area behind screen + any uncovered region) */}
        <rect
          x={roomTopLeft.px}
          y={roomTopLeft.py}
          width={roomBottomRight.px - roomTopLeft.px}
          height={roomBottomRight.py - roomTopLeft.py}
          fill="#F8F8F7"
          stroke="none"
        />

        {/* ── Banded RP23 viewing zones (longitudinal, opaque) ── */}
        {/* Below L1 zones are intentionally skipped — outside the valid L1
            viewing envelope the room background shows through as empty space. */}
        {(Array.isArray(zones) ? zones : []).map((zone) => {
          if (zone.level === "below-l1") return null;
          const yStart = Math.max(0, zone.yStart);
          const yEnd = Math.min(L, zone.yEnd);
          if (yEnd <= yStart) return null;
          const tl = toPx(0, yStart);
          const br = toPx(W, yEnd);
          const heightPx = br.py - tl.py;
          return (
            <g key={zone.key}>
              <rect
                x={tl.px}
                y={tl.py}
                width={br.px - tl.px}
                height={heightPx}
                fill={LEVEL_FILLS[zone.level]}
                stroke="none"
              />
              {heightPx > 18 && (
                <text
                  x={(tl.px + br.px) / 2}
                  y={(tl.py + br.py) / 2}
                  fill={LABEL_COLORS[zone.level] || "#3E4349"}
                  fontSize={print ? 9 : 11}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="Didact Gothic, Century Gothic, sans-serif"
                  letterSpacing="0.1em"
                  fontWeight={600}
                >
                  {zone.label}
                </text>
              )}
            </g>
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
        {plotSeats.map((seat) => {
          const sp = toPx(seat.x, seat.y);
          const isRspSeat =
            rspMatchesSeat && Math.abs(seat.x - rspX) < 0.01 && Math.abs(seat.y - rspY) < 0.01;
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
      )}

      {showSupport && (<>
      {/* ── Compact horizontal legend ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: print ? 10 : 14,
          margin: 0,
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}
      >
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: 3,
                background: item.fill,
                border: "1px solid #DCDBD6",
              }}
            />
            <span style={{ fontSize: print ? 9 : 11, color: "#625143", letterSpacing: "0.04em" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Projector light output note (between drawing and seat matrix) ── */}
      {projectorLumens != null && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            padding: print ? "8px 20px" : "10px 24px",
            background: "#F8F8F7",
            borderRadius: 8,
            border: "1px solid #DCDBD6",
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: print ? 8.5 : 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#625143",
              fontWeight: 600,
            }}
          >
            Projector Light Output
          </div>
          <div
            style={{
              fontSize: print ? 11.5 : 14,
              color: "#3E4349",
              fontWeight: 500,
              textAlign: "center",
            }}
          >
            Minimum calibrated output for 108 nits:{" "}
            {projectorLumens.toLocaleString("en-GB")} lumens
          </div>
          <div style={{ fontSize: print ? 8.5 : 10, color: "#625143" }}>
            0.9 screen gain
          </div>
        </div>
      )}

      {/* ── Compact seat matrix ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          width: "100%",
          fontFamily: "Didact Gothic, Century Gothic, sans-serif",
        }}
      >
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: print ? 10 : 12,
            color: "#3E4349",
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "4px 10px",
                  textAlign: "left",
                  fontWeight: 600,
                  color: "#625143",
                  borderBottom: "1px solid #DCDBD6",
                }}
              />
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
              <td style={{ padding: "4px 10px", textAlign: "left", fontWeight: 600, color: "#625143" }}>
                RP23 Viewing
              </td>
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
                  {seat.levelLabel ?? "—"}
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
      </>)}

      {/* ── Client explanation (screen only — print uses the result region) ── */}
      {!print && (
        <p
          style={{
            fontSize: 13,
            color: "#625143",
            textAlign: "center",
            maxWidth: 520,
            lineHeight: 1.5,
            margin: 0,
            fontFamily: "Didact Gothic, Century Gothic, sans-serif",
          }}
        >
          {explanation}
        </p>
      )}
    </div>
  );
}