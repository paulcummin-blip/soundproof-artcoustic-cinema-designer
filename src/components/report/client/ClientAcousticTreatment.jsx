// ClientAcousticTreatment.jsx
// ---------------------------
// Client-facing Visual Report page: Acoustic Treatment.
//
// Shows the actual room plan with simple highlighted treatment zones and
// selected Abfuser panels drawn as scaled 700×1100mm rectangles.
//
// This is a VISUAL REPORT feature only — no complex acoustic simulation,
// no ray tracing, no RT60, no absorption coefficients.

import React from "react";
import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  borderStrong: "#D9D5CE",
  label: "#9B8E82",
  panelFill: "#213428",
  panelStroke: "#213428",
  roomStroke: "#3E4349",
  seatFill: "#625143",
  rspFill: "#213428",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function ClientAcousticTreatment({
  roomDims,
  seatingPositions = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
}) {
  const data = selectClientAcousticTreatment({
    roomDims,
    seatingPositions,
    rsp,
    acousticTreatmentEnabled,
    selectedAbfuserQty,
  });

  if (!data.hasAny) return null;

  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;

  // SVG viewBox with padding
  const padding = 0.4;
  const viewBoxW = widthM + padding * 2;
  const viewBoxH = lengthM + padding * 2;

  // Scale: 1 metre = 1 SVG unit
  const toX = (m) => m + padding;
  const toY = (m) => m + padding;

  return (
    <div style={{ fontFamily: FONT_BODY, color: COLORS.body }}>
      {/* ── Heading ── */}
      <div style={{ marginBottom: "6mm" }}>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: "18pt",
            fontWeight: 400,
            color: COLORS.primary,
            letterSpacing: "0.01em",
            lineHeight: 1.1,
          }}
        >
          ACOUSTIC TREATMENT
        </div>
      </div>

      {/* ── Room plan with treatment zones + panels ── */}
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "4mm",
          marginBottom: "5mm",
        }}
      >
        <svg
          viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {/* Room outline */}
          <rect
            x={toX(0)}
            y={toY(0)}
            width={widthM}
            height={lengthM}
            fill="#FAFAF8"
            stroke={COLORS.roomStroke}
            strokeWidth={0.03}
          />

          {/* Screen indicator (top wall) */}
          <rect
            x={toX(widthM * 0.2)}
            y={toY(0)}
            width={widthM * 0.6}
            height={0.04}
            fill={COLORS.primary}
          />
          <text
            x={toX(widthM / 2)}
            y={toY(0) - 0.08}
            textAnchor="middle"
            fontSize={0.12}
            fill={COLORS.label}
            fontFamily={FONT_BODY}
          >
            SCREEN
          </text>

          {/* Treatment zones */}
          {data.zones.map((zone) => (
            <rect
              key={zone.id}
              x={toX(zone.x)}
              y={toY(zone.y)}
              width={zone.width}
              height={zone.height}
              fill={zone.fill}
              stroke={zone.stroke}
              strokeWidth={0.02}
              strokeDasharray={zone.dashed ? "0.08 0.06" : undefined}
              rx={0.02}
            />
          ))}

          {/* Abfuser panels */}
          {data.panels.map((panel) => (
            <rect
              key={panel.id}
              x={toX(panel.x)}
              y={toY(panel.y)}
              width={panel.width}
              height={panel.height}
              fill={panel.isCeiling ? "rgba(33, 52, 40, 0.25)" : COLORS.panelFill}
              stroke={COLORS.panelStroke}
              strokeWidth={0.015}
              rx={0.02}
              opacity={panel.isCeiling ? 0.7 : 1}
            />
          ))}

          {/* Seating positions */}
          {seatingPositions.map((seat, i) => {
            const sx = Number(seat?.x);
            const sy = Number(seat?.y);
            if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
            return (
              <circle
                key={seat?.id || i}
                cx={toX(sx)}
                cy={toY(sy)}
                r={0.12}
                fill={seat?.isPrimary ? COLORS.rspFill : COLORS.seatFill}
                opacity={0.6}
              />
            );
          })}

          {/* RSP marker */}
          {rsp && Number.isFinite(rsp.x) && Number.isFinite(rsp.y) && (
            <circle
              cx={toX(rsp.x)}
              cy={toY(rsp.y)}
              r={0.08}
              fill={COLORS.rspFill}
              stroke="#FFFFFF"
              strokeWidth={0.02}
            />
          )}

          {/* Dimension labels */}
          <text
            x={toX(widthM / 2)}
            y={toY(lengthM) + 0.25}
            textAnchor="middle"
            fontSize={0.11}
            fill={COLORS.label}
            fontFamily={FONT_BODY}
          >
            {widthM.toFixed(1)} m
          </text>
          <text
            x={toX(0) - 0.15}
            y={toY(lengthM / 2)}
            textAnchor="middle"
            fontSize={0.11}
            fill={COLORS.label}
            fontFamily={FONT_BODY}
            transform={`rotate(-90 ${toX(0) - 0.15} ${toY(lengthM / 2)})`}
          >
            {lengthM.toFixed(1)} m
          </text>
        </svg>

        {/* Zone legend */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4mm",
            marginTop: "3mm",
            fontSize: "8pt",
            color: COLORS.secondary,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "rgba(33, 52, 40, 0.12)", border: "1px solid #213428", borderRadius: 2 }} />
            Side reflection
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: "rgba(33, 52, 40, 0.10)", border: "1px solid #213428", borderRadius: 2 }} />
            Rear wall
          </span>
          {data.ceilingQty > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: "rgba(33, 52, 40, 0.06)", border: "1px dashed #213428", borderRadius: 2 }} />
              Ceiling
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: COLORS.panelFill, borderRadius: 2 }} />
            Abfuser panel (700×1100mm)
          </span>
        </div>
      </div>

      {/* ── Explanation ── */}
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "5mm 6mm",
          marginBottom: "5mm",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "10pt",
            lineHeight: 1.5,
            color: COLORS.body,
            fontFamily: FONT_BODY,
          }}
        >
          The highlighted areas show where reflected sound has the greatest influence on the
          listening area. Artcoustic Abfusers placed within these zones help control unwanted
          reflections, improving dialogue clarity, imaging and overall definition without
          over-damping the room.
        </p>
      </div>

      {/* ── Result card ── */}
      <div
        style={{
          background: COLORS.primary,
          color: "#FFFFFF",
          borderRadius: 6,
          padding: "5mm 6mm",
        }}
      >
        <div
          style={{
            fontSize: "8pt",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            opacity: 0.7,
            marginBottom: "2mm",
            fontFamily: FONT_BODY,
          }}
        >
          RECOMMENDED ACOUSTIC TREATMENT
        </div>
        <div
          style={{
            fontFamily: FONT_HEADING,
            fontSize: "16pt",
            fontWeight: 400,
            lineHeight: 1.2,
            marginBottom: "2mm",
          }}
        >
          {data.selectedQty} × Artcoustic Abfuser
        </div>
        <div
          style={{
            fontSize: "9pt",
            opacity: 0.8,
            lineHeight: 1.4,
            fontFamily: FONT_BODY,
          }}
        >
          Positioned to control the strongest early reflections around the listening area.
        </div>
      </div>
    </div>
  );
}