import React from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";
import { buildSpeakerInfo } from "@/components/room/speakerInfo/speakerInfoModel";

/**
 * Front and rear subwoofer side profiles for the Side Elevation.
 *
 * Extracted unchanged from SideElevation so the drawing file stays inside its
 * size limit. Behaviour, geometry and styling are exactly as before: each
 * subwoofer is drawn at its own depth and height, front subs against the front
 * wall, rear subs against the rear wall, with the vertical drag hit area that
 * commits one height change on release.
 */
export default function SideViewSubwoofers({
  frontSubs = [],
  frontSubsCfg = null,
  rearSubs = [],
  rearSubsCfg = null,
  rx,
  rz,
  roomL,
  liveSubDrag = null,
  onFrontSubHeightChange = null,
  onRearSubHeightChange = null,
  handleSubMouseDown,
  speakerInfo,
}) {
  if (typeof rx !== "function" || typeof rz !== "function") return null;

  const safeSubs = Array.isArray(frontSubs) ? frontSubs.filter((s) => s?.enabled !== false) : [];
  const safeRearSubs = Array.isArray(rearSubs) ? rearSubs.filter((s) => s?.enabled !== false) : [];
  const isDraggingFront = liveSubDrag?.group === "front";
  const isDraggingRear = liveSubDrag?.group === "rear";

  return (
    <>
      {/* Front subwoofers — side profile, sourced from frontSubs (same as FrontElevation / Plan View) */}
      {safeSubs.length > 0 && (
        <g opacity={0.88}>
          {safeSubs.map((sub, i) => {
            const orientation = sub?.orientation || frontSubsCfg?.orientation;
            const meta = getSpeakerModelMeta(sub?.model, orientation) || {};
            const subHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.40;
            const subDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.35;
            const subCentreY = Number.isFinite(sub?.position?.y) ? Number(sub.position.y) : 0.01;
            const frontX = rx(subCentreY - subDepthM / 2);
            const backX  = rx(subCentreY + subDepthM / 2);
            const svgW   = Math.max(4, backX - frontX);
            const staticBottom = Number.isFinite(sub?.bottomHeightM) ? sub.bottomHeightM
              : Number.isFinite(sub?.position?.z) ? sub.position.z - subHeightM / 2
              : 0;
            const bottomZ = isDraggingFront ? liveSubDrag.liveBottomHeightM : staticBottom;
            const topZ   = bottomZ + subHeightM;
            const svgTop = rz(topZ);
            const svgBot = rz(bottomZ);
            const svgH   = Math.max(4, svgBot - svgTop);
            const label  = `SUB${i + 1}`;
            const canDrag = !!onFrontSubHeightChange;
            return (
              <g key={`fsub-${i}`}
                onMouseDown={canDrag ? (e) => handleSubMouseDown(e, 'front', staticBottom, subHeightM) : undefined}
                style={{ cursor: canDrag ? 'ns-resize' : 'default' }}
                {...speakerInfo.bind(() => ({
                  ...buildSpeakerInfo({
                    role: label,
                    model: sub?.model,
                    acousticCentreZ_m: bottomZ + subHeightM / 2,
                    orientationOrPreset: orientation,
                    orientation,
                    extras: [Number.isFinite(bottomZ) ? `Bottom height AFF: ${Math.round(bottomZ * 100)} cm` : null],
                  }),
                  exclusions: [],
                }))}>
                <rect
                  x={frontX} y={svgTop}
                  width={svgW} height={svgH}
                  fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                {/* Front face baffle line */}
                <line
                  x1={frontX} y1={svgTop}
                  x2={frontX} y2={svgBot}
                  stroke="#4A4540" strokeWidth={1.4} />
                <text
                  x={frontX - 4} y={(svgTop + svgBot) / 2 + 3}
                  textAnchor="end" fontSize={6}
                  fill="#4A4540" fontWeight={600}>
                  {label}
                </text>
                {/* Subwoofer dimensions and bottom height are read on hover
                    or tap in the speaker information card. */}
                {canDrag && (
                  <rect
                    x={frontX - 7} y={svgTop - 7}
                    width={svgW + 14} height={svgH + 14}
                    fill="transparent" pointerEvents="all"
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) => handleSubMouseDown(e, 'front', staticBottom, subHeightM)}
                  />
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Rear subwoofers — side profile, mirroring front sub style, against rear wall */}
      {safeRearSubs.length > 0 && (
        <g opacity={0.88}>
          {safeRearSubs.map((sub, i) => {
            const orientation = sub?.orientation || rearSubsCfg?.orientation;
            const meta = getSpeakerModelMeta(sub?.model, orientation) || {};
            const subHeightM = Number(meta.heightM) > 0 ? Number(meta.heightM) : 0.40;
            const subDepthM  = Number(meta.depthM)  > 0 ? Number(meta.depthM)  : 0.35;
            const subCentreY = Number.isFinite(sub?.position?.y)
              ? Number(sub.position.y)
              : roomL - subDepthM / 2;
            const frontX = rx(subCentreY - subDepthM / 2);
            const backX  = rx(subCentreY + subDepthM / 2);
            const svgW   = Math.max(4, backX - frontX);
            const staticBottom = Number.isFinite(sub?.bottomHeightM) ? sub.bottomHeightM
              : Number.isFinite(sub?.position?.z) ? sub.position.z - subHeightM / 2
              : 0;
            const bottomZ = isDraggingRear ? liveSubDrag.liveBottomHeightM : staticBottom;
            const topZ   = bottomZ + subHeightM;
            const svgTop = rz(topZ);
            const svgBot = rz(bottomZ);
            const svgH   = Math.max(4, svgBot - svgTop);
            const label  = `RSUB${i + 1}`;
            const canDrag = !!onRearSubHeightChange;
            return (
              <g key={`rsub-${i}`}
                onMouseDown={canDrag ? (e) => handleSubMouseDown(e, 'rear', staticBottom, subHeightM) : undefined}
                style={{ cursor: canDrag ? 'ns-resize' : 'default' }}
                {...speakerInfo.bind(() => ({
                  ...buildSpeakerInfo({
                    role: label,
                    model: sub?.model,
                    acousticCentreZ_m: bottomZ + subHeightM / 2,
                    orientationOrPreset: orientation,
                    orientation,
                    extras: [Number.isFinite(bottomZ) ? `Bottom height AFF: ${Math.round(bottomZ * 100)} cm` : null],
                  }),
                  exclusions: [],
                }))}>
                <rect
                  x={frontX} y={svgTop}
                  width={svgW} height={svgH}
                  fill="#fff" stroke="#4A4540" strokeWidth={0.9} rx={1} />
                {/* Front face baffle line */}
                <line
                  x1={frontX} y1={svgTop}
                  x2={frontX} y2={svgBot}
                  stroke="#4A4540" strokeWidth={1.4} />
                <text
                  x={frontX - 4} y={(svgTop + svgBot) / 2 + 3}
                  textAnchor="end" fontSize={6}
                  fill="#4A4540" fontWeight={600}>
                  {label}
                </text>
                {/* Dimensions read on hover or tap instead of being drawn. */}
                {canDrag && (
                  <rect
                    x={frontX - 7} y={svgTop - 7}
                    width={svgW + 14} height={svgH + 14}
                    fill="transparent" pointerEvents="all"
                    style={{ cursor: 'ns-resize' }}
                    onMouseDown={(e) => handleSubMouseDown(e, 'rear', staticBottom, subHeightM)}
                  />
                )}
              </g>
            );
          })}
        </g>
      )}
    </>
  );
}