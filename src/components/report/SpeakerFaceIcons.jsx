import React from 'react';

// Shared stroke — matches COLORS.speaker in ScreenWallConstructionGraphic
const STROKE = '#111111';

// ─── Shared drawing primitives ────────────────────────────────────────────────

/** Woofer: 3 concentric circles (surround, cone, dust cap) */
function WooferCircles({ cx, cy, r1, r2, r3 }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <circle cx={cx} cy={cy} r={r3} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </>
  );
}

/** Tweeter: 2 concentric circles (flange, dome) */
function TweeterCircles({ cx, cy, r1, r2 }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </>
  );
}

/** 4 corner fixing bolts */
function CornerBolts({ x, y, w, h, inset, r }) {
  return (
    <>
      <circle cx={x + inset} cy={y + inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={x + w - inset} cy={y + inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={x + inset} cy={y + h - inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={x + w - inset} cy={y + h - inset} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
    </>
  );
}

/** 2 top/bottom centre fixing bolts (portrait cabinet style) */
function CentreBolts({ midX, topY, bottomY, r }) {
  return (
    <>
      <circle cx={midX} cy={topY} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
      <circle cx={midX} cy={bottomY} r={r} fill="none" stroke={STROKE} strokeWidth="0.6" />
    </>
  );
}

// ─── Q-Series face icons ──────────────────────────────────────────────────────

export function Q43FaceIcon({ x, y, width, height }) {
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
      <rect x={x + outerInset} y={y + outerInset} width={width - outerInset * 2} height={height - outerInset * 2} fill="none" stroke={STROKE} strokeWidth="0.9" />
      <rect x={x + innerInsetX} y={y + innerInsetY} width={width - innerInsetX * 2} height={height - innerInsetY * 2} rx={Math.min(width, height) * 0.06} ry={Math.min(width, height) * 0.06} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <rect x={x + baffleInsetX} y={y + baffleInsetY} width={baffleW} height={baffleH} fill="none" stroke={STROKE} strokeWidth="0.8" />

      <line x1={centerX} y1={topY} x2={centerX} y2={bottomY} stroke={STROKE} strokeWidth="0.7" />

      <line x1={x + baffleInsetX} y1={topY} x2={x + flareInset} y2={y + innerInsetY + 1} stroke={STROKE} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={topY} x2={x + width - flareInset} y2={y + innerInsetY + 1} stroke={STROKE} strokeWidth="0.7" />
      <line x1={x + baffleInsetX} y1={bottomY} x2={x + flareInset} y2={y + height - innerInsetY - 1} stroke={STROKE} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={bottomY} x2={x + width - flareInset} y2={y + height - innerInsetY - 1} stroke={STROKE} strokeWidth="0.7" />

      <path d={`M ${centerX} ${upperTop} C ${centerX + driverHalfW * 0.95} ${upperTop + driverHalfH * 0.34}, ${centerX + driverHalfW * 1.08} ${upperBottom - driverHalfH * 0.34}, ${centerX} ${upperBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${upperTop} C ${centerX - driverHalfW * 0.95} ${upperTop + driverHalfH * 0.34}, ${centerX - driverHalfW * 1.08} ${upperBottom - driverHalfH * 0.34}, ${centerX} ${upperBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX + driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.34}, ${centerX + driverHalfW * 1.08} ${lowerBottom - driverHalfH * 0.34}, ${centerX} ${lowerBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX - driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.34}, ${centerX - driverHalfW * 1.08} ${lowerBottom - driverHalfH * 0.34}, ${centerX} ${lowerBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />

      <rect x={centerX - nodeSize} y={topY + nodeSize * 0.2} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={upperBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={lowerBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </g>
  );
}

export function Q45FaceIcon({ x, y, width, height }) {
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
      <path d={`M ${centerX} ${midY - halfH} C ${centerX + halfW * 0.95} ${midY - halfH * 0.62}, ${centerX + halfW * 1.05} ${midY + halfH * 0.62}, ${centerX} ${midY + halfH}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${midY - halfH} C ${centerX - halfW * 0.95} ${midY - halfH * 0.62}, ${centerX - halfW * 1.05} ${midY + halfH * 0.62}, ${centerX} ${midY + halfH}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
    </>
  );

  return (
    <g>
      <rect x={x + outerInset} y={y + outerInset} width={width - outerInset * 2} height={height - outerInset * 2} fill="none" stroke={STROKE} strokeWidth="0.9" />
      <rect x={x + innerInsetX} y={y + innerInsetY} width={width - innerInsetX * 2} height={height - innerInsetY * 2} rx={Math.min(width, height) * 0.05} ry={Math.min(width, height) * 0.05} fill="none" stroke={STROKE} strokeWidth="0.8" />

      <rect x={topBoxX} y={topBoxY} width={topBoxW} height={topBoxH} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <line x1={centerX} y1={topBoxY} x2={centerX} y2={topBoxY + topBoxH} stroke={STROKE} strokeWidth="0.7" />
      <line x1={topBoxX} y1={topBoxY} x2={x + width * 0.40} y2={y + height * 0.08} stroke={STROKE} strokeWidth="0.7" />
      <line x1={topBoxX + topBoxW} y1={topBoxY} x2={x + width * 0.77} y2={y + height * 0.08} stroke={STROKE} strokeWidth="0.7" />
      <line x1={topBoxX} y1={topBoxY + topBoxH} x2={x + width * 0.40} y2={y + height * 0.50} stroke={STROKE} strokeWidth="0.7" />
      <line x1={topBoxX + topBoxW} y1={topBoxY + topBoxH} x2={x + width * 0.77} y2={y + height * 0.50} stroke={STROKE} strokeWidth="0.7" />

      <line x1={bottomTopLeft} y1={bottomTopY} x2={bottomBottomLeft} y2={bottomBottomY} stroke={STROKE} strokeWidth="0.8" />
      <line x1={bottomTopRight} y1={bottomTopY} x2={bottomBottomRight} y2={bottomBottomY} stroke={STROKE} strokeWidth="0.8" />
      <line x1={bottomTopLeft} y1={bottomTopY} x2={bottomTopRight} y2={bottomTopY} stroke={STROKE} strokeWidth="0.8" />
      <line x1={bottomBottomLeft} y1={bottomBottomY} x2={bottomBottomRight} y2={bottomBottomY} stroke={STROKE} strokeWidth="0.8" />
      <line x1={centerX} y1={bottomTopY} x2={centerX} y2={bottomBottomY} stroke={STROKE} strokeWidth="0.7" />
      <line x1={bottomTopLeft} y1={bottomTopY} x2={x + width * 0.40} y2={y + height * 0.49} stroke={STROKE} strokeWidth="0.7" />
      <line x1={bottomTopRight} y1={bottomTopY} x2={x + width * 0.77} y2={y + height * 0.49} stroke={STROKE} strokeWidth="0.7" />
      <line x1={bottomBottomLeft} y1={bottomBottomY} x2={x + width * 0.40} y2={y + height * 0.91} stroke={STROKE} strokeWidth="0.7" />
      <line x1={bottomBottomRight} y1={bottomBottomY} x2={x + width * 0.78} y2={y + height * 0.91} stroke={STROKE} strokeWidth="0.7" />

      {drawLens(topUpperMidY, topDriverHalfW, topDriverHalfH)}
      {drawLens(topLowerMidY, topDriverHalfW, topDriverHalfH)}
      {drawLens(bottomUpperMidY, bottomUpperHalfW, bottomUpperHalfH)}
      {drawLens(bottomLowerMidY, bottomLowerHalfW, bottomLowerHalfH)}

      <rect x={centerX - nodeSize} y={topBoxY + nodeSize * 0.4} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={topLowerMidY - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={bottomUpperMidY + bottomUpperHalfH - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={bottomLowerMidY + bottomLowerHalfH - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </g>
  );
}

/**
 * Spitfire Q 8-5 — tall portrait cabinet
 * Uses product sheet image.
 */
export function Q85FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image
        x="0"
        y="0"
        width="100"
        height="100"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/8eb64d06e_Q8-5Front.png"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}

export function Q63FaceIcon({ x, y, size }) {
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

  const upperTop = upperMidY - driverHalfH;
  const upperBottom = upperMidY + driverHalfH;
  const lowerTop = lowerMidY - driverHalfH;
  const lowerBottom = lowerMidY + driverHalfH;

  return (
    <g>
      <rect x={x + outerInset} y={y + outerInset} width={size - outerInset * 2} height={size - outerInset * 2} fill="none" stroke={STROKE} strokeWidth="0.9" />
      <rect x={x + innerInset} y={y + innerInset} width={size - innerInset * 2} height={size - innerInset * 2} rx={size * 0.055} ry={size * 0.055} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <rect x={x + baffleInsetX} y={y + baffleInsetY} width={baffleW} height={baffleH} rx={size * 0.01} ry={size * 0.01} fill="none" stroke={STROKE} strokeWidth="0.8" />

      <line x1={centerX} y1={topY} x2={centerX} y2={bottomY} stroke={STROKE} strokeWidth="0.7" />

      <line x1={x + baffleInsetX} y1={topY} x2={centerX} y2={topY + size * 0.04} stroke={STROKE} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={topY} x2={centerX} y2={topY + size * 0.04} stroke={STROKE} strokeWidth="0.7" />
      <line x1={x + baffleInsetX} y1={bottomY} x2={centerX} y2={bottomY - size * 0.04} stroke={STROKE} strokeWidth="0.7" />
      <line x1={x + baffleInsetX + baffleW} y1={bottomY} x2={centerX} y2={bottomY - size * 0.04} stroke={STROKE} strokeWidth="0.7" />

      <path d={`M ${centerX} ${upperTop} C ${centerX + driverHalfW * 0.95} ${upperTop + driverHalfH * 0.38}, ${centerX + driverHalfW * 1.05} ${upperBottom - driverHalfH * 0.38}, ${centerX} ${upperBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${upperTop} C ${centerX - driverHalfW * 0.95} ${upperTop + driverHalfH * 0.38}, ${centerX - driverHalfW * 1.05} ${upperBottom - driverHalfH * 0.38}, ${centerX} ${upperBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX + driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.38}, ${centerX + driverHalfW * 1.05} ${lowerBottom - driverHalfH * 0.38}, ${centerX} ${lowerBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />
      <path d={`M ${centerX} ${lowerTop} C ${centerX - driverHalfW * 0.95} ${lowerTop + driverHalfH * 0.38}, ${centerX - driverHalfW * 1.05} ${lowerBottom - driverHalfH * 0.38}, ${centerX} ${lowerBottom}`} fill="none" stroke={STROKE} strokeWidth="0.8" />

      <rect x={centerX - nodeSize} y={topY + size * 0.037 - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={upperBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
      <rect x={centerX - nodeSize} y={lowerBottom - nodeSize} width={nodeSize * 2} height={nodeSize * 2} fill="none" stroke={STROKE} strokeWidth="0.7" />
    </g>
  );
}

// ─── Evolve Series face icons ─────────────────────────────────────────────────

export function Evolve11FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/590fdd26f_Screenshot2026-05-23at153725.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve21FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/bb66545fd_Evolve2-1front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve31FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/053510389_Evolve3-1front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve42FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/fa3b2393b_Evolve4-2front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve63FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/3010c90e8_Evolve6-3front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Evolve84FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/29826d0f4_Evolve8-4front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}