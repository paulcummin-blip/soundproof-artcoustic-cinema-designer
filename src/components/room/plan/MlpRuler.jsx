/**
 * MlpRuler – renders the MLP position ruler lines and distance labels.
 * Extracted from RoomVisualisation to reduce file size.
 */
import React from "react";

export default function MlpRuler({
  mlpDotX_m,
  mlpDotY_m,
  widthM,
  lengthM,
  screenFrontPlaneM,
  scale,
  toPx,
  roomRect,
  exportMode,
}) {
  if (!Number.isFinite(mlpDotX_m) || !Number.isFinite(mlpDotY_m)) return null;

  const [mlpX_px, mlpY_px] = toPx(mlpDotX_m, mlpDotY_m);
  const screenY_px = (roomRect?.y ?? 0) + (screenFrontPlaneM * scale);

  const rulerColor = '#625143';
  const rulerStroke = 1.5;
  const dotRadius = 3;
  const fontSize = 11;
  const labelOffset = 16;

  const distLeftWall = mlpDotX_m;
  const distRightWall = widthM - mlpDotX_m;
  const distScreen = mlpDotY_m - screenFrontPlaneM;
  const distBackWall = lengthM - mlpDotY_m;
  const distFrontWall = mlpDotY_m;

  const secondaryRulerX_px = (roomRect?.x ?? 0) + 0.20 * (mlpX_px - (roomRect?.x ?? 0));
  const fontFamily = exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif';

  return (
    <g data-layer="mlp-ruler" pointerEvents="none">
      {/* Horizontal ruler */}
      <line x1={(roomRect?.x ?? 0)} y1={mlpY_px} x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)} y2={mlpY_px} stroke={rulerColor} strokeWidth={rulerStroke} opacity={0.6} />
      <circle cx={(roomRect?.x ?? 0)} cy={mlpY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      <circle cx={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)} cy={mlpY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      <text x={((roomRect?.x ?? 0) + mlpX_px) / 2} y={mlpY_px - labelOffset} textAnchor="middle" fontSize={fontSize} fill={rulerColor} fontFamily={fontFamily}>{distLeftWall.toFixed(2)}m</text>
      <text x={(mlpX_px + (roomRect?.x ?? 0) + (roomRect?.width ?? 0)) / 2} y={mlpY_px - labelOffset} textAnchor="middle" fontSize={fontSize} fill={rulerColor} fontFamily={fontFamily}>{distRightWall.toFixed(2)}m</text>

      {/* Vertical ruler */}
      <line x1={mlpX_px} y1={screenY_px} x2={mlpX_px} y2={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)} stroke={rulerColor} strokeWidth={rulerStroke} opacity={0.6} />
      <circle cx={mlpX_px} cy={screenY_px} r={dotRadius} fill={rulerColor} opacity={0.8} />
      <circle cx={mlpX_px} cy={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)} r={dotRadius} fill={rulerColor} opacity={0.8} />
      <text x={mlpX_px - labelOffset} y={(screenY_px + mlpY_px) / 2} textAnchor="middle" fontSize={fontSize} fill={rulerColor} fontFamily={fontFamily} transform={`rotate(-90 ${mlpX_px - labelOffset} ${(screenY_px + mlpY_px) / 2})`}>{distScreen.toFixed(2)}m</text>
      <text x={mlpX_px + labelOffset} y={(mlpY_px + (roomRect?.y ?? 0) + (roomRect?.height ?? 0)) / 2} textAnchor="middle" fontSize={fontSize} fill={rulerColor} fontFamily={fontFamily} transform={`rotate(-90 ${mlpX_px + labelOffset} ${(mlpY_px + (roomRect?.y ?? 0) + (roomRect?.height ?? 0)) / 2})`}>{distBackWall.toFixed(2)}m</text>

      {/* Secondary ruler: front wall → MLP */}
      <defs>
        <marker id="mlp-depth-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={rulerColor} />
        </marker>
      </defs>
      <line x1={secondaryRulerX_px} y1={(roomRect?.y ?? 0)} x2={secondaryRulerX_px} y2={mlpY_px} stroke={rulerColor} strokeWidth={rulerStroke} opacity={0.6} markerStart="url(#mlp-depth-arrow)" markerEnd="url(#mlp-depth-arrow)" />
      <text x={secondaryRulerX_px + labelOffset} y={((roomRect?.y ?? 0) + mlpY_px) / 2} textAnchor="middle" fontSize={fontSize} fill={rulerColor} fontFamily={fontFamily} transform={`rotate(-90 ${secondaryRulerX_px + labelOffset} ${((roomRect?.y ?? 0) + mlpY_px) / 2})`}>{distFrontWall.toFixed(2)}m</text>
    </g>
  );
}