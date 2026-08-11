// ClientAcousticTreatment.jsx
// ---------------------------
// Client-facing Visual Report page: Acoustic Treatment.
//
// Simple RP22-backed treatment-zone visual:
//   - LEFT/RIGHT SIDE REFLECTION ZONES  (primary reflection treatment)
//   - REAR TREATMENT ZONE               (rear sound control)
// Abfuser markers shown as small subordinate indicators within zones.
// No reflection rays, no ceiling panels on the main plan.
//
// Supported by concise RP22 Section 9 guidance and Abfuser absorption data.

import React from "react";
import { selectClientAcousticTreatment } from "./selectClientAcousticTreatment";

const COLORS = {
  cardBg: "#FFFFFF",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  border: "#E6E4DD",
  label: "#9B8E82",
  panelFill: "#213428",
  roomStroke: "#3E4349",
  seatFill: "#625143",
  rspFill: "#213428",
  zoneSideFill: "rgba(33, 52, 40, 0.14)",
  zoneRearFill: "rgba(33, 52, 40, 0.12)",
  zoneStroke: "#213428",
};

const FONT_HEADING = "'Futura PT Light', 'Century Gothic', sans-serif";
const FONT_BODY = "'Didact Gothic', 'Century Gothic', sans-serif";

const ABFUSER_W = 0.70;
const ABFUSER_H = 1.10;
// Subordinate marker size (half-scale for visual subordination)
const MARKER_W = 0.35;
const MARKER_H = 0.55;

/**
 * Compute visual panel markers across side/rear zones only.
 * Ceiling allocation is redistributed into side/rear for display —
 * commercial quantity is not changed.
 */
function computeVisualPanels(qty, zones, widthM) {
  const sideZone = zones.find((z) => z.id === "side-left");
  const rearZone = zones.find((z) => z.id === "rear-wall");
  if (!sideZone || !rearZone || qty <= 0) return [];

  let visualSide = Math.round(qty * 0.65);
  let visualRear = qty - visualSide;
  if (visualSide < 2 && qty >= 2) { visualSide = 2; visualRear = qty - visualSide; }
  if (visualRear < 0) visualRear = 0;

  const markers = [];
  const sideSpan = Math.max(0, sideZone.height - ABFUSER_H);

  // Side markers: split across left + right walls
  const perSide = Math.ceil(visualSide / 2);
  const leftCount = perSide;
  const rightCount = visualSide - leftCount;

  for (let i = 0; i < leftCount; i++) {
    const frac = leftCount === 1 ? 0.5 : i / (leftCount - 1);
    const cy = sideZone.y + ABFUSER_H / 2 + frac * sideSpan;
    markers.push({ id: `msl-${i}`, cx: ABFUSER_W / 2 + 0.02, cy, zone: "side" });
  }
  for (let i = 0; i < rightCount; i++) {
    const frac = rightCount === 1 ? 0.5 : i / (rightCount - 1);
    const cy = sideZone.y + ABFUSER_H / 2 + frac * sideSpan;
    markers.push({ id: `msr-${i}`, cx: widthM - ABFUSER_W / 2 - 0.02, cy, zone: "side" });
  }

  // Rear markers: distribute within wall bounds
  if (visualRear > 0) {
    const rearMargin = 0.10;
    const rearSpan = Math.max(0, widthM - ABFUSER_W - rearMargin * 2);
    const firstCenter = rearMargin + ABFUSER_W / 2;
    for (let i = 0; i < visualRear; i++) {
      const frac = visualRear === 1 ? 0.5 : i / (visualRear - 1);
      const cx = firstCenter + frac * rearSpan;
      markers.push({ id: `mr-${i}`, cx, cy: rearZone.y + rearZone.height / 2, zone: "rear" });
    }
  }

  return markers;
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

  const markers = computeVisualPanels(data.selectedQty, data.zones, widthM);
  const sideZone = data.zones.find((z) => z.id === "side-left");
  const rearZone = data.zones.find((z) => z.id === "rear-wall");

  return (
    <div style={{ fontFamily: FONT_BODY, color: COLORS.body }}>
      {/* ── Heading ── */}
      <div style={{ marginBottom: "5mm" }}>
        <div style={{ fontFamily: FONT_HEADING, fontSize: "18pt", fontWeight: 400, color: COLORS.primary, letterSpacing: "0.01em", lineHeight: 1.1 }}>
          ACOUSTIC TREATMENT
        </div>
      </div>

      {/* ── Room plan with treatment zones ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4mm", marginBottom: "4mm" }}>
        <svg viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {/* Room outline */}
          <rect x={toX(0)} y={toY(0)} width={widthM} height={lengthM} fill="#FAFAF8" stroke={COLORS.roomStroke} strokeWidth={0.03} />

          {/* Screen */}
          <rect x={toX(widthM * 0.2)} y={toY(0)} width={widthM * 0.6} height={0.04} fill={COLORS.primary} />
          <text x={toX(widthM / 2)} y={toY(0) - 0.1} textAnchor="middle" fontSize={0.13} fill={COLORS.label} fontFamily={FONT_BODY}>SCREEN</text>

          {/* ── Treatment zones (primary visual) ── */}
          {data.zones.filter((z) => z.id !== "ceiling").map((zone) => (
            <rect
              key={zone.id}
              x={toX(zone.x)} y={toY(zone.y)}
              width={zone.width} height={zone.height}
              fill={zone.id === "rear-wall" ? COLORS.zoneRearFill : COLORS.zoneSideFill}
              stroke={COLORS.zoneStroke} strokeWidth={0.02} rx={0.02}
            />
          ))}

          {/* ── Abfuser markers (subordinate, half-scale) ── */}
          {markers.map((m) => (
            <rect
              key={m.id}
              x={toX(m.cx - MARKER_W / 2)} y={toY(m.cy - MARKER_H / 2)}
              width={MARKER_W} height={MARKER_H}
              fill={COLORS.panelFill} opacity={0.65} rx={0.02}
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
          {sideZone && (
            <text x={toX(widthM / 2)} y={toY(sideZone.y) - 0.06} textAnchor="middle" fontSize={0.1} fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}>
              PRIMARY REFLECTION TREATMENT
            </text>
          )}
          {rearZone && (
            <text x={toX(widthM / 2)} y={toY(rearZone.y) - 0.06} textAnchor="middle" fontSize={0.1} fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}>
              REAR SOUND CONTROL
            </text>
          )}

          {/* Dimensions */}
          <text x={toX(widthM / 2)} y={toY(lengthM) + 0.28} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY}>{widthM.toFixed(1)} m</text>
          <text x={toX(0) - 0.18} y={toY(lengthM / 2)} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY} transform={`rotate(-90 ${toX(0) - 0.18} ${toY(lengthM / 2)})`}>{lengthM.toFixed(1)} m</text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", marginTop: "3mm", fontSize: "8pt", color: COLORS.secondary }}>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: COLORS.zoneSideFill, border: `1px solid ${COLORS.zoneStroke}`, borderRadius: 2 }} />
            Primary reflection zone
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: COLORS.zoneRearFill, border: `1px solid ${COLORS.zoneStroke}`, borderRadius: 2 }} />
            Rear treatment zone
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, background: COLORS.panelFill, borderRadius: 2, opacity: 0.65 }} />
            Abfuser panel (indicative)
          </span>
        </div>
      </div>

      {/* ── WHY THESE AREAS? ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          WHY THESE AREAS?
        </div>
        <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          RP22 recommends controlling strong early reflections from the front soundstage, particularly at lateral reflection areas in higher-channel-count systems. It also recommends managed absorption, diffusion and scattering toward the rear of the room to preserve clarity while supporting an immersive soundfield.
        </p>
      </div>

      {/* ── WHY ABFUSER? ── */}
      <div style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5mm 6mm", marginBottom: "4mm" }}>
        <div style={{ fontSize: "8pt", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.primary, marginBottom: "2mm", fontFamily: FONT_BODY }}>
          WHY ABFUSER?
        </div>
        <p style={{ margin: 0, fontSize: "10pt", lineHeight: 1.5, color: COLORS.body, fontFamily: FONT_BODY }}>
          The Artcoustic Abfuser combines absorption and diffusion. Its acoustic absorption increases substantially above the low bass region, reaching 0.85 at 500 Hz and approximately 0.95 through 1–4 kHz. This makes it well suited to controlling the reflections that can reduce dialogue clarity and precise sound localisation.
        </p>
        <div style={{ marginTop: "3mm", fontSize: "8pt", color: COLORS.secondary, fontFamily: FONT_BODY, lineHeight: 1.6 }}>
          <strong style={{ color: COLORS.primary }}>Absorption coefficients:</strong> 125 Hz = 0.26 · 250 Hz = 0.32 · 500 Hz = 0.85 · 1 kHz = 0.95 · 2 kHz = 0.95 · 4 kHz = 0.95 · 6 kHz = 0.90
        </div>
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
          Recommended within the highlighted areas to control early reflections, improve dialogue clarity and localisation, and maintain a balanced, immersive soundfield.
        </div>
      </div>
    </div>
  );
}