import React, { useMemo } from 'react';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import { Q43FaceIcon, Q45FaceIcon, Q63FaceIcon, Q85FaceIcon } from '@/components/report/SpeakerFaceIcons';
import { yHalfExtentM_physical } from '@/components/room/rv/RenderPrimitives';
import { calculateAzimuth } from '@/components/utils/aimingUtils';
import { SCREEN_BUFFER_M } from '@/components/room/rv/utils/rvGeometry';

const HEADING_FONT = '"Futura PT Light", "Century Gothic", sans-serif';
const BODY_FONT = '"Didact Gothic", "Century Gothic", sans-serif';

const PAGE = { width: 794, height: 1120, margin: 28 };

const COLORS = {
  bg: '#ffffff',
  border: '#111111',
  wall: '#111111',
  screen: '#111111',
  viewable: '#8d8d8d',
  dimension: '#8b8b8b',
  extension: '#d3d3d3',
  speaker: '#111111',
  text: '#111111',
  muted: '#5f5f5f',
  bandFill: '#111111',
  bandStroke: '#8b8b8b',
  schedBorder: '#d3d3d3',
  schedHeader: '#f5f5f5',
  schedAlt: '#fafafa',
  panelBorder: '#d3d3d3',
  panelBg: '#fafafa',
};

const SPEAKER_FALLBACKS = {
  'evolve 2 1': { widthM: 0.2, heightM: 0.082, depthM: 0.082 },
  'evolve 3 1': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve 4 2': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve 6 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'evolve 8 4': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q4 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q6 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q4 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'spitfire q8 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q4 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q6 3': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q4 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
  'q8 5': { widthM: 0.27, heightM: 0.082, depthM: 0.082 },
};

const SUB_FALLBACKS = {
  'sub2-12': { widthM: 0.5, heightM: 0.255, depthM: 0.255 },
  'sub3-12': { widthM: 0.6, heightM: 0.255, depthM: 0.255 },
  'sub4-12': { widthM: 0.44, heightM: 0.27, depthM: 0.27 },
  'sub 2-12': { widthM: 0.5, heightM: 0.255, depthM: 0.255 },
  'sub 3-12': { widthM: 0.6, heightM: 0.255, depthM: 0.255 },
  'sub 4-12': { widthM: 0.44, heightM: 0.27, depthM: 0.27 },
};

const ALLOWED_SPEAKER_ROLES = new Set(['FL', 'FC', 'FR', 'FCL', 'FCR']);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function finite(v) {
  return Number.isFinite(Number(v));
}

function fmtM(v) {
  return `${num(v).toFixed(2)}m`;
}

function fmtMm(m) {
  return `${Math.round(num(m) * 1000)}mm`;
}

function fmtDeg(deg) {
  const d = num(deg);
  if (Math.abs(d) < 0.05) return '0°';
  return `${d > 0 ? '+' : ''}${d.toFixed(1)}°`;
}

function normalizeModelKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFallbackDims(modelName, fallbackMap, defaultDims) {
  const key = normalizeModelKey(modelName);
  return fallbackMap[key] || defaultDims;
}

function resolveDims(modelName, fallbackMap, defaultDims, orientation) {
  const meta = getSpeakerModelMeta(modelName, orientation);
  const fallback = getFallbackDims(modelName, fallbackMap, defaultDims);
  return {
    widthM: finite(meta?.widthM) ? Number(meta.widthM) : fallback.widthM,
    heightM: finite(meta?.heightM) ? Number(meta.heightM) : fallback.heightM,
    depthM: finite(meta?.depthM) ? Number(meta.depthM) : fallback.depthM,
  };
}

function DimText({ x, y, text, anchor = 'middle', rotate = null, withBackground = false }) {
  const lines = Array.isArray(text) ? text : String(text || '').split('\n');
  const lineHeight = 10;
  const maxChars = lines.reduce((max, line) => Math.max(max, String(line).length), 0);
  const boxWidth = Math.max(44, maxChars * 4.8 + 10);
  const boxHeight = Math.max(14, lines.length * lineHeight + 6);
  const boxX = anchor === 'start' ? x - 3 : anchor === 'end' ? x - boxWidth + 3 : x - boxWidth / 2;
  const boxY = y - 8;

  return (
    <g transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>
      {withBackground && (
        <rect x={boxX} y={boxY} width={boxWidth} height={boxHeight} fill="#ffffff" fillOpacity="0.92" />
      )}
      <text x={x} y={y} fontSize="8" fill={COLORS.text} textAnchor={anchor} fontFamily={BODY_FONT}>
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function DimLine({ x1, y1, x2, y2, text, offset = 0, vertical = false, textOffset = 10, textY = null, textBackground = false, textRotate = null }) {
  if (vertical) {
    const dimX = x1 + offset;
    const midY = textY ?? (y1 + y2) / 2;
    return (
      <g>
        <line x1={x1} y1={y1} x2={dimX} y2={y1} stroke={COLORS.extension} strokeWidth="0.5" />
        <line x1={x2} y1={y2} x2={dimX} y2={y2} stroke={COLORS.extension} strokeWidth="0.5" />
        <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke={COLORS.dimension} strokeWidth="0.7" />
        <DimText x={dimX + textOffset} y={midY - 4} text={text} anchor="start" rotate={textRotate} withBackground={textBackground} />
      </g>
    );
  }

  const dimY = y1 + offset;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x1} y2={dimY} stroke={COLORS.extension} strokeWidth="0.5" />
      <line x1={x2} y1={y2} x2={x2} y2={dimY} stroke={COLORS.extension} strokeWidth="0.5" />
      <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke={COLORS.dimension} strokeWidth="0.7" />
      <DimText x={(x1 + x2) / 2} y={dimY - 6} text={text} withBackground={textBackground} />
    </g>
  );
}

function canonicalScreenRole(role) {
  const r = String(role || '').trim().toUpperCase();
  if (r === 'C' || r === 'CENTER' || r === 'CENTRE') return 'FC';
  if (r === 'L' || r === 'LEFT') return 'FL';
  if (r === 'R' || r === 'RIGHT') return 'FR';
  return r;
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
  screenFrontPlaneM,
  placedSpeakers,
  frontSubs,
  frontSubsCfg,
  primarySeatingPosition,
  lcrAimMode,
  speakerClearanceM,
}) {
  const roomW = Math.max(0.1, num(roomWidthM, 4.5));
  const roomH = Math.max(0.1, num(roomHeightM, 2.4));
  const screenViewW = Math.max(0, num(screenWidthM));
  const screenViewH = Math.max(0, num(screenHeightM));
  const screenOuterW = Math.max(screenViewW, num(screenTotalWidthM, screenViewW));
  const screenOuterH = Math.max(screenViewH, num(screenTotalHeightM, screenViewH));
  const screenBottom = num(screenBottomHeightM);
  const screenTop = finite(screenTopHeightM) ? Number(screenTopHeightM) : screenBottom + screenOuterH;
  const frontPlane = num(screenFrontPlaneM, 0);
  const minAllowed = SCREEN_BUFFER_M;

  const drawArea = { x: 40, y: 200, width: 500, height: 380 };
  const scale = Math.min(drawArea.width / roomW, drawArea.height / roomH);
  const wallPxW = roomW * scale;
  const wallPxH = roomH * scale;
  const wallX = drawArea.x + (drawArea.width - wallPxW) / 2;
  const wallY = drawArea.y + (drawArea.height - wallPxH) / 2;

  const mapX = (xM) => wallX + xM * scale;
  const mapY = (zM) => wallY + wallPxH - zM * scale;

  const borderX = Math.max(0, (screenOuterW - screenViewW) / 2);
  const borderY = Math.max(0, (screenOuterH - screenViewH) / 2);
  const screenInnerX = (roomW - screenViewW) / 2;
  const screenInnerBottom = screenBottom;
  const screenInnerTop = screenTop;
  const screenOuterX = screenInnerX - borderX;
  const screenOuterY = screenInnerBottom - borderY;
  const screenOuterTop = screenInnerTop + borderY;

  const bandBottom = screenBottom + screenViewH / 3;
  const bandTop = screenBottom + (screenViewH * 2) / 3;

  const drawnSpeakers = useMemo(() => {
    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const roleMap = new Map();
    const aim = String(lcrAimMode || 'flat').toLowerCase();
    list
      .filter((item) => finite(item?.position?.x) && finite(item?.position?.z))
      .forEach((item) => {
        const canon = canonicalScreenRole(item?.role);
        if (!ALLOWED_SPEAKER_ROLES.has(canon)) return;
        const pos = item.position;
        let yaw = 0;
        if (aim === 'angled' && primarySeatingPosition && Number.isFinite(primarySeatingPosition.x) && Number.isFinite(primarySeatingPosition.y)) {
          yaw = calculateAzimuth(pos, { x: primarySeatingPosition.x, y: primarySeatingPosition.y }) ?? 0;
        }
        roleMap.set(canon, {
          role: canon,
          model: item.model || '—',
          xM: Number(pos.x),
          yM: Number(pos.y),
          zM: Number(pos.z),
          yaw,
          dims: resolveDims(item.model, SPEAKER_FALLBACKS, { widthM: 0.27, heightM: 0.082, depthM: 0.082 }),
        });
      });
    return Array.from(roleMap.values());
  }, [placedSpeakers, lcrAimMode, primarySeatingPosition]);

  const { sharedLcrZM, minXM, maxXM } = useMemo(() => {
    if (drawnSpeakers.length === 0) return { sharedLcrZM: null, minXM: null, maxXM: null };
    const xs = drawnSpeakers.map(s => s.xM);
    const leftMost = drawnSpeakers.find(s => s.xM === Math.min(...xs));
    const rightMost = drawnSpeakers.find(s => s.xM === Math.max(...xs));
    const leftZ = leftMost && Number.isFinite(leftMost.zM) ? leftMost.zM : null;
    const rightZ = rightMost && Number.isFinite(rightMost.zM) ? rightMost.zM : null;
    let z = null;
    if (leftZ !== null && rightZ !== null) z = (leftZ + rightZ) / 2;
    else if (leftZ !== null) z = leftZ;
    else if (rightZ !== null) z = rightZ;
    return { sharedLcrZM: z, minXM: leftMost ? leftMost.xM : null, maxXM: rightMost ? rightMost.xM : null };
  }, [drawnSpeakers]);

  const drawnSubs = useMemo(() => {
    const list = Array.isArray(frontSubs) ? frontSubs : [];
    return list
      .filter((item) => {
        const x = Number.isFinite(item?.x) ? item.x : item?.position?.x;
        const z = Number.isFinite(item?.z) ? item.z : item?.position?.z;
        return Number.isFinite(x) && Number.isFinite(z);
      })
      .map((item, index) => {
        const x = Number.isFinite(item?.x) ? item.x : item?.position?.x;
        const z = Number.isFinite(item?.z) ? item.z : item?.position?.z;
        const bottomHeightM = Number(item?.bottomHeightM);
        const orientation = item?.orientation || frontSubsCfg?.orientation;
        return {
          label: `SUB${index + 1}`,
          model: item.model || `SUB ${index + 1}`,
          xM: Number(x),
          zM: Number(z),
          bottomHeightM: Number.isFinite(bottomHeightM)
            ? bottomHeightM
            : Number.isFinite(Number(frontSubsCfg?.bottomHeightM))
              ? Number(frontSubsCfg.bottomHeightM)
              : 0.05,
          dims: resolveDims(item.model, SUB_FALLBACKS, { widthM: 0.6, heightM: 0.255, depthM: 0.255 }, orientation),
        };
      });
  }, [frontSubs, frontSubsCfg?.orientation, frontSubsCfg?.bottomHeightM]);

  const lcrClearance = useMemo(() => {
    if (!Number.isFinite(frontPlane) || drawnSpeakers.length === 0) return null;
    let minClearance = Infinity;
    drawnSpeakers.forEach((s) => {
      if (!Number.isFinite(s.yM)) return;
      const halfExtent = yHalfExtentM_physical(s.dims.depthM, s.dims.widthM, s.yaw);
      const nearestFrontY = s.yM + halfExtent;
      const c = frontPlane - nearestFrontY;
      if (Number.isFinite(c) && c < minClearance) minClearance = c;
    });
    return Number.isFinite(minClearance) ? minClearance : null;
  }, [drawnSpeakers, frontPlane]);

  const sortedByX = useMemo(() => [...drawnSpeakers].sort((a, b) => a.xM - b.xM), [drawnSpeakers]);

  const scheduleRows = useMemo(() => {
    const rows = [];
    const roleOrder = ['FL', 'FC', 'FR'];
    roleOrder.forEach((role) => {
      const s = drawnSpeakers.find(sp => sp.role === role);
      if (s) {
        rows.push({
          role,
          model: s.model,
          dims: `${Math.round(s.dims.widthM * 1000)} × ${Math.round(s.dims.heightM * 1000)} × ${Math.round(s.dims.depthM * 1000)}`,
          centreX: fmtM(s.xM),
          centreH: fmtM(s.zM),
          yaw: fmtDeg(s.yaw),
        });
      } else {
        rows.push({ role, model: '—', dims: '—', centreX: '—', centreH: '—', yaw: '—' });
      }
    });
    const sub = drawnSubs[0];
    if (sub) {
      rows.push({
        role: sub.label,
        model: sub.model,
        dims: `${Math.round(sub.dims.widthM * 1000)} × ${Math.round(sub.dims.heightM * 1000)} × ${Math.round(sub.dims.depthM * 1000)}`,
        centreX: fmtM(sub.xM),
        centreH: fmtM(sub.bottomHeightM + sub.dims.heightM / 2),
        yaw: '—',
      });
    } else {
      rows.push({ role: 'SUB1', model: '—', dims: '—', centreX: '—', centreH: '—', yaw: '—' });
    }
    return rows;
  }, [drawnSpeakers, drawnSubs]);

  const cols = [
    { label: 'ROLE', w: 70 },
    { label: 'MODEL', w: 160 },
    { label: 'W × H × D (mm)', w: 170 },
    { label: 'CENTRE X', w: 100 },
    { label: 'CENTRE HEIGHT', w: 110 },
    { label: 'YAW', w: 90 },
  ];
  const tableX = PAGE.margin + 18;
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const rowH = 26;
  const tableStartY = 800;
  const colX = cols.map((c, i) => tableX + cols.slice(0, i).reduce((s, cc) => s + cc.w, 0));

  return (
    <div className="bg-white text-black w-full print:block" style={{ background: '#fff' }}>
      <svg viewBox={`0 0 ${PAGE.width} ${PAGE.height}`} className="w-full h-auto" role="img" aria-label="Screen wall construction detail">
        <rect x="0" y="0" width={PAGE.width} height={PAGE.height} fill={COLORS.bg} />
        <rect x={PAGE.margin} y={PAGE.margin} width={PAGE.width - PAGE.margin * 2} height={PAGE.height - PAGE.margin * 2} fill="none" stroke={COLORS.border} strokeWidth="0.9" />

        {/* Header */}
        <g>
          <text x={PAGE.margin + 18} y={PAGE.margin + 26} fontSize="18" fill={COLORS.text} fontWeight="600" fontFamily={HEADING_FONT}>
            SCREEN WALL CONSTRUCTION DETAIL
          </text>
          <line x1={PAGE.margin + 18} y1={PAGE.margin + 36} x2={PAGE.width - PAGE.margin - 18} y2={PAGE.margin + 36} stroke={COLORS.extension} strokeWidth="0.8" />
          <text x={PAGE.margin + 18} y={PAGE.margin + 54} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Project</text>
          <text x={PAGE.margin + 78} y={PAGE.margin + 54} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>{projectName}</text>
          <text x={PAGE.margin + 18} y={PAGE.margin + 70} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Client</text>
          <text x={PAGE.margin + 78} y={PAGE.margin + 70} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>{clientName}</text>
          <text x={PAGE.width - PAGE.margin - 200} y={PAGE.margin + 54} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Drawing</text>
          <text x={PAGE.width - PAGE.margin - 120} y={PAGE.margin + 54} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>SW-01</text>
          <text x={PAGE.width - PAGE.margin - 200} y={PAGE.margin + 70} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Status</text>
          <text x={PAGE.width - PAGE.margin - 120} y={PAGE.margin + 70} fontSize="9" fill={COLORS.text} fontFamily={BODY_FONT} fontWeight="600">NOT FOR SCALING</text>
        </g>

        {/* Drawing label */}
        <text x={wallX + wallPxW / 2} y={drawArea.y - 10} fontSize="10" fill={COLORS.muted} textAnchor="middle" fontFamily={BODY_FONT} letterSpacing="1.2">
          FRONT ELEVATION
        </text>

        {/* Top horizontal dimensions (3 nested) */}
        <DimLine x1={wallX} y1={wallY} x2={wallX + wallPxW} y2={wallY} text={['ROOM WIDTH', fmtM(roomW)]} offset={-62} textBackground />
        <DimLine x1={mapX(screenOuterX)} y1={wallY} x2={mapX(screenOuterX + screenOuterW)} y2={wallY} text={['OVERALL SCREEN WIDTH', fmtM(screenOuterW)]} offset={-40} textBackground />
        <DimLine x1={mapX(screenInnerX)} y1={wallY} x2={mapX(screenInnerX + screenViewW)} y2={wallY} text={['VIEWABLE IMAGE WIDTH', fmtM(screenViewW)]} offset={-18} textBackground />

        {/* Room boundary (strong) */}
        <rect x={wallX} y={wallY} width={wallPxW} height={wallPxH} fill="none" stroke={COLORS.wall} strokeWidth="1.4" />

        {/* Overall screen (medium solid) */}
        <rect x={mapX(screenOuterX)} y={mapY(screenOuterTop)} width={screenOuterW * scale} height={screenOuterH * scale} fill="none" stroke={COLORS.screen} strokeWidth="1.1" />

        {/* Viewable image (subtle dashed) */}
        <rect x={mapX(screenInnerX)} y={mapY(screenInnerTop)} width={screenViewW * scale} height={screenViewH * scale} fill="none" stroke={COLORS.viewable} strokeWidth="0.8" strokeDasharray="4 4" />

        {/* Acoustic centre band (light dashed/tinted) */}
        <rect x={mapX(screenInnerX)} y={mapY(bandTop)} width={screenViewW * scale} height={(bandTop - bandBottom) * scale} fill={COLORS.bandFill} fillOpacity="0.04" stroke={COLORS.bandStroke} strokeWidth="0.5" strokeDasharray="3 3" />
        <text x={mapX(screenInnerX + screenViewW / 2)} y={mapY(bandTop) - 6} fontSize="7.5" fill={COLORS.muted} textAnchor="middle" fontFamily={BODY_FONT}>
          Acoustic centre band
        </text>

        {/* Right vertical dimensions (5 staggered) */}
        <DimLine x1={wallX + wallPxW} y1={mapY(0)} x2={wallX + wallPxW} y2={mapY(roomH)} text={['ROOM HEIGHT', fmtM(roomH)]} offset={40} vertical textOffset={8} textY={mapY(roomH / 2)} textRotate={-90} textBackground />
        <DimLine x1={mapX(screenOuterX + screenOuterW)} y1={mapY(screenOuterY)} x2={mapX(screenOuterX + screenOuterW)} y2={mapY(screenOuterTop)} text={['OVERALL SCREEN HEIGHT', fmtM(screenOuterH)]} offset={80} vertical textOffset={8} textY={mapY((screenOuterY + screenOuterTop) / 2)} textRotate={-90} textBackground />
        <DimLine x1={mapX(screenInnerX + screenViewW)} y1={mapY(screenInnerBottom)} x2={mapX(screenInnerX + screenViewW)} y2={mapY(screenInnerTop)} text={['VIEWABLE IMAGE HEIGHT', fmtM(screenViewH)]} offset={120} vertical textOffset={8} textY={mapY((screenInnerBottom + screenInnerTop) / 2)} textRotate={-90} textBackground />
        <DimLine x1={wallX + wallPxW} y1={mapY(0)} x2={wallX + wallPxW} y2={mapY(screenTop)} text={['SCREEN TOP', fmtM(screenTop)]} offset={160} vertical textOffset={8} textY={mapY(screenTop / 2)} textRotate={-90} textBackground />
        <DimLine x1={wallX + wallPxW} y1={mapY(0)} x2={wallX + wallPxW} y2={mapY(screenBottom)} text={['SCREEN BOTTOM', fmtM(screenBottom)]} offset={200} vertical textOffset={8} textY={mapY(screenBottom / 2)} textRotate={-90} textBackground />

        {/* Speakers */}
        {drawnSpeakers.map((item) => {
          const modelKey = normalizeModelKey(item.model);
          const isQ63 = modelKey.includes('q6 3');
          const isQ43 = modelKey.includes('q4 3');
          const isQ45 = modelKey.includes('q4 5');
          const isQ85 = modelKey.includes('q8 5');
          const w = (isQ63 ? 0.28 : isQ43 ? 0.28 : isQ45 ? 0.5 : isQ85 ? 0.5 : item.dims.widthM) * scale;
          const h = (isQ63 ? 0.28 : isQ43 ? 0.21 : isQ45 ? 0.4 : isQ85 ? 0.6 : item.dims.heightM) * scale;
          const x = mapX(item.xM) - w / 2;
          const drawZM = sharedLcrZM !== null && minXM !== null && maxXM !== null && item.xM >= minXM && item.xM <= maxXM ? sharedLcrZM : item.zM;
          const y = mapY(drawZM) - h / 2;
          return (
            <g key={`${item.role}-${item.xM}-${item.zM}`}>
              {isQ63 ? <Q63FaceIcon x={x} y={y} width={w} height={h} /> :
               isQ43 ? <Q43FaceIcon x={x} y={y} width={w} height={h} /> :
               isQ45 ? <Q45FaceIcon x={x} y={y} width={w} height={h} /> :
               isQ85 ? <Q85FaceIcon x={x} y={y} width={w} height={h} /> :
               <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.speaker} strokeWidth="1" />}
              <text x={x + w / 2} y={y - 6} fontSize="8" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT} fontWeight="600">
                {item.role}
              </text>
            </g>
          );
        })}

        {/* Subwoofers */}
        {drawnSubs.map((item) => {
          const w = item.dims.widthM * scale;
          const bottomM = Number.isFinite(item.bottomHeightM) ? item.bottomHeightM : 0.05;
          const h = item.dims.heightM * scale;
          const y = mapY(bottomM) - h;
          const x = mapX(item.xM) - w / 2;
          return (
            <g key={`${item.label}-${item.xM}-${item.zM}`}>
              <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.speaker} strokeWidth="1.1" />
              <text x={x + w / 2} y={y - 6} fontSize="8" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT} fontWeight="600">
                {item.label}
              </text>
            </g>
          );
        })}

        {/* Bottom horizontal positioning chain */}
        {sortedByX.length > 0 && (() => {
          const baseY = wallY + wallPxH;
          const chain = [];
          const points = [
            { x: wallX },
            ...sortedByX.map(s => ({ x: mapX(s.xM) })),
            { x: wallX + wallPxW },
          ];
          for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const dist = p2.x - p1.x;
            if (dist < 1) continue;
            const distM = dist / scale;
            const offset = i % 2 === 0 ? 28 : 48;
            chain.push(
              <DimLine key={`chain-${i}`} x1={p1.x} y1={baseY} x2={p2.x} y2={baseY} text={fmtM(distM)} offset={offset} textBackground />
            );
          }
          return chain;
        })()}

        {/* Screen data block */}
        <g>
          <rect x={PAGE.margin + 18} y={670} width={340} height={100} fill={COLORS.panelBg} stroke={COLORS.panelBorder} strokeWidth="0.5" />
          <text x={PAGE.margin + 28} y={688} fontSize="9" fill={COLORS.text} fontFamily={BODY_FONT} fontWeight="600" letterSpacing="0.8">SCREEN DATA</text>
          {[
            ['Viewable W × H', `${fmtM(screenViewW)} × ${fmtM(screenViewH)}`],
            ['Overall W × H', `${fmtM(screenOuterW)} × ${fmtM(screenOuterH)}`],
            ['Viewable bottom', fmtM(screenBottom)],
            ['Viewable top', fmtM(screenTop)],
            ['Screen front plane', fmtM(frontPlane)],
          ].map(([label, value], i) => (
            <g key={label}>
              <text x={PAGE.margin + 28} y={704 + i * 13} fontSize="8.5" fill={COLORS.muted} fontFamily={BODY_FONT}>{label}</text>
              <text x={PAGE.margin + 180} y={704 + i * 13} fontSize="8.5" fill={COLORS.text} fontFamily={BODY_FONT}>{value}</text>
            </g>
          ))}
        </g>

        {/* LCR clearance */}
        <g>
          <rect x={PAGE.width - PAGE.margin - 358} y={670} width={340} height={100} fill={COLORS.panelBg} stroke={COLORS.panelBorder} strokeWidth="0.5" />
          <text x={PAGE.width - PAGE.margin - 348} y={688} fontSize="9" fill={COLORS.text} fontFamily={BODY_FONT} fontWeight="600" letterSpacing="0.8">LCR TO SCREEN CLEARANCE</text>
          <text x={PAGE.width - PAGE.margin - 348} y={712} fontSize="8.5" fill={COLORS.muted} fontFamily={BODY_FONT}>Actual minimum</text>
          <text x={PAGE.width - PAGE.margin - 198} y={712} fontSize="8.5" fill={COLORS.text} fontFamily={BODY_FONT} fontWeight="600">{lcrClearance !== null ? fmtMm(lcrClearance) : '—'}</text>
          <text x={PAGE.width - PAGE.margin - 348} y={730} fontSize="8.5" fill={COLORS.muted} fontFamily={BODY_FONT}>Minimum allowed</text>
          <text x={PAGE.width - PAGE.margin - 198} y={730} fontSize="8.5" fill={COLORS.text} fontFamily={BODY_FONT} fontWeight="600">{fmtMm(minAllowed)}</text>
        </g>

        {/* Equipment schedule */}
        <g>
          <text x={PAGE.margin + 18} y={790} fontSize="10" fill={COLORS.text} fontFamily={HEADING_FONT} fontWeight="600" letterSpacing="0.8">SCREEN WALL EQUIPMENT SCHEDULE</text>
          <rect x={tableX} y={tableStartY} width={tableW} height={rowH} fill={COLORS.schedHeader} stroke={COLORS.schedBorder} strokeWidth="0.5" />
          {cols.map((c, i) => (
            <text key={c.label} x={colX[i] + c.w / 2} y={tableStartY + rowH / 2 + 3} fontSize="8.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT} fontWeight="600">{c.label}</text>
          ))}
          {scheduleRows.map((row, i) => {
            const y = tableStartY + (i + 1) * rowH;
            return (
              <g key={row.role}>
                <rect x={tableX} y={y} width={tableW} height={rowH} fill={i % 2 === 0 ? 'none' : COLORS.schedAlt} stroke={COLORS.schedBorder} strokeWidth="0.5" />
                <text x={colX[0] + cols[0].w / 2} y={y + rowH / 2 + 3} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT} fontWeight="600">{row.role}</text>
                <text x={colX[1] + cols[1].w / 2} y={y + rowH / 2 + 3} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>{row.model}</text>
                <text x={colX[2] + cols[2].w / 2} y={y + rowH / 2 + 3} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>{row.dims}</text>
                <text x={colX[3] + cols[3].w / 2} y={y + rowH / 2 + 3} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>{row.centreX}</text>
                <text x={colX[4] + cols[4].w / 2} y={y + rowH / 2 + 3} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>{row.centreH}</text>
                <text x={colX[5] + cols[5].w / 2} y={y + rowH / 2 + 3} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>{row.yaw}</text>
              </g>
            );
          })}
          {drawnSubs[0] && (
            <text x={tableX} y={tableStartY + (scheduleRows.length + 1) * rowH + 12} fontSize="8" fill={COLORS.muted} fontFamily={BODY_FONT}>
              {drawnSubs[0].label} bottom height: {fmtM(drawnSubs[0].bottomHeightM)}
            </text>
          )}
        </g>

        {/* Notes */}
        <g>
          <line x1={PAGE.margin + 18} y1={PAGE.height - PAGE.margin - 48} x2={PAGE.width - PAGE.margin - 18} y2={PAGE.height - PAGE.margin - 48} stroke={COLORS.extension} strokeWidth="0.8" />
          <text x={PAGE.margin + 18} y={PAGE.height - PAGE.margin - 34} fontSize="8" fill={COLORS.text} fontFamily={BODY_FONT} fontWeight="600">NOTES</text>
          <text x={PAGE.margin + 18} y={PAGE.height - PAGE.margin - 20} fontSize="7.5" fill={COLORS.muted} fontFamily={BODY_FONT}>
            <tspan x={PAGE.margin + 18} dy="0">Dimensions govern. Verify dimensions on site before construction.</tspan>
            <tspan x={PAGE.margin + 18} dy="11">Speaker and sub positions are generated from the current design. Acoustic centres should remain within the indicated band where practical.</tspan>
            <tspan x={PAGE.margin + 18} dy="11">Angle speakers toward the RSP where mounting permits.</tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}