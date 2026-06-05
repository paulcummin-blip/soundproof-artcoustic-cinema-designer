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
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/689388d97_Q4-3front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

export function Q45FaceIcon({ x, y, width, height }) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/d1376c28d_Q4-5front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
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

export function Q63FaceIcon({ x, y, size, width, height }) {
  const w = width ?? size;
  const h = height ?? size;
  return (
    <svg x={x} y={y} width={w} height={h} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <image x="0" y="0" width="100" height="100" href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/9a1ad66a6_Q6-3front.png" preserveAspectRatio="xMidYMid meet" />
    </svg>
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

// ─── Artcoustic C Series face icons ──────────────────────────────────────────

/**
 * Artcoustic C4-1 soundbar — physical 1711 × 120 mm
 * viewBox aspect ratio 1711:120 preserves exact proportions at all zoom levels.
 */
export function C41FaceIcon({ x, y, width, height }) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 1711 120"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <image
        x="0"
        y="0"
        width="1711"
        height="120"
        href="https://media.base44.com/images/public/6a1166c68ddc81e5ea2cdf6b/2adee2973_Screenshot2026-06-05at132314.png"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}