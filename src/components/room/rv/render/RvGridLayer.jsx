"use client";

import React from "react";

export default function RvGridLayer(props) {
  const {
    roomRect,
    widthM,
    lengthM,
    meterToCanvasX,
    meterToCanvasY,
  } = props;

  return (
    <g data-layer="grid">
      {/* Draw vertical grid lines (centre-anchored) */}
      {(() => {
        const GRID_STEP_M = 0.5;
        const centreXM = widthM / 2;
        const verticalLines = [];

        // Centre line
        const centreXCanvas = meterToCanvasX(centreXM);
        verticalLines.push(
          <line
            key="grid-x-centre"
            x1={centreXCanvas}
            y1={(roomRect?.y ?? 0)}
            x2={centreXCanvas}
            y2={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)}
            stroke="#E6E4DD"
            strokeWidth="0.5"
          />
        );

        // Step outwards from centre
        let offsetIndex = 1;
        while (true) {
          const leftXM = centreXM - offsetIndex * GRID_STEP_M;
          const rightXM = centreXM + offsetIndex * GRID_STEP_M;
          let anyDrawn = false;

          if (leftXM >= 0) {
            const xCanvas = meterToCanvasX(leftXM);
            verticalLines.push(
              <line
                key={`grid-x-left-${offsetIndex}`}
                x1={xCanvas}
                y1={(roomRect?.y ?? 0)}
                x2={xCanvas}
                y2={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)}
                stroke="#E6E4DD"
                strokeWidth="0.5"
              />
            );
            anyDrawn = true;
          }

          if (rightXM <= widthM) {
            const xCanvas = meterToCanvasX(rightXM);
            verticalLines.push(
              <line
                key={`grid-x-right-${offsetIndex}`}
                x1={xCanvas}
                y1={(roomRect?.y ?? 0)}
                x2={xCanvas}
                y2={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)}
                stroke="#E6E4DD"
                strokeWidth="0.5"
              />
            );
            anyDrawn = true;
          }

          if (!anyDrawn) break;
          offsetIndex += 1;
        }

        return verticalLines;
      })()}

      {/* Draw horizontal grid lines (front-anchored, unchanged) */}
      {(() => {
        const GRID_STEP_M = 0.5;
        const horizontalLines = [];

        for (let yM = 0; yM <= lengthM + 1e-6; yM += GRID_STEP_M) {
          const yCanvas = meterToCanvasY(yM);
          horizontalLines.push(
            <line
              key={`grid-y-${yM}`}
              x1={(roomRect?.x ?? 0)}
              y1={yCanvas}
              x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)}
              y2={yCanvas}
              stroke="#E6E4DD"
              strokeWidth="0.5"
            />
          );
        }

        return horizontalLines;
      })()}
    </g>
  );
}