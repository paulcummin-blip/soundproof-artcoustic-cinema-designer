import React from "react";

/**
 * RoomDimensionsOverlay – renders width/length dimension lines above and to the left of the room outline.
 */
export default function RoomDimensionsOverlay({ roomRect, widthM, lengthM, exportMode }) {
  const fontFamily = exportMode === 'dimensions' ? 'Century Gothic, sans-serif' : 'system-ui, sans-serif';

  return (
    <g data-layer="room-dimensions">
      <defs>
        <marker id="dim-arrow" viewBox="0 0 10 10" refX="5" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#DCDBD6" />
        </marker>
      </defs>

      {/* Horizontal (width) line – top of the room */}
      <line
        x1={(roomRect?.x ?? 0)} y1={(roomRect?.y ?? 0) - 20}
        x2={(roomRect?.x ?? 0) + (roomRect?.width ?? 0)} y2={(roomRect?.y ?? 0) - 20}
        stroke="#DCDBD6" strokeWidth={2}
        markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)"
      />
      <text
        x={(roomRect?.x ?? 0) + (roomRect?.width ?? 0) / 2}
        y={(roomRect?.y ?? 0) - 28}
        textAnchor="middle" fontFamily={fontFamily} fontSize={12} fill="#1B1A1A">
        {`${(widthM ?? 0).toFixed(2)} m`}
      </text>

      {/* Vertical (length) line – left side of the room */}
      <line
        x1={(roomRect?.x ?? 0) - 20} y1={(roomRect?.y ?? 0)}
        x2={(roomRect?.x ?? 0) - 20} y2={(roomRect?.y ?? 0) + (roomRect?.height ?? 0)}
        stroke="#DCDBD6" strokeWidth={2}
        markerStart="url(#dim-arrow)" markerEnd="url(#dim-arrow)"
      />
      <text
        x={(roomRect?.x ?? 0) - 28}
        y={(roomRect?.y ?? 0) + (roomRect?.height ?? 0) / 2}
        textAnchor="middle" fontFamily={fontFamily} fontSize={12} fill="#1B1A1A"
        transform={`rotate(-90 ${(roomRect?.x ?? 0) - 28} ${(roomRect?.y ?? 0) + (roomRect?.height ?? 0) / 2})`}>
        {`${(lengthM ?? 0).toFixed(2)} m`}
      </text>
    </g>
  );
}