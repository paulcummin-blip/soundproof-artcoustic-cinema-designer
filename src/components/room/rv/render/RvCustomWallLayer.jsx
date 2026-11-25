"use client";

/**
 * RvCustomWallLayer
 * ----------------
 * Renders Custom Wall segments in Plan View. Visual overlay only — these
 * walls are never read by the acoustic engine, bass simulation, RP22 grading,
 * best-sub layout or any fingerprint path.
 *
 * Rendering:
 *   - Wall line with visible thickness (rotated rectangle).
 *   - Draggable endpoints shown when the wall is selected.
 *   - Whole-wall drag via the body.
 *   - Orange clash markers on speakers intersecting a restricted wall.
 *   - Snap indication ring at an endpoint that is currently snapped.
 *
 * Selection state is owned by the parent (RoomVisualisation) via
 * selectedWallId / onSelectWall so it survives re-renders and coordinates
 * with the drag pipeline.
 */

import { wallCorners, wallMidpoint, isCustomWall, speakersClashingWalls, CUSTOM_WALL_TYPE } from "@/components/room/customWall/customWallGeometry";

const NORMAL_STROKE = "#5B5148";
const NORMAL_FILL = "rgba(168,159,149,0.35)";
const SELECTED_STROKE = "#213428";
const SELECTED_FILL = "rgba(33,52,40,0.18)";
const RESTRICTED_STROKE = "#C76A1B";
const RESTRICTED_FILL = "rgba(199,106,27,0.10)";
const CLASH_STROKE = "#C76A1B";
const CLASH_FILL = "rgba(199,106,27,0.28)";
const ENDPOINT_FILL = "#FFFFFF";
const ENDPOINT_STROKE = "#213428";
const SNAP_STROKE = "#3E6B4F";

export default function RvCustomWallLayer({
  hasRoomRect,
  roomElements,
  widthM,
  lengthM,
  scale,
  toPx,
  meterToCanvasX,
  meterToCanvasY,
  placedSpeakers,
  getModelDimsM,
  getCanonicalRole,
  handleMouseDown,
  selectedWallId,
  onSelectWall,
  snapIndicators = [],
}) {
  if (!hasRoomRect) return null;
  const walls = (Array.isArray(roomElements) ? roomElements : []).filter(isCustomWall);
  if (walls.length === 0) return null;

  // Speaker clash set across all restricted walls.
  const clashingKeys = speakersClashingWalls(placedSpeakers, walls, getModelDimsM);

  return (
    <g data-layer="custom-walls" pointerEvents="none">
      {walls.map((wall) => {
        const corners = wallCorners(wall);
        if (!corners || corners.length < 4) return null;
        const isSelected = selectedWallId === wall.id;
        const isRestricted = wall.restriction === 'on';

        // Polygon points string (SVG pixels)
        const pts = corners.map((c) => {
          const [px, py] = toPx(c.x, c.y);
          return `${px},${py}`;
        }).join(" ");

        const fill = isRestricted ? RESTRICTED_FILL : (isSelected ? SELECTED_FILL : NORMAL_FILL);
        const stroke = isRestricted ? RESTRICTED_STROKE : (isSelected ? SELECTED_STROKE : NORMAL_STROKE);

        // Endpoints
        const [p1x, p1y] = toPx(wall.p1.x, wall.p1.y);
        const [p2x, p2y] = toPx(wall.p2.x, wall.p2.y);

        // Label at the wall midpoint, rotated to follow the segment so it stays
        // attached to the wall body for diagonal walls. Flipped 180 deg when the
        // segment points up-left so the text is never upside-down.
        const mid = wallMidpoint(wall);
        const [lmx, lmy] = toPx(mid.x, mid.y);
        let labelAngleDeg = Math.atan2(p2y - p1y, p2x - p1x) * 180 / Math.PI;
        if (labelAngleDeg > 90) labelAngleDeg -= 180;
        if (labelAngleDeg < -90) labelAngleDeg += 180;
        const wallLabel = String(wall.label || 'Custom Wall');

        // Snap indicators for this wall's endpoints
        const snapP1 = snapIndicators.find((s) => s.wallId === wall.id && s.endpoint === 'p1');
        const snapP2 = snapIndicators.find((s) => s.wallId === wall.id && s.endpoint === 'p2');

        const endpointR = Math.max(5, 5 * (scale || 1) * 0.3 + 3);
        const hitR = Math.max(10, endpointR * 2);

        const onBodyDown = (ev) => {
          if (!handleMouseDown) return;
          ev.preventDefault();
          ev.stopPropagation();
          onSelectWall?.(wall.id);
          handleMouseDown(ev, wall.id, 'customWall');
        };
        const onEndpointDown = (ev, which) => {
          if (!handleMouseDown) return;
          ev.preventDefault();
          ev.stopPropagation();
          onSelectWall?.(wall.id);
          handleMouseDown(ev, wall.id, which === 'p1' ? 'customWallEndpoint1' : 'customWallEndpoint2');
        };

        return (
          <g key={wall.id} style={handleMouseDown ? { cursor: 'grab', pointerEvents: 'all' } : undefined}>
            {/* Wall body (rotated rectangle) */}
            <polygon
              points={pts}
              fill={fill}
              stroke={stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              pointerEvents={handleMouseDown ? 'all' : 'none'}
              onPointerDown={onBodyDown}
            />
            {/* Larger invisible hit area along the segment for easier grabbing */}
            {handleMouseDown && (
              <line
                x1={p1x}
                y1={p1y}
                x2={p2x}
                y2={p2y}
                stroke="transparent"
                strokeWidth={Math.max(12, Number(wall.thickness_m || 0.1) * scale + 8)}
                strokeLinecap="round"
                pointerEvents="all"
                onPointerDown={onBodyDown}
              />
            )}
            {/* Snap indication rings */}
            {snapP1 && (
              <circle
                cx={p1x}
                cy={p1y}
                r={endpointR + 5}
                fill="none"
                stroke={SNAP_STROKE}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {snapP2 && (
              <circle
                cx={p2x}
                cy={p2y}
                r={endpointR + 5}
                fill="none"
                stroke={SNAP_STROKE}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {/* Wall label at the midpoint, rotated along the segment */}
            {wallLabel && (
              <text
                x={lmx}
                y={lmy}
                fill="#1B1A1A"
                fillOpacity={0.9}
                fontSize={11}
                fontWeight={700}
                style={{ userSelect: 'none' }}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={labelAngleDeg !== 0 ? `rotate(${labelAngleDeg}, ${lmx}, ${lmy})` : undefined}
                pointerEvents="none"
              >
                {wallLabel}
              </text>
            )}
            {/* Endpoint handles — only when selected */}
            {isSelected && handleMouseDown && (
              <>
                <circle
                  cx={p1x}
                  cy={p1y}
                  r={hitR}
                  fill="transparent"
                  pointerEvents="all"
                  onPointerDown={(ev) => onEndpointDown(ev, 'p1')}
                />
                <circle
                  cx={p1x}
                  cy={p1y}
                  r={endpointR}
                  fill={ENDPOINT_FILL}
                  stroke={ENDPOINT_STROKE}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <circle
                  cx={p2x}
                  cy={p2y}
                  r={hitR}
                  fill="transparent"
                  pointerEvents="all"
                  onPointerDown={(ev) => onEndpointDown(ev, 'p2')}
                />
                <circle
                  cx={p2x}
                  cy={p2y}
                  r={endpointR}
                  fill={ENDPOINT_FILL}
                  stroke={ENDPOINT_STROKE}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              </>
            )}
          </g>
        );
      })}

      {/* Orange clash markers on speakers intersecting restricted walls */}
      {placedSpeakers.map((sp) => {
        if (!sp?.position) return null;
        const key = String(sp.id || sp.role || '');
        if (!clashingKeys.has(key)) return null;
        const [cx, cy] = toPx(sp.position.x, sp.position.y);
        const r = Math.max(8, 0.18 * (scale || 1));
        return (
          <circle
            key={`cw-clash-${key}`}
            cx={cx}
            cy={cy}
            r={r}
            fill={CLASH_FILL}
            stroke={CLASH_STROKE}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        );
      })}
    </g>
  );
}