import React from 'react';
import { getSpeakerModelMeta, normaliseModelKey } from '@/components/models/speakers/registry';

const PALETTE = {
  line: '#6B7280',
  outline: '#374151',
  light: '#D1D5DB',
  lighter: '#E5E7EB',
  text: '#1F2937',
  subtext: '#6B7280',
  recess: '#9CA3AF',
  screenBorder: '#111827',
  fillLight: '#F9FAFB',
};

const SPEAKER_ROLES = ['FL', 'FCL', 'FC', 'FCR', 'FR'];
const FALLBACK_DIMS = {
  'evolve-2-1': { widthM: 0.2, heightM: 0.082, depthM: 0.082 },
  'evolve-3-1': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve-4-2': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve-6-3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve-8-4': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q4-3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q6-3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q4-5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q8-5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'sub2-12': { widthM: 0.5, heightM: 0.255, depthM: 0.255 },
  'sub3-12': { widthM: 0.6, heightM: 0.255, depthM: 0.255 },
  'sub4-12': { widthM: 0.44, heightM: 0.27, depthM: 0.27 },
};

function fmtM(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} m` : '—';
}

function getModelDims(model) {
  const meta = getSpeakerModelMeta(model);
  if (meta && !meta.notFound) {
    return {
      widthM: Number(meta.widthM) || null,
      heightM: Number(meta.heightM) || null,
      depthM: Number(meta.depthM) || null,
    };
  }
  const key = normaliseModelKey(model);
  return FALLBACK_DIMS[key] || { widthM: 0.27, heightM: 0.082, depthM: 0.082 };
}

function makeElevationTransform(roomWidthM, roomHeightM, width, height, pad) {
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const scale = Math.min(usableW / roomWidthM, usableH / roomHeightM);
  const drawW = roomWidthM * scale;
  const drawH = roomHeightM * scale;
  const offsetX = pad + (usableW - drawW) / 2;
  const offsetY = pad + (usableH - drawH) / 2;
  return {
    scale,
    x: (roomX) => offsetX + roomX * scale,
    y: (roomZ) => offsetY + drawH - roomZ * scale,
    left: offsetX,
    top: offsetY,
    drawW,
    drawH,
  };
}

function makeIsoTransform(originX, originY, scale) {
  return {
    point: (depth, height) => ({
      x: originX + depth * scale,
      y: originY - height * scale + depth * scale * 0.45,
    }),
  };
}

function getSpeakerCenterZ(speaker, dims) {
  const posZ = Number(speaker?.position?.z);
  if (Number.isFinite(posZ)) return posZ;
  return null;
}

function getFrontSubsResolved(frontSubs, frontSubsCfg) {
  if (Array.isArray(frontSubs) && frontSubs.length) return frontSubs;
  if (Array.isArray(frontSubsCfg?.positions) && frontSubsCfg.positions.length) {
    return frontSubsCfg.positions.map((pos, index) => ({
      id: `front-sub-${index + 1}`,
      model: frontSubsCfg?.model,
      position: pos,
    }));
  }
  return [];
}

function DimensionLine({ x1, y1, x2, y2, label, textOffset = -6, dashed = false }) {
  const vertical = Math.abs(x1 - x2) < 0.01;
  const horizontal = Math.abs(y1 - y2) < 0.01;
  const textX = vertical ? x1 + 6 : (x1 + x2) / 2;
  const textY = horizontal ? y1 + textOffset : (y1 + y2) / 2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PALETTE.line} strokeWidth={0.8} strokeDasharray={dashed ? '4 3' : undefined} />
      {horizontal && (
        <>
          <line x1={x1} y1={y1 - 4} x2={x1} y2={y1 + 4} stroke={PALETTE.line} strokeWidth={0.8} />
          <line x1={x2} y1={y2 - 4} x2={x2} y2={y2 + 4} stroke={PALETTE.line} strokeWidth={0.8} />
          <text x={textX} y={textY} fontSize={10} fill={PALETTE.subtext} textAnchor="middle">{label}</text>
        </>
      )}
      {vertical && (
        <>
          <line x1={x1 - 4} y1={y1} x2={x1 + 4} y2={y1} stroke={PALETTE.line} strokeWidth={0.8} />
          <line x1={x2 - 4} y1={y2} x2={x2 + 4} y2={y2} stroke={PALETTE.line} strokeWidth={0.8} />
          <text x={textX} y={textY} fontSize={10} fill={PALETTE.subtext} textAnchor="start">{label}</text>
        </>
      )}
    </g>
  );
}

export default function ScreenWallConstructionGraphic({
  projectName,
  clientName,
  roomWidthM,
  roomHeightM,
  screenWidthM,
  screenHeightM,
  screenTotalWidthM,
  screenTotalHeightM,
  screenBottomHeightM,
  screenTopHeightM,
  placedSpeakers = [],
  frontSubsCfg,
  rearSubsCfg,
  frontSubs = [],
  rearSubs = [],
}) {
  if (!Number.isFinite(roomWidthM) || !Number.isFinite(roomHeightM)) return null;

  const svgW = 760;
  const svgH = 980;
  const elevationBox = { x: 0, y: 0, w: 760, h: 620 };
  const isoOrigin = { x: 170, y: 875 };
  const elevation = makeElevationTransform(roomWidthM, roomHeightM, elevationBox.w, elevationBox.h, 56);

  const screenCenterX = roomWidthM / 2;
  const screenCenterZ = (screenBottomHeightM + screenTopHeightM) / 2;
  const screenOuterLeft = screenCenterX - screenTotalWidthM / 2;
  const screenOuterRight = screenCenterX + screenTotalWidthM / 2;
  const screenOuterBottom = screenCenterZ - screenTotalHeightM / 2;
  const screenOuterTop = screenCenterZ + screenTotalHeightM / 2;
  const screenInnerLeft = screenCenterX - screenWidthM / 2;
  const screenInnerRight = screenCenterX + screenWidthM / 2;
  const recessWidth = screenTotalWidthM - 0.15;
  const recessHeight = screenTotalHeightM - 0.15;
  const recessLeft = screenCenterX - recessWidth / 2;
  const recessRight = screenCenterX + recessWidth / 2;
  const recessBottom = screenCenterZ - recessHeight / 2;
  const recessTop = screenCenterZ + recessHeight / 2;

  const screenSpeakers = placedSpeakers
    .filter((speaker) => SPEAKER_ROLES.includes(String(speaker?.role || '').toUpperCase()))
    .filter((speaker) => Number.isFinite(speaker?.position?.x))
    .map((speaker) => ({
      ...speaker,
      dims: getModelDims(speaker.model),
      centerZ: getSpeakerCenterZ(speaker, getModelDims(speaker.model)),
    }))
    .filter((speaker) => Number.isFinite(speaker.centerZ));

  const resolvedFrontSubs = getFrontSubsResolved(frontSubs, frontSubsCfg)
    .filter((sub) => Number.isFinite(sub?.position?.x))
    .map((sub, index) => ({
      ...sub,
      dims: getModelDims(sub.model || frontSubsCfg?.model),
      label: `SUB ${index + 1}`,
    }))
    .filter((sub) => Number.isFinite(sub?.position?.z));

  const fl = screenSpeakers.find((s) => String(s.role).toUpperCase() === 'FL');
  const fc = screenSpeakers.find((s) => String(s.role).toUpperCase() === 'FC');
  const fr = screenSpeakers.find((s) => String(s.role).toUpperCase() === 'FR');
  const centreDims = [];
  if (fl && fc) centreDims.push({ a: fl, b: fc, label: fmtM(Math.abs(fc.position.x - fl.position.x)) });
  if (fc && fr) centreDims.push({ a: fc, b: fr, label: fmtM(Math.abs(fr.position.x - fc.position.x)) });

  const frontDepths = [
    ...screenSpeakers.map((speaker) => Number(speaker?.dims?.depthM)).filter(Number.isFinite),
    ...resolvedFrontSubs.map((sub) => Number(sub?.dims?.depthM)).filter(Number.isFinite),
  ];
  const chamberDepth = (frontDepths.length ? Math.max(...frontDepths) : 0.082) + 0.02;
  const iso = makeIsoTransform(isoOrigin.x, isoOrigin.y, 230);
  const wallBottomLeft = iso.point(0, 0);
  const wallBottomRight = { x: wallBottomLeft.x + roomWidthM * 60, y: wallBottomLeft.y };
  const wallTopLeft = iso.point(0, roomHeightM * 0.35);
  const screenPlaneFront = iso.point(0, 0);
  const screenPlaneTop = iso.point(0, screenTotalHeightM * 0.45);
  const speakerPlaneFront = iso.point(chamberDepth, 0);
  const speakerPlaneTop = iso.point(chamberDepth, screenTotalHeightM * 0.45);

  return (
    <div style={{ width: '100%', background: '#FFFFFF', color: PALETTE.text, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, borderBottom: `1px solid ${PALETTE.lighter}`, paddingBottom: 6 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: PALETTE.text, letterSpacing: '0.02em' }}>Screen Wall Construction Detail</div>
          {(projectName || clientName) && (
            <div style={{ fontSize: 9, color: PALETTE.subtext, marginTop: 2 }}>
              {projectName && <span style={{ fontWeight: 600 }}>{projectName}</span>}
              {projectName && clientName && <span style={{ margin: '0 6px', color: PALETTE.light }}>|</span>}
              {clientName && <span>{clientName}</span>}
            </div>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ display: 'block' }}>
        <rect x="0" y="0" width={svgW} height={svgH} fill="#FFFFFF" />

        <text x="56" y="34" fontSize="12" fill={PALETTE.subtext}>Front elevation</text>
        <rect
          x={elevation.x(roomWidthM * 0)}
          y={elevation.y(roomHeightM)}
          width={elevation.drawW}
          height={elevation.drawH}
          fill={PALETTE.fillLight}
          stroke={PALETTE.outline}
          strokeWidth="1"
        />

        <line x1={elevation.left} y1={elevation.y(0)} x2={elevation.left + elevation.drawW} y2={elevation.y(0)} stroke={PALETTE.outline} strokeWidth="1" />
        <line x1={elevation.left} y1={elevation.y(roomHeightM)} x2={elevation.left + elevation.drawW} y2={elevation.y(roomHeightM)} stroke={PALETTE.outline} strokeWidth="1" />
        <text x={elevation.left + 4} y={elevation.y(0) - 8} fontSize="10" fill={PALETTE.subtext}>floor</text>
        <text x={elevation.left + 4} y={elevation.y(roomHeightM) - 8} fontSize="10" fill={PALETTE.subtext}>ceiling</text>

        <DimensionLine x1={elevation.left} y1={elevation.y(0) + 28} x2={elevation.left + elevation.drawW} y2={elevation.y(0) + 28} label={`room width ${fmtM(roomWidthM)}`} />
        <DimensionLine x1={elevation.left - 28} y1={elevation.y(0)} x2={elevation.left - 28} y2={elevation.y(roomHeightM)} label={`room height ${fmtM(roomHeightM)}`} />

        <rect
          x={elevation.x(recessLeft)}
          y={elevation.y(recessTop)}
          width={(recessRight - recessLeft) * elevation.scale}
          height={(recessTop - recessBottom) * elevation.scale}
          fill="none"
          stroke={PALETTE.recess}
          strokeWidth="0.9"
          strokeDasharray="6 4"
        />
        <text x={elevation.x(recessRight) + 8} y={elevation.y(recessTop) + 10} fontSize="10" fill={PALETTE.subtext}>sound chamber recess</text>
        <DimensionLine x1={elevation.x(recessLeft)} y1={elevation.y(recessBottom) + 22} x2={elevation.x(recessRight)} y2={elevation.y(recessBottom) + 22} label={`recess width ${fmtM(recessWidth)}`} />
        <DimensionLine x1={elevation.x(recessRight) + 24} y1={elevation.y(recessBottom)} x2={elevation.x(recessRight) + 24} y2={elevation.y(recessTop)} label={`recess height ${fmtM(recessHeight)}`} />

        <rect
          x={elevation.x(screenOuterLeft)}
          y={elevation.y(screenOuterTop)}
          width={(screenOuterRight - screenOuterLeft) * elevation.scale}
          height={(screenOuterTop - screenOuterBottom) * elevation.scale}
          fill="#FFFFFF"
          stroke={PALETTE.screenBorder}
          strokeWidth="1.2"
        />
        <rect
          x={elevation.x(screenInnerLeft)}
          y={elevation.y(screenTopHeightM)}
          width={(screenInnerRight - screenInnerLeft) * elevation.scale}
          height={(screenTopHeightM - screenBottomHeightM) * elevation.scale}
          fill="#F3F4F6"
          stroke={PALETTE.outline}
          strokeWidth="0.8"
        />
        <DimensionLine x1={elevation.x(screenInnerLeft)} y1={elevation.y(screenBottomHeightM) - 18} x2={elevation.x(screenInnerRight)} y2={elevation.y(screenBottomHeightM) - 18} label={`viewable screen width ${fmtM(screenWidthM)}`} />
        <DimensionLine x1={elevation.x(screenInnerRight) + 28} y1={elevation.y(screenBottomHeightM)} x2={elevation.x(screenInnerRight) + 28} y2={elevation.y(screenTopHeightM)} label={`viewable screen height ${fmtM(screenHeightM)}`} />
        <DimensionLine x1={elevation.x(screenOuterLeft) - 24} y1={elevation.y(0)} x2={elevation.x(screenOuterLeft) - 24} y2={elevation.y(screenBottomHeightM)} label={`screen bottom height ${fmtM(screenBottomHeightM)}`} />
        <DimensionLine x1={elevation.x(screenOuterRight) + 48} y1={elevation.y(0)} x2={elevation.x(screenOuterRight) + 48} y2={elevation.y(screenTopHeightM)} label={`screen top height ${fmtM(screenTopHeightM)}`} />

        {screenSpeakers.map((speaker) => {
          const width = Number(speaker.dims.widthM) || 0.27;
          const height = Number(speaker.dims.heightM) || 0.082;
          const left = speaker.position.x - width / 2;
          const bottom = speaker.centerZ - height / 2;
          return (
            <g key={speaker.id || speaker.role}>
              <rect
                x={elevation.x(left)}
                y={elevation.y(bottom + height)}
                width={width * elevation.scale}
                height={height * elevation.scale}
                fill="#FFFFFF"
                stroke={PALETTE.outline}
                strokeWidth="0.9"
              />
              <text x={elevation.x(speaker.position.x)} y={elevation.y(bottom + height) - 6} fontSize="10" fill={PALETTE.text} textAnchor="middle">{speaker.role}</text>
            </g>
          );
        })}

        {centreDims.map((dim, index) => (
          <DimensionLine
            key={`${dim.a.role}-${dim.b.role}`}
            x1={elevation.x(dim.a.position.x)}
            y1={elevation.y(dim.a.centerZ) - 26 - index * 16}
            x2={elevation.x(dim.b.position.x)}
            y2={elevation.y(dim.b.centerZ) - 26 - index * 16}
            label={dim.label}
          />
        ))}

        {resolvedFrontSubs.map((sub) => {
          const width = Number(sub.dims.widthM) || 0.5;
          const height = Number(sub.dims.heightM) || 0.255;
          const left = sub.position.x - width / 2;
          const bottom = sub.position.z - height / 2;
          return (
            <g key={sub.id || sub.label}>
              <rect
                x={elevation.x(left)}
                y={elevation.y(bottom + height)}
                width={width * elevation.scale}
                height={height * elevation.scale}
                fill="#FFFFFF"
                stroke={PALETTE.outline}
                strokeWidth="0.9"
              />
              <text x={elevation.x(sub.position.x)} y={elevation.y(bottom + height) - 6} fontSize="10" fill={PALETTE.text} textAnchor="middle">{sub.label}</text>
            </g>
          );
        })}

        <text x="56" y="676" fontSize="12" fill={PALETTE.subtext}>45° construction view</text>
        <line x1={wallBottomLeft.x} y1={wallBottomLeft.y} x2={wallBottomRight.x} y2={wallBottomRight.y} stroke={PALETTE.outline} strokeWidth="1" />
        <line x1={wallBottomLeft.x} y1={wallBottomLeft.y} x2={wallTopLeft.x} y2={wallTopLeft.y} stroke={PALETTE.outline} strokeWidth="1" />
        <line x1={screenPlaneFront.x + 120} y1={screenPlaneFront.y} x2={screenPlaneTop.x + 120} y2={screenPlaneTop.y} stroke={PALETTE.line} strokeWidth="0.9" />
        <line x1={speakerPlaneFront.x + 120} y1={speakerPlaneFront.y} x2={speakerPlaneTop.x + 120} y2={speakerPlaneTop.y} stroke={PALETTE.outline} strokeWidth="0.9" />
        <line x1={screenPlaneFront.x + 120} y1={screenPlaneFront.y} x2={speakerPlaneFront.x + 120} y2={speakerPlaneFront.y} stroke={PALETTE.recess} strokeWidth="0.8" strokeDasharray="4 3" />
        <line x1={screenPlaneTop.x + 120} y1={screenPlaneTop.y} x2={speakerPlaneTop.x + 120} y2={speakerPlaneTop.y} stroke={PALETTE.recess} strokeWidth="0.8" strokeDasharray="4 3" />
        <text x={screenPlaneTop.x + 110} y={screenPlaneTop.y - 10} fontSize="10" fill={PALETTE.subtext}>screen plane</text>
        <text x={speakerPlaneTop.x + 110} y={speakerPlaneTop.y - 10} fontSize="10" fill={PALETTE.subtext}>speaker/sub plane</text>
        <DimensionLine x1={screenPlaneFront.x + 120} y1={screenPlaneFront.y + 38} x2={speakerPlaneFront.x + 120} y2={speakerPlaneFront.y + 38} label={`sound chamber depth ${fmtM(chamberDepth)}`} />

        <text x="56" y="950" fontSize="9" fill={PALETTE.subtext}>
          Construction drawing is generated from the current room, screen, speaker and subwoofer data. Re-check dimensions if product selection or mounting method changes.
        </text>
      </svg>
    </div>
  );
}