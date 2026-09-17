/**
 * ClientP19HeatMap
 * ----------------
 * Visual Report PAGE — Bass Performance: P19 Response Quality Heat Map
 *
 * A dedicated page showing the validated P19 spatial heat map across the room.
 * Each 30×30 grid cell is coloured by its P19 grade (L4/L3/L2/L1/FAIL) using
 * the canonical Sound Proof level colours (diluted for the spatial field).
 *
 * Overlays: room boundary, screen/front wall, actual seats (with canonical
 * P19 result markers), RSP, and subwoofer positions — kept crisp and visually
 * separate from the heat-map fill.
 *
 * Heat-map generation is lazy/background — does not block the report opening.
 * Shows a clear loading state while generating. Cached by calibration
 * fingerprint + authority version + grid size + ear height.
 *
 * Print/PDF: fits one A4 page, renders identically in preview and PDF.
 * Never exports as a blank page — shows "Map not yet generated" if not ready.
 */

import React from "react";
import { useP19HeatMap } from "./useP19HeatMap";
import { buildHeatMapSummary } from "./p19HeatMapEngine";
import { RP22_GRADE_TOKENS } from "@/components/utils/rp22Colors";
import SeatMarker from "./SeatMarker";
import { computeHaloRadiusPx, BASS_TWO_SEGMENT_LAYOUT, PRIMARY_STROKE_WIDTH } from "./seatMarkerGeometry";
import { resolveCoordinate } from "./selectClientSpeakerBalance";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";
import { Loader2 } from "lucide-react";
import P19SeatProbeTable from "./P19SeatProbeTable";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

// Diluted cell colours for the large spatial field (canonical tokens, faded)
const HEATMAP_CELL_COLORS = {
  L4: RP22_GRADE_TOKENS.L4.bg,
  L3: RP22_GRADE_TOKENS.L3.bg,
  L2: RP22_GRADE_TOKENS.L2.bg,
  L1: RP22_GRADE_TOKENS.L1.bg,
  FAIL: "rgba(74, 35, 15, 0.10)",
  NA: "#F5F4F1",
  DASH: "#F5F4F1",
};

// Legend entries (stronger colours for readability)
const LEGEND_ENTRIES = [
  { key: "L4", label: "L4", color: RP22_GRADE_TOKENS.L4.bg, border: RP22_GRADE_TOKENS.L4.border },
  { key: "L3", label: "L3", color: RP22_GRADE_TOKENS.L3.bg, border: RP22_GRADE_TOKENS.L3.border },
  { key: "L2", label: "L2", color: RP22_GRADE_TOKENS.L2.bg, border: RP22_GRADE_TOKENS.L2.border },
  { key: "L1", label: "L1", color: RP22_GRADE_TOKENS.L1.bg, border: RP22_GRADE_TOKENS.L1.border },
  { key: "FAIL", label: "FAIL", color: "rgba(74, 35, 15, 0.15)", border: RP22_GRADE_TOKENS.FAIL.border },
];

const RSP_RING_R = 8;
const RSP_DOT_R = 3;

function levelToLabel(level) {
  if (level == null) return null;
  if (level === "N/A" || level === "not_applicable") return null;
  const n = Number(level);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return `L${n}`;
  if (n === 0) return "FAIL";
  const match = String(level).match(/^L?([1-4])$/i);
  return match ? `L${match[1]}` : null;
}

function buildBassSeats(seatingPositions, p19PerSeat) {
  if (!Array.isArray(seatingPositions)) return [];
  const p19Map = new Map();
  if (Array.isArray(p19PerSeat)) {
    p19PerSeat.forEach((s) => { if (s?.seatId != null) p19Map.set(s.seatId, s); });
  }
  return seatingPositions
    .filter((s) => {
      if (!s || s.id == null) return false;
      const x = resolveCoordinate(s.x, s.position?.x);
      const y = resolveCoordinate(s.y, s.position?.y);
      return x !== null && y !== null;
    })
    .map((s, i) => {
      const x = resolveCoordinate(s.x, s.position?.x);
      const y = resolveCoordinate(s.y, s.position?.y);
      const p19Result = p19Map.get(s.id);
      return {
        id: s.id,
        label: s.label || `Seat ${i + 1}`,
        x, y,
        isPrimary: !!s.isPrimary,
        p19Level: p19Result ? levelToLabel(p19Result.level) : null,
      };
    });
}

export default function ClientP19HeatMap({
  projectId,
  versionId,
  completedBassAuthority,
  bassPerformance,
  roomDims,
  seatingPositions,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  subwooferInstances,
  earHeightM,
  print,
  printPart,
}) {
  // Resolve seat coordinates for explicit heat-map probes.
  // Each seat carries its own Z (ear height) matching the production engine's
  // convention (seat.z ?? seat.position?.z ?? seat.earHeightM ?? seat.ear_h)
  // so the heat-map evaluator computes P19 at the exact same (x, y, z) as the
  // published per-seat P19 authority.
  const seatPositions = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .filter((s) => s && s.id != null)
    .map((s) => {
      const x = resolveCoordinate(s.x, s.position?.x);
      const y = resolveCoordinate(s.y, s.position?.y);
      const z = Number(s.z ?? s.position?.z ?? s.earHeightM ?? s.ear_h);
      return { id: s.id, x, y, z: Number.isFinite(z) && z > 0 ? z : Number(earHeightM) || 1.2 };
    })
    .filter((s) => s.x !== null && s.y !== null);

  const { status, grid, gridN, error, seatProbes, rspProbe } = useP19HeatMap({
    projectId,
    versionId,
    completedBassAuthority,
    roomDims,
    subwooferInstances,
    rsp,
    earHeightM,
    seatPositions,
  });

  const W = Number(roomDims?.widthM) || 4.5;
  const L = Number(roomDims?.lengthM) || 6.0;
  const PADDING_M = 0.6;
  const totalW = W + PADDING_M * 2;
  const totalL = L + PADDING_M * 2;
  const SVG_W = 760;
  const SVG_H = Math.round(SVG_W * (totalL / totalW));
  const SCALE = SVG_W / totalW;

  const toPx = (x, y) => ({
    px: (x + PADDING_M) * SCALE,
    py: (y + PADDING_M) * SCALE,
  });

  // Screen geometry
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // RSP
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);
  const rspPx = rspValid ? toPx(rspX, rspY) : null;

  // Seats with P19 markers
  const p19PerSeat = bassPerformance?.p19?.perSeatResults || [];
  const seats = buildBassSeats(seatingPositions, p19PerSeat);
  const seatPointsPx = seats.map((seat) => toPx(seat.x, seat.y));
  const haloRadius = computeHaloRadiusPx(seatPointsPx);

  // Subwoofer positions
  const subPositions = (Array.isArray(subwooferInstances) ? subwooferInstances : [])
    .filter((s) => s && s.enabled !== false && s.position)
    .map((s) => ({
      id: s.id,
      x: Number(s.position.x) || 0,
      y: Number(s.position.y) || 0,
    }));

  // Summary
  const summary = grid && grid.length > 0 ? buildHeatMapSummary(grid, rsp, roomDims) : null;

  const showDrawing = !print || printPart !== "support";
  const showSupport = !print || printPart !== "drawing";

  const containerStyle = !print
    ? {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        padding: "32px 36px",
        background: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #DCDBD6",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        fontFamily: BODY_FONT,
      }
    : printPart === "drawing"
    ? { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }
    : printPart === "support"
    ? { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 16px", fontFamily: BODY_FONT }
    : { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "8px 16px", width: "100%", height: "100%", fontFamily: BODY_FONT };

  // ── Loading / error / not-ready states ──
  const showLoading = status === "generating" || status === "idle";
  const showError = status === "error";
  const showNotReady = print && status !== "ready";

  return (
    <div style={containerStyle}>
      {/* ── Heading hierarchy (screen only) ── */}
      {!print && (
        <div style={{ width: "100%", marginBottom: 8 }}>
          <h1 style={{
            margin: 0,
            fontSize: 34,
            fontWeight: 300,
            color: "#213428",
            letterSpacing: "0.01em",
            fontFamily: HEADING_FONT,
            textAlign: "center",
          }}>
            Bass Performance
          </h1>
          <p style={{
            margin: "6px 0 0 0",
            fontSize: 12,
            color: "#625143",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            fontFamily: BODY_FONT,
          }}>
            RP22 Parameter 19 — Response Quality Across the Room
          </p>
          <p style={{
            margin: "8px 0 0 0",
            fontSize: 13,
            color: "#3E4349",
            textAlign: "center",
            fontFamily: BODY_FONT,
            maxWidth: 600,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            Predicted bass response quality across the listening area after calibration.
          </p>
        </div>
      )}

      {showDrawing && (
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="client-report-print-svg"
          style={print && printPart === "drawing"
            ? { width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%", display: "block" }
            : print
            ? { width: "100%", height: "100%", maxHeight: "none", display: "block" }
            : { width: "100%", maxWidth: 760, height: "auto" }
          }
        >
          {/* ── Heat-map cells (rendered first, behind overlays) ── */}
          {grid && grid.length > 0 && (() => {
            const cellW = W / gridN;
            const cellH = L / gridN;
            const cells = [];
            for (let j = 0; j < gridN; j++) {
              for (let i = 0; i < (grid[0]?.length || 0); i++) {
                const cell = grid[j]?.[i];
                if (!cell) continue;
                const color = HEATMAP_CELL_COLORS[cell.grade] || HEATMAP_CELL_COLORS.NA;
                const xM = i * cellW;
                const yM = j * cellH;
                const tl = toPx(xM, yM);
                const br = toPx(xM + cellW, yM + cellH);
                cells.push(
                  <rect
                    key={`cell-${i}-${j}`}
                    x={tl.px}
                    y={tl.py}
                    width={br.px - tl.px}
                    height={br.py - tl.py}
                    fill={color}
                    stroke="none"
                  />
                );
              }
            }
            return cells;
          })()}

          {/* ── Loading overlay (inside SVG so it prints correctly) ── */}
          {(showLoading || showError || showNotReady) && (
            <g>
              <rect
                x={roomTopLeft.px}
                y={roomTopLeft.py}
                width={roomBottomRight.px - roomTopLeft.px}
                height={roomBottomRight.py - roomTopLeft.py}
                fill="#F8F8F7"
                opacity={0.92}
              />
              <text
                x={(roomTopLeft.px + roomBottomRight.px) / 2}
                y={(roomTopLeft.py + roomBottomRight.py) / 2 - 8}
                fill="#625143"
                fontSize={16}
                textAnchor="middle"
                fontFamily={BODY_FONT}
                fontWeight={600}
              >
                {showError
                  ? (error && error.includes("incomplete")
                    ? "Heat map unavailable"
                    : "Map generation error")
                  : showNotReady
                  ? "Map not yet generated"
                  : "Generating bass response map\u2026"}
              </text>
              <text
                x={(roomTopLeft.px + roomBottomRight.px) / 2}
                y={(roomTopLeft.py + roomBottomRight.py) / 2 + 16}
                fill="#8A8580"
                fontSize={11}
                textAnchor="middle"
                fontFamily={BODY_FONT}
              >
                {showError
                  ? (error && error.includes("incomplete")
                    ? "Current bass authority incomplete"
                    : error || "Please return to the project and reopen the report.")
                  : showNotReady
                  ? "The map will appear here once generation completes."
                  : "30\u00d730 grid \u00b7 P19 response quality"}
              </text>
            </g>
          )}

          {/* ── Room boundary (crisp, on top of heat map) ── */}
          <rect
            x={roomTopLeft.px}
            y={roomTopLeft.py}
            width={roomBottomRight.px - roomTopLeft.px}
            height={roomBottomRight.py - roomTopLeft.py}
            fill="none"
            stroke="#625143"
            strokeWidth={2}
          />

          {/* ── Screen / front wall marker ── */}
          <line
            x1={screenLeftPx.px}
            y1={screenLeftPx.py}
            x2={screenRightPx.px}
            y2={screenRightPx.py}
            stroke="#3E4349"
            strokeWidth={5}
          />
          <text
            x={(screenLeftPx.px + screenRightPx.px) / 2}
            y={screenLeftPx.py - 10}
            fill="#625143"
            fontSize={11}
            textAnchor="middle"
            fontFamily={BODY_FONT}
            letterSpacing="0.06em"
          >
            SCREEN
          </text>

          {/* ── Subwoofer positions (crisp squares) ── */}
          {subPositions.map((sub) => {
            const sp = toPx(sub.x, sub.y);
            return (
              <g key={sub.id}>
                <rect
                  x={sp.px - 5}
                  y={sp.py - 5}
                  width={10}
                  height={10}
                  fill="#213428"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  rx={1.5}
                />
              </g>
            );
          })}

          {/* ── Seat markers (canonical P19 result, two-segment style) ── */}
          {seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            const segments = BASS_TWO_SEGMENT_LAYOUT.map((seg) => ({
              key: seg.key,
              level: seat[`${seg.key}Level`],
              startAngle: seg.startAngle,
              endAngle: seg.endAngle,
            }));
            return (
              <SeatMarker
                key={seat.id}
                cx={sp.px}
                cy={sp.py}
                haloRadius={haloRadius}
                isPrimary={seat.isPrimary}
                segments={segments}
              />
            );
          })}

          {/* ── RSP marker ── */}
          {rspPx && (() => {
            const seatCircles = seats.map((seat) => {
              const sp = toPx(seat.x, seat.y);
              return { cx: sp.px, cy: sp.py, r: haloRadius + PRIMARY_STROKE_WIDTH };
            });
            const screenCx = (screenLeftPx.px + screenRightPx.px) / 2;
            const screenRect = {
              x1: Math.min(screenLeftPx.px, screenCx - 25),
              y1: screenLeftPx.py - 22,
              x2: Math.max(screenRightPx.px, screenCx + 25),
              y2: screenLeftPx.py + 3,
            };
            const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], screenRect, { w: SVG_W, h: SVG_H }, { markerRadius: haloRadius + PRIMARY_STROKE_WIDTH });
            return (
              <g>
                <circle cx={rspPx.px} cy={rspPx.py} r={RSP_RING_R} fill="none" stroke="#213428" strokeWidth={2.5} />
                <circle cx={rspPx.px} cy={rspPx.py} r={RSP_DOT_R} fill="#213428" />
                <text
                  x={placement.x}
                  y={placement.y}
                  fill="#213428"
                  fontSize={12}
                  textAnchor={placement.anchor}
                  dominantBaseline="middle"
                  fontWeight={600}
                  fontFamily={BODY_FONT}
                  letterSpacing="0.08em"
                >
                  RSP
                </text>
              </g>
            );
          })()}
        </svg>
      )}

      {showSupport && (
        <>
          {/* ── Legend ── */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 16,
            padding: "10px 16px",
            background: "#F1F0EE",
            borderRadius: 8,
            border: "1px solid #DCDBD6",
            width: "100%",
            maxWidth: print ? "100%" : 600,
            fontFamily: BODY_FONT,
          }}>
            {LEGEND_ENTRIES.map((entry) => (
              <div key={entry.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width={20} height={20} viewBox="0 0 20 20">
                  <rect x={3} y={3} width={14} height={14} rx={3} fill={entry.color} stroke={entry.border} strokeWidth={1.5} />
                </svg>
                <span style={{ fontSize: 12, color: "#3E4349", letterSpacing: "0.02em", fontWeight: 600 }}>
                  {entry.label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Supporting line ── */}
          <p style={{
            margin: "4px 0 0 0",
            fontSize: 11,
            color: "#8A7B6A",
            textAlign: "center",
            fontFamily: BODY_FONT,
            maxWidth: 500,
          }}>
            Higher levels indicate smoother predicted bass response across the assessed frequency band.
          </p>

          {/* ── Seat P19 parity table (heat-map vs published) ── */}
          <P19SeatProbeTable
            seatProbes={seatProbes}
            rspProbe={rspProbe}
            bassPerformance={bassPerformance}
            seatingPositions={seatingPositions}
            print={print}
          />

          {/* ── Summary ── */}
          {summary && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 20px",
              background: "#F1F0EE",
              borderRadius: 12,
              border: "1px solid #DCDBD6",
              width: "100%",
              maxWidth: print ? "100%" : 600,
              fontFamily: BODY_FONT,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5 }}>
                  {summary}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Screen-only loading / error indicator (below SVG) ── */}
      {!print && showLoading && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 20px",
          background: "#F1F0EE",
          borderRadius: 8,
          border: "1px solid #DCDBD6",
          fontFamily: BODY_FONT,
        }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#213428" }} />
          <span style={{ fontSize: 13, color: "#3E4349" }}>
            {"Generating bass response map\u2026"}
          </span>
        </div>
      )}
      {!print && showError && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 20px",
          background: "#F1F0EE",
          borderRadius: 8,
          border: "1px solid #DCDBD6",
          fontFamily: BODY_FONT,
        }}>
          <span style={{ fontSize: 13, color: error && error.includes("incomplete") ? "#625143" : "#B04040", fontWeight: 600 }}>
            {error || "Heat map generation failed"}
          </span>
        </div>
      )}
    </div>
  );
}