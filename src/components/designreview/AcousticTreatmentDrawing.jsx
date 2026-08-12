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

const COLORS = {
  bg: "transparent",
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  muted: "#77736B",
  zoneFill: "rgba(33, 52, 40, 0.12)",
  zoneStroke: "#213428",
  roomStroke: "#B0AEA8",
  roomFill: "#F4F3F0",
  screenFill: "#2C2C2C",
  seatFill: "#213428",
  speakerFill: "#625143",
};

const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const PADDING = 40;
const LABEL_TOP = 20;

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

  // SVG layout
  const SVG_W = 640;
  const drawW = SVG_W - PADDING * 2;
  const drawH = Math.round(drawW * (lengthM / widthM));
  const SVG_H = drawH + PADDING * 2 + LABEL_TOP;

  const rx = (m) => PADDING + (m / widthM) * drawW;
  const ry = (m) => PADDING + LABEL_TOP + (m / lengthM) * drawH;

  if (!acousticTreatmentEnabled || selectedAbfuserQty <= 0) {
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
  const qtyBreakdown = treatmentData?.quantityBreakdown;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* SVG plan */}
      <div style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}>
        <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block" }}>
          {/* Room background */}
          <rect
            x={rx(0)} y={ry(0)}
            width={drawW} height={drawH}
            fill={COLORS.roomFill}
            stroke={COLORS.roomStroke}
            strokeWidth={1.5}
          />

          {/* Screen (front wall) */}
          <rect
            x={rx(0)} y={ry(0)}
            width={drawW} height={4}
            fill={COLORS.screenFill}
          />

          {/* Treatment zones */}
          {zones.map((zone) => (
            <rect
              key={zone.id}
              x={rx(zone.x)}
              y={ry(zone.y)}
              width={Math.max(2, (zone.width / widthM) * drawW)}
              height={Math.max(2, (zone.height / lengthM) * drawH)}
              fill={COLORS.zoneFill}
              stroke={COLORS.zoneStroke}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          ))}

          {/* Seating positions */}
          {seatingPositions.filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y)).map((seat, i) => (
            <circle
              key={seat.id || i}
              cx={rx(Number(seat.x))}
              cy={ry(Number(seat.y))}
              r={3}
              fill={COLORS.seatFill}
            />
          ))}

          {/* Speakers (non-overhead only) */}
          {placedSpeakers.filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y) && !String(s.role || "").startsWith("T")).map((spk, i) => (
            <rect
              key={spk.id || i}
              x={rx(Number(spk.x)) - 2}
              y={ry(Number(spk.y)) - 2}
              width={4}
              height={4}
              fill={COLORS.speakerFill}
            />
          ))}
        </svg>
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
          Artcoustic Abfuser Selection
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: COLORS.primary,
          fontFamily: FONT_BODY,
        }}>
          {selectedAbfuserQty} panel{selectedAbfuserQty !== 1 ? "s" : ""}
        </div>
        {qtyBreakdown && (
          <div style={{
            fontSize: 11,
            color: COLORS.body,
            fontFamily: FONT_BODY,
            marginTop: 4,
            lineHeight: 1.5,
          }}>
            {qtyBreakdown}
          </div>
        )}
      </div>
    </div>
  );
}