// ClientAcousticTreatment.jsx
// ---------------------------
// Client-facing Visual Report page: Acoustic Treatment.
//
// Restored positions page. Shows:
//   - plan view of the room
//   - Abfuser markers on the recommended treatment zones
//     (left / right first reflection, rear wall, optional ceiling)
//   - quantity by zone, total recommended quantity, total treatment area (m²)
//   - the designer-selected (included) quantity, shown separately
//
// QUANTITY AUTHORITY:
//   Recommended quantity = ADI strategic reflection control.
//   Selected quantity = the designer's decision, and the only quantity that is
//   priced. The two are never conflated: the recommendation is never presented
//   as a designer selection.

import React from "react";
import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";
import { resolveReportQuantity } from "@/components/report/reportPricedQuantities";

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
  zoneFill: "rgba(33, 52, 40, 0.10)",
  zoneStroke: "#213428",
  markerFill: "#213428",
  advisoryFill: "rgba(98, 81, 67, 0.16)",
  advisoryStroke: "#625143",
};

import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

export default function ClientAcousticTreatment({
  roomDims,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
  legacyAutoQuantity = 0,
  pricedAbfuserQty = null,
  priceSummary = null,
  projectId = null,
}) {
  const data = selectClientAcousticTreatment({
    roomDims,
    seatingPositions,
    placedSpeakers,
    rsp,
    acousticTreatmentEnabled,
    selectedAbfuserQty,
    legacyAutoQuantity,
  });

  if (!data.hasAny) return null;

  const { roomPlan, recommendation, quantityBreakdown: qb, inclusion } = data;
  const widthM = roomPlan?.widthM || 4.5;
  const lengthM = roomPlan?.lengthM || 6.0;

  const padding = 0.5;
  const viewBoxW = widthM + padding * 2;
  const viewBoxH = lengthM + padding * 2;
  const toX = (m) => m + padding;
  const toY = (m) => m + padding;

  const recommendedQty = data.recommendedQty;
  const selectedQty = data.selectedQty;

  // QUANTITY CONSISTENCY: the report shows the same quantity the priced
  // schedule uses — the canonical selection, never the ADI recommendation.
  // When no quantity is priced, the report states that plainly instead of
  // showing a contradictory product number.
  const pricedQuantity = resolveReportQuantity({
    label: "Abfuser",
    selectedQuantity: pricedAbfuserQty ?? selectedQty,
    priceSummary,
    projectId,
  });
  const pricedQty = pricedQuantity.quantity;
  const displayQty = pricedQty != null ? pricedQty : recommendedQty;
  const surfaceArea = Number(qb?.treatmentSurfaceArea || 0).toFixed(2);
  const countedZones = data.zones.filter((z) => !z.advisory);
  const advisoryZones = data.zones.filter((z) => z.advisory);

  const inclusionColor = inclusion.state === "ABOVE_RECOMMENDATION" ? "#8A5A2B" : COLORS.primary;

  return (
    <div style={{ fontFamily: FONT_BODY, color: COLORS.body }}>
      {/* ── Heading ── */}
      <div style={{ marginBottom: "5mm" }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "18pt", fontWeight: 400, color: COLORS.primary, letterSpacing: "0.01em", lineHeight: 1.1 }}>
          ACOUSTIC TREATMENT
        </div>
      </div>

      {/* ── Room plan with recommended Abfuser positions ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4mm", marginBottom: "4mm" }}>
        <svg viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {/* Room outline */}
          <rect x={toX(0)} y={toY(0)} width={widthM} height={lengthM} fill="#FAFAF8" stroke={COLORS.roomStroke} strokeWidth={0.03} />

          {/* Screen */}
          <rect x={toX(widthM * 0.2)} y={toY(0)} width={widthM * 0.6} height={0.04} fill={COLORS.primary} />
          <text x={toX(widthM / 2)} y={toY(0) - 0.1} textAnchor="middle" fontSize={0.13} fill={COLORS.label} fontFamily={FONT_BODY}>SCREEN</text>

          {/* Treatment zone extents */}
          {countedZones.map((zone) => (
            <rect
              key={zone.id}
              x={toX(zone.x)} y={toY(zone.y)}
              width={zone.width} height={zone.height}
              fill={COLORS.zoneFill} stroke={COLORS.zoneStroke} strokeWidth={0.012}
            />
          ))}

          {/* Advisory (optional) ceiling zones — dashed, never counted */}
          {advisoryZones.map((zone) => (
            <rect
              key={zone.id}
              x={toX(zone.x)} y={toY(zone.y)}
              width={zone.width} height={zone.height}
              fill={COLORS.advisoryFill} stroke={COLORS.advisoryStroke}
              strokeWidth={0.014} strokeDasharray="0.18 0.12"
            />
          ))}

          {/* Recommended Abfuser markers */}
          {data.markers.map((marker) => (
            <rect
              key={marker.key}
              x={toX(marker.x)} y={toY(marker.y)}
              width={marker.width} height={marker.height}
              fill={marker.advisory ? COLORS.advisoryStroke : COLORS.markerFill}
              opacity={marker.advisory ? 0.75 : 1}
            />
          ))}

          {/* Seating */}
          {seatingPositions.map((seat, i) => {
            const sx = Number(seat?.x);
            const sy = Number(seat?.y);
            if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
            return (
              <circle key={seat?.id || i} cx={toX(sx)} cy={toY(sy)} r={0.1}
                fill={COLORS.seatFill} opacity={0.5} />
            );
          })}

          {/* RSP */}
          {Number.isFinite(rsp?.x) && Number.isFinite(rsp?.y) && (
            <circle cx={toX(rsp.x)} cy={toY(rsp.y)} r={0.07} fill={COLORS.rspFill} stroke="#FFFFFF" strokeWidth={0.02} />
          )}

          {/* Zone labels */}
          {countedZones.filter((z) => z.wall === "left").map((z) => {
            const midY = z.y + z.height / 2;
            return (
              <text
                key={`lbl-${z.id}`}
                x={toX(0.30)} y={toY(midY)}
                textAnchor="middle" fontSize={0.1}
                fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}
                transform={`rotate(-90 ${toX(0.30)} ${toY(midY)})`}
              >
                {`LEFT FIRST REFLECTION (${z.panels})`}
              </text>
            );
          })}
          {countedZones.filter((z) => z.wall === "right").map((z) => {
            const midY = z.y + z.height / 2;
            return (
              <text
                key={`lbl-${z.id}`}
                x={toX(widthM - 0.30)} y={toY(midY)}
                textAnchor="middle" fontSize={0.1}
                fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}
                transform={`rotate(-90 ${toX(widthM - 0.30)} ${toY(midY)})`}
              >
                {`RIGHT FIRST REFLECTION (${z.panels})`}
              </text>
            );
          })}
          {countedZones.filter((z) => z.wall === "rear").map((z) => {
            const midX = z.x + z.width / 2;
            return (
              <text
                key={`lbl-${z.id}`}
                x={toX(midX)} y={toY(lengthM - 0.30)}
                textAnchor="middle" fontSize={0.1}
                fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}
              >
                {`REAR WALL (${z.panels})`}
              </text>
            );
          })}
          {advisoryZones.map((z) => (
            <text
              key={`lbl-${z.id}`}
              x={toX(z.x + z.width / 2)} y={toY(z.y + z.height / 2)}
              textAnchor="middle" fontSize={0.1}
              fill={COLORS.advisoryStroke} fontFamily={FONT_BODY} fontWeight={600}
            >
              {`OPTIONAL CEILING (${z.panels})`}
            </text>
          ))}

          {/* Dimensions */}
          <text x={toX(widthM / 2)} y={toY(lengthM) + 0.28} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY}>{widthM.toFixed(1)} m</text>
          <text x={toX(0) - 0.18} y={toY(lengthM / 2)} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY} transform={`rotate(-90 ${toX(0) - 0.18} ${toY(lengthM / 2)})`}>{lengthM.toFixed(1)} m</text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", marginTop: "3mm", fontSize: "8pt", color: COLORS.secondary }}>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 12, height: 6, background: COLORS.zoneFill, border: `1px solid ${COLORS.zoneStroke}`, borderRadius: 1 }} />
            Treatment zone
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 5, height: 11, background: COLORS.markerFill, borderRadius: 1 }} />
            Abfuser panel
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.seatFill, opacity: 0.5 }} />
            Listening position
          </span>
        </div>
      </div>

      {/* ── ADI recommendation summary ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          ADI ACOUSTIC TREATMENT RECOMMENDATION
        </div>

        <div style={{ fontFamily: FONT_HEADING, fontSize: "16pt", fontWeight: 400, color: COLORS.primary, lineHeight: 1.2 }}>
          Recommended: {recommendedQty} Abfusers
        </div>
        <div style={{ fontSize: "10pt", color: COLORS.secondary, marginTop: "1mm", fontFamily: FONT_BODY }}>
          Total treatment area: {surfaceArea} m²
        </div>

        <p style={{ margin: "3mm 0 0 0", fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          {data.wording.paragraph}
        </p>

        {/* Positions — quantity by zone */}
        <div style={{ marginTop: "4mm" }}>
          <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.label, marginBottom: "1.5mm", fontFamily: FONT_BODY }}>
            Positions
          </div>
          {countedZones.map((zone) => (
            <div key={`qty-${zone.id}`} style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
              {zone.panels} {zone.shortLabel.toLowerCase()}
            </div>
          ))}
          {advisoryZones.map((zone) => (
            <div key={`qty-${zone.id}`} style={{ fontSize: "9pt", color: COLORS.secondary, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
              {zone.panels} optional ceiling pair — advisory only, not counted in the recommendation
            </div>
          ))}
          <div style={{ marginTop: "1.5mm", paddingTop: "1.5mm", borderTop: `1px solid ${COLORS.border}`, fontSize: "9pt", fontWeight: 700, color: COLORS.primary, fontFamily: FONT_BODY }}>
            Total recommended: {recommendedQty} Abfusers ({surfaceArea} m²)
          </div>
        </div>

        {/* Included quantity — separate authority from the recommendation */}
        <div style={{ marginTop: "4mm", background: "#F8F8F7", border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "3mm 4mm" }}>
          <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.secondary, marginBottom: "1mm", fontFamily: FONT_BODY }}>
            INCLUDED IN THE PRICED SCHEDULE
          </div>
          <div style={{ fontFamily: FONT_HEADING, fontSize: "12pt", color: inclusionColor, lineHeight: 1.2 }}>
            {pricedQty != null ? `${pricedQty} Abfuser${pricedQty === 1 ? "" : "s"}` : "Not included"}
          </div>
          <div style={{ fontSize: "9pt", color: inclusionColor, marginTop: "1mm", fontFamily: FONT_BODY, lineHeight: 1.5 }}>
            {pricedQuantity.warning || inclusion.message}
          </div>
        </div>
      </div>

      {/* ── WHY THESE AREAS? ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          WHY THESE AREAS?
        </div>
        <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          The marked areas are the first lateral reflection points between the front loudspeakers and the
          listening positions, plus the rear wall where returning reflection energy is controlled. Each
          position is derived from this room's geometry and seating layout rather than a fixed percentage
          of the room's surface area.
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
          Artcoustic Abfuser combines absorption and diffusion. Its absorption coefficient reaches 0.85 at
          500 Hz and approximately 0.95 from 1–4 kHz, for controlling reflections that affect dialogue
          clarity and localisation.
        </p>
        <p style={{ margin: "2mm 0 0 0", fontSize: "9pt", lineHeight: 1.4, color: COLORS.secondary, fontFamily: FONT_BODY }}>
          {recommendation?.estimatedEffect?.bassNote || ""}
        </p>
      </div>

      {/* ── Result card ── */}
      <div style={{ background: COLORS.primary, color: "#FFFFFF", borderRadius: 6, padding: "5mm 6mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.7, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          {pricedQty != null ? "ACOUSTIC TREATMENT — INCLUDED" : "ADI ACOUSTIC TREATMENT RECOMMENDATION"}
        </div>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "16pt", fontWeight: 400, lineHeight: 1.2, marginBottom: "2mm" }}>
          {displayQty} × Artcoustic Abfuser
        </div>
        <div style={{ fontSize: "9pt", opacity: 0.85, lineHeight: 1.4, fontFamily: FONT_BODY }}>
          {data.wording.recommendationSentence}
        </div>
        {pricedQuantity.warning && (
          <div style={{
            fontSize: "8pt",
            opacity: 0.85,
            lineHeight: 1.45,
            fontFamily: FONT_BODY,
            marginTop: "2mm",
            paddingTop: "2mm",
            borderTop: "1px solid rgba(255, 255, 255, 0.25)",
          }}>
            {pricedQuantity.warning}
          </div>
        )}
        <div style={{ fontSize: "8pt", opacity: 0.7, lineHeight: 1.4, fontFamily: FONT_BODY, marginTop: "2mm" }}>
          Approximate treatment surface: {surfaceArea} m²
        </div>
      </div>
    </div>
  );
}