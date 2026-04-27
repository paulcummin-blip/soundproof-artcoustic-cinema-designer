import React, { useMemo } from 'react';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

const HEADING_FONT = '"Futura PT Light", "Century Gothic", sans-serif';
const BODY_FONT = '"Didact Gothic", "Century Gothic", sans-serif';

const PAGE = {
  width: 1120,
  height: 794,
  margin: 28,
  headerH: 92,
  footerH: 42,
};

const COLORS = {
  bg: '#ffffff',
  border: '#111111',
  wall: '#111111',
  screen: '#111111',
  viewable: '#8d8d8d',
  recess: '#b7b7b7',
  dimension: '#8b8b8b',
  extension: '#d3d3d3',
  speaker: '#111111',
  text: '#111111',
  muted: '#5f5f5f',
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

function resolveDims(modelName, fallbackMap, defaultDims) {
  const meta = getSpeakerModelMeta(modelName);
  const fallback = getFallbackDims(modelName, fallbackMap, defaultDims);
  return {
    widthM: finite(meta?.widthM) ? Number(meta.widthM) : fallback.widthM,
    heightM: finite(meta?.heightM) ? Number(meta.heightM) : fallback.heightM,
    depthM: finite(meta?.depthM) ? Number(meta.depthM) : fallback.depthM,
  };
}

function DimText({ x, y, text, anchor = 'middle', rotate = null }) {
  const lines = Array.isArray(text) ? text : String(text || '').split('\n');
  return (
    <text
      x={x}
      y={y}
      fontSize="9"
      fill={COLORS.text}
      textAnchor={anchor}
      fontFamily={BODY_FONT}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : 10}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function DimLine({ x1, y1, x2, y2, text, offset = 0, vertical = false, textOffset = 10 }) {
  if (vertical) {
    const dimX = x1 + offset;
    const midY = (y1 + y2) / 2;
    return (
      <g>
        <line x1={x1} y1={y1} x2={dimX} y2={y1} stroke={COLORS.extension} strokeWidth="0.8" />
        <line x1={x2} y1={y2} x2={dimX} y2={y2} stroke={COLORS.extension} strokeWidth="0.8" />
        <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke={COLORS.dimension} strokeWidth="0.8" />
        <DimText x={dimX + textOffset} y={midY - 4} text={text} anchor="start" />
      </g>
    );
  }

  const dimY = y1 + offset;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x1} y2={dimY} stroke={COLORS.extension} strokeWidth="0.8" />
      <line x1={x2} y1={y2} x2={x2} y2={dimY} stroke={COLORS.extension} strokeWidth="0.8" />
      <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke={COLORS.dimension} strokeWidth="0.8" />
      <DimText x={(x1 + x2) / 2} y={dimY - 6} text={text} />
    </g>
  );
}

function Q63FaceIcon({ x, y, size }) {
  const inset = size * 0.12;
  const driverW = size * 0.28;
  const driverH = size * 0.18;
  const centerX = x + size / 2;
  const upperY = y + size * 0.27;
  const lowerY = y + size * 0.58;

  return (
    <g>
      <rect x={x} y={y} width={size} height={size} fill="none" stroke={COLORS.speaker} strokeWidth="1" />
      <rect x={x + inset} y={y + inset} width={size - inset * 2} height={size - inset * 2} rx={8} ry={8} fill="none" stroke={COLORS.speaker} strokeWidth="0.9" />
      <line x1={centerX} y1={y + inset + 6} x2={centerX} y2={y + size - inset - 6} stroke={COLORS.speaker} strokeWidth="0.9" />
      <path d={`M ${centerX - driverW / 2} ${upperY + driverH / 2} Q ${centerX} ${upperY - driverH / 2} ${centerX + driverW / 2} ${upperY + driverH / 2}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.9" />
      <path d={`M ${centerX - driverW / 2} ${upperY + driverH / 2} Q ${centerX} ${upperY + driverH * 1.25} ${centerX + driverW / 2} ${upperY + driverH / 2}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.9" />
      <path d={`M ${centerX - driverW / 2} ${lowerY + driverH / 2} Q ${centerX} ${lowerY - driverH / 2} ${centerX + driverW / 2} ${lowerY + driverH / 2}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.9" />
      <path d={`M ${centerX - driverW / 2} ${lowerY + driverH / 2} Q ${centerX} ${lowerY + driverH * 1.25} ${centerX + driverW / 2} ${lowerY + driverH / 2}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.9" />
      <line x1={centerX - 8} y1={upperY + driverH / 2} x2={centerX + 8} y2={upperY + driverH / 2} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX - 8} y1={lowerY + driverH / 2} x2={centerX + 8} y2={lowerY + driverH / 2} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX - 4} y1={upperY + driverH / 2 - 6} x2={centerX + 4} y2={upperY + driverH / 2 - 6} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX - 4} y1={lowerY + driverH / 2 + 6} x2={centerX + 4} y2={lowerY + driverH / 2 + 6} stroke={COLORS.speaker} strokeWidth="0.8" />
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
  placedSpeakers,
  frontSubs,
}) {
  const roomW = Math.max(0.1, num(roomWidthM, 4.5));
  const roomH = Math.max(0.1, num(roomHeightM, 2.4));
  const screenViewW = Math.max(0, num(screenWidthM));
  const screenViewH = Math.max(0, num(screenHeightM));
  const screenOuterW = Math.max(screenViewW, num(screenTotalWidthM, screenViewW));
  const screenOuterH = Math.max(screenViewH, num(screenTotalHeightM, screenViewH));
  const screenBottom = num(screenBottomHeightM);
  const screenTop = finite(screenTopHeightM) ? Number(screenTopHeightM) : screenBottom + screenOuterH;

  const drawingArea = {
    x: PAGE.margin + 74,
    y: PAGE.margin + PAGE.headerH + 18,
    width: PAGE.width - PAGE.margin * 2 - 168,
    height: PAGE.height - PAGE.margin * 2 - PAGE.headerH - PAGE.footerH - 84,
  };

  const scale = Math.min(drawingArea.width / roomW, drawingArea.height / roomH);
  const wallPxW = roomW * scale;
  const wallPxH = roomH * scale;
  const wallX = drawingArea.x + (drawingArea.width - wallPxW) / 2;
  const wallY = drawingArea.y + (drawingArea.height - wallPxH) / 2;

  const mapX = (xM) => wallX + xM * scale;
  const mapY = (zM) => wallY + wallPxH - zM * scale;

  const screenOuterX = (roomW - screenOuterW) / 2;
  const screenOuterY = screenBottom;
  const screenInnerX = (roomW - screenViewW) / 2;
  const screenInnerY = (screenBottom + screenTop - screenViewH) / 2;

  const recess = {
    widthM: Math.max(0.1, screenOuterW - 0.15),
    heightM: Math.max(0.1, screenOuterH - 0.15),
  };
  recess.xM = (roomW - recess.widthM) / 2;
  recess.yM = screenBottom + (screenOuterH - recess.heightM) / 2;

  const drawnSpeakers = useMemo(() => {
    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    return list
      .filter((item) => ALLOWED_SPEAKER_ROLES.has(String(item?.role || '').toUpperCase()))
      .filter((item) => finite(item?.position?.x) && finite(item?.position?.z))
      .map((item) => ({
        role: String(item.role).toUpperCase(),
        xM: Number(item.position.x),
        zM: Number(item.position.z),
        dims: resolveDims(item.model, SPEAKER_FALLBACKS, { widthM: 0.27, heightM: 0.082, depthM: 0.082 }),
      }));
  }, [placedSpeakers]);

  const drawnSubs = useMemo(() => {
    const list = Array.isArray(frontSubs) ? frontSubs : [];
    return list
      .filter((item) => finite(item?.x) && finite(item?.z))
      .map((item, index) => ({
        label: `SUB ${index + 1}`,
        xM: Number(item.x),
        zM: Number(item.z),
        dims: resolveDims(item.model, SUB_FALLBACKS, { widthM: 0.5, heightM: 0.255, depthM: 0.255 }),
      }));
  }, [frontSubs]);

  const speakerCenterDims = useMemo(() => {
    const items = [...drawnSpeakers, ...drawnSubs]
      .filter((item) => item.role === 'FC' || item.label === 'SUB 1' || item.label === 'SUB 2')
      .sort((a, b) => a.xM - b.xM);
    return items;
  }, [drawnSpeakers, drawnSubs]);

  return (
    <div className="bg-white text-black w-full print:block" style={{ background: '#fff' }}>
      <svg
        viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
        className="w-full h-auto"
        role="img"
        aria-label="Screen wall construction detail"
      >
        <rect x="0" y="0" width={PAGE.width} height={PAGE.height} fill={COLORS.bg} />
        <rect x={PAGE.margin} y={PAGE.margin} width={PAGE.width - PAGE.margin * 2} height={PAGE.height - PAGE.margin * 2} fill="none" stroke={COLORS.border} strokeWidth="0.9" />

        <g>
          <text x={PAGE.margin + 18} y={PAGE.margin + 26} fontSize="19" fill={COLORS.text} fontWeight="600" fontFamily={HEADING_FONT}>
            SCREEN WALL CONSTRUCTION DETAIL
          </text>
          <line x1={PAGE.margin + 18} y1={PAGE.margin + 36} x2={PAGE.width - PAGE.margin - 18} y2={PAGE.margin + 36} stroke={COLORS.extension} strokeWidth="0.8" />
          <text x={PAGE.margin + 18} y={PAGE.margin + 54} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Project</text>
          <text x={PAGE.margin + 88} y={PAGE.margin + 54} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>{projectName || 'Untitled Project'}</text>
          <text x={PAGE.margin + 18} y={PAGE.margin + 70} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Client</text>
          <text x={PAGE.margin + 88} y={PAGE.margin + 70} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>{clientName || '—'}</text>
          <text x={PAGE.width - PAGE.margin - 168} y={PAGE.margin + 54} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Drawing</text>
          <text x={PAGE.width - PAGE.margin - 104} y={PAGE.margin + 54} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>SW-01</text>
          <text x={PAGE.width - PAGE.margin - 168} y={PAGE.margin + 70} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Scale</text>
          <text x={PAGE.width - PAGE.margin - 104} y={PAGE.margin + 70} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>Proportional</text>
        </g>

        <g>
          <rect x={wallX} y={wallY} width={wallPxW} height={wallPxH} fill="none" stroke={COLORS.wall} strokeWidth="1.2" />

          <DimLine x1={wallX} y1={wallY} x2={wallX + wallPxW} y2={wallY} text={[`ROOM WIDTH`, fmtM(roomW)]} offset={-26} />
          <DimLine x1={wallX} y1={wallY + wallPxH} x2={wallX} y2={wallY} text={[`ROOM`, `HEIGHT`, fmtM(roomH)]} offset={-48} vertical textOffset={12} />

          <rect
            x={mapX(recess.xM)}
            y={mapY(recess.yM + recess.heightM)}
            width={recess.widthM * scale}
            height={recess.heightM * scale}
            fill="none"
            stroke={COLORS.recess}
            strokeWidth="0.9"
            strokeDasharray="5 4"
          />

          <rect
            x={mapX(screenOuterX)}
            y={mapY(screenOuterY + screenOuterH)}
            width={screenOuterW * scale}
            height={screenOuterH * scale}
            fill="none"
            stroke={COLORS.screen}
            strokeWidth="1.1"
          />
          <rect
            x={mapX(screenInnerX)}
            y={mapY(screenInnerY + screenViewH)}
            width={screenViewW * scale}
            height={screenViewH * scale}
            fill="none"
            stroke={COLORS.viewable}
            strokeWidth="0.9"
            strokeDasharray="4 4"
          />

          <DimLine
            x1={mapX(recess.xM + recess.widthM)}
            y1={mapY(recess.yM)}
            x2={mapX(recess.xM + recess.widthM)}
            y2={mapY(recess.yM + recess.heightM)}
            text={[`RECESS`, `HEIGHT`, fmtM(recess.heightM)]}
            offset={44}
            vertical
            textOffset={10}
          />
          <DimLine
            x1={mapX(screenInnerX + screenViewW)}
            y1={mapY(screenInnerY)}
            x2={mapX(screenInnerX + screenViewW)}
            y2={mapY(screenInnerY + screenViewH)}
            text={[`IMAGE`, `HEIGHT`, fmtM(screenViewH)]}
            offset={82}
            vertical
            textOffset={10}
          />
          <DimLine
            x1={wallX + wallPxW}
            y1={mapY(0)}
            x2={wallX + wallPxW}
            y2={mapY(screenBottom)}
            text={[`SCREEN`, `BOTTOM`, fmtM(screenBottom)]}
            offset={118}
            vertical
            textOffset={10}
          />
          <DimLine
            x1={wallX + wallPxW}
            y1={mapY(0)}
            x2={wallX + wallPxW}
            y2={mapY(screenTop)}
            text={[`SCREEN`, `TOP`, fmtM(screenTop)]}
            offset={156}
            vertical
            textOffset={10}
          />

          {drawnSpeakers.map((item) => {
            const isQ63 = normalizeModelKey(item.model) === 'q6 3';
            const w = (isQ63 ? 0.28 : item.dims.widthM) * scale;
            const h = (isQ63 ? 0.28 : item.dims.heightM) * scale;
            const x = mapX(item.xM) - w / 2;
            const y = mapY(item.zM) - h / 2;
            return (
              <g key={`${item.role}-${item.xM}-${item.zM}`}>
                {isQ63 ? (
                  <Q63FaceIcon x={x} y={y} size={w} />
                ) : (
                  <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.speaker} strokeWidth="1" />
                )}
                <text x={x + w / 2} y={y - 8} fontSize="9" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>
                  {item.role}
                </text>
              </g>
            );
          })}

          {drawnSubs.map((item) => {
            const w = item.dims.widthM * scale;
            const h = item.dims.heightM * scale;
            const x = mapX(item.xM) - w / 2;
            const y = mapY(item.zM) - h / 2;
            return (
              <g key={`${item.label}-${item.xM}-${item.zM}`}>
                <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.speaker} strokeWidth="1" />
                <text x={x + w / 2} y={y + h + 11} fontSize="8.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>
                  {item.label}
                </text>
              </g>
            );
          })}

          {speakerCenterDims.map((item, index) => {
            const centerX = mapX(item.xM);
            const baseY = wallY + wallPxH;
            const offset = 30 + index * 26;
            const label = item.role === 'FC' ? ['FC CTR', fmtM(item.xM)] : [item.label, fmtM(item.xM)];
            return (
              <DimLine
                key={`${item.role || item.label}-center-dim`}
                x1={wallX}
                y1={baseY}
                x2={centerX}
                y2={baseY}
                text={label}
                offset={offset}
              />
            );
          })}
        </g>

        <g>
          <line
            x1={PAGE.margin + 18}
            y1={PAGE.height - PAGE.margin - PAGE.footerH}
            x2={PAGE.width - PAGE.margin - 18}
            y2={PAGE.height - PAGE.margin - PAGE.footerH}
            stroke={COLORS.extension}
            strokeWidth="0.8"
          />
          <text x={PAGE.margin + 18} y={PAGE.height - PAGE.margin - PAGE.footerH + 14} fontSize="8.5" fill={COLORS.muted} fontFamily={BODY_FONT}>
            Construction drawing is generated from the current room, screen, speaker and subwoofer data. Re-check dimensions if product selection or mounting method changes.
          </text>
        </g>
      </svg>
    </div>
  );
}