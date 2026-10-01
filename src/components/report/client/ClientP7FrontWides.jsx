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
import {
  parameterResultHeading,
  parameterResultDescription,
} from "./parameterResultCopy";
import { toPlanTheta } from "./p7IdealAngles";
import P7PlacementGuidance from "./P7PlacementGuidance";

import {
  REPORT_FONT_HEADING as HEADING_FONT,
  REPORT_FONT_BODY as BODY_FONT,
} from '@/components/report/typography/reportTypography';

const FL_FR_COLOR = "#3E4349";
const LW_RW_COLOR = "#213428";
const MEDIAN_COLOR = "#8A7B6A";
const SURROUND_COLOR = "#625143";
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

  const {
    level,
    maxDeviation,
    lwPos,
    rwPos,
    flPos,
    frPos,
    medianPoint,
    rsp,
    ideal,
    slPos,
    srPos,
  } = p7Data;

  const levelLabel = levelToLabel(level);
  const color = levelColor(level);

  // Result-card copy comes from the shared Visual Report authority: the pill
  // carries the level, so the card speaks it as a word and never repeats the
  // parameter number the page has already identified.
  const resultHeading = parameterResultHeading(level);
  const resultDescription = parameterResultDescription(7);

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

  // ── Ideal median position vs the actual front wide position ────────────────
  // The published P7 result carries, per side, the ideal (median) angle, the
  // actual angle and the deviation between them. The plan draws the ideal median
  // ray and the deviation arc, so the reader can see both where each front wide
  // sits and where it ideally wants to be. Drawing only — nothing is recomputed.
  const polarToSvg = (cx, cy, radiusM, thetaDeg) => {
    const rad = (thetaDeg - 90) * (Math.PI / 180);
    return {
      x: cx + radiusM * Math.cos(rad) * SCALE,
      y: cy + radiusM * Math.sin(rad) * SCALE,
    };
  };

  const publishedDeviations = [ideal?.LW?.deviation, ideal?.RW?.deviation]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const worstDeviation = publishedDeviations.length ? Math.max(...publishedDeviations) : null;

  const placementSides = [
    { key: "LW", pos: lwPos, ideal: ideal?.LW },
    { key: "RW", pos: rwPos, ideal: ideal?.RW },
  ]
    .filter((side) => side.ideal && side.pos && rspPx && rsp)
    .map((side) => {
      const idealTheta = toPlanTheta(side.ideal.targetAngle);
      const actualTheta = toPlanTheta(side.ideal.actualAngle);
      if (idealTheta == null || actualTheta == null) return null;
      const radiusM = Math.hypot(side.pos.x - rsp.x, side.pos.y - rsp.y) || 1;
      const idealPt = polarToSvg(rspPx.px, rspPx.py, radiusM, idealTheta);
      const labelPt = polarToSvg(rspPx.px, rspPx.py, radiusM + 0.4, idealTheta);
      const arcRadiusM = radiusM * 1.16;
      const arcStart = polarToSvg(rspPx.px, rspPx.py, arcRadiusM, actualTheta);
      const arcEnd = polarToSvg(rspPx.px, rspPx.py, arcRadiusM, idealTheta);
      const sweep = ((idealTheta - actualTheta) % 360 + 360) % 360;
      const arcLabelPt = polarToSvg(
        rspPx.px,
        rspPx.py,
        arcRadiusM + 0.3,
        (actualTheta + sweep / 2) % 360,
      );
      const deviation = Number(side.ideal.deviation);
      return {
        key: side.key,
        idealPt,
        labelPt,
        arcLabelPt,
        arcPath: `M ${arcStart.x} ${arcStart.y} A ${arcRadiusM * SCALE} ${arcRadiusM * SCALE} 0 ${sweep > 180 ? 1 : 0} 1 ${arcEnd.x} ${arcEnd.y}`,
        deviation: Number.isFinite(deviation) ? deviation : null,
        isWorst: Number.isFinite(deviation)
          && Number.isFinite(worstDeviation)
          && Math.abs(deviation - worstDeviation) < 0.001,
      };
    })
    .filter(Boolean);

  const showIdealMedian = placementSides.length > 0;

  // The deviation the drawing states is the published P7 result itself — the same
  // figure the result card carries — never a re-measurement of the drawn arc. It
  // is written once, on the arc of the side that sets the result; if the published
  // authority does not say which side that is, the first drawn side carries it.
  const publishedMaxDeviation = Number(maxDeviation);
  const deviationLabel = Number.isFinite(publishedMaxDeviation)
    ? `${publishedMaxDeviation.toFixed(1)}° from ideal`
    : null;
  const deviationSide = placementSides.find((side) => side.isWorst) || placementSides[0] || null;

  // The adjacent side surrounds give the median angle its far end.
  const surroundPx = [
    { pos: slPos, label: "SL" },
    { pos: srPos, label: "SR" },
  ]
    .filter((entry) => entry.pos)
    .map((entry) => ({ ...toPx(entry.pos.x, entry.pos.y), label: entry.label }));

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

  // Legend reads the same facts as the drawing: where the front wides actually
  // sit, where the ideal median position is, the median reference, the screen
  // speakers and the surrounds. The ideal entry appears only when an ideal median
  // direction was published, so the key never explains something the drawing
  // does not show.
  const legendItems = [
    {
      id: "wides",
      label: "Front wides (actual)",
      sample: <circle cx={10} cy={10} r={5} fill={LW_RW_COLOR} />,
    },
    ...(showIdealMedian ? [{
      id: "ideal",
      label: "Ideal front wide position",
      sample: (
        <rect
          x={5.5}
          y={5.5}
          width={9}
          height={9}
          fill="#FFFFFF"
          stroke={MEDIAN_COLOR}
          strokeWidth={2}
          strokeDasharray="3 2"
          transform="rotate(45 10 10)"
        />
      ),
    }] : []),
    {
      id: "median",
      label: "Median reference",
      sample: <line x1={10} y1={10} x2={16} y2={4} stroke={MEDIAN_COLOR} strokeWidth={2} strokeDasharray="3 2" />,
    },
    {
      id: "screen",
      label: "Screen speakers",
      sample: <circle cx={10} cy={10} r={5} fill={FL_FR_COLOR} />,
    },
    ...(surroundPx.length ? [{
      id: "surrounds",
      label: "Side surrounds",
      sample: <circle cx={10} cy={10} r={5} fill={SURROUND_COLOR} />,
    }] : []),
  ];

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

          {/* Median reference — the ideal median direction per side, drawn from
              the published angles. Falls back to the midpoint of the current
              front wide positions when the published angles are unavailable. */}
          {showIdealMedian
            ? placementSides.map((side) => (
                <line
                  key={`ideal-ray-${side.key}`}
                  x1={rspPx.px}
                  y1={rspPx.py}
                  x2={side.idealPt.x}
                  y2={side.idealPt.y}
                  stroke={MEDIAN_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                />
              ))
            : rspPx && medianPx && (
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

          {/* Adjacent side surrounds — the far end of the median angle */}
          {surroundPx.map((surround) => (
            <g key={`surround-${surround.label}`}>
              <circle
                cx={surround.px}
                cy={surround.py}
                r={5}
                fill={SURROUND_COLOR}
                stroke="#F8F8F7"
                strokeWidth={1.5}
              />
              <text
                x={surround.px}
                y={surround.py - 12}
                fill={SURROUND_COLOR}
                fontSize={10}
                textAnchor="middle"
                fontFamily={BODY_FONT}
                fontWeight={600}
              >
                {surround.label}
              </text>
            </g>
          ))}

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

          {/* Deviation from the ideal median position — the angular span between
              where each front wide sits and where it ideally wants to be. The side
              that sets the result carries the level colour. */}
          {placementSides.map((side) => (
            <path
              key={`deviation-${side.key}`}
              d={side.arcPath}
              fill="none"
              stroke={side.isWorst ? color : MEDIAN_COLOR}
              strokeWidth={side.isWorst ? 2.5 : 1.5}
              strokeOpacity={side.isWorst ? 0.95 : 0.6}
            />
          ))}

          {/* The published deviation, stated once — the same figure as the result
              card, so the drawing and the card can never disagree. */}
          {deviationLabel && deviationSide && (
            <text
              x={deviationSide.arcLabelPt.x}
              y={deviationSide.arcLabelPt.y}
              fill={color}
              fontSize={11}
              fontWeight={600}
              textAnchor="middle"
              fontFamily={BODY_FONT}
            >
              {deviationLabel}
            </text>
          )}

          {/* Ideal median position — where each front wide aims to be. Outlined,
              never filled solid, so it can never be read as an installed speaker. */}
          {placementSides.map((side) => (
            <g key={`ideal-marker-${side.key}`}>
              <rect
                x={side.idealPt.x - 4.5}
                y={side.idealPt.y - 4.5}
                width={9}
                height={9}
                fill="#FFFFFF"
                stroke={MEDIAN_COLOR}
                strokeWidth={2}
                strokeDasharray="3 2"
                transform={`rotate(45 ${side.idealPt.x} ${side.idealPt.y})`}
              />
              <text
                x={side.labelPt.x}
                y={side.labelPt.y}
                fill={MEDIAN_COLOR}
                fontSize={9}
                fontWeight={600}
                textAnchor="middle"
                fontFamily={BODY_FONT}
                letterSpacing="0.06em"
              >
                Ideal FW
              </text>
            </g>
          ))}

          {/* Median marker (small diamond at median point) — only when the
              published ideal angles are unavailable */}
          {!showIdealMedian && medianPx && (
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
            {legendItems.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width={18} height={18} viewBox="0 0 20 20">{item.sample}</svg>
                <span style={{ fontSize: 11, color: "#3E4349" }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* ── P7 result card — pill, level heading, official RP22 description ── */}
          {levelLabel && resultHeading && (
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
                  {resultHeading}
                </div>
                <div style={{ fontSize: 13, color: "#3E4349", marginTop: 2, lineHeight: 1.45 }}>
                  {resultDescription}
                </div>
                {maxDeviation != null && (
                  <div style={{ fontSize: 12, color: "#625143", marginTop: 2 }}>
                    Maximum deviation from median: {maxDeviation.toFixed(1)}°
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Placement guidance — where the wides sit, where they want to be ── */}
          <P7PlacementGuidance
            level={level}
            maxDeviation={maxDeviation}
            ideal={ideal}
            print={print}
          />
        </>
      )}
    </div>
  );
}