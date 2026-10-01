/**
 * AbfuserTreatmentPlan.jsx
 * ------------------------
 * Plan view of the ADI Abfuser recommendation for the Visual Report Acoustic
 * Treatment page.
 *
 * PANELS ARE DRAWN TO SCALE. Each panel is its real product footprint in plan —
 * 700 mm along the wall × 18 mm thick (ABFUSER_PRODUCT) — mounted against the
 * wall face it belongs to. Panels are never stretched to fill a zone.
 *
 * Treatment zones are pale guide areas: they show where panels may usefully
 * sit, never the panel coverage. Every zone is labelled with its panel count,
 * and the drawing states the total.
 *
 * Adjacent panels are installed edge-to-edge; the 10 mm visual joint between
 * them (see the selector) is a drawing convention so each panel reads as a
 * separate panel rather than one continuous bar. The 700 mm pitch is unchanged.
 *
 * Quantity comes from the ADI recommendation. This component draws and labels
 * what it is given; it decides nothing.
 *
 * Props:
 *   roomPlan         — { widthM, lengthM }
 *   zones            — [{ id, wall, advisory, panels, shortLabel, x, y, width, height }]
 *   panels           — [{ key, wall, advisory, x, y, width, height }] scaled panel rects
 *   panel            — { label, widthM, heightM, depthM, sizeAvailable } product size
 *   seatingPositions — [{ id, x, y }]
 *   rsp              — { x, y }
 *   totalPanels      — recommended panel count (the drawing's total)
 */

import React from "react";
import RspReferenceMarker from "./RspReferenceMarker";
import { REPORT_FONT_BODY as FONT_BODY } from "@/components/report/typography/reportTypography";

const COLORS = {
  roomFill: "#FAFAF8",
  roomStroke: "#3E4349",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  label: "#9B8E82",
  border: "#E6E4DD",
  zoneFill: "rgba(33, 52, 40, 0.10)",
  zoneStroke: "#213428",
  panelFill: "#213428",
  advisoryFill: "rgba(98, 81, 67, 0.16)",
  advisoryStroke: "#625143",
  seatFill: "#625143",
};

const PADDING_M = 0.5;
// Zone labels sit this far inside the room, clear of the wall zone band.
const ZONE_LABEL_INSET_M = 0.30;
const SCHEDULE_WARNING = "Panel size unavailable — schematic only";

function panelCountLabel(zone) {
  const count = Math.max(0, Math.floor(Number(zone?.panels) || 0));
  const noun = count === 1 ? "PANEL" : "PANELS";
  return `${String(zone?.shortLabel || "").toUpperCase()} — ${count} ${noun}`;
}

function advisoryLabel(zone) {
  const count = Math.max(0, Math.floor(Number(zone?.panels) || 0));
  const noun = count === 1 ? "PANEL" : "PANELS";
  return `OPTIONAL CEILING — ${count} ${noun} (ADVISORY)`;
}

function zoneLabelPlacement(zone, widthM, lengthM) {
  if (zone.wall === "left") {
    return { x: ZONE_LABEL_INSET_M, y: zone.y + zone.height / 2, rotate: true };
  }
  if (zone.wall === "right") {
    return { x: widthM - ZONE_LABEL_INSET_M, y: zone.y + zone.height / 2, rotate: true };
  }
  if (zone.wall === "rear") {
    return { x: zone.x + zone.width / 2, y: lengthM - ZONE_LABEL_INSET_M, rotate: false };
  }
  return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2, rotate: false };
}

export default function AbfuserTreatmentPlan({
  roomPlan,
  zones = [],
  panels = [],
  panel = null,
  seatingPositions = [],
  rsp,
  totalPanels = 0,
}) {
  const widthM = Number(roomPlan?.widthM) || 4.5;
  const lengthM = Number(roomPlan?.lengthM) || 6.0;

  const viewBoxW = widthM + PADDING_M * 2;
  const viewBoxH = lengthM + PADDING_M * 2;
  const toX = (m) => m + PADDING_M;
  const toY = (m) => m + PADDING_M;

  const countedZones = zones.filter((z) => !z.advisory);
  const advisoryZones = zones.filter((z) => z.advisory);
  const sizeAvailable = panel?.sizeAvailable === true;

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <svg
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* Room outline */}
        <rect
          x={toX(0)} y={toY(0)}
          width={widthM} height={lengthM}
          fill={COLORS.roomFill} stroke={COLORS.roomStroke} strokeWidth={0.03}
        />

        {/* Screen */}
        <rect x={toX(widthM * 0.2)} y={toY(0)} width={widthM * 0.6} height={0.04} fill={COLORS.primary} />
        <text x={toX(widthM / 2)} y={toY(0) - 0.1} textAnchor="middle" fontSize={0.13} fill={COLORS.label} fontFamily={FONT_BODY}>SCREEN</text>

        {/* Treatment zones — pale guide areas only, never the panel coverage */}
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

        {/* Abfuser panels — real scaled footprint, against the wall face */}
        {panels.map((item) => (
          <rect
            key={item.key}
            x={toX(item.x)} y={toY(item.y)}
            width={item.width} height={item.height}
            fill={item.advisory ? COLORS.advisoryStroke : COLORS.panelFill}
            opacity={item.advisory ? 0.75 : 1}
          />
        ))}

        {/* Seating */}
        {seatingPositions.map((seat, i) => {
          const sx = Number(seat?.x);
          const sy = Number(seat?.y);
          if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
          return <circle key={seat?.id || i} cx={toX(sx)} cy={toY(sy)} r={0.1} fill={COLORS.seatFill} opacity={0.5} />;
        })}

        {/* Reference seating position — its own glyph, never a seat */}
        {Number.isFinite(rsp?.x) && Number.isFinite(rsp?.y) && (
          <RspReferenceMarker
            cx={toX(rsp.x)} cy={toY(rsp.y)}
            ringR={0.06} dotR={0.025} tickR={0.10} strokeWidth={0.018}
          />
        )}

        {/* Panel count per zone */}
        {countedZones.map((zone) => {
          const place = zoneLabelPlacement(zone, widthM, lengthM);
          return (
            <text
              key={`lbl-${zone.id}`}
              x={toX(place.x)} y={toY(place.y)}
              textAnchor="middle" fontSize={0.1}
              fill={COLORS.primary} fontFamily={FONT_BODY} fontWeight={600}
              transform={place.rotate ? `rotate(-90 ${toX(place.x)} ${toY(place.y)})` : undefined}
            >
              {panelCountLabel(zone)}
            </text>
          );
        })}
        {advisoryZones.map((zone) => {
          const place = zoneLabelPlacement(zone, widthM, lengthM);
          return (
            <text
              key={`lbl-${zone.id}`}
              x={toX(place.x)} y={toY(place.y)}
              textAnchor="middle" fontSize={0.1}
              fill={COLORS.advisoryStroke} fontFamily={FONT_BODY} fontWeight={600}
            >
              {advisoryLabel(zone)}
            </text>
          );
        })}

        {/* Dimensions */}
        <text x={toX(widthM / 2)} y={toY(lengthM) + 0.28} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY}>{widthM.toFixed(1)} m</text>
        <text x={toX(0) - 0.18} y={toY(lengthM / 2)} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY} transform={`rotate(-90 ${toX(0) - 0.18} ${toY(lengthM / 2)})`}>{lengthM.toFixed(1)} m</text>
      </svg>

      {/* ── Total ── */}
      <div style={{
        marginTop: "3mm",
        fontSize: "10pt",
        fontWeight: 700,
        color: COLORS.primary,
        letterSpacing: "0.02em",
      }}>
        Total: {totalPanels} Abfuser {totalPanels === 1 ? "panel" : "panels"}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", marginTop: "2mm", fontSize: "8pt", color: COLORS.secondary }}>
        <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <span style={{ display: "inline-block", width: 12, height: 6, background: COLORS.zoneFill, border: `1px solid ${COLORS.zoneStroke}`, borderRadius: 1 }} />
          Treatment zone
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <span style={{ display: "inline-block", width: 14, height: 4, background: COLORS.panelFill, borderRadius: 1 }} />
          {sizeAvailable
            ? `Individual Abfuser panel — ${Math.round(panel.widthM * 1000)} × ${Math.round(panel.depthM * 1000)} mm, drawn to scale`
            : "Individual Abfuser panel"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.seatFill, opacity: 0.5 }} />
          Listening position
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
          <svg width={14} height={14} viewBox="0 0 14 14">
            <RspReferenceMarker cx={7} cy={7} ringR={4.5} dotR={1.8} tickR={6.5} strokeWidth={1.4} />
          </svg>
          Reference position (RSP)
        </span>
      </div>

      {/* ── Size warning — stated rather than guessed ── */}
      {!sizeAvailable && (
        <div style={{
          marginTop: "2mm",
          fontSize: "8pt",
          fontWeight: 600,
          color: COLORS.advisoryStroke,
        }}>
          {SCHEDULE_WARNING}
        </div>
      )}
    </div>
  );
}