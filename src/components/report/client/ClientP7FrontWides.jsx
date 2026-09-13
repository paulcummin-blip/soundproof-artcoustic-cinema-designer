/**
 * ClientP7FrontWides
 * -------------------
 * Visual Report PAGE — P7 Front Wide Placement
 * (RP22 Parameter 7 — Front Wide Speaker Position)
 *
 * Shows a clean plan-view diagram centred around the RSP with FL, FR, LW, RW,
 * and the median reference line. The achieved RP22 level is the headline;
 * the raw deviation angle is secondary.
 *
 * All data is consumed from the canonical authority — no local re-grading.
 */

import React from "react";
import { resolveGradeToken } from "@/components/utils/rp22Colors";
import { resolveRspLabelPlacement } from "./ClientSpeakerBalance";

const HEADING_FONT = "'Futura PT Light', 'Century Gothic', sans-serif";
const BODY_FONT = "'Didact Gothic', 'Century Gothic', sans-serif";

const FL_FR_COLOR = "#3E4349";
const LW_RW_COLOR = "#213428";
const MEDIAN_COLOR = "#8A7B6A";
const RSP_RING_COLOR = "#213428";

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

export default function ClientP7FrontWides({
  p7Data,
  roomDims,
  screenFrontPlaneM,
  screenWidthM,
  print,
  printPart,
}) {
  if (!p7Data) return null;

  const { level, maxDeviation, lwPos, rwPos, flPos, frPos, medianPoint, rsp } = p7Data;

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

  const roomTopLeft = toPx(0, 0);
  const roomBottomRight = toPx(W, L);

  // Screen geometry
  const screenY = Number(screenFrontPlaneM) || 0.2;
  const screenW = Number(screenWidthM) || 3;
  const screenLeftX = (W - screenW) / 2;
  const screenRightX = (W + screenW) / 2;
  const screenLeftPx = toPx(screenLeftX, screenY);
  const screenRightPx = toPx(screenRightX, screenY);

  // RSP
  const rspPx = rsp ? toPx(rsp.x, rsp.y) : null;

  // Speaker positions
  const lwPx = toPx(lwPos.x, lwPos.y);
  const rwPx = toPx(rwPos.x, rwPos.y);
  const flPx = flPos ? toPx(flPos.x, flPos.y) : null;
  const frPx = frPos ? toPx(frPos.x, frPos.y) : null;
  const medianPx = medianPoint ? toPx(medianPoint.x, medianPoint.y) : null;

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
            RP22 Parameter 7 — Front Wide Speaker Position
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

          {/* Median reference line from RSP through median point */}
          {rspPx && medianPx && (
            <line
              x1={rspPx.px}
              y1={rspPx.py}
              x2={medianPx.px}
              y2={medianPx.py}
              stroke={MEDIAN_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
          )}

          {/* FL / FR speakers */}
          {flPx && (
            <g>
              <circle cx={flPx.px} cy={flPx.py} r={6} fill={FL_FR_COLOR} stroke="#F8F8F7" strokeWidth={1.5} />
              <text x={flPx.px} y={flPx.py - 12} fill={FL_FR_COLOR} fontSize={11} textAnchor="middle" fontFamily={BODY_FONT} fontWeight={600}>
                FL
              </text>
            </g>
          )}
          {frPx && (
            <g>
              <circle cx={frPx.px} cy={frPx.py} r={6} fill={FL_FR_COLOR} stroke="#F8F8F7" strokeWidth={1.5} />
              <text x={frPx.px} y={frPx.py - 12} fill={FL_FR_COLOR} fontSize={11} textAnchor="middle" fontFamily={BODY_FONT} fontWeight={600}>
                FR
              </text>
            </g>
          )}

          {/* LW / RW speakers — with actual-angle rays from RSP */}
          {rspPx && lwPx && (
            <line
              x1={rspPx.px}
              y1={rspPx.py}
              x2={lwPx.px}
              y2={lwPx.py}
              stroke={LW_RW_COLOR}
              strokeWidth={1.5}
              strokeOpacity={0.4}
            />
          )}
          {rspPx && rwPx && (
            <line
              x1={rspPx.px}
              y1={rspPx.py}
              x2={rwPx.px}
              y2={rwPx.py}
              stroke={LW_RW_COLOR}
              strokeWidth={1.5}
              strokeOpacity={0.4}
            />
          )}

          {/* LW speaker */}
          <g>
            <circle cx={lwPx.px} cy={lwPx.py} r={7} fill={LW_RW_COLOR} stroke="#F8F8F7" strokeWidth={1.5} />
            <text x={lwPx.px} y={lwPx.py - 12} fill={LW_RW_COLOR} fontSize={11} textAnchor="middle" fontFamily={BODY_FONT} fontWeight={600}>
              LW
            </text>
          </g>

          {/* RW speaker */}
          <g>
            <circle cx={rwPx.px} cy={rwPx.py} r={7} fill={LW_RW_COLOR} stroke="#F8F8F7" strokeWidth={1.5} />
            <text x={rwPx.px} y={rwPx.py - 12} fill={LW_RW_COLOR} fontSize={11} textAnchor="middle" fontFamily={BODY_FONT} fontWeight={600}>
              RW
            </text>
          </g>

          {/* Median marker (small diamond at median point) */}
          {medianPx && (
            <g>
              <rect
                x={medianPx.px - 4}
                y={medianPx.py - 4}
                width={8}
                height={8}
                fill={MEDIAN_COLOR}
                transform={`rotate(45 ${medianPx.px} ${medianPx.py})`}
              />
            </g>
          )}

          {/* RSP marker */}
          {rspPx && (() => {
            const seatCircles = [
              { cx: lwPx.px, cy: lwPx.py, r: 7 },
              { cx: rwPx.px, cy: rwPx.py, r: 7 },
            ];
            const placement = resolveRspLabelPlacement(rspPx, seatCircles, [], null, { w: SVG_W, h: SVG_H }, { markerRadius: 10 });
            return (
              <g>
                <circle cx={rspPx.px} cy={rspPx.py} r={10} fill="none" stroke={RSP_RING_COLOR} strokeWidth={2} />
                <circle cx={rspPx.px} cy={rspPx.py} r={4} fill="#FFFFFF" />
                <text
                  x={placement.x}
                  y={placement.y}
                  fill={RSP_RING_COLOR}
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
        </svg>
      )}

      {showSupport && (
        <>
          {/* ── Legend ── */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 14,
            padding: "10px 16px",
            background: "#F1F0EE",
            borderRadius: 8,
            border: "1px solid #DCDBD6",
            width: "100%",
            maxWidth: print ? "100%" : 600,
            fontFamily: BODY_FONT,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width={18} height={18} viewBox="0 0 20 20">
                <line x1={10} y1={10} x2={16} y2={4} stroke={MEDIAN_COLOR} strokeWidth={2} strokeDasharray="3 2" />
              </svg>
              <span style={{ fontSize: 11, color: "#3E4349" }}>Median reference</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width={18} height={18} viewBox="0 0 20 20">
                <circle cx={10} cy={10} r={5} fill={LW_RW_COLOR} />
              </svg>
              <span style={{ fontSize: 11, color: "#3E4349" }}>Front wides</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width={18} height={18} viewBox="0 0 20 20">
                <circle cx={10} cy={10} r={5} fill={FL_FR_COLOR} />
              </svg>
              <span style={{ fontSize: 11, color: "#3E4349" }}>Screen speakers</span>
            </div>
          </div>

          {/* ── P7 level badge ── */}
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
                  P7 — {levelLabel}
                </div>
                {maxDeviation != null && (
                  <div style={{ fontSize: 12, color: "#625143", marginTop: 2 }}>
                    Maximum deviation from median: {maxDeviation.toFixed(1)}°
                  </div>
                )}
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
                  Front Wide Placement
                </div>
                <div style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5 }}>
                  The front wide speakers are positioned relative to the ideal median angle to support smooth movement between the screen and surround channels.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}