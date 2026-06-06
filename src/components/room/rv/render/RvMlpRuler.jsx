"use client";

import React from "react";

export default function RvMlpRuler(props) {
  const {
    showMlpRuler,
    exportMode,
    mlp,
    toPx,
    roomRect,
    screenFrontPlaneM,
    scale,
    widthM,
    lengthM,
  } = props;

  // Guard: only render when enabled and not in clean export mode
  if (exportMode === 'clean' || !showMlpRuler) return null;

  const mlpDotX_m = mlp?.x;
  const mlpDotY_m = mlp?.y;

  // Render MLP position ruler using the same visual style as speaker rulers
  if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;

  const [mlpX_px, mlpY_px] = toPx(mlpDotX_m, mlpDotY_m);
  
  // Screen position (for screen → MLP distance)
  const screenY_px = (roomRect?.y ?? 0) + (screenFrontPlaneM * scale);
  
  // Ruler styling (match speaker rulers)
  const rulerColor = '#625143';
  const brandGreen = '#213428';
  const rulerStroke = 1.5;
  const dotRadius = 3;
  const fontSize = 11;
  const labelOffset = 16; // pixels from the line

  // Calculate distances
  const distLeftWall = mlpDotX_m; // Distance from left wall (x=0)
  const distRightWall = widthM - mlpDotX_m; // Distance from right wall
  const distScreen = mlpDotY_m - screenFrontPlaneM; // Distance from screen → RSP
  const distFrontWall = mlpDotY_m; // Distance from front wall → RSP
  const distRearWall = lengthM - mlpDotY_m; // Distance from RSP → rear wall

  // Pixel positions for secondary rulers
  const frontWallY_px = (roomRect?.y ?? 0);
  const rearWallY_px = (roomRect?.y ?? 0) + (roomRect?.height ?? 0);

  // Horizontal offsets so three vertical rulers don't overlap
  const rulerX_frontWall = mlpX_px - 40; // left of centre
  const rulerX_screen   = mlpX_px;       // centre (unchanged)
  const rulerX_rearWall = mlpX_px + 40;  // right of centre



  return (
    <g data-layer="mlp-ruler" pointerEvents="none">
      {/* Horizontal ruler (left wall ↔ MLP ↔ right wall) */}
      <line
        x1={(roomRect?.x ?? 0)}
        y1={mlpY_px}
        x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)}
        y2={mlpY_px}
        stroke={rulerColor}
        strokeWidth={rulerStroke}
        opacity={0.6}
      />
      
      {/* Left wall dot */}
      <circle
        cx={(roomRect?.x ?? 0)}
        cy={mlpY_px}
        r={dotRadius}
        fill={rulerColor}
        opacity={0.8}
      />
      
      {/* Right wall dot */}
      <circle
        cx={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)}
        cy={mlpY_px}
        r={dotRadius}
        fill={rulerColor}
        opacity={0.8}
      />
      
      {/* Left wall → MLP distance label */}
      <text
        x={((roomRect?.x ?? 0) + mlpX_px) / 2}
        y={mlpY_px - labelOffset}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
      >
        {distLeftWall.toFixed(2)}m
      </text>
      
      {/* MLP → Right wall distance label */}
      <text
        x={(mlpX_px + (roomRect?.x ?? 0) + (roomRect?.width ?? 0)) / 2}
        y={mlpY_px - labelOffset}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
      >
        {distRightWall.toFixed(2)}m
      </text>

      {/* ── CENTRE: Screen → RSP ruler (unchanged) ── */}
      <line
        x1={rulerX_screen}
        y1={screenY_px}
        x2={rulerX_screen}
        y2={mlpY_px}
        stroke={rulerColor}
        strokeWidth={rulerStroke}
        opacity={0.6}
      />
      {/* Screen plane dot */}
      <circle cx={rulerX_screen} cy={screenY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      {/* RSP dot (centre) */}
      <circle cx={rulerX_screen} cy={mlpY_px} r={dotRadius} fill={brandGreen} opacity={0.8} />
      {/* Screen → RSP label */}
      <text
        x={rulerX_screen - labelOffset}
        y={(screenY_px + mlpY_px) / 2}
        textAnchor="middle"
        fontSize={fontSize}
        fill={brandGreen}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
        transform={`rotate(-90 ${rulerX_screen - labelOffset} ${(screenY_px + mlpY_px) / 2})`}
      >
        {distScreen.toFixed(2)}m
      </text>

      {/* ── LEFT: Front wall → RSP ruler ── */}
      <line
        x1={rulerX_frontWall}
        y1={frontWallY_px}
        x2={rulerX_frontWall}
        y2={mlpY_px}
        stroke={rulerColor}
        strokeWidth={rulerStroke}
        opacity={0.6}
      />
      {/* Front wall dot */}
      <circle cx={rulerX_frontWall} cy={frontWallY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      {/* RSP dot (left) */}
      <circle cx={rulerX_frontWall} cy={mlpY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      {/* Front wall → RSP label */}
      <text
        x={rulerX_frontWall - labelOffset}
        y={(frontWallY_px + mlpY_px) / 2}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
        transform={`rotate(-90 ${rulerX_frontWall - labelOffset} ${(frontWallY_px + mlpY_px) / 2})`}
      >
        {distFrontWall.toFixed(2)}m
      </text>

      {/* ── RIGHT: RSP → Rear wall ruler ── */}
      <line
        x1={rulerX_rearWall}
        y1={mlpY_px}
        x2={rulerX_rearWall}
        y2={rearWallY_px}
        stroke={rulerColor}
        strokeWidth={rulerStroke}
        opacity={0.6}
      />
      {/* RSP dot (right) */}
      <circle cx={rulerX_rearWall} cy={mlpY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      {/* Rear wall dot */}
      <circle cx={rulerX_rearWall} cy={rearWallY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      {/* RSP → Rear wall label */}
      <text
        x={rulerX_rearWall + labelOffset}
        y={(mlpY_px + rearWallY_px) / 2}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
        transform={`rotate(-90 ${rulerX_rearWall + labelOffset} ${(mlpY_px + rearWallY_px) / 2})`}
      >
        {distRearWall.toFixed(2)}m
      </text>


    </g>
  );
}