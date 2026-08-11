// ClientAcousticTreatment.jsx
// ---------------------------
// Client-facing Visual Report page: Acoustic Treatment.
//
// Redesigned as a simple causal diagram:
//   DIRECT SOUND → EARLY REFLECTION → ABFUSER CONTROLS REFLECTION → CLEARER SOUND
//
// Shows a small number of explanatory acoustic paths (NOT a simulation):
//   - 2 direct sound paths (Left → RSP, Right → RSP) — solid
//   - 2 side-wall early reflection paths — dashed
//   - 1 rear-wall returning reflection (when rear treatment selected) — dashed
// Abfuser panels are drawn at the reflection areas so the client can see WHY
// each panel is located there.
//
// Ceiling treatment is shown in a small side-elevation inset (not floating in
// the plan view).
//
// No RT60, no coefficients, no ray density, no delay times, no equations.

import React from "react";
import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";

const COLORS = {
  bg: "#F1F0EE",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  label: "#9B8E82",
  panelFill: "#213428",
  panelStroke: "#213428",
  roomStroke: "#3E4349",
  seatFill: "#625143",
  rspFill: "#213428",
  directPath: "#213428",
  reflPath: "#625143",
  speakerFill: "#213428",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

/**
 * Side-wall reflection point via the image-source method:
 * mirror the speaker across the wall, then find where the
 * mirror→listener line crosses the wall plane.
 */
function sideReflectionPoint(speaker, listener, wallX, isLeftWall) {
  const mirrorX = isLeftWall ? -speaker.x : 2 * wallX - speaker.x;
  const t = (wallX - mirrorX) / (listener.x - mirrorX);
  return { x: wallX, y: speaker.y + t * (listener.y - speaker.y) };
}

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

  const padding = 0.5;
  const viewBoxW = widthM + padding * 2;
  const viewBoxH = lengthM + padding * 2;
  const toX = (m) => m + padding;
  const toY = (m) => m + padding;

  // Representative front soundstage positions (near screen wall)
  const leftSpeaker = { x: widthM * 0.22, y: 0.35 };
  const rightSpeaker = { x: widthM * 0.78, y: 0.35 };
  const listener = {
    x: Number.isFinite(rsp?.x) ? rsp.x : widthM / 2,
    y: Number.isFinite(rsp?.y) ? rsp.y : lengthM * 0.6,
  };

  // Side-wall reflection points
  const leftRefl = sideReflectionPoint(leftSpeaker, listener, 0, true);
  const rightRefl = sideReflectionPoint(rightSpeaker, listener, widthM, false);

  // Rear-wall returning reflection (front center → rear wall → listener)
  const hasRear = data.rearQty > 0;
  const rearPoint = { x: widthM / 2, y: lengthM };
  const frontCenter = { x: widthM / 2, y: 0.35 };

  // Panels for main plan (ceiling shown in inset, not floating in plan)
  const mainPanels = data.panels.filter((p) => p.zone !== "ceiling");
  const ceilingZone = data.zones.find((z) => z.id === "ceiling");
  const hasCeiling = data.ceilingQty > 0 && ceilingZone;

  // Label positions
  const directLabelX = toX(widthM / 2);
  const directLabelY = toY((leftSpeaker.y + listener.y) / 2) - 0.06;
  const reflLabelX = toX(0.15);
  const reflLabelY = toY(leftRefl.y) - 0.04;
  const abfuserLabelX = toX(0.15);
  const abfuserLabelY = toY(leftRefl.y) + 0.22;

  return (
    <div style={{ fontFamily: FONT_BODY, color: COLORS.body }}>
      {/* ── Heading ── */}
      <div style={{ marginBottom: "5mm" }}>
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

      {/* ── Room plan with causal diagram ── */}
      <div
        style={{
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "4mm",
          marginBottom: "4mm",
        }}
      >
        <svg
          viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {/* Room outline */}
          <rect
            x={toX(0)} y={toY(0)}
            width={widthM} height={lengthM}
            fill="#FAFAF8" stroke={COLORS.roomStroke} strokeWidth={0.03}
          />

          {/* Screen indicator (top wall) */}
          <rect
            x={toX(widthM * 0.2)} y={toY(0)}
            width={widthM * 0.6} height={0.04}
            fill={COLORS.primary}
          />
          <text
            x={toX(widthM / 2)} y={toY(0) - 0.1}
            textAnchor="middle" fontSize={0.13}
            fill={COLORS.label} fontFamily={FONT_BODY}
          >
            SCREEN
          </text>

          {/* ── DIRECT SOUND paths (solid) ── */}
          <line
            x1={toX(leftSpeaker.x)} y1={toY(leftSpeaker.y)}
            x2={toX(listener.x)} y2={toY(listener.y)}
            stroke={COLORS.directPath} strokeWidth={0.025}
          />
          <line
            x1={toX(rightSpeaker.x)} y1={toY(rightSpeaker.y)}
            x2={toX(listener.x)} y2={toY(listener.y)}
            stroke={COLORS.directPath} strokeWidth={0.025}
          />

          {/* ── EARLY REFLECTION paths (dashed) ── */}
          <polyline
            points={`${toX(leftSpeaker.x)},${toY(leftSpeaker.y)} ${toX(leftRefl.x)},${toY(leftRefl.y)} ${toX(listener.x)},${toY(listener.y)}`}
            fill="none" stroke={COLORS.reflPath}
            strokeWidth={0.02} strokeDasharray="0.1 0.07"
          />
          <polyline
            points={`${toX(rightSpeaker.x)},${toY(rightSpeaker.y)} ${toX(rightRefl.x)},${toY(rightRefl.y)} ${toX(listener.x)},${toY(listener.y)}`}
            fill="none" stroke={COLORS.reflPath}
            strokeWidth={0.02} strokeDasharray="0.1 0.07"
          />

          {/* ── REAR REFLECTION path (dashed, if rear treatment) ── */}
          {hasRear && (
            <polyline
              points={`${toX(frontCenter.x)},${toY(frontCenter.y)} ${toX(rearPoint.x)},${toY(rearPoint.y)} ${toX(listener.x)},${toY(listener.y)}`}
              fill="none" stroke={COLORS.reflPath}
              strokeWidth={0.02} strokeDasharray="0.1 0.07" opacity={0.7}
            />
          )}

          {/* ── Abfuser panels (side + rear only) ── */}
          {mainPanels.map((panel) => (
            <rect
              key={panel.id}
              x={toX(panel.x)} y={toY(panel.y)}
              width={panel.width} height={panel.height}
              fill={COLORS.panelFill} stroke={COLORS.panelStroke}
              strokeWidth={0.015} rx={0.02}
            />
          ))}

          {/* ── Front speakers ── */}
          <circle cx={toX(leftSpeaker.x)} cy={toY(leftSpeaker.y)} r={0.09} fill={COLORS.speakerFill} />
          <circle cx={toX(rightSpeaker.x)} cy={toY(rightSpeaker.y)} r={0.09} fill={COLORS.speakerFill} />
          <text x={toX(leftSpeaker.x)} y={toY(leftSpeaker.y) + 0.24} textAnchor="middle" fontSize={0.1} fill={COLORS.label} fontFamily={FONT_BODY}>L</text>
          <text x={toX(rightSpeaker.x)} y={toY(rightSpeaker.y) + 0.24} textAnchor="middle" fontSize={0.1} fill={COLORS.label} fontFamily={FONT_BODY}>R</text>

          {/* ── Seating positions ── */}
          {seatingPositions.map((seat, i) => {
            const sx = Number(seat?.x);
            const sy = Number(seat?.y);
            if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
            return (
              <circle
                key={seat?.id || i}
                cx={toX(sx)} cy={toY(sy)} r={0.1}
                fill={seat?.isPrimary ? COLORS.rspFill : COLORS.seatFill}
                opacity={0.5}
              />
            );
          })}

          {/* ── RSP marker ── */}
          {Number.isFinite(rsp?.x) && Number.isFinite(rsp?.y) && (
            <circle
              cx={toX(rsp.x)} cy={toY(rsp.y)} r={0.07}
              fill={COLORS.rspFill} stroke="#FFFFFF" strokeWidth={0.02}
            />
          )}

          {/* ── Labels ── */}
          <text x={directLabelX} y={directLabelY} textAnchor="middle" fontSize={0.11} fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}>
            DIRECT SOUND
          </text>
          <text x={reflLabelX} y={reflLabelY} textAnchor="start" fontSize={0.1} fill={COLORS.secondary} fontFamily={FONT_BODY} fontWeight={600}>
            EARLY REFLECTION
          </text>
          <text x={abfuserLabelX} y={abfuserLabelY} textAnchor="start" fontSize={0.09} fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}>
            <tspan x={abfuserLabelX} dy={0}>ABFUSER CONTROLS</tspan>
            <tspan x={abfuserLabelX} dy={0.14}>THIS REFLECTION</tspan>
          </text>
          {hasRear && (
            <text x={toX(widthM / 2)} y={toY(lengthM) - 0.12} textAnchor="middle" fontSize={0.1} fill={COLORS.secondary} fontFamily={FONT_BODY} fontWeight={600}>
              REAR REFLECTION CONTROL
            </text>
          )}

          {/* Dimension labels */}
          <text x={toX(widthM / 2)} y={toY(lengthM) + 0.28} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY}>
            {widthM.toFixed(1)} m
          </text>
          <text x={toX(0) - 0.18} y={toY(lengthM / 2)} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY} transform={`rotate(-90 ${toX(0) - 0.18} ${toY(lengthM / 2)})`}>
            {lengthM.toFixed(1)} m
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", marginTop: "3mm", fontSize: "8pt", color: COLORS.secondary }}>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 16, height: 2, background: COLORS.directPath }} />
            Direct sound
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 16, borderTop: `2px dashed ${COLORS.reflPath}` }} />
            Early reflection
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: COLORS.panelFill, borderRadius: 2 }} />
            Abfuser panel (700×1100mm)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.speakerFill }} />
            Speaker
          </span>
        </div>
      </div>

      {/* ── Ceiling inset (only when ceiling treatment allocated) ── */}
      {hasCeiling && (
        <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4mm", marginBottom: "4mm" }}>
          <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
            CEILING TREATMENT
          </div>
          <div style={{ display: "flex", gap: "4mm", alignItems: "center" }}>
            <svg viewBox="0 0 8 3" style={{ width: 140, height: "auto", flexShrink: 0 }}>
              {/* floor */}
              <line x1={0.5} y1={2.5} x2={7.5} y2={2.5} stroke={COLORS.roomStroke} strokeWidth={0.04} />
              {/* ceiling */}
              <line x1={0.5} y1={0.5} x2={7.5} y2={0.5} stroke={COLORS.roomStroke} strokeWidth={0.04} />
              {/* screen */}
              <rect x={0.5} y={0.5} width={0.1} height={2.0} fill={COLORS.primary} />
              {/* ceiling treatment area (dashed) */}
              <rect x={3.0} y={0.5} width={2.5} height={0.3} fill="rgba(33,52,40,0.15)" stroke={COLORS.primary} strokeWidth={0.02} strokeDasharray="0.1 0.08" />
              {/* vertical reflection (dashed) */}
              <line x1={4.25} y1={0.8} x2={4.25} y2={2.3} stroke={COLORS.reflPath} strokeWidth={0.02} strokeDasharray="0.1 0.07" />
              {/* listener position */}
              <circle cx={4.25} cy={2.5} r={0.12} fill={COLORS.rspFill} />
            </svg>
            <div style={{ fontSize: "9pt", color: COLORS.body, lineHeight: 1.4, fontFamily: FONT_BODY }}>
              Helps control vertical reflections above the listening area.
            </div>
          </div>
        </div>
      )}

      {/* ── Explanation ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          Sound reaches the listening position directly from the speakers, but it also reflects from nearby walls and arrives slightly later. These early reflections can reduce dialogue clarity and blur the precise location of sounds.
        </p>
        <p style={{ margin: "3mm 0 0 0", fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          Abfusers are positioned at the strongest reflection areas to control this unwanted energy while maintaining a natural, spacious sound.
        </p>
      </div>

      {/* ── Result card ── */}
      <div style={{ background: COLORS.primary, color: "#FFFFFF", borderRadius: 6, padding: "5mm 6mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          RECOMMENDED ACOUSTIC TREATMENT
        </div>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "16pt", fontWeight: 400, lineHeight: 1.2, marginBottom: "2mm" }}>
          {data.selectedQty} × Artcoustic Abfuser
        </div>
        <div style={{ fontSize: "9pt", opacity: 0.8, lineHeight: 1.4, fontFamily: FONT_BODY }}>
          Positioned at the principal side and rear reflection areas to improve clarity and imaging.
        </div>
      </div>
    </div>
  );
}