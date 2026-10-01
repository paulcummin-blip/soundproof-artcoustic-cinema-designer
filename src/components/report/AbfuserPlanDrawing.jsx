/**
 * AbfuserPlanDrawing.jsx
 * ----------------------
 * THE single Abfuser plan-drawing authority. Both the Technical Report
 * (Design Review — Drawings & Geometry → ACOUSTIC TREATMENT) and the Visual
 * Report (Acoustic Treatment page) render this component, so the two can never
 * disagree about where a panel sits, how big it is, or how many there are.
 *
 * GEOMETRY IS THE SAME FOR EVERY CONSUMER. One plan scale for the whole
 * drawing: the room plus a fixed margin, in metres, so the room, its seats, its
 * speakers, the treatment zones and every panel share one coordinate transform
 * and one aspect ratio. Panel rectangles come from the caller's selector
 * (selectClientAcousticTreatment) already placed against the wall face at their
 * real 700 × 18 mm plan footprint — this component draws them and decides
 * nothing about quantity, position or size.
 *
 * PANEL JOINTS ARE A DRAWING CONVENTION. Adjacent panels are installed butted
 * together on a 700 mm pitch; at room scale a true joint would be invisible and
 * the run would read as one continuous strip. The drawn joint the selector
 * applies therefore stays visible so each panel reads as a separate product.
 *
 * VARIANTS differ only in annotation, never in geometry:
 *   variant="technical" — room, screen, zones, panels, seats, speakers. No
 *                         legend, labels, dimensions or total (the Technical
 *                         Report states those in its own summary card).
 *   variant="visual"    — the same drawing plus the Visual Report's annotation
 *                         layer: zone labels, dimensions, total, legend and the
 *                         drawn-joint note, and a subtle RSP marker when an RSP
 *                         is supplied.
 *
 * The reference seating position is a small survey marker, never a large cross,
 * so it can never compete with the product it sits among.
 *
 * Props:
 *   roomPlan         — { widthM, lengthM }
 *   zones            — [{ id, wall, advisory, panels, shortLabel, x, y, width, height }]
 *   panels           — [{ key, wall, advisory, x, y, width, height }] scaled panel rects
 *   panel            — { label, widthM, heightM, depthM, sizeAvailable } product size
 *   seatingPositions — [{ id, x, y }]
 *   placedSpeakers   — [{ role, x, y } | { role, position: { x, y } }]
 *   rsp              — { x, y } reference seating position (drawn only if finite)
 *   totalPanels      — recommended panel count (the drawing's total)
 *   variant          — "technical" (default) | "visual"
 */

import React from "react";
import RspReferenceMarker from "./client/RspReferenceMarker";
import { REPORT_FONT_BODY as FONT_BODY } from "@/components/report/typography/reportTypography";

const COLORS = {
  roomFill: "#FAFAF8",
  roomStroke: "#3E4349",
  primary: "#213428",
  body: "#3E4349",
  secondary: "#625143",
  label: "#9B8E82",
  zoneLabel: "#4C5A4F",
  warning: "#8A5A2B",
  border: "#E6E4DD",
  // Treatment zones are pale guides only — panels are the dark, individual
  // product footprints and always out-rank them visually.
  zoneFill: "rgba(33, 52, 40, 0.06)",
  zoneStroke: "#C7CDC4",
  panelFill: "#213428",
  seatFill: "#625143",
  speakerFill: "#625143",
};

const PADDING_M = 0.5;
// Zone labels sit this far inside the room, against the wall they describe.
const ZONE_LABEL_INSET_M = 0.22;
const ZONE_LABEL_FONT_M = 0.085;
const ZONE_LABEL_LINE_M = 0.115;
const RSP_LABEL_OFFSET_M = 0.17;
// Speaker footprint in plan — a small mark, never a second drawing.
const SPEAKER_MARK_M = 0.12;
const SCHEDULE_WARNING = "Panel size unavailable — schematic only";
// Panel size as stated in the legend, from the product data (700 × 18 mm).
const panelSizeLabel = (panel) => `${Math.round(Number(panel?.widthM) * 1000)} × ${Math.round(Number(panel?.depthM) * 1000)} mm`;

// Two horizontal lines per zone — location over count — so nothing is rotated
// through a wall and every count stays next to the wall it belongs to.
function zoneLabelLines(zone) {
  const count = Math.max(0, Math.floor(Number(zone?.panels) || 0));
  return [
    String(zone?.shortLabel || "").toUpperCase(),
    `${count} ${count === 1 ? "PANEL" : "PANELS"}`,
  ];
}

function zoneLabelAnchor(zone, widthM, lengthM) {
  if (zone.wall === "left") {
    return { x: ZONE_LABEL_INSET_M, y: zone.y + zone.height / 2, anchor: "start" };
  }
  if (zone.wall === "right") {
    return { x: widthM - ZONE_LABEL_INSET_M, y: zone.y + zone.height / 2, anchor: "end" };
  }
  return { x: zone.x + zone.width / 2, y: lengthM - ZONE_LABEL_INSET_M - 0.32, anchor: "middle" };
}

// Speakers arrive from the plan authority either flat or nested under position.
function speakerPoint(speaker) {
  const x = Number(speaker?.x ?? speaker?.position?.x);
  const y = Number(speaker?.y ?? speaker?.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export default function AbfuserPlanDrawing({
  roomPlan,
  zones = [],
  panels = [],
  panel = null,
  seatingPositions = [],
  placedSpeakers = [],
  rsp,
  totalPanels = 0,
  variant = "technical",
}) {
  const widthM = Number(roomPlan?.widthM) || 4.5;
  const lengthM = Number(roomPlan?.lengthM) || 6.0;

  const annotated = variant === "visual";
  const viewBoxW = widthM + PADDING_M * 2;
  const viewBoxH = lengthM + PADDING_M * 2;
  const toX = (m) => m + PADDING_M;
  const toY = (m) => m + PADDING_M;

  const countedZones = zones.filter((z) => !z.advisory);
  const sizeAvailable = panel?.sizeAvailable === true;
  // Overhead speakers have no plan footprint in a bed-layer treatment plan.
  const planSpeakers = placedSpeakers
    .filter((spk) => !String(spk?.role || "").startsWith("T"))
    .map((spk) => ({ ...spk, point: speakerPoint(spk) }))
    .filter((spk) => spk.point);

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
        {annotated && (
          <text x={toX(widthM / 2)} y={toY(0) - 0.1} textAnchor="middle" fontSize={0.13} fill={COLORS.label} fontFamily={FONT_BODY}>SCREEN</text>
        )}

        {/* Treatment zones — pale guide areas only, never the panel coverage.
            The optional low-ceiling zone is a ceiling area with no plan-view
            footprint, so it is stated in the page copy and is never drawn as a
            centre-room block. */}
        {countedZones.map((zone) => (
          <rect
            key={zone.id}
            x={toX(zone.x)} y={toY(zone.y)}
            width={zone.width} height={zone.height}
            fill={COLORS.zoneFill} stroke={COLORS.zoneStroke} strokeWidth={0.008}
            strokeDasharray="0.06 0.05"
          />
        ))}

        {/* Abfuser panels — one rect per recommended panel, each at its real
            scaled footprint, separated by the drawn joint so the count reads */}
        {panels.map((item) => (
          <rect
            key={item.key}
            x={toX(item.x)} y={toY(item.y)}
            width={item.width} height={item.height}
            fill={COLORS.panelFill}
          />
        ))}

        {/* Listening positions */}
        {seatingPositions.map((seat, i) => {
          const sx = Number(seat?.x);
          const sy = Number(seat?.y);
          if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
          return <circle key={seat?.id || i} cx={toX(sx)} cy={toY(sy)} r={0.09} fill={COLORS.seatFill} opacity={0.4} />;
        })}

        {/* Speakers — bed-layer marks only, so the plan reads as the real room */}
        {planSpeakers.map((spk, i) => (
          <rect
            key={spk.id || `spk-${i}`}
            x={toX(spk.point.x) - SPEAKER_MARK_M / 2}
            y={toY(spk.point.y) - SPEAKER_MARK_M / 2}
            width={SPEAKER_MARK_M}
            height={SPEAKER_MARK_M}
            fill={COLORS.speakerFill}
            opacity={0.7}
          />
        ))}

        {/* Reference seating position — a small survey marker, never a cross */}
        {Number.isFinite(rsp?.x) && Number.isFinite(rsp?.y) && (
          <g>
            <RspReferenceMarker
              cx={toX(rsp.x)} cy={toY(rsp.y)}
              ringR={0.05} dotR={0.012} tickR={0.06} strokeWidth={0.012}
              tickStrokeWidth={0.01}
            />
            <text
              x={toX(rsp.x)} y={toY(rsp.y) + RSP_LABEL_OFFSET_M}
              textAnchor="middle" fontSize={0.075}
              fill={COLORS.label} fontFamily={FONT_BODY} letterSpacing={0.004}
            >
              RSP
            </text>
          </g>
        )}

        {/* Location and count per zone — horizontal, never rotated through a wall */}
        {annotated && countedZones.map((zone) => {
          const place = zoneLabelAnchor(zone, widthM, lengthM);
          const x = toX(place.x);
          const y = toY(place.y) - ZONE_LABEL_LINE_M / 2;
          return (
            <text
              key={`lbl-${zone.id}`}
              x={x} y={y}
              textAnchor={place.anchor} fontSize={ZONE_LABEL_FONT_M}
              fill={COLORS.zoneLabel} fontFamily={FONT_BODY} fontWeight={600}
              letterSpacing={0.004}
            >
              {zoneLabelLines(zone).map((line, index) => (
                <tspan key={line} x={x} dy={index === 0 ? 0 : ZONE_LABEL_LINE_M}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}

        {/* Dimensions */}
        {annotated && (
          <>
            <text x={toX(widthM / 2)} y={toY(lengthM) + 0.28} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY}>{widthM.toFixed(1)} m</text>
            <text x={toX(0) - 0.18} y={toY(lengthM / 2)} textAnchor="middle" fontSize={0.11} fill={COLORS.label} fontFamily={FONT_BODY} transform={`rotate(-90 ${toX(0) - 0.18} ${toY(lengthM / 2)})`}>{lengthM.toFixed(1)} m</text>
          </>
        )}
      </svg>

      {/* ── Total ── */}
      {annotated && (
        <div style={{
          marginTop: "3mm",
          fontSize: "10pt",
          fontWeight: 700,
          color: COLORS.primary,
          letterSpacing: "0.02em",
        }}>
          Total: {totalPanels} Abfuser {totalPanels === 1 ? "panel" : "panels"}
        </div>
      )}

      {/* ── Legend ── */}
      {annotated && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4mm", marginTop: "2mm", fontSize: "8pt", color: COLORS.secondary }}>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 14, height: 5, background: COLORS.panelFill, borderRadius: 1 }} />
            {sizeAvailable
              ? `Individual Abfuser panel — ${panelSizeLabel(panel)}`
              : "Individual Abfuser panel"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 12, height: 6, background: COLORS.zoneFill, border: `1px dashed ${COLORS.zoneStroke}`, borderRadius: 1 }} />
            Treatment zone
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.seatFill, opacity: 0.4 }} />
            Listening position
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "1.5mm" }}>
            <svg width={14} height={14} viewBox="0 0 14 14">
              <RspReferenceMarker cx={7} cy={7} ringR={4} dotR={1.2} tickR={5.5} strokeWidth={1.2} />
            </svg>
            Reference position (RSP)
          </span>
        </div>
      )}

      {/* ── Drawn-joint note — the panels are true size, the joints are widened ── */}
      {annotated && sizeAvailable && (
        <div style={{ marginTop: "1.5mm", fontSize: "7pt", color: COLORS.label, lineHeight: 1.4 }}>
          Each panel is drawn at its true {panelSizeLabel(panel)} plan footprint. The joints between
          panels are widened so every panel reads separately.
        </div>
      )}

      {/* ── Size warning — stated rather than guessed ── */}
      {annotated && !sizeAvailable && (
        <div style={{
          marginTop: "2mm",
          fontSize: "8pt",
          fontWeight: 600,
          color: COLORS.warning,
        }}>
          {SCHEDULE_WARNING}
        </div>
      )}
    </div>
  );
}