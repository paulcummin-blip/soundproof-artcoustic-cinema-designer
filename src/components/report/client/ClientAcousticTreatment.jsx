// ClientAcousticTreatment.jsx
// ---------------------------
// Client-facing Visual Report page: Acoustic Treatment.
//
// Restored positions page. Shows:
//   - plan view of the room, with one scaled 700 × 18 mm Abfuser rect per
//     recommended panel and treatment zones as pale guides only
//   - quantity by zone, total recommended quantity, total treatment area (m²)
//   - the designer-selected (included) quantity, shown separately
//
// The page is the client-facing summary: the plan carries the count, the block
// beneath it carries the distribution and total, and nothing is said twice.
//
// QUANTITY AUTHORITY:
//   Recommended quantity = ADI strategic reflection control.
//   Selected quantity = the designer's decision, and the only quantity that is
//   priced. The two are never conflated: the recommendation is never presented
//   as a designer selection.

import React from "react";
import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";
import AbfuserTreatmentPlan from "./AbfuserTreatmentPlan";
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

  // When the priced schedule and the ADI recommendation differ, the page states
  // it in one plain sentence instead of leaving two numbers to be reconciled.
  const scheduleNote = pricedQty != null && pricedQty !== recommendedQty
    ? `Priced schedule currently includes ${pricedQty} Abfuser${pricedQty === 1 ? "" : "s"}. ADI recommendation is ${recommendedQty}.`
    : null;

  const inclusionColor = inclusion.state === "ABOVE_RECOMMENDATION" ? "#8A5A2B" : COLORS.primary;

  return (
    <div style={{ fontFamily: FONT_BODY, color: COLORS.body }}>
      {/* ── Heading ── */}
      <div style={{ marginBottom: "5mm" }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "18pt", fontWeight: 400, color: COLORS.primary, letterSpacing: "0.01em", lineHeight: 1.1 }}>
          ACOUSTIC TREATMENT
        </div>
      </div>

      {/* ── Room plan — scaled Abfuser panels, one per recommended panel ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4mm", marginBottom: "4mm" }}>
        <AbfuserTreatmentPlan
          roomPlan={roomPlan}
          zones={data.zones}
          panels={data.markers}
          panel={data.panel}
          seatingPositions={seatingPositions}
          placedSpeakers={placedSpeakers}
          rsp={rsp}
          totalPanels={recommendedQty}
        />
      </div>

      {/* ── ADI recommendation summary ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          ADI ACOUSTIC TREATMENT RECOMMENDATION
        </div>

        <div style={{ fontFamily: FONT_HEADING, fontSize: "16pt", fontWeight: 400, color: COLORS.primary, lineHeight: 1.2 }}>
          Recommended: {recommendedQty} Abfuser {recommendedQty === 1 ? "panel" : "panels"}
        </div>
        <div style={{ fontSize: "10pt", color: COLORS.secondary, marginTop: "1mm", fontFamily: FONT_BODY }}>
          Total treatment area: {surfaceArea} m²
        </div>

        {/* Positions — quantity by zone */}
        <div style={{ marginTop: "4mm" }}>
          <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.label, marginBottom: "1.5mm", fontFamily: FONT_BODY }}>
            Distribution
          </div>
          {countedZones.map((zone) => (
            <div key={`qty-${zone.id}`} style={{ fontSize: "9pt", color: COLORS.body, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
              {zone.shortLabel} — {zone.panels} {zone.panels === 1 ? "panel" : "panels"}
            </div>
          ))}
          {advisoryZones.map((zone) => (
            <div key={`qty-${zone.id}`} style={{ fontSize: "9pt", color: COLORS.secondary, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
              {zone.shortLabel} — {zone.panels} panels (advisory only, not counted)
            </div>
          ))}
          <div style={{ marginTop: "1.5mm", paddingTop: "1.5mm", borderTop: `1px solid ${COLORS.border}`, fontSize: "9pt", fontWeight: 700, color: COLORS.primary, fontFamily: FONT_BODY }}>
            Total: {recommendedQty} Abfuser {recommendedQty === 1 ? "panel" : "panels"} ({surfaceArea} m²)
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
            {scheduleNote || pricedQuantity.warning || inclusion.message}
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
      </div>
    </div>
  );
}