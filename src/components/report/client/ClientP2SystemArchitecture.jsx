/**
 * ClientP2SystemArchitecture
 * ---------------------------
 * Visual Report PAGE — P2 System Architecture / Spatial Resolution
 * (RP22 Parameter 2 — Number of Discrete Speaker Channels)
 *
 * Shows a clean plan-view room diagram with the actual current speaker layout,
 * a simple current-system count summary, the canonical P2 level, and an
 * upgrade path showing what additional channels would reach the next level.
 *
 * All data is consumed from the canonical authority — no local re-grading.
 */

import React from "react";
import { resolveGradeToken } from "@/components/utils/rp22Colors";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

// Speaker role colours (brand-aligned, same as P12/P13 plan)
const ROLE_COLORS = {
  FL: "#3E4349", FC: "#3E4349", FR: "#3E4349",
  SL: "#625143", SR: "#625143",
  SBL: "#4A230F", SBR: "#4A230F",
  LW: "#213428", RW: "#213428",
};

const OVERHEAD_COLOR = "#8A7B6A";
const SUB_COLOR = "#1B1A1A";

const OVERHEAD_PREFIXES = ["T", "U"];

function isOverheadRole(canonRole) {
  return OVERHEAD_PREFIXES.some((p) => canonRole.startsWith(p));
}

function isSubwooferRole(canonRole) {
  const r = canonRole.toUpperCase();
  return r === "SUB" || r.startsWith("SUB");
}

function levelToLabel(level) {
  if (level == null) return null;
  const { key } = resolveGradeToken(level);
  if (key === "FAIL") return "FAIL";
  const n = Number(level);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return `L${n}`;
  return key === "DASH" ? null : key;
}

function levelColor(lvl) {
  const { token } = resolveGradeToken(lvl);
  return token.solid ? token.border : token.text;
}

export default function ClientP2SystemArchitecture({
  p2Data,
  roomDims,
  seatingPositions,
  rsp,
  screenFrontPlaneM,
  screenWidthM,
  placedSpeakers,
  print,
  printPart,
}) {
  if (!p2Data) return null;

  const { level, discreteCount, configuration, bedCount, overheadCount, subCount, subwoofers, upgradePath } = p2Data;

  const levelLabel = levelToLabel(level);
  const color = levelColor(level);

  // Room geometry
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

  // Seats
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map((s, i) => {
      const x = Number(s.x ?? s.position?.x);
      const y = Number(s.y ?? s.position?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { id: s.id || `seat-${i}`, x, y };
    })
    .filter(Boolean);

  // Speakers for plan view
  const speakers = (Array.isArray(placedSpeakers) ? placedSpeakers : [])
    .filter((s) => s?.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y))
    .map((s) => {
      const canon = getCanonicalRole(s.role);
      return { role: canon, x: Number(s.position.x), y: Number(s.position.y) };
    });

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
            Spatial Resolution
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
            RP22 Parameter 2 — Number of Discrete Speaker Channels
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
          {/* Background */}
          <rect width={SVG_W} height={SVG_H} fill="#F8F8F7" rx={12} />

          {/* Room outline */}
          <rect
            x={roomTopLeft.px}
            y={roomTopLeft.py}
            width={roomBottomRight.px - roomTopLeft.px}
            height={roomBottomRight.py - roomTopLeft.py}
            fill="none"
            stroke="#C1B6AD"
            strokeOpacity={0.5}
            strokeWidth={2}
            rx={4}
          />

          {/* Screen */}
          <line
            x1={screenLeftPx.px}
            y1={screenLeftPx.py}
            x2={screenRightPx.px}
            y2={screenRightPx.py}
            stroke="#625143"
            strokeWidth={5}
            strokeLinecap="round"
          />
          <text
            x={(screenLeftPx.px + screenRightPx.px) / 2}
            y={screenLeftPx.py - 10}
            fill="#625143"
            fontSize={11}
            textAnchor="middle"
            fontFamily={BODY_FONT}
            letterSpacing="0.08em"
          >
            SCREEN
          </text>

          {/* Seats */}
          {seats.map((seat) => {
            const sp = toPx(seat.x, seat.y);
            return (
              <circle
                key={seat.id}
                cx={sp.px}
                cy={sp.py}
                r={6}
                fill="#625143"
                stroke="#F8F8F7"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Speakers */}
          {speakers.map((spk, i) => {
            const sp = toPx(spk.x, spk.y);
            let speakerColor = ROLE_COLORS[spk.role] || "#625143";
            if (isOverheadRole(spk.role)) speakerColor = OVERHEAD_COLOR;
            if (isSubwooferRole(spk.role)) speakerColor = SUB_COLOR;
            const isOverhead = isOverheadRole(spk.role);
            return (
              <g key={`spk-${i}`}>
                {isOverhead ? (
                  <>
                    {/* Overhead: dashed circle to indicate height */}
                    <circle
                      cx={sp.px}
                      cy={sp.py}
                      r={6}
                      fill="none"
                      stroke={speakerColor}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                    />
                    <text
                      x={sp.px}
                      y={sp.py - 12}
                      fill={speakerColor}
                      fontSize={10}
                      textAnchor="middle"
                      fontFamily={BODY_FONT}
                      fontWeight={600}
                    >
                      {spk.role}
                    </text>
                  </>
                ) : (
                  <>
                    <circle
                      cx={sp.px}
                      cy={sp.py}
                      r={6}
                      fill={speakerColor}
                      stroke="#F8F8F7"
                      strokeWidth={1.5}
                    />
                    <text
                      x={sp.px}
                      y={sp.py - 12}
                      fill={speakerColor}
                      fontSize={11}
                      textAnchor="middle"
                      fontFamily={BODY_FONT}
                      fontWeight={600}
                    >
                      {spk.role}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {/* RSP marker */}
          {rspPx && (() => {
            const seatCircles = seats.map((s) => {
              const sp = toPx(s.x, s.y);
              return { cx: sp.px, cy: sp.py, r: 6 };
            });
            const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], null, { w: SVG_W, h: SVG_H }, { markerRadius: 10 });
            return (
              <g>
                <circle cx={rspPx.px} cy={rspPx.py} r={10} fill="none" stroke="#213428" strokeWidth={2} />
                <circle cx={rspPx.px} cy={rspPx.py} r={4} fill="#FFFFFF" />
                <text
                  x={placement.x}
                  y={placement.y}
                  fill="#213428"
                  fontSize={11}
                  textAnchor={placement.anchor}
                  dominantBaseline="middle"
                  fontFamily={BODY_FONT}
                  fontWeight={600}
                  letterSpacing="0.08em"
                >
                  RSP
                </text>
              </g>
            );
          })()}

          {/* Subwoofers — rendered from canonical subwooferInstances (descriptive only).
              Presentation-only wall snap: the acoustic coordinate is preserved; only
              the rendered icon offset shifts so the outer edge touches the wall. */}
          {(Array.isArray(subwoofers) ? subwoofers : []).map((sub, i) => {
            const sp = toPx(sub.x, sub.y);
            const SUB_W = 14;
            const SUB_H = 10;
            const WALL_THRESH_M = 0.5;
            const sx = Number(sub.x);
            const sy = Number(sub.y);
            const distFront = sy;
            const distRear = L - sy;
            const distLeft = sx;
            const distRight = W - sx;
            let iconX = sp.px - SUB_W / 2;
            let iconY = sp.py - SUB_H / 2;
            let labelBelow = true;
            if (distFront <= WALL_THRESH_M && distFront <= distRear) {
              iconY = roomTopLeft.py;              // top edge against front wall
            } else if (distRear <= WALL_THRESH_M) {
              iconY = roomBottomRight.py - SUB_H;   // bottom edge against rear wall
              labelBelow = false;
            }
            if (distLeft <= WALL_THRESH_M && distLeft <= distRight) {
              iconX = roomTopLeft.px;              // left edge against left wall
            } else if (distRight <= WALL_THRESH_M) {
              iconX = roomBottomRight.px - SUB_W;   // right edge against right wall
            }
            return (
              <g key={`sub-${sub.id || i}`}>
                <rect
                  x={iconX}
                  y={iconY}
                  width={SUB_W}
                  height={SUB_H}
                  rx={2}
                  fill={SUB_COLOR}
                  stroke="#F8F8F7"
                  strokeWidth={1.5}
                />
                <text
                  x={iconX + SUB_W / 2}
                  y={labelBelow ? iconY + SUB_H + 13 : iconY - 5}
                  fill={SUB_COLOR}
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily={BODY_FONT}
                  fontWeight={600}
                  letterSpacing="0.04em"
                >
                  SUB
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {showSupport && (
        <>
          {/* ── Current system summary ── */}
          <div style={{
            width: "100%",
            maxWidth: print ? "100%" : 600,
            padding: "16px 20px",
            background: "#F1F0EE",
            borderRadius: 12,
            border: "1px solid #DCDBD6",
            fontFamily: BODY_FONT,
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#625143",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}>
              Current system
            </div>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 20px",
              fontSize: 13,
              color: "#3E4349",
            }}>
              <span>{bedCount} bed-layer speaker{bedCount !== 1 ? "s" : ""}</span>
              {overheadCount > 0 && <span>{overheadCount} overhead speaker{overheadCount !== 1 ? "s" : ""}</span>}
              <span>{subCount} subwoofer{subCount !== 1 ? "s" : ""}</span>
              {discreteCount != null && <span>{discreteCount} discrete main channel{discreteCount !== 1 ? "s" : ""}</span>}
            </div>
          </div>

          {/* ── P2 level badge ── */}
          {levelLabel && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              background: "#FFFFFF",
              borderRadius: 12,
              border: `2px solid ${color}`,
              width: "100%",
              maxWidth: print ? "100%" : 600,
              fontFamily: BODY_FONT,
            }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 8,
                background: resolveGradeToken(level).token.bg,
                border: `2px solid ${color}`,
                fontSize: 22,
                fontWeight: 700,
                color: color,
                fontFamily: HEADING_FONT,
              }}>
                {levelLabel}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#213428", fontFamily: HEADING_FONT }}>
                  P2 — {levelLabel}
                </div>
                <div style={{ fontSize: 13, color: "#3E4349", marginTop: 2 }}>
                  {configuration ? `${configuration} configuration` : "Discrete speaker configuration"}
                </div>
              </div>
            </div>
          )}

          {/* ── Already L4 ── */}
          {level === "L4" && (
            <div style={{
              width: "100%",
              maxWidth: print ? "100%" : 600,
              padding: "16px 20px",
              background: "#F5F4F1",
              borderRadius: 12,
              border: "1px solid #D9D5CE",
              fontFamily: BODY_FONT,
            }}>
              <div style={{ fontSize: 14, color: "#213428", lineHeight: 1.5 }}>
                The system meets the highest Parameter 2 level.
              </div>
            </div>
          )}

          {/* ── Summary callout (screen only) ── */}
          {!print && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              background: "#F1F0EE",
              borderRadius: 12,
              border: "1px solid #DCDBD6",
              width: "100%",
              fontFamily: BODY_FONT,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#213428", marginBottom: 4, fontFamily: HEADING_FONT }}>
                  System Architecture
                </div>
                <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5 }}>
                  {levelLabel
                    ? `The current layout achieves ${levelLabel} for RP22 Parameter 2 with ${discreteCount ?? 0} discrete speaker channels.`
                    : "Discrete speaker channel configuration."
                  }
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}