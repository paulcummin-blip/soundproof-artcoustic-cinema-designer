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
        <rect
          x={boxX}
          y={boxY}
          width={boxWidth}
          height={boxHeight}
          fill="#ffffff"
          fillOpacity="0.92"
        />
      )}
      <text
        x={x}
        y={y}
        fontSize="8"
        fill={COLORS.text}
        textAnchor={anchor}
        fontFamily={BODY_FONT}
      >
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

function Q43FaceIcon({ x, y, width, height }) {
  const outerInset = width * 0.008;
  const innerInsetX = width * 0.055;
  const innerInsetY = height * 0.07;
  const baffleInsetX = width * 0.285;
  const baffleInsetY = height * 0.11;
  const baffleW = width - baffleInsetX * 2;
  const baffleH = height - baffleInsetY * 2;
  const centerX = x + width / 2;
  const topY = y + baffleInsetY;
  const bottomY = topY + baffleH;
  const upperMidY = y + height * 0.33;
  const lowerMidY = y + height * 0.67;
  const driverHalfW = width * 0.11;
  const driverHalfH = height * 0.15;
  const nodeSize = Math.min(width, height) * 0.02;
  const flareInset = width * 0.12;

  const upperTop = upperMidY - driverHalfH;
  const upperBottom = upperMidY + driverHalfH;
  const lowerTop = lowerMidY - driverHalfH;
  const lowerBottom = lowerMidY + driverHalfH;

  return (
    <g>
      <rect
        x={x + outerInset}
        y={y + outerInset}
        width={width - outerInset * 2}
        height={height - outerInset * 2}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.9"
      />
      <rect
        x={x + innerInsetX}
        y={y + innerInsetY}
        width={width - innerInsetX * 2}
        height={height - innerInsetY * 2}
        rx={Math.min(width, height) * 0.06}
        ry={Math.min(width, height) * 0.06}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.8"
      />
      <rect
        x={x + baffleInsetX}
        y={y + baffleInsetY}
        width={baffleW}
        height={baffleH}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.8"
      />

      <line x1={centerX} y1={topY} x2={centerX} y2={bottomY} stroke={COLORS.speaker} strokeWidth="0.7" />

      <line x1={x + baffleInsetX} y1={topY} x2={x + flareInset} y2={y + innerInsetY + 1} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={topY} x2={x + width - flareInset} y2={y + innerInsetY + 1} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={x + baffleInsetX} y1={bottomY} x2={x + flareInset} y2={y + height - innerInsetY - 1} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={bottomY} x2={x + width - flareInset} y2={y + height - innerInsetY - 1} stroke={COLORS.speaker} strokeWidth="0.7" />

      <path d={`M ${centerX} ${upperTop} C ${centerX + driverHalfW * 0.95} ${upperTop + driverHalfH * 0.34}, ${centerX + driverHalfW * 1.08} ${upperBottom - driverHalfH * 0.34}, ${centerX} ${upperBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${upperTop} C ${centerX - driverHalfW * 0.95} ${upperTop + driverHalfH * 0.34}, ${centerX - driverHalfW * 1.08} ${upperBottom - driverHalfH * 0.34}, ${centerX} ${upperBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX + driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.34}, ${centerX + driverHalfW * 1.08} ${lowerBottom - driverHalfH * 0.34}, ${centerX} ${lowerBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX - driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.34}, ${centerX - driverHalfW * 1.08} ${lowerBottom - driverHalfH * 0.34}, ${centerX} ${lowerBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />

      <rect x={centerX - nodeSize} y={topY + nodeSize * 0.2} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={upperBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={lowerBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
    </g>
  );
}

function Q45FaceIcon({ x, y, width, height }) {
  const outerInset = width * 0.008;
  const innerInsetX = width * 0.04;
  const innerInsetY = height * 0.055;
  const topBoxX = x + width * 0.44;
  const topBoxY = y + height * 0.10;
  const topBoxW = width * 0.28;
  const topBoxH = height * 0.39;
  const bottomTopY = y + height * 0.50;
  const bottomBottomY = y + height * 0.91;
  const bottomTopLeft = x + width * 0.44;
  const bottomTopRight = x + width * 0.72;
  const bottomBottomLeft = x + width * 0.48;
  const bottomBottomRight = x + width * 0.68;
  const centerX = x + width * 0.58;
  const topUpperMidY = y + height * 0.22;
  const topLowerMidY = y + height * 0.37;
  const bottomUpperMidY = y + height * 0.63;
  const bottomLowerMidY = y + height * 0.82;
  const topDriverHalfW = width * 0.06;
  const topDriverHalfH = height * 0.10;
  const bottomUpperHalfW = width * 0.075;
  const bottomUpperHalfH = height * 0.12;
  const bottomLowerHalfW = width * 0.06;
  const bottomLowerHalfH = height * 0.09;
  const nodeSize = Math.min(width, height) * 0.015;

  const drawLens = (midY, halfW, halfH) => (
    <>
      <path d={`M ${centerX} ${midY - halfH} C ${centerX + halfW * 0.95} ${midY - halfH * 0.62}, ${centerX + halfW * 1.05} ${midY + halfH * 0.62}, ${centerX} ${midY + halfH}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${midY - halfH} C ${centerX - halfW * 0.95} ${midY - halfH * 0.62}, ${centerX - halfW * 1.05} ${midY + halfH * 0.62}, ${centerX} ${midY + halfH}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
    </>
  );

  return (
    <g>
      <rect
        x={x + outerInset}
        y={y + outerInset}
        width={width - outerInset * 2}
        height={height - outerInset * 2}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.9"
      />
      <rect
        x={x + innerInsetX}
        y={y + innerInsetY}
        width={width - innerInsetX * 2}
        height={height - innerInsetY * 2}
        rx={Math.min(width, height) * 0.05}
        ry={Math.min(width, height) * 0.05}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.8"
      />

      <rect x={topBoxX} y={topBoxY} width={topBoxW} height={topBoxH} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX} y1={topBoxY} x2={centerX} y2={topBoxY + topBoxH} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX} y1={topBoxY} x2={x + width * 0.40} y2={y + height * 0.08} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX + topBoxW} y1={topBoxY} x2={x + width * 0.77} y2={y + height * 0.08} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX} y1={topBoxY + topBoxH} x2={x + width * 0.40} y2={y + height * 0.50} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX + topBoxW} y1={topBoxY + topBoxH} x2={x + width * 0.77} y2={y + height * 0.50} stroke={COLORS.speaker} strokeWidth="0.7" />

      <line x1={bottomTopLeft} y1={bottomTopY} x2={bottomBottomLeft} y2={bottomBottomY} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={bottomTopRight} y1={bottomTopY} x2={bottomBottomRight} y2={bottomBottomY} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={bottomTopLeft} y1={bottomTopY} x2={bottomTopRight} y2={bottomTopY} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={bottomBottomLeft} y1={bottomBottomY} x2={bottomBottomRight} y2={bottomBottomY} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX} y1={bottomTopY} x2={centerX} y2={bottomBottomY} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomTopLeft} y1={bottomTopY} x2={x + width * 0.40} y2={y + height * 0.49} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomTopRight} y1={bottomTopY} x2={x + width * 0.77} y2={y + height * 0.49} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomBottomLeft} y1={bottomBottomY} x2={x + width * 0.40} y2={y + height * 0.91} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomBottomRight} y1={bottomBottomY} x2={x + width * 0.78} y2={y + height * 0.91} stroke={COLORS.speaker} strokeWidth="0.7" />

      {drawLens(topUpperMidY, topDriverHalfW, topDriverHalfH)}
      {drawLens(topLowerMidY, topDriverHalfW, topDriverHalfH)}
      {drawLens(bottomUpperMidY, bottomUpperHalfW, bottomUpperHalfH)}
      {drawLens(bottomLowerMidY, bottomLowerHalfW, bottomLowerHalfH)}

      <rect x={centerX - nodeSize} y={topBoxY + nodeSize * 0.4} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={topLowerMidY - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={bottomUpperMidY + bottomUpperHalfH - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={bottomLowerMidY + bottomLowerHalfH - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
    </g>
  );
}

function Q85FaceIcon({ x, y, width, height }) {
  const outerInset = width * 0.008;
  const innerInsetX = width * 0.04;
  const innerInsetY = height * 0.03;
  const topBoxX = x + width * 0.44;
  const topBoxTop = y + height * 0.06;
  const topBoxBottom = y + height * 0.33;
  const topBoxW = width * 0.22;
  const midBoxX = x + width * 0.41;
  const midBoxTop = y + height * 0.33;
  const midBoxBottom = y + height * 0.67;
  const midBoxW = width * 0.26;
  const bottomBoxX = x + width * 0.44;
  const bottomBoxTop = y + height * 0.67;
  const bottomBoxBottom = y + height * 0.92;
  const bottomBoxW = width * 0.22;
  const centerX = x + width * 0.55;
  const nodeSize = Math.min(width, height) * 0.013;

  const drawLens = (midY, halfW, halfH) => (
    <>
      <path d={`M ${centerX} ${midY - halfH} C ${centerX + halfW * 0.95} ${midY - halfH * 0.62}, ${centerX + halfW * 1.05} ${midY + halfH * 0.62}, ${centerX} ${midY + halfH}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${midY - halfH} C ${centerX - halfW * 0.95} ${midY - halfH * 0.62}, ${centerX - halfW * 1.05} ${midY + halfH * 0.62}, ${centerX} ${midY + halfH}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
    </>
  );

  return (
    <g>
      <rect
        x={x + outerInset}
        y={y + outerInset}
        width={width - outerInset * 2}
        height={height - outerInset * 2}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.9"
      />
      <rect
        x={x + innerInsetX}
        y={y + innerInsetY}
        width={width - innerInsetX * 2}
        height={height - innerInsetY * 2}
        rx={Math.min(width, height) * 0.04}
        ry={Math.min(width, height) * 0.04}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.8"
      />

      <line x1={x + innerInsetX} y1={y + innerInsetY} x2={x + width * 0.34} y2={y + height * 0.05} stroke={COLORS.speaker} strokeWidth="0.6" />
      <path d={`M ${x + width * 0.34} ${y + height * 0.05} Q ${x + width * 0.37} ${y + height * 0.06} ${topBoxX} ${topBoxTop}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.6" />
      <path d={`M ${bottomBoxX + bottomBoxW} ${bottomBoxBottom} Q ${x + width * 0.77} ${y + height * 0.91} ${x + width - innerInsetX} ${y + height - innerInsetY}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.6" />

      <line x1={topBoxX} y1={topBoxTop} x2={topBoxX + width * 0.02} y2={topBoxBottom} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={topBoxX + topBoxW} y1={topBoxTop} x2={topBoxX + topBoxW - width * 0.02} y2={topBoxBottom} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={topBoxX} y1={topBoxTop} x2={topBoxX + topBoxW} y2={topBoxTop} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={topBoxX + width * 0.02} y1={topBoxBottom} x2={topBoxX + topBoxW - width * 0.02} y2={topBoxBottom} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX} y1={topBoxTop} x2={centerX} y2={topBoxBottom} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX} y1={topBoxTop} x2={x + width * 0.41} y2={y + height * 0.055} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX + topBoxW} y1={topBoxTop} x2={x + width * 0.69} y2={y + height * 0.055} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX + width * 0.02} y1={topBoxBottom} x2={x + width * 0.41} y2={midBoxTop} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={topBoxX + topBoxW - width * 0.02} y1={topBoxBottom} x2={x + width * 0.69} y2={midBoxTop} stroke={COLORS.speaker} strokeWidth="0.7" />

      <rect x={midBoxX} y={midBoxTop} width={midBoxW} height={midBoxBottom - midBoxTop} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX} y1={midBoxTop} x2={centerX} y2={midBoxBottom} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={midBoxX} y1={midBoxTop} x2={x + width * 0.40} y2={midBoxTop + height * 0.02} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={midBoxX + midBoxW} y1={midBoxTop} x2={x + width * 0.68} y2={midBoxTop + height * 0.02} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={midBoxX} y1={midBoxBottom} x2={x + width * 0.40} y2={midBoxBottom - height * 0.02} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={midBoxX + midBoxW} y1={midBoxBottom} x2={x + width * 0.68} y2={midBoxBottom - height * 0.02} stroke={COLORS.speaker} strokeWidth="0.7" />

      <line x1={bottomBoxX + width * 0.02} y1={bottomBoxTop} x2={bottomBoxX} y2={bottomBoxBottom} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={bottomBoxX + bottomBoxW - width * 0.02} y1={bottomBoxTop} x2={bottomBoxX + bottomBoxW} y2={bottomBoxBottom} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={bottomBoxX + width * 0.02} y1={bottomBoxTop} x2={bottomBoxX + bottomBoxW - width * 0.02} y2={bottomBoxTop} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={bottomBoxX} y1={bottomBoxBottom} x2={bottomBoxX + bottomBoxW} y2={bottomBoxBottom} stroke={COLORS.speaker} strokeWidth="0.8" />
      <line x1={centerX} y1={bottomBoxTop} x2={centerX} y2={bottomBoxBottom} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomBoxX + width * 0.02} y1={bottomBoxTop} x2={x + width * 0.41} y2={midBoxBottom} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomBoxX + bottomBoxW - width * 0.02} y1={bottomBoxTop} x2={x + width * 0.69} y2={midBoxBottom} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomBoxX} y1={bottomBoxBottom} x2={x + width * 0.41} y2={y + height * 0.92} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={bottomBoxX + bottomBoxW} y1={bottomBoxBottom} x2={x + width * 0.69} y2={y + height * 0.92} stroke={COLORS.speaker} strokeWidth="0.7" />

      {drawLens(y + height * 0.135, width * 0.05, height * 0.06)}
      {drawLens(y + height * 0.255, width * 0.05, height * 0.06)}
      {drawLens(y + height * 0.425, width * 0.055, height * 0.065)}
      {drawLens(y + height * 0.555, width * 0.05, height * 0.055)}
      {drawLens(y + height * 0.745, width * 0.055, height * 0.065)}
      {drawLens(y + height * 0.875, width * 0.05, height * 0.06)}

      <rect x={centerX - nodeSize} y={topBoxTop + nodeSize * 0.2} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={y + height * 0.255 + height * 0.06 - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={y + height * 0.425 + height * 0.065 - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={y + height * 0.555 + height * 0.055 - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={y + height * 0.745 + height * 0.065 - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={bottomBoxBottom - nodeSize * 1.8} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
    </g>
  );
}

function Q63FaceIcon({ x, y, size }) {
  const outerInset = size * 0.005;
  const innerInset = size * 0.095;
  const baffleInsetX = size * 0.31;
  const baffleInsetY = size * 0.20;
  const baffleW = size - baffleInsetX * 2;
  const baffleH = size - baffleInsetY * 2;
  const centerX = x + size / 2;
  const topY = y + baffleInsetY;
  const bottomY = topY + baffleH;
  const upperMidY = y + size * 0.37;
  const lowerMidY = y + size * 0.63;
  const driverHalfW = size * 0.105;
  const driverHalfH = size * 0.105;
  const nodeSize = size * 0.016;

  const upperLeft = centerX - driverHalfW;
  const upperRight = centerX + driverHalfW;
  const upperTop = upperMidY - driverHalfH;
  const upperBottom = upperMidY + driverHalfH;
  const lowerTop = lowerMidY - driverHalfH;
  const lowerBottom = lowerMidY + driverHalfH;

  return (
    <g>
      <rect
        x={x + outerInset}
        y={y + outerInset}
        width={size - outerInset * 2}
        height={size - outerInset * 2}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.9"
      />
      <rect
        x={x + innerInset}
        y={y + innerInset}
        width={size - innerInset * 2}
        height={size - innerInset * 2}
        rx={size * 0.055}
        ry={size * 0.055}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.8"
      />
      <rect
        x={x + baffleInsetX}
        y={y + baffleInsetY}
        width={baffleW}
        height={baffleH}
        rx={size * 0.01}
        ry={size * 0.01}
        fill="none"
        stroke={COLORS.speaker}
        strokeWidth="0.8"
      />

      <line x1={centerX} y1={topY} x2={centerX} y2={bottomY} stroke={COLORS.speaker} strokeWidth="0.7" />

      <line x1={x + baffleInsetX} y1={topY} x2={centerX} y2={topY + size * 0.04} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={topY} x2={centerX} y2={topY + size * 0.04} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={x + baffleInsetX} y1={bottomY} x2={centerX} y2={bottomY - size * 0.04} stroke={COLORS.speaker} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={bottomY} x2={centerX} y2={bottomY - size * 0.04} stroke={COLORS.speaker} strokeWidth="0.7" />

      <path d={`M ${centerX} ${upperTop} C ${centerX + driverHalfW * 0.95} ${upperTop + driverHalfH * 0.38}, ${centerX + driverHalfW * 1.05} ${upperBottom - driverHalfH * 0.38}, ${centerX} ${upperBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${upperTop} C ${centerX - driverHalfW * 0.95} ${upperTop + driverHalfH * 0.38}, ${centerX - driverHalfW * 1.05} ${upperBottom - driverHalfH * 0.38}, ${centerX} ${upperBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX + driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.38}, ${centerX + driverHalfW * 1.05} ${lowerBottom - driverHalfH * 0.38}, ${centerX} ${lowerBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX - driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.38}, ${centerX - driverHalfW * 1.05} ${lowerBottom - driverHalfH * 0.38}, ${centerX} ${lowerBottom}`} fill="none" stroke={COLORS.speaker} strokeWidth="0.8" />

      <rect x={centerX - nodeSize} y={topY + size * 0.037 - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={upperBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={lowerBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={COLORS.speaker} strokeWidth="0.7" />
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
    x: PAGE.margin + 56,
    y: PAGE.margin + PAGE.headerH + 34,
    width: PAGE.width - PAGE.margin * 2 - 128,
    height: PAGE.height - PAGE.margin * 2 - PAGE.headerH - PAGE.footerH - 176,
  };

  const scale = Math.min(drawingArea.width / roomW, drawingArea.height / roomH);
  const wallPxW = roomW * scale;
  const wallPxH = roomH * scale;
  const wallX = drawingArea.x + (drawingArea.width - wallPxW) / 2;
  const wallY = drawingArea.y + (drawingArea.height - wallPxH) / 2;

  const mapX = (xM) => wallX + xM * scale;
  const mapY = (zM) => wallY + wallPxH - zM * scale;

  const borderX = Math.max(0, (screenOuterW - screenViewW) / 2);
  const borderY = Math.max(0, (screenOuterH - screenViewH) / 2);

  const screenInnerX = (roomW - screenViewW) / 2;
  const screenInnerBottom = screenBottom;
  const screenInnerTop = screenTop;
  const screenInnerY = screenInnerBottom;

  const screenOuterX = screenInnerX - borderX;
  const screenOuterY = screenInnerBottom - borderY;
  const screenOuterTop = screenInnerTop + borderY;

  const middleThirdBottom = screenBottom + screenViewH / 3;
  const middleThirdTop = screenBottom + (screenViewH * 2) / 3;

  const recess = {
    widthM: Math.max(0.1, screenOuterW - 0.2),
    heightM: Math.max(0.1, screenOuterH - 0.2),
  };
  recess.xM = screenOuterX + (screenOuterW - recess.widthM) / 2;
  recess.yM = screenOuterY + (screenOuterH - recess.heightM) / 2;

  const canonicalScreenRole = (role) => {
    const r = String(role || '').trim().toUpperCase();
    if (r === 'C' || r === 'CENTER' || r === 'CENTRE') return 'FC';
    if (r === 'L' || r === 'LEFT') return 'FL';
    if (r === 'R' || r === 'RIGHT') return 'FR';
    return r;
  };

  const drawnSpeakers = useMemo(() => {
    const list = Array.isArray(placedSpeakers) ? placedSpeakers : [];
    const roleMap = new Map();
    list
      .filter((item) => finite(item?.position?.x) && finite(item?.position?.z))
      .forEach((item) => {
        const canon = canonicalScreenRole(item?.role);
        if (!ALLOWED_SPEAKER_ROLES.has(canon)) return;
        roleMap.set(canon, {
          role: canon,
          model: item.model,
          xM: Number(item.position.x),
          zM: Number(item.position.z),
          dims: resolveDims(item.model, SPEAKER_FALLBACKS, { widthM: 0.27, heightM: 0.082, depthM: 0.082 }),
        });
      });
    return Array.from(roleMap.values());
  }, [placedSpeakers]);

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

        return {
          label: `SUB ${index + 1}`,
          model: item.model || `SUB ${index + 1}`,
          xM: Number(x),
          zM: Number(z),
          bottomHeightM: Number.isFinite(bottomHeightM) ? bottomHeightM : 0.05,
          dims: resolveDims(item.model, SUB_FALLBACKS, {
            widthM: 0.6,
            heightM: 0.255,
            depthM: 0.255,
          }),
        };
      });
  }, [frontSubs]);

  const sharedLcrZM = useMemo(() => {
    const fl = drawnSpeakers.find(s => s.role === 'FL');
    const fr = drawnSpeakers.find(s => s.role === 'FR');
    const flZ = fl && Number.isFinite(fl.zM) ? fl.zM : null;
    const frZ = fr && Number.isFinite(fr.zM) ? fr.zM : null;
    if (flZ !== null && frZ !== null) return (flZ + frZ) / 2;
    if (flZ !== null) return flZ;
    if (frZ !== null) return frZ;
    return null;
  }, [drawnSpeakers]);

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
          <text x={PAGE.margin + 88} y={PAGE.margin + 54} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>{projectName}</text>
          <text x={PAGE.margin + 18} y={PAGE.margin + 70} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Client</text>
          <text x={PAGE.margin + 88} y={PAGE.margin + 70} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>{clientName}</text>
          <text x={PAGE.width - PAGE.margin - 168} y={PAGE.margin + 54} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Drawing</text>
          <text x={PAGE.width - PAGE.margin - 104} y={PAGE.margin + 54} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>SW-01</text>
          <text x={PAGE.width - PAGE.margin - 168} y={PAGE.margin + 70} fontSize="10" fill={COLORS.muted} fontFamily={BODY_FONT}>Scale</text>
          <text x={PAGE.width - PAGE.margin - 104} y={PAGE.margin + 70} fontSize="10" fill={COLORS.text} fontFamily={BODY_FONT}>Proportional</text>
        </g>

        <g>
          <text
            x={wallX + wallPxW / 2}
            y={wallY - 82}
            fontSize="10"
            fill={COLORS.muted}
            textAnchor="middle"
            fontFamily={BODY_FONT}
            letterSpacing="1.2"
          >
            FRONT ELEVATION
          </text>

          <DimLine x1={wallX} y1={wallY} x2={wallX + wallPxW} y2={wallY} text={[`ROOM WIDTH`, fmtM(roomW)]} offset={-62} textBackground />
          <DimLine x1={mapX(screenOuterX)} y1={wallY} x2={mapX(screenOuterX + screenOuterW)} y2={wallY} text={[`OVERALL SCREEN WIDTH`, fmtM(screenOuterW)]} offset={-40} textBackground />
          <DimLine x1={mapX(screenInnerX)} y1={wallY} x2={mapX(screenInnerX + screenViewW)} y2={wallY} text={[`VIEWABLE IMAGE WIDTH`, fmtM(screenViewW)]} offset={-18} textBackground />

          <rect x={wallX} y={wallY} width={wallPxW} height={wallPxH} fill="none" stroke={COLORS.wall} strokeWidth="1.4" />

          <DimLine x1={wallX} y1={wallY + wallPxH} x2={wallX} y2={wallY} text={[`ROOM`, `HEIGHT`, fmtM(roomH)]} offset={-70} vertical textOffset={12} textBackground />

          <rect
            x={mapX(recess.xM)}
            y={mapY(recess.yM + recess.heightM)}
            width={recess.widthM * scale}
            height={recess.heightM * scale}
            fill="none"
            stroke={COLORS.recess}
            strokeWidth="0.7"
            strokeDasharray="5 4"
          />

          <rect
            x={mapX(screenOuterX)}
            y={mapY(screenOuterTop)}
            width={screenOuterW * scale}
            height={screenOuterH * scale}
            fill="none"
            stroke={COLORS.screen}
            strokeWidth="1.2"
          />
          <rect
            x={mapX(screenInnerX)}
            y={mapY(screenInnerTop)}
            width={screenViewW * scale}
            height={screenViewH * scale}
            fill="none"
            stroke={COLORS.viewable}
            strokeWidth="0.8"
            strokeDasharray="4 4"
          />

          <rect
            x={mapX(screenInnerX)}
            y={mapY(middleThirdTop)}
            width={screenViewW * scale}
            height={(middleThirdTop - middleThirdBottom) * scale}
            fill="#111111"
            fillOpacity="0.04"
            stroke={COLORS.dimension}
            strokeWidth="0.5"
            strokeDasharray="3 3"
          />
          <text
            x={mapX(screenInnerX + screenViewW / 2)}
            y={mapY(middleThirdTop) - 8}
            fontSize="8"
            fill={COLORS.muted}
            textAnchor="middle"
            fontFamily={BODY_FONT}
          >
            Recommended screen speaker acoustic centre band
          </text>

          <DimLine
            x1={mapX(recess.xM + recess.widthM)}
            y1={mapY(recess.yM)}
            x2={mapX(recess.xM + recess.widthM)}
            y2={mapY(recess.yM + recess.heightM)}
            text={[`RECESS HEIGHT`, fmtM(recess.heightM)]}
            offset={48}
            vertical
            textOffset={10}
            textY={mapY((recess.yM + recess.yM + recess.heightM) / 2)}
            textRotate={-90}
            textBackground
          />
          <DimLine
            x1={mapX(screenInnerX + screenViewW)}
            y1={mapY(screenInnerBottom)}
            x2={mapX(screenInnerX + screenViewW)}
            y2={mapY(screenInnerTop)}
            text={[`VIEWABLE IMAGE HEIGHT`, fmtM(screenViewH)]}
            offset={88}
            vertical
            textOffset={10}
            textY={mapY((screenInnerBottom + screenInnerTop) / 2)}
            textRotate={-90}
            textBackground
          />
          <DimLine
            x1={mapX(screenOuterX + screenOuterW)}
            y1={mapY(screenOuterY)}
            x2={mapX(screenOuterX + screenOuterW)}
            y2={mapY(screenOuterTop)}
            text={[`OVERALL SCREEN HEIGHT`, fmtM(screenOuterH)]}
            offset={128}
            vertical
            textOffset={10}
            textY={mapY((screenOuterY + screenOuterTop) / 2)}
            textRotate={-90}
            textBackground
          />
          <DimLine
            x1={wallX + wallPxW}
            y1={mapY(0)}
            x2={wallX + wallPxW}
            y2={mapY(screenTop)}
            text={[`SCREEN TOP HEIGHT`, fmtM(screenTop)]}
            offset={188}
            vertical
            textOffset={10}
            textY={mapY(screenTop / 2)}
            textRotate={-90}
            textBackground
          />
          <DimLine
            x1={wallX + wallPxW}
            y1={mapY(0)}
            x2={wallX + wallPxW}
            y2={mapY(screenBottom)}
            text={[`SCREEN BOTTOM HEIGHT`, fmtM(screenBottom)]}
            offset={228}
            vertical
            textOffset={10}
            textY={mapY(screenBottom / 2)}
            textRotate={-90}
            textBackground
          />

          {drawnSpeakers.map((item) => {
            const modelKey = normalizeModelKey(item.model);
            const isQ63 = modelKey.includes('q6 3');
            const isQ43 = modelKey.includes('q4 3');
            const isQ45 = modelKey.includes('q4 5');
            const isQ85 = modelKey.includes('q8 5');
            const w = (isQ63 ? 0.28 : isQ43 ? 0.28 : isQ45 ? 0.5 : isQ85 ? 0.5 : item.dims.widthM) * scale;
            const h = (isQ63 ? 0.28 : isQ43 ? 0.21 : isQ45 ? 0.4 : isQ85 ? 0.6 : item.dims.heightM) * scale;
            const x = mapX(item.xM) - w / 2;
            const lcrDrawZM = ['FL', 'FC', 'FR'].includes(item.role) && sharedLcrZM !== null
              ? sharedLcrZM
              : item.zM;
            const y = mapY(lcrDrawZM) - h / 2;
            return (
              <g key={`${item.role}-${item.xM}-${item.zM}`}>
                {isQ63 ? (
                  <image
                    href="https://media.base44.com/images/public/69624f294dc304ed40a57ee1/0e8cd191b_Screenshot2026-04-27at165517.png"
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : isQ43 ? (
                  <Q43FaceIcon x={x} y={y} width={w} height={h} />
                ) : isQ45 ? (
                  <Q45FaceIcon x={x} y={y} width={w} height={h} />
                ) : isQ85 ? (
                  <Q85FaceIcon x={x} y={y} width={w} height={h} />
                ) : (
                  <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.speaker} strokeWidth="1" />
                )}
                <text x={x + w / 2} y={y - 10} fontSize="8.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>
                  {item.role}
                </text>
              </g>
            );
          })}

          {drawnSubs.map((item, idx) => {
            const w = item.dims.widthM * scale;
            const bottomM = Number.isFinite(item.bottomHeightM) ? item.bottomHeightM : 0.05;
            const h = item.dims.heightM * scale;
            const y = mapY(bottomM) - h;
            const x = mapX(item.xM) - w / 2;
            const clipId = `sub-clip-${idx}`;
            // 4 lines stacked: model, W, H, D — centred vertically
            const lineHeight = 8;
            const totalTextH = 7 + lineHeight * 3; // model line + 3 dim lines
            const textStartY = y + h / 2 - totalTextH / 2 + 5;
            return (
              <g key={`${item.label}-${item.xM}-${item.zM}`}>
                <defs>
                  <clipPath id={clipId}>
                    <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} />
                  </clipPath>
                </defs>
                <rect x={x} y={y} width={w} height={h} fill="none" stroke={COLORS.speaker} strokeWidth="1.1" />
                <g clipPath={`url(#${clipId})`}>
                  <text x={x + w / 2} y={textStartY} fontSize="7.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT} fontWeight="600">
                    {item.model}
                  </text>
                  <text x={x + w / 2} y={textStartY + lineHeight} fontSize="6.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>
                    {`W ${Math.round(item.dims.widthM * 1000)}mm`}
                  </text>
                  <text x={x + w / 2} y={textStartY + lineHeight * 2} fontSize="6.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>
                    {`H ${Math.round(item.dims.heightM * 1000)}mm`}
                  </text>
                  <text x={x + w / 2} y={textStartY + lineHeight * 3} fontSize="6.5" fill={COLORS.text} textAnchor="middle" fontFamily={BODY_FONT}>
                    {`D ${Math.round(item.dims.depthM * 1000)}mm`}
                  </text>
                </g>
              </g>
            );
          })}

          {speakerCenterDims.map((item, index) => {
            const centerX = mapX(item.xM);
            const baseY = wallY + wallPxH;
            const offset = 46 + index * 24;
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
                textBackground
              />
            );
          })}
        </g>

        <g>
          <rect
            x={PAGE.margin + 18}
            y={PAGE.height - PAGE.margin - PAGE.footerH - 82}
            width="250"
            height="56"
            fill="none"
            stroke={COLORS.extension}
            strokeWidth="0.5"
          />
          <text x={PAGE.margin + 28} y={PAGE.height - PAGE.margin - PAGE.footerH - 68} fontSize="8" fill={COLORS.text} fontFamily={BODY_FONT}>
            NOTES
          </text>
          <text x={PAGE.margin + 28} y={PAGE.height - PAGE.margin - PAGE.footerH - 52} fontSize="8" fill={COLORS.muted} fontFamily={BODY_FONT}>
            <tspan x={PAGE.margin + 28} dy="0">All dimensions in metres</tspan>
            <tspan x={PAGE.margin + 28} dy="11">Speaker and sub positions based on design layout</tspan>
            <tspan x={PAGE.margin + 28} dy="11">Screen speaker acoustic centres should sit within the</tspan>
            <tspan x={PAGE.margin + 28} dy="11">middle third of the viewable image where practical.</tspan>
            <tspan x={PAGE.margin + 28} dy="11">Angle toward the RSP where mounting allows.</tspan>
          </text>

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