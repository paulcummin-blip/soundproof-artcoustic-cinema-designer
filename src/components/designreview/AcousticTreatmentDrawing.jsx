/**
 * AcousticTreatmentDrawing.jsx
 * -----------------------------
 * Stage D — Compact acoustic treatment visualization for the Design Review
 * Drawings & Geometry section.
 *
 * Reuses selectClientAcousticTreatment (same zone authority as the Client
 * Visual Report) to derive wall-hugging treatment zones. Renders a compact
 * SVG plan with zone overlays and a quantity summary.
 */

import React, { useMemo } from "react";
import { selectClientAcousticTreatment } from "@/components/report/client/selectClientAcousticTreatment";
import AbfuserPlanDrawing from "@/components/report/AbfuserPlanDrawing";

const COLORS = {
  bg: "transparent",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  muted: "#77736B",
};

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

export default function AcousticTreatmentDrawing({
  roomDims,
  seatingPositions = [],
  placedSpeakers = [],
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
}) {
  const treatmentData = useMemo(
    () => selectClientAcousticTreatment({
      roomDims,
      seatingPositions,
      placedSpeakers,
      acousticTreatmentEnabled,
      selectedAbfuserQty,
    }),
    [roomDims, seatingPositions, placedSpeakers, acousticTreatmentEnabled, selectedAbfuserQty]
  );

  const widthM = Number(roomDims?.widthM) || 4.5;
  const lengthM = Number(roomDims?.lengthM) || 6.0;

  // Plan geometry is drawn by the single Abfuser plan authority, on the same
  // room scale the Visual Report uses. This page adds no geometry of its own.

  // The page follows the Acoustic Treatment toggle, not the included quantity:
  // the ADI recommendation is guidance and is shown even when nothing has been
  // accepted into pricing yet.
  if (!acousticTreatmentEnabled) {
    return (
      <div style={{
        padding: "24px 16px",
        textAlign: "center",
        color: COLORS.muted,
        fontFamily: FONT_BODY,
        fontSize: 13,
      }}>
        Acoustic treatment is not enabled for this project.
      </div>
    );
  }

  const zones = treatmentData?.zones || [];
  const markers = treatmentData?.markers || [];
  const qtyBreakdown = treatmentData?.quantityBreakdown;
  const selectedQty = treatmentData?.selectedQty ?? 0;
  const inclusion = treatmentData?.inclusion;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* SVG plan */}
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <AbfuserPlanDrawing
          variant="technical"
          roomPlan={{ widthM, lengthM }}
          zones={zones}
          panels={markers}
          seatingPositions={seatingPositions}
          placedSpeakers={placedSpeakers}
        />
      </div>

      {/* Quantity summary */}
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "14px 16px",
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.secondary,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontFamily: FONT_BODY,
          marginBottom: 8,
        }}>
          Artcoustic Abfuser Recommendation
        </div>
        {qtyBreakdown && (
          <>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.primary,
              fontFamily: FONT_BODY,
            }}>
              Recommended: {qtyBreakdown.recommendedQty} × Artcoustic Abfuser
            </div>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 16px",
              fontSize: 11,
              color: COLORS.body,
              fontFamily: FONT_BODY,
              marginTop: 6,
              lineHeight: 1.5,
            }}>
              <span>Left: {qtyBreakdown.leftPanels}</span>
              <span>Right: {qtyBreakdown.rightPanels}</span>
              <span>Rear: {qtyBreakdown.rearPanels}</span>
              {qtyBreakdown.ceilingAdvisoryPanels > 0 && (
                <span>Ceiling (optional): {qtyBreakdown.ceilingAdvisoryPanels}</span>
              )}
            </div>
            {Number.isFinite(qtyBreakdown.treatmentSurfaceArea) && (
              <div style={{
                fontSize: 11,
                color: COLORS.secondary,
                fontFamily: FONT_BODY,
                marginTop: 4,
                lineHeight: 1.5,
              }}>
                Approximate treatment surface: {qtyBreakdown.treatmentSurfaceArea.toFixed(1)} m²
              </div>
            )}
            <div style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: `1px solid ${COLORS.border}`,
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.primary,
              fontFamily: FONT_BODY,
            }}>
              Included in proposal: {selectedQty} / {qtyBreakdown?.recommendedQty ?? 0}
            </div>
            {inclusion?.message && (
              <div style={{
                fontSize: 11,
                color: inclusion.state === "ABOVE_RECOMMENDATION" ? "#8A5A2B" : COLORS.secondary,
                fontFamily: FONT_BODY,
                marginTop: 4,
                lineHeight: 1.5,
              }}>
                {inclusion.message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}