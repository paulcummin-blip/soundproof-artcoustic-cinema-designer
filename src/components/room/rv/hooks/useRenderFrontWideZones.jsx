"use client";

import { useCallback } from "react";

export function useRenderFrontWideZones({
  hasRoomRect,
  frontWideZones,
  widthM,
  lengthM,
  roomRect,
  scale,
  ZONE_DEPTH_M,
}) {
  return useCallback(() => {
    if (!hasRoomRect) return null;

    const W = widthM || 4.5;
    const L = lengthM || 6.0;
    const WALL = 0.02;

    // If we have valid zones, render them
    if (frontWideZones?.status === 'ok') {
      const leftZone = frontWideZones.left;
      const rightZone = frontWideZones.right;

      if (!leftZone || !rightZone) return null;

      const zoneOpacity = 0.25;
      const strokeOpacity = 0.4;

      return (
        <g pointerEvents="none">
          {/* Left zone */}
          <rect
            x={(roomRect?.x ?? 0) + (WALL * scale)}
            y={(roomRect?.y ?? 0) + (leftZone.yMin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(leftZone.yMax - leftZone.yMin) * scale}
            fill="#4A230F"
            opacity={zoneOpacity}
            stroke="#4A230F"
            strokeWidth="1"
            strokeOpacity={strokeOpacity}
            strokeDasharray="4,4"
          />
          <line
            x1={(roomRect?.x ?? 0) + (WALL * scale)}
            y1={(roomRect?.y ?? 0) + (leftZone.medianY * scale)}
            x2={(roomRect?.x ?? 0) + ((WALL + ZONE_DEPTH_M) * scale)}
            y2={(roomRect?.y ?? 0) + (leftZone.medianY * scale)}
            stroke="#4A230F"
            strokeWidth="2"
            strokeOpacity={0.6}
          />

          {/* Right zone */}
          <rect
            x={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) - ((WALL + ZONE_DEPTH_M) * scale)}
            y={(roomRect?.y ?? 0) + (rightZone.yMin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(rightZone.yMax - rightZone.yMin) * scale}
            fill="#213428"
            opacity={zoneOpacity}
            stroke="#213428"
            strokeWidth="1"
            strokeOpacity={strokeOpacity}
            strokeDasharray="4,4"
          />
          <line
            x1={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) - ((WALL + ZONE_DEPTH_M) * scale)}
            y1={(roomRect?.y ?? 0) + (rightZone.medianY * scale)}
            x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) - (WALL * scale)}
            y2={(roomRect?.y ?? 0) + (rightZone.medianY * scale)}
            stroke="#213428"
            strokeWidth="2"
            strokeOpacity={0.6}
          />
        </g>
      );
    }

    // Fallback: if zones can't be computed (no sides, invalid geom, etc.)
    // Renders only when overlay is enabled AND status !== 'ok'
    if (frontWideZones?.status !== 'ok') {
      const W = Number(widthM) || 4.5;
      const L = Number(lengthM) || 6.0;
      const WALL = 0.02;

      const approxYmin   = L * 0.35;
      const approxYmax   = L * 0.65;
      const approxMedian = L * 0.50;
      const placeholderOpacity = 0.15;

      // Centre label using actual canvas rect
      const labelX = (roomRect?.x ?? 0) + ((roomRect?.width ?? 0) / 2);
      const labelY = (roomRect?.y ?? 0) + (approxMedian * scale) - 10;

      return (
        <g pointerEvents="none">
          {/* Left placeholder zone */}
          <rect
            x={(roomRect?.x ?? 0) + (WALL * scale)}
            y={(roomRect?.y ?? 0) + (approxYmin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(approxYmax - approxYmin) * scale}
            fill="#4A230F"
            opacity={placeholderOpacity}
            stroke="#4A230F"
            strokeWidth="1"
            strokeOpacity={0.3}
            strokeDasharray="8,8"
          />
          <line
            x1={(roomRect?.x ?? 0) + (WALL * scale)}
            y1={(roomRect?.y ?? 0) + (approxMedian * scale)}
            x2={(roomRect?.x ?? 0) + ((WALL + ZONE_DEPTH_M) * scale)}
            y2={(roomRect?.y ?? 0) + (approxMedian * scale)}
            stroke="#4A230F"
            strokeWidth="1.5"
            strokeOpacity={0.4}
            strokeDasharray="4,4"
          />

          {/* Right placeholder zone */}
          <rect
            x={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) - ((WALL + ZONE_DEPTH_M) * scale)}
            y={(roomRect?.y ?? 0) + (approxYmin * scale)}
            width={ZONE_DEPTH_M * scale}
            height={(approxYmax - approxYmin) * scale}
            fill="#213428"
            opacity={placeholderOpacity}
            stroke="#213428"
            strokeWidth="1"
            strokeOpacity={0.3}
            strokeDasharray="8,8"
          />
          <line
            x1={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) - ((WALL + ZONE_DEPTH_M) * scale)}
            y1={(roomRect?.y ?? 0) + (approxMedian * scale)}
            x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) - (WALL * scale)}
            y2={(roomRect?.y ?? 0) + (approxMedian * scale)}
            stroke="#213428"
            strokeWidth="1.5"
            strokeOpacity={0.4}
            strokeDasharray="4,4"
          />

          {/* Status text for user feedback */}
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            fill="#666"
            fontSize="11"
            fontFamily="system-ui, sans-serif"
          >
            Front-Wide zones (place L/C/R + SL/SR for precise positioning)
          </text>
        </g>
      );
    }
    return null;
  }, [
    frontWideZones,
    widthM,
    lengthM,
    roomRect,
    scale,
    ZONE_DEPTH_M,
    hasRoomRect,
  ]);
}