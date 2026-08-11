// ClientAcousticTreatment.jsx
// ---------------------------
// Client-facing Visual Report page: Acoustic Treatment.
//
// Simple RP22-backed wall-zone visual:
//   - LEFT/RIGHT side reflection zones (narrow wall-hugging bands)
//   - REAR treatment zone (narrow wall-hugging band)
// Zones are derived from actual speaker/seating geometry (image-source method).
// No individual Abfuser markers. No ceiling zone.
//
// Includes:
//   - WHY THESE AREAS?  (RP22 Section 9 guidance)
//   - WHY ABFUSER?      (product absorption summary)
//   - WHY [X] ABFUSERS? (quantity explained from actual zone geometry)

import React from "react";
import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  label: "#9B8E82",
  roomStroke: "#3E4349",
  seatFill: "#625143",
  rspFill: "#213428",
  zoneFill: "rgba(33, 52, 40, 0.22)",
  zoneStroke: "#213428",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function ClientAcousticTreatment({
  roomDims,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
}) {
  const data = selectClientAcousticTreatment({
    roomDims,
    seatingPositions,
    placedSpeakers,
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

  const qb = data.quantityBreakdown || {};
  const surfaceArea = qb.treatmentSurfaceArea ? qb.treatmentSurfaceArea.toFixed(1) : null;

  return (
    <div style={{ fontFamily: FONT_BODY, color: COLORS.body }}>
      {/* ── Heading ── */}
      <div style={{ marginBottom: "5mm" }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "18pt", fontWeight: 400, color: COLORS.primary, letterSpacing: "0.01em", lineHeight: 1.1 }}>
          ACOUSTIC TREATMENT
        </div>
      </div>

      {/* ── Room plan with wall-hugging treatment zones ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4mm", marginBottom: "4mm" }}>
        <svg viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {/* Room outline */}
          <rect x={toX(0)} y={toY(0)} width={widthM} height={lengthM} fill="#FAFAF8" stroke={COLORS.roomStroke} strokeWidth={0.03} />

          {/* Screen */}
          <rect x={toX(widthM * 0.2)} y={toY(0)} width={widthM * 0.6} height={0.04} fill={COLORS.primary} />
          <text x={toX(widthM / 2)} y={toY(0) - 0.1} textAnchor="middle" fontSize={0.13} fill={COLORS.label} fontFamily={FONT_BODY}>SCREEN</text>

          {/* ── Wall-hugging treatment zones ── */}
          {data.zones.map((zone) => (
            <rect
              key={zone.id}
              x={toX(zone.x)} y={toY(zone.y)}
              width={zone.width} height={zone.height}
              fill={COLORS.zoneFill} stroke={COLORS.zoneStroke} strokeWidth={0.02}
            />
          ))}

          {/* ── Seating ── */}
          {seatingPositions.map((seat, i) => {
            const sx = Number(seat?.x);
            const sy = Number(seat?.y);
            if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
            return (
              <circle key={seat?.id || i} cx={toX(sx)} cy={toY(sy)} r={0.1}
                fill={seat?.isPrimary ? COLORS.rspFill : COLORS.seatFill} opacity={0.5} />
            );
          })}

          {/* ── RSP ── */}
          {Number.isFinite(rsp?.x) && Number.isFinite(rsp?.y) && (
            <circle cx={toX(rsp.x)} cy={toY(rsp.y)} r={0.07} fill={COLORS.rspFill} stroke="#FFFFFF" strokeWidth={0.02} />
          )}

          {/* ── Zone labels ── */}
          {/* Side label: rotated along the left wall, just inside the room */}
          {data.zones.filter((z) => z.wall === "left").map((z) => {
            const midY = z.y + z.height / 2;
            return (
              <text
                key={`lbl-${z.id}`}
                x={toX(0.22)} y={toY(midY)}
                textAnchor="middle" fontSize={0.1}
                fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}
                transform={`rotate(-90 ${toX(0.22)} ${toY(midY)})`}
              >
                PRIMARY REFLECTION TREATMENT
              </text>
            );
          })}
          {/* Rear label: just inside the rear wall */}
          {data.zones.filter((z) => z.wall === "rear").map((z) => {
            const midX = z.x + z.width / 2;
            return (
              <text
                key={`lbl-${z.id}`}
                x={toX(midX)} y={toY(lengthM - 0.22)}
                textAnchor="middle" fontSize={0.1}
                fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}
              >
                REAR SOUND CONTROL
              </text>
            );
          })}

          {/* Dimensions */}
          <text x={toX(widthM / 2)} y={toY(lengthM) + 0.28} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY}>{widthM.toFixed(1)} m</text>
          <text x={toX(0) - 0.18} y={toY(lengthM / 2)} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY} transform={`rotate(-90 ${toX(0) - 0.18} ${toY(lengthM / 2)})`}>{lengthM.toFixed(1)} m</text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", marginTop: "3mm", fontSize: "8pt", color: COLORS.secondary }}>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 12, height: 6, background: COLORS.zoneFill, border: `1px solid ${COLORS.zoneStroke}`, borderRadius: 1 }} />
            Treatment zone (on wall)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.rspFill, opacity: 0.5 }} />
            Listening position
          </span>
        </div>
      </div>

      {/* ── WHY THESE AREAS? ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          WHY THESE AREAS?
        </div>
        <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          RP22 identifies the first lateral reflection areas from the front soundstage as useful treatment locations in high-channel-count cinema systems. It also recommends managed absorption, diffusion and scattering toward the rear of the room to preserve clarity while supporting an immersive soundfield.
        </p>
        <p style={{ margin: "2mm 0 0 0", fontSize: "9pt", lineHeight: 1.4, color: COLORS.secondary, fontFamily: FONT_BODY, fontStyle: "italic" }}>
          The goal is to control reflections — not eliminate them all.
        </p>
      </div>

      {/* ── WHY ABFUSER? ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          WHY ABFUSER?
        </div>
        <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          Artcoustic Abfuser combines absorption and diffusion. Its absorption coefficient reaches 0.85 at 500 Hz and approximately 0.95 from 1–4 kHz, making it well suited to controlling reflections that affect dialogue clarity and localisation.
        </p>
      </div>

      {/* ── WHY [X] ABFUSERS? ── */}
      {qb.recommendedQty > 0 && (
        <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
          <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
            WHY {qb.recommendedQty} ABFUSERS?
          </div>
          <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
            This room creates two primary side-wall reflection zones and a rear treatment area spanning the listening seats. {qb.recommendedQty} Abfusers provide practical coverage across these priority areas without over-treating the room.
          </p>
          <div style={{ marginTop: "3mm", fontSize: "8pt", color: COLORS.secondary, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
            Left zone: {qb.leftPanels} panels · Right zone: {qb.rightPanels} panels · Rear zone: {qb.rearPanels} panels
          </div>
          {surfaceArea && (
            <div style={{ marginTop: "1.5mm", fontSize: "8pt", color: COLORS.secondary, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
              Together, the recommended panels provide approximately {surfaceArea} m² of acoustic treatment surface.
            </div>
          )}
        </div>
      )}

      {/* ── Result card ── */}
      <div style={{ background: COLORS.primary, color: "#FFFFFF", borderRadius: 6, padding: "5mm 6mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          RECOMMENDED ACOUSTIC TREATMENT
        </div>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "16pt", fontWeight: 400, lineHeight: 1.2, marginBottom: "2mm" }}>
          {data.selectedQty} × Artcoustic Abfuser
        </div>
        <div style={{ fontSize: "9pt", opacity: 0.8, lineHeight: 1.4, fontFamily: FONT_BODY }}>
          Recommended for the highlighted wall zones identified from this room and seating layout.
        </div>
        {surfaceArea && (
          <div style={{ fontSize: "8pt", opacity: 0.6, lineHeight: 1.4, fontFamily: FONT_BODY, marginTop: "1.5mm" }}>
            Approximate treatment surface: {surfaceArea} m²
          </div>
        )}
      </div>
    </div>
  );
}