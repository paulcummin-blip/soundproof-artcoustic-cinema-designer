import React, { useMemo } from "react";
import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Roles displayed in front elevation
const FRONT_ROLES = new Set(["FL", "FC", "FR", "L", "C", "R"]);
const canonFront = (role) => {
  const map = { L: "FL", C: "FC", R: "FR", FL: "FL", FC: "FC", FR: "FR" };
  return map[String(role || "").toUpperCase()] || null;
};

// Convert screen config to viewable width/height in metres
function screenDimsM(screen) {
  if (!screen) return { w: 2.54, h: 1.43 };

  // TV preset widths (inches)
  const TV_INCHES = { tv65: 55.55, tv77: 67.36, tv83: 72.52, tv100: 87.80 };
  let wInches = 0;

  if (screen.tvPresetKey && TV_INCHES[screen.tvPresetKey]) {
    wInches = TV_INCHES[screen.tvPresetKey];
  } else if (screen.manualMode && Number(screen.manualWidthM) > 0) {
    return { w: Number(screen.manualWidthM), h: Number(screen.manualHeightM) || Number(screen.manualWidthM) * (9 / 16) };
  } else {
    wInches = Number(screen.visibleWidthInches) || 100;
  }

  const wM = wInches * 0.0254;
  const ar = screen.aspectRatio === "2.35:1" ? (2.35 / 1) : (16 / 9);
  return { w: wM, h: wM / ar };
}

export default function FrontElevation({ dimensions, screen, placedSpeakers = [], frontSubs = [] }) {
  const roomW = Number(dimensions?.widthM ?? dimensions?.width) || 4.5;
  const roomH = Number(dimensions?.heightM ?? dimensions?.height) || 2.8;

  const SVG_W = 600;
  const PADDING = 36;
  const LABEL_TOP = 20; // space above for room width label
  const LABEL_LEFT = 32; // space left for room height label
  const drawW = SVG_W - PADDING * 2 - LABEL_LEFT;
  const drawH = Math.round(drawW * (roomH / roomW));
  const SVG_H = drawH + PADDING * 2 + LABEL_TOP;

  const offsetX = PADDING + LABEL_LEFT;
  const offsetY = PADDING + LABEL_TOP;

  // room-metres → SVG px
  const rx = (m) => offsetX + (m / roomW) * drawW;
  const ry = (m) => offsetY + drawH - (m / roomH) * drawH; // y=0 is floor

  // Screen
  const screenData = useMemo(() => screenDimsM(screen), [screen]);
  const screenFloorM = Number(screen?.heightFromFloorM) || 0.5;
  const screenCenterX = roomW / 2;

  // LCR speakers
  const lcrSpeakers = useMemo(() => {
    if (!Array.isArray(placedSpeakers)) return [];
    return placedSpeakers
      .filter(s => canonFront(s?.role))
      .map(s => {
        const meta = getSpeakerModelMeta(s?.model);
        const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.20;
        const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.20;
        const x = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
        const z = Number.isFinite(s?.position?.z) ? s.position.z : 1.2;
        return { role: canonFront(s.role), x, z, wM, hM, label: canonFront(s.role) };
      });
  }, [placedSpeakers, roomW]);

  // Front subs
  const subItems = useMemo(() => {
    if (!Array.isArray(frontSubs)) return [];
    return frontSubs.map((s, i) => {
      const meta = getSpeakerModelMeta(s?.model);
      const wM = (meta && !meta.notFound && meta.widthM) ? meta.widthM : 0.35;
      const hM = (meta && !meta.notFound && meta.heightM) ? meta.heightM : 0.35;
      const x = Number.isFinite(s?.position?.x) ? s.position.x : roomW / 2;
      const z = Number.isFinite(s?.position?.z) ? s.position.z : hM / 2;
      return { x, z, wM, hM, label: `SUB${i + 1}` };
    });
  }, [frontSubs, roomW]);

  // Artcoustic colour palette matching plan view
  const ROOM_FILL = "#F8F8F7";
  const ROOM_STROKE = "#213428";
  const SCREEN_FILL = "#2C2C2C";
  const SCREEN_STROKE = "#1a1a1a";
  const SPEAKER_FILL = "#213428";
  const SPEAKER_STROKE = "#213428";
  const SUB_FILL = "#625143";
  const LABEL_COLOR = "#625143";
  const DIM_COLOR = "#888";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F8F7", padding: 16 }}>
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ maxWidth: "100%", maxHeight: "100%" }}
      >
        {/* Title */}
        <text x={offsetX + drawW / 2} y={14} textAnchor="middle" fontSize={10} fontWeight={600} fill={LABEL_COLOR} letterSpacing="0.06em">
          FRONT ELEVATION
        </text>

        {/* Room rectangle */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawW}
          height={drawH}
          fill={ROOM_FILL}
          stroke={ROOM_STROKE}
          strokeWidth={1.5}
        />

        {/* Floor line (heavy) */}
        <line
          x1={offsetX}
          y1={offsetY + drawH}
          x2={offsetX + drawW}
          y2={offsetY + drawH}
          stroke={ROOM_STROKE}
          strokeWidth={3}
        />

        {/* Dimension: room width */}
        <line x1={offsetX} y1={offsetY - 10} x2={offsetX + drawW} y2={offsetY - 10} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX} y1={offsetY - 14} x2={offsetX} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX + drawW} y1={offsetY - 14} x2={offsetX + drawW} y2={offsetY - 6} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text x={offsetX + drawW / 2} y={offsetY - 13} textAnchor="middle" fontSize={9} fill={DIM_COLOR}>
          {roomW.toFixed(2)}m
        </text>

        {/* Dimension: room height (rotated left side) */}
        <line x1={offsetX - 10} y1={offsetY} x2={offsetX - 10} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY} x2={offsetX - 6} y2={offsetY} stroke={DIM_COLOR} strokeWidth={0.8} />
        <line x1={offsetX - 14} y1={offsetY + drawH} x2={offsetX - 6} y2={offsetY + drawH} stroke={DIM_COLOR} strokeWidth={0.8} />
        <text
          x={offsetX - 18}
          y={offsetY + drawH / 2}
          textAnchor="middle"
          fontSize={9}
          fill={DIM_COLOR}
          transform={`rotate(-90, ${offsetX - 18}, ${offsetY + drawH / 2})`}
        >
          {roomH.toFixed(2)}m
        </text>

        {/* Screen */}
        {(() => {
          const sw = (screenData.w / roomW) * drawW;
          const sh = (screenData.h / roomH) * drawH;
          const sx = rx(screenCenterX) - sw / 2;
          const sy = ry(screenFloorM + screenData.h);
          return (
            <g>
              <rect x={sx} y={sy} width={sw} height={sh} fill={SCREEN_FILL} stroke={SCREEN_STROKE} strokeWidth={1} rx={2} />
              <text x={rx(screenCenterX)} y={sy + sh / 2 + 4} textAnchor="middle" fontSize={8} fill="#fff" fontWeight={600}>
                SCREEN
              </text>
              <text x={rx(screenCenterX)} y={sy - 4} textAnchor="middle" fontSize={8} fill={LABEL_COLOR}>
                {(screenData.w * 100).toFixed(0)}×{(screenData.h * 100).toFixed(0)}cm
              </text>
            </g>
          );
        })()}

        {/* LCR Speakers */}
        {lcrSpeakers.map((spk) => {
          const sw = Math.max(4, (spk.wM / roomW) * drawW);
          const sh = Math.max(4, (spk.hM / roomH) * drawH);
          const sx = rx(spk.x) - sw / 2;
          const sy = ry(spk.z + spk.hM / 2);
          return (
            <g key={spk.role}>
              <rect x={sx} y={sy} width={sw} height={sh} fill={SPEAKER_FILL} stroke={SPEAKER_STROKE} strokeWidth={1} rx={1} />
              <text x={rx(spk.x)} y={sy - 3} textAnchor="middle" fontSize={8} fill={LABEL_COLOR} fontWeight={600}>
                {spk.label}
              </text>
            </g>
          );
        })}

        {/* Front subwoofers */}
        {subItems.map((sub, i) => {
          const sw = Math.max(4, (sub.wM / roomW) * drawW);
          const sh = Math.max(4, (sub.hM / roomH) * drawH);
          const sx = rx(sub.x) - sw / 2;
          const sy = ry(sub.z + sub.hM / 2);
          return (
            <g key={`sub-${i}`}>
              <rect x={sx} y={sy} width={sw} height={sh} fill={SUB_FILL} stroke={SUB_FILL} strokeWidth={1} rx={1} opacity={0.85} />
              <text x={rx(sub.x)} y={sy - 3} textAnchor="middle" fontSize={8} fill={LABEL_COLOR}>
                {sub.label}
              </text>
            </g>
          );
        })}

        {/* Empty state hint */}
        {lcrSpeakers.length === 0 && frontSubs.length === 0 && (
          <text x={offsetX + drawW / 2} y={offsetY + drawH / 2} textAnchor="middle" fontSize={11} fill={DIM_COLOR}>
            Add speakers in the Controls panel
          </text>
        )}
      </svg>
    </div>
  );
}