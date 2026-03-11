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
  const rulerStroke = 1.5;
  const dotRadius = 3;
  const fontSize = 11;
  const labelOffset = 16; // pixels from the line

  // Calculate distances
  const distLeftWall = mlpDotX_m; // Distance from left wall (x=0)
  const distRightWall = widthM - mlpDotX_m; // Distance from right wall
  const distScreen = mlpDotY_m - screenFrontPlaneM; // Distance from screen
  const distBackWall = lengthM - mlpDotY_m; // Distance from back wall
  const distFrontWall = mlpDotY_m; // Distance from front wall (y=0)

  // Secondary ruler X position: 20% from left wall toward MLP centerline
  // Formula: x = leftWallX + 0.20 * (mlpCenterX - leftWallX)
  const secondaryRulerX_px = (roomRect?.x ?? 0) + 0.20 * (mlpX_px - (roomRect?.x ?? 0));

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

      {/* Vertical ruler (screen ↔ MLP ↔ back wall) */}
      <line
        x1={mlpX_px}
        y1={screenY_px}
        x2={mlpX_px}
        y2={mlpY_px}
        stroke={rulerColor}
        strokeWidth={rulerStroke}
        opacity={0.6}
      />
      
      {/* Screen plane dot */}
      <circle
        cx={mlpX_px}
        cy={screenY_px}
        r={dotRadius}
        fill={rulerColor}
        opacity={0.8}
      />
      
      {/* Back wall dot */}
      <circle
        cx={mlpX_px}
        cy={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)}
        r={dotRadius}
        fill={rulerColor}
        opacity={0.8}
      />
      
      {/* Screen → MLP distance label (rotated, left side) */}
      <text
        x={mlpX_px - labelOffset}
        y={(screenY_px + mlpY_px) / 2}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
        transform={`rotate(-90 ${mlpX_px - labelOffset} ${(screenY_px + mlpY_px) / 2})`}
      >
        {distScreen.toFixed(2)}m
      </text>
      
      {/* MLP → Back wall distance label (rotated, right side) */}
      <text
        x={mlpX_px + labelOffset}
        y={(mlpY_px + (roomRect?.y ?? 0) + (roomRect?.height ?? 0)) / 2}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
        transform={`rotate(-90 ${mlpX_px + labelOffset} ${(mlpY_px + (roomRect?.y ?? 0) + (roomRect?.height ?? 0)) / 2})`}
      >
        {distBackWall.toFixed(2)}m
      </text>

      {/* SECONDARY RULER: MLP → Front Wall depth */}
      <defs>
        <marker
          id="mlp-depth-arrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={rulerColor} />
        </marker>
      </defs>

      {/* Vertical line from front wall to MLP horizontal ruler */}
      <line
        x1={secondaryRulerX_px}
        y1={(roomRect?.y ?? 0)}
        x2={secondaryRulerX_px}
        y2={mlpY_px}
        stroke={rulerColor}
        strokeWidth={rulerStroke}
        opacity={0.6}
        markerStart="url(#mlp-depth-arrow)"
        markerEnd="url(#mlp-depth-arrow)"
      />
      
      {/* MLP → Front wall distance label (rotated, reading bottom to top) */}
      <text
        x={secondaryRulerX_px + labelOffset}
        y={((roomRect?.y ?? 0) + mlpY_px) / 2}
        textAnchor="middle"
        fontSize={fontSize}
        fill={rulerColor}
        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
        transform={`rotate(-90 ${secondaryRulerX_px + labelOffset} ${((roomRect?.y ?? 0) + mlpY_px) / 2})`}
      >
        {distFrontWall.toFixed(2)}m
      </text>
    </g>
  );
}