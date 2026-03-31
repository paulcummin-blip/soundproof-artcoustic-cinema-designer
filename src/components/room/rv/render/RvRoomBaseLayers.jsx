"use client";

import React from "react";
import RvGridLayer from "@/components/room/rv/render/RvGridLayer";

export default function RvRoomBaseLayers(props) {
  const {
    // geometry + converters
    roomRect,
    widthM,
    lengthM,
    heightM,
    scale,
    meterToCanvasX,
    meterToCanvasY,
    toPx,

    // view / export flags
    exportMode,
    speakerPositionsView,
    overlaysForRendering,

    // constants used inside the extracted block (already exist in RV today)
    SPEAKER_PLAN_SIDE_GUTTER_PX,
    TOP_GUTTER_PX,
    SPEAKER_PLAN_TOP_GUTTER_PX,
    BOTTOM_GUTTER_PX,
    SPEAKER_PLAN_BOTTOM_GUTTER_PX,

    // pre-rendered JSX from the parent
    BaffleAndScreen,
  } = props;

  return (
    <>
      {/* Layer 1: Grid Backdrop (Bottom Layer) */}
      <RvGridLayer
        roomRect={roomRect}
        widthM={widthM}
        lengthM={lengthM}
        meterToCanvasX={meterToCanvasX}
        meterToCanvasY={meterToCanvasY}
      />

      {/* Deterministic crop area for exports */}
      {Number.isFinite(scale) && roomRect && (
        <rect
          id="export-crop-bounds"
          x={speakerPositionsView === "plan" ? (roomRect.x - SPEAKER_PLAN_SIDE_GUTTER_PX) : roomRect.x}
          y={speakerPositionsView === "plan" ? (roomRect.y - TOP_GUTTER_PX - SPEAKER_PLAN_TOP_GUTTER_PX) : (roomRect.y - TOP_GUTTER_PX)}
          width={speakerPositionsView === "plan" ? (roomRect.width + (2 * SPEAKER_PLAN_SIDE_GUTTER_PX)) : roomRect.width}
          height={roomRect.height + (overlaysForRendering?.ROOM_DIMS ? TOP_GUTTER_PX : 0) + (speakerPositionsView === "plan" ? (BOTTOM_GUTTER_PX + SPEAKER_PLAN_TOP_GUTTER_PX + SPEAKER_PLAN_BOTTOM_GUTTER_PX) : 0)}
          fill="none"
          stroke="none"
          opacity={0}
          pointerEvents="none"
        />
      )}

      {/* Wrapper for export bounds */}
      <g id="export-content-bounds">
        <g id="export-bounds">
          {/* --- Export-only report labels (clean-plan page enhancements) --- */}
          {exportMode !== 'clean' && overlaysForRendering?.EXPORT_CEILING_LABEL && (
            <g data-layer="export-ceiling-label" pointerEvents="none">
              <text
                x={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) * (2 / 3)}
                y={(roomRect?.y ?? 0) - 48}
                textAnchor="middle"
                fontFamily="Century Gothic, sans-serif"
                fontSize={11}
                fill="#1B1A1A"
              >
                {`Ceiling height: ${(heightM ?? 0).toFixed(2)} m`}
              </text>
            </g>
          )}

          {exportMode !== 'clean' && overlaysForRendering?.EXPORT_RSP_LABEL && (
            <g data-layer="export-rsp-label" pointerEvents="none">
              {(() => {
                const mlpX = props.mlp?.x ?? props.mlpPoint?.x;
                const mlpY = props.mlp?.y ?? props.mlpPoint?.y;
                if (!Number.isFinite(mlpX) || !Number.isFinite(mlpY)) return null;

                const [px, py] = toPx(mlpX, mlpY);
                const green = "#6BBF59";

                return (
                  <text
                    x={px + 18}
                    y={py + 5}
                    textAnchor="start"
                    fontFamily="Century Gothic, sans-serif"
                    fontSize={12}
                    fill={green}
                    fontWeight={600}
                  >
                    RSP
                  </text>
                );
              })()}
            </g>
          )}

          {exportMode !== 'clean' && exportMode !== 'dimensions' && overlaysForRendering?.EXPORT_ROW_FRONT_DIST && (
            <g data-layer="export-row-front-distance" pointerEvents="none">
              {(() => {
                const seatsArr = Array.isArray(props.seatingPositions) ? props.seatingPositions : [];
                if (seatsArr.length === 0) return null;

                const isNum = (v) => Number.isFinite(Number(v));

                const sorted = seatsArr
                  .filter(s => s && isNum(s.x) && isNum(s.y))
                  .slice()
                  .sort((a, b) => (a.y - b.y) || (a.x - b.x));

                const rowBuckets = [];
                for (const s of sorted) {
                  const last = rowBuckets[rowBuckets.length - 1];
                  if (!last || Math.abs(s.y - last.y) > 0.20) {
                    rowBuckets.push({ y: s.y, seats: [s] });
                  } else {
                    last.seats.push(s);
                  }
                }

                const pickSeatForRow = (row) => {
                  const seats = row.seats.slice().sort((a, b) => a.x - b.x);
                  const n = seats.length;
                  if (n === 1) return seats[0];
                  const idx = n % 2 === 1 ? Math.floor(n / 2) : (n / 2 - 1);
                  return seats[Math.max(0, Math.min(n - 1, idx))];
                };

                return rowBuckets.map((row, i) => {
                  const seat = pickSeatForRow(row);
                  if (!seat) return null;

                  const sx = Number(seat.x);
                  const sy = Number(seat.y);

                  const [px, py] = toPx(sx, sy);

                  return (
                    <g key={`row-frontdist-${i}`}>
                      <text
                        x={px}
                        y={py + 26}
                        textAnchor="middle"
                        fontFamily="Century Gothic, sans-serif"
                        fontSize={11}
                        fill="#1B1A1A"
                      >
                        to front wall
                      </text>

                      <text
                        x={px}
                        y={py + 40}
                        textAnchor="middle"
                        fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
                        fontSize={12}
                        fill="#1B1A1A"
                      >
                        {`${sy.toFixed(2)} m`}
                      </text>
                    </g>
                  );
                });
              })()}
            </g>
          )}

          {/* Layer 2: Room Outline and Furniture */}
          <rect
            x={(roomRect?.x ?? 0)}
            y={(roomRect?.y ?? 0)}
            width={(roomRect?.width ?? 0)}
            height={(roomRect?.height ?? 0)}
            fill="none"
            stroke="#DCDBD6"
            strokeWidth={2}
          />

          {/* Room Dimensions Overlay */}
          {exportMode !== 'clean' && overlaysForRendering?.ROOM_DIMS && (
            <g data-layer="room-dimensions">
              {/* Arrow markers */}
              <defs>
                <marker
                  id="dim-arrow"
                  viewBox="0 0 10 10"
                  refX="5"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill="#DCDBD6"
                  />
                </marker>
              </defs>

              {/* Horizontal (width) line – top of the room (screen wall) */}
              <line
                x1={(roomRect?.x ?? 0)}
                y1={(roomRect?.y ?? 0) - 20}
                x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)}
                y2={(roomRect?.y ?? 0) - 20}
                stroke="#DCDBD6"
                strokeWidth={2}
                markerStart="url(#dim-arrow)"
                markerEnd="url(#dim-arrow)"
              />
              <text
                x={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) / 2}
                y={(roomRect?.y ?? 0) - 28}
                textAnchor="middle"
                fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
                fontSize={12}
                fill="#1B1A1A"
              >
                {`${(widthM ?? 0).toFixed(2)} m`}
              </text>

              {/* Vertical (length) line – left side of the room */}
              <line
                x1={(roomRect?.x ?? 0) - 20}
                y1={(roomRect?.y ?? 0)}
                x2={(roomRect?.x ?? 0) - 20}
                y2={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)}
                stroke="#DCDBD6"
                strokeWidth={2}
                markerStart="url(#dim-arrow)"
                markerEnd="url(#dim-arrow)"
              />
              <text
                x={(roomRect?.x ?? 0) - 28}
                y={(roomRect?.y ?? 0) + (roomRect?.height ?? 0) / 2}
                textAnchor="middle"
                transform={`rotate(-90 ${(roomRect?.x ?? 0) - 28} ${(roomRect?.y ?? 0) + (roomRect?.height ?? 0) / 2})`}
                fontFamily={exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif'}
                fontSize={12}
                fill="#1B1A1A"
              >
                {`${(lengthM ?? 0).toFixed(2)} m`}
              </text>
            </g>
          )}

          {/* Screen and baffle - Layer 3 */}
          {BaffleAndScreen}
        </g>
      </g>
    </>
  );
}